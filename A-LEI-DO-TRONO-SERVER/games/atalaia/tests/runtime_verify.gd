extends SceneTree
var app: Node
var failures=0
func _initialize():call_deferred("verify")
func check(ok: bool,label: String):
 if not ok:failures+=1;push_error("UI FAIL: "+label)
 else:print("UI PASS: "+label)
func verify():
 var save_path="user://atalaia_campaign_v1.json"
 var original_save=FileAccess.get_file_as_string(save_path) if FileAccess.file_exists(save_path) else ""
 app=load("res://scenes/main.tscn").instantiate();root.add_child(app)
 app.qa_mode=true
 await process_frame
 check(app.in_menu,"Tela de título inicial")
 app.start_game()
 check(is_equal_approx(app.board.scale.x,app.board.scale.y),"Campo preserva proporções de cenário, unidades e cliques")
 check(app.board.get_parent().clip_contents,"Atores e caminhos ficam dentro dos limites do campo")
 check(app.stats_label.text=="360" and app.stats_label.get_parent().get_children().any(func(n):return n is Label and n.text=="OURO"),"Ouro inicial tem nome legível e valor real")
 check(app.life_meter.size.y<=5 and app.wave_meter.size.y<=5,"Barras finas não encobrem valores nem controles")
 app.arsenal_buttons.ballista.pressed.emit()
 app.board.pad_clicked.emit(4)
 check(app.run.towers.size()==1 and app.selected==app.run.towers[0].id,"Arsenal e seleção de espaço constroem e selecionam")
 app.upgrade_button.pressed.emit()
 check(app.run.towers[0].level==2,"Painel da torreta evolui a seleção")
 app.run.gold=400
 app.refresh_hud()
 await create_timer(0.4).timeout
 check(app.stats_label.text.contains("400"),"Contador animado converge para o ouro real")
 app.arsenal_buttons.poison.pressed.emit();app.board.pad_clicked.emit(6)
 var second=app.selected
 var report_button=app.rows.get_child(0).get_children().filter(func(n):return n is Button)[0]
 report_button.grab_focus();app.refresh_hud();await process_frame
 check(is_instance_valid(report_button) and app.get_viewport().gui_get_focus_owner()==report_button,"Atualizar dano preserva foco no relatório")
 app.wave_button.pressed.emit()
 check(app.run.phase=="wave","Botão iniciar onda")
 await create_timer(0.2).timeout
 app.toggle_pause();var elapsed=app.run.elapsed
 await create_timer(0.15).timeout
 check(app.paused and is_equal_approx(elapsed,app.run.elapsed),"Pausa interrompe a simulação")
 app.toggle_pause();app.show_settings()
 check(app.modal_kind=="settings" and app.paused,"Menu de áudio pausa o combate")
 app.sound.set_volume("Effects",0.52)
 check(is_equal_approx(app.sound.mix.Effects,0.52),"Mixer independente de efeitos")
 app.close_settings()
 app.run.phase="cards";app.run.choices=[AtalaiaCatalog.card("power"),AtalaiaCatalog.card("rapid"),AtalaiaCatalog.card("venom")]
 app.show_cards()
 await create_timer(0.7).timeout
 check(app.card_nodes.size()==3 and app.card_nodes[0].modulate.a>0.99,"Entrada animada das três cartas")
 app.card_nodes[0].chosen.emit(0)
 check(app.target_panel.visible and app.target_ids.size()==2,"Carta exige confirmação do recebedor")
 var index=app.target_ids.find(second);app.target_selector.select(index);app.target_selector.item_selected.emit(index)
 app.apply_button.pressed.emit()
 await create_timer(0.35).timeout
 check("power" in app.run.towers[1].mods and app.run.towers[0].mods.is_empty(),"Confirmação aplica somente em T02")
 check(app.modal_kind=="" and app.run.phase=="prep","Escolha retorna à preparação")
 app.report_group=true;app.refresh_hud()
 check(app.rows.get_child_count()==2,"Relatório agrupado contém dois tipos construídos")
 app.run.wave=5;app.run.phase="cards";app.run.choices=[AtalaiaCatalog.card("treasury")];app.show_cards();app.choose_card(0)
 await create_timer(0.3).timeout
 check(app.run.phase=="doctrine" and app.modal_kind=="cards","Recurso após chefe abre doutrina")
 app.card_nodes[0].chosen.emit(0)
 await create_timer(0.4).timeout
 check(app.run.stage==1 and app.run.doctrines.size()==1 and app.run.phase=="prep","Doutrina animada conduz à próxima fase")
 app.qa_mode=false;app.save_game();app.qa_mode=true
 var saved=JSON.parse_string(FileAccess.get_file_as_string(app.SAVE_PATH))
 app.saved=saved;app.continue_game()
 check(app.run.stage==1 and app.run.towers[1].mods==["power"] and app.run.doctrines.size()==1,"Salvar/continuar preserva fase, carta e doutrina")
 DirAccess.remove_absolute(app.SAVE_PATH)
 if original_save!="":
  var file=FileAccess.open(save_path,FileAccess.WRITE)
  if file:file.store_string(original_save);file.close()
 app.sound.shutdown();await create_timer(0.15).timeout
 app.queue_free();await process_frame
 print("UI RESULTADO: %d falha(s)"%failures)
 quit(1 if failures else 0)
