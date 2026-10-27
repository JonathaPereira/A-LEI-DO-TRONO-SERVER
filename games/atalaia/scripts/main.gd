extends Node2D
const Run = preload("res://scripts/run.gd")
const UI = preload("res://scripts/ui.gd")
const CardView = preload("res://scripts/card_view.gd")
const SAVE_PATH="user://atalaia_campaign_v1.json"
const SETTINGS_PATH="user://atalaia_settings_v1.json"
var run: AtalaiaRun
var board: Node2D
var sound: Node
var hud: Control
var modal: Control
var quick: Panel
var sidebar: Panel
var rows: VBoxContainer
var stats_label: Label
var map_label: Label
var life_label: Label
var wave_label: Label
var phase_label: Label
var wave_progress_label: Label
var life_meter: ProgressBar
var campaign_meter: ProgressBar
var wave_meter: ProgressBar
var gold_display_value=-1.0
var gold_target=-1
var gold_tween: Tween
var quick_label: Label
var quick_mods: Label
var quick_icon: TextureRect
var upgrade_button: Button
var move_button: Button
var sell_button: Button
var wave_button: Button
var pause_button: Button
var speed_button: Button
var report_title: Label
var report_rows: Dictionary={}
var doctrine_signature=""
var doctrine_label: Label
var doctrine_tray: Panel
var toast_label: Label
var arsenal_buttons: Dictionary={}
var selected=-1
var build_type=""
var moving=false
var paused=false
var speed=1.0
var in_menu=true
var report_group=false
var report_wave=false
var hud_timer=0.0
var save_timer=0.0
var toast_time=0.0
var saved: Dictionary={}
var qa_mode=false
var card_nodes: Array=[]
var selected_card=-1
var target_ids: Array=[]
var target_selector: OptionButton
var apply_button: Button
var target_panel: Panel
var target_description: Label
var modal_kind=""
var selection_locked=false

func _ready():
 qa_mode="--qa" in OS.get_cmdline_user_args() or "--showcase" in OS.get_cmdline_user_args()
 run=Run.new(int(Time.get_unix_time_from_system()))
 var battlefield=Control.new();add_child(battlefield)
 battlefield.position=Vector2(24,116);battlefield.size=Vector2(1100,682)
 battlefield.clip_contents=true;battlefield.mouse_filter=Control.MOUSE_FILTER_IGNORE
 board=Node2D.new(); board.set_script(preload("res://scripts/board.gd")); battlefield.add_child(board)
 board.scale=Vector2(1.1,1.1); board.run=run
 board.pad_clicked.connect(on_pad)
 var core_node=Node2D.new(); core_node.set_script(preload("res://scripts/core.gd")); core_node.board=board; board.add_child(core_node)
 core_node.z_index=1
 sound=Node.new(); sound.set_script(preload("res://scripts/sound.gd")); add_child(sound)
 var layer=CanvasLayer.new(); add_child(layer)
 hud=Control.new(); layer.add_child(hud); hud.size=Vector2(1600,900); hud.mouse_filter=Control.MOUSE_FILTER_IGNORE
 modal=Control.new(); layer.add_child(modal); modal.size=Vector2(1600,900); modal.mouse_filter=Control.MOUSE_FILTER_IGNORE
 build_hud()
 load_settings()
 if not qa_mode and FileAccess.file_exists(SAVE_PATH):
  var candidate=JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
  if candidate is Dictionary:
   var check=Run.new()
   if check.load_data(candidate): saved=candidate
 show_menu()
 if "--showcase" in OS.get_cmdline_user_args():
  var region=1
  for arg in OS.get_cmdline_user_args():
   if arg.begins_with("--showcase-region="):region=arg.get_slice("=",1).to_int()
  start_showcase(region)
 refresh_hud()
 get_tree().auto_accept_quit=false

func _notification(what):
 if what==NOTIFICATION_WM_CLOSE_REQUEST:
  save_game(); save_settings();sound.shutdown()
  await get_tree().create_timer(0.12).timeout
  get_tree().quit()

func _process(dt):
 if not in_menu and not paused and run.phase=="wave":
  # Fixed maximum simulation step keeps fast-forward numerically stable.
  var remaining=dt*speed
  while remaining>0:
   var step=minf(remaining,1.0/60.0)
   run.tick(step); remaining-=step
  drain_events()
 sound.update_flame(not paused and not in_menu and run.phase=="wave" and run.towers.any(func(t):return t.type=="flame" and t.firing),dt)
 board.interactive=not in_menu and modal_kind=="" and not paused
 hud_timer+=dt; save_timer+=dt
 if hud_timer>0.2: hud_timer=0; refresh_hud()
 if save_timer>4.0: save_timer=0; save_game()
 toast_time=maxf(0.0,toast_time-dt)
 toast_label.visible=toast_time>0

func _unhandled_key_input(e):
 if not e.is_pressed() or e.is_echo(): return
 if e.keycode==KEY_M: sound.toggle_mute(); toast("Áudio silenciado" if sound.muted else "Áudio ativado"); return
 if in_menu: return
 if e.keycode==KEY_ESCAPE:
  if modal_kind=="settings": close_settings()
  elif moving or build_type!="": moving=false; build_type=""; refresh_hud()
  elif modal_kind=="": toggle_pause()
  return
 if modal_kind!="": return
 match e.keycode:
  KEY_SPACE: launch_wave()
  KEY_U: upgrade_selected()
  KEY_P: toggle_pause()
  KEY_F: toggle_speed()
  KEY_1,KEY_2,KEY_3,KEY_4,KEY_5,KEY_6: choose_build(AtalaiaCatalog.TYPES[e.keycode-KEY_1])

func build_hud():
 var header=UI.panel(hud,Rect2(16,12,1568,88),Color("0b171c"),Color("495151"))
 UI.image(header,load("res://assets/icon.svg"),Rect2(18,17,43,49))
 UI.label(header,"A T A L A I A",Rect2(76,12,230,38),28,UI.GOLD,true)
 UI.label(header,"GUARDIÕES DO CRISTAL",Rect2(77,53,230,18),11,UI.MUTED)
 map_label=UI.label(header,"",Rect2(304,20,150,48),16,UI.WHITE,true)
 map_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 var life=UI.panel(header,Rect2(474,12,180,64),Color("15262b"),Color("34484c"))
 UI.icon(life,"core",Rect2(13,16,30,30),Color("81dbe7"))
 UI.label(life,"NÚCLEO",Rect2(54,6,120,17),11,UI.MUTED)
 life_label=UI.label(life,"",Rect2(54,22,120,32),25,UI.WHITE)
 life_meter=UI.meter(life,Rect2(54,57,108,3),Color("77cbbc"))
 var money=UI.panel(header,Rect2(668,12,180,64),Color("29271d"),Color("62563b"))
 UI.icon(money,"gold",Rect2(13,16,30,30))
 UI.label(money,"OURO",Rect2(54,6,120,17),11,UI.GOLD)
 stats_label=UI.label(money,"",Rect2(54,22,120,32),27,UI.GOLD)
 var wave=UI.panel(header,Rect2(862,12,180,64),Color("182530"),Color("354858"))
 UI.icon(wave,"wave",Rect2(13,16,28,30),Color("9cc3ee"))
 UI.label(wave,"ONDA",Rect2(54,6,120,17),11,UI.MUTED)
 wave_label=UI.label(wave,"",Rect2(54,22,120,32),25,UI.WHITE)
 campaign_meter=UI.meter(wave,Rect2(54,57,108,3),Color("91bde5"))
 pause_button=UI.button(header,"Pausar",Rect2(1060,22,102,44),toggle_pause)
 speed_button=UI.button(header,"1x",Rect2(1174,22,66,44),toggle_speed)
 UI.button(header,"Salvar",Rect2(1252,22,116,44),func():save_game();toast("Campanha salva"))
 UI.button(header,"Opções",Rect2(1380,22,168,44),show_settings)
 var frame=UI.panel(hud,Rect2(16,108,1118,698),Color(0,0,0,0),Color("647064"))
 frame.mouse_filter=Control.MOUSE_FILTER_IGNORE
 var phase=UI.panel(hud,Rect2(40,130,380,68),Color(0.025,0.065,0.07,0.91),Color("637364"))
 phase.mouse_filter=Control.MOUSE_FILTER_IGNORE
 UI.icon(phase,"target",Rect2(14,15,30,30),Color("a2d4c0"))
 phase_label=UI.label(phase,"",Rect2(58,8,306,25),15,UI.WHITE)
 wave_progress_label=UI.label(phase,"",Rect2(58,35,306,18),12,UI.MUTED)
 wave_meter=UI.meter(phase,Rect2(58,57,302,3),UI.GOLD)
 var bottom=UI.panel(hud,Rect2(16,816,1118,72),Color("0c1b20"),Color("52615b"))
 for i in range(6):
  var type=AtalaiaCatalog.TYPES[i]
  var b=AtalaiaCatalog.TOWERS[type]
  var x=7+i*184
  var button=UI.button(bottom,"",Rect2(x,7,178,58),func():choose_build(type))
  UI.image(button,AtalaiaArt.tower(type),Rect2(2,0,59,57))
  var short_name={"ice":"Glacial","flame":"Chamas","poison":"Alquimista"}.get(type,b.name)
  UI.label(button,short_name,Rect2(63,7,112,23),16,Color(b.color))
  UI.label(button,"%d ouro  |  %d"%[b.cost,i+1],Rect2(63,33,112,17),12,UI.MUTED)
  button.tooltip_text=b.role+"\nEscolha a arma e clique em um terreno livre."
  arsenal_buttons[type]=button
 sidebar=UI.panel(hud,Rect2(1150,108,434,780),Color("0b191e"),Color("415553"))
 UI.label(sidebar,"COMANDO DA DEFESA",Rect2(20,11,394,29),13,UI.GOLD)
 quick=UI.panel(sidebar,Rect2(14,47,406,220),Color("12262b"),Color("53655b"))
 quick_icon=UI.image(quick,AtalaiaArt.tower("ballista"),Rect2(8,28,80,95))
 quick_label=UI.label(quick,"",Rect2(100,13,292,52),22,UI.WHITE,true)
 quick_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 quick_mods=UI.label(quick,"",Rect2(100,73,292,81),13,UI.MUTED)
 quick_mods.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 upgrade_button=UI.button(quick,"EVOLUIR [U]",Rect2(12,167,216,40),upgrade_selected,true)
 move_button=UI.button(quick,"Mover",Rect2(236,167,74,40),func():
  moving=not moving;build_type="";toast("Escolha um espaço para mover ou trocar. Sem custo entre ondas.");refresh_hud())
 sell_button=UI.button(quick,"Vender",Rect2(318,167,74,40),func():
  if run.sell(selected): selected=-1;drain_events();refresh_hud();save_game())
 UI.label(sidebar,"DANO DA DEFESA",Rect2(20,283,394,28),17,UI.GOLD,true)
 UI.button(sidebar,"Torretas",Rect2(18,320,125,32),func():report_group=false;refresh_hud())
 UI.button(sidebar,"Tipos",Rect2(151,320,105,32),func():report_group=true;refresh_hud())
 UI.button(sidebar,"Onda / total",Rect2(264,320,152,32),func():report_wave=not report_wave;refresh_hud())
 report_title=UI.label(sidebar,"",Rect2(20,360,394,24),12,UI.MUTED)
 var scroll=ScrollContainer.new(); sidebar.add_child(scroll); scroll.position=Vector2(16,392); scroll.size=Vector2(402,177)
 scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
 rows=VBoxContainer.new(); scroll.add_child(rows); rows.size_flags_horizontal=Control.SIZE_EXPAND_FILL
 rows.add_theme_constant_override("separation",7)
 doctrine_tray=UI.panel(sidebar,Rect2(16,583,402,74),Color("122526"),Color("3c554b"))
 doctrine_label=UI.label(doctrine_tray,"",Rect2(12,10,378,57),12,UI.MUTED)
 doctrine_label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 UI.button(sidebar,"Exportar relatório CSV",Rect2(18,670,398,34),export_damage)
 wave_button=UI.button(sidebar,"INICIAR ONDA  |  ESPAÇO",Rect2(18,720,398,44),launch_wave,true)
 toast_label=UI.label(hud,"",Rect2(155,754,850,36),15,UI.GOLD)
 toast_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 toast_label.add_theme_stylebox_override("normal",UI.box(Color(0.025,0.065,0.07,0.96),Color("88734a")))
 toast_label.visible=false

func refresh_hud():
 if not is_instance_valid(quick): return
 board.selected=selected; board.build_type=build_type
 map_label.text="REGIÃO %02d / 03\n%s"%[run.stage+1,run.maps[run.stage].short]
 update_gold(run.gold)
 life_label.text="%d / 30"%run.core
 wave_label.text="%02d / 15"%run.wave
 life_meter.value=run.core/30.0
 campaign_meter.value=run.wave/15.0
 var resolved=maxi(0,run.spawn_count-run.enemies.size())
 wave_meter.value=clampf(float(resolved)/maxi(1,run.spawn_total),0,1) if run.phase=="wave" else 0.0
 phase_label.text="DEFENDA O CRISTAL" if run.phase=="wave" else "PREPARE SUA DEFESA"
 wave_progress_label.text="%d / %d inimigos resolvidos"%[resolved,run.spawn_total] if run.phase=="wave" else "%d via(s)  |  Escolha uma arma e um terreno"%run.routes.size()
 if paused:phase_label.text="DEFESA PAUSADA"
 pause_button.text="Retomar" if paused else "Pausar"
 speed_button.text="%dx"%int(speed)
 wave_button.disabled=run.phase!="prep" or in_menu or paused
 wave_button.text="INICIAR ONDA %d  |  ESPAÇO"%(run.wave+1) if run.phase=="prep" else ("ONDA EM ANDAMENTO" if run.phase=="wave" else "ESCOLHA SUA RECOMPENSA")
 for type in arsenal_buttons:
  var b=arsenal_buttons[type]
  b.disabled=run.phase!="prep" or run.gold<AtalaiaCatalog.TOWERS[type].cost
  b.add_theme_stylebox_override("normal",UI.box(Color("29443e") if build_type==type else Color("12292c"),UI.GOLD if build_type==type else Color("3c5355")))
 var t=run.tower_by_id(selected)
 if t.is_empty():
  quick_icon.visible=false
  quick_label.text="Erga a defesa\ndo cristal"
  quick_mods.text="Escolha uma arma abaixo e clique em um terreno.\nEspaço: próxima onda."
  upgrade_button.visible=false; move_button.visible=false;sell_button.visible=false
  if build_type!="":
   quick_icon.visible=true;quick_icon.texture=AtalaiaArt.tower(build_type)
   quick_label.text=AtalaiaCatalog.TOWERS[build_type].name
   quick_mods.text=AtalaiaCatalog.TOWERS[build_type].role+"\nClique em um terreno livre. Esc cancela."
 else:
  var s=run.stats(t)
  quick_icon.visible=true; quick_icon.texture=AtalaiaArt.tower(t.type)
  quick_label.text="%s\nNível %d  |  T%02d"%[AtalaiaCatalog.TOWERS[t.type].name,t.level,t.id]
  var mods: Array=[]
  for id in t.mods: mods.append(AtalaiaCatalog.card(id).name)
  quick_mods.text="%d dano  |  %d alcance  |  %.2fs\n"%[s.damage,s.range,s.rate]
  quick_mods.text+="Cartas %d/3: %s"%[t.mods.size()," / ".join(mods)] if not mods.is_empty() else "3 espaços para cartas disponíveis"
  if moving: quick_mods.text="MOVER / TROCAR\nClique em outro terreno. Nível e cartas acompanham a torreta."
  upgrade_button.visible=true;move_button.visible=true;sell_button.visible=true
  upgrade_button.text="NÍVEL MÁXIMO" if t.level>=3 else "EVOLUIR  %d OURO [U]"%s.cost
  upgrade_button.disabled=t.level>=3 or run.gold<s.cost or run.phase not in ["prep","wave"]
  move_button.disabled=run.phase!="prep"; sell_button.disabled=run.phase!="prep"
 refresh_doctrines()
 refresh_report()

func refresh_doctrines():
 var signature=JSON.stringify(run.doctrines)
 if doctrine_signature==signature:return
 doctrine_signature=signature
 for n in doctrine_tray.get_children():
  if n!=doctrine_label:doctrine_tray.remove_child(n);n.queue_free()
 doctrine_label.visible=run.doctrines.is_empty()
 doctrine_label.text="DOUTRINAS\nDerrote o chefe para fortalecer todas as torretas de um tipo."
 for i in range(run.doctrines.size()):
  var d=run.doctrines[i]
  var b=AtalaiaCatalog.TOWERS[d.type]
  var chip=UI.panel(doctrine_tray,Rect2(5+i*198,5,193,64),Color("162d2d"),Color(b.color).darkened(0.4))
  UI.image(chip,AtalaiaArt.tower(d.type),Rect2(2,6,50,48))
  var name=UI.label(chip,{"power":"Arsenal","range":"Vigília","mastery":"Maestria"}[d.effect]+"\n"+b.name,Rect2(57,8,130,49),12,Color(b.color))
  name.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART

func update_gold(value: int):
 if gold_target==value:return
 gold_target=value
 if gold_display_value<0:
  gold_display_value=value
  stats_label.text=str(value)
  return
 if gold_tween and gold_tween.is_running():gold_tween.kill()
 stats_label.modulate=Color("fff0b8") if value>gold_display_value else Color("f2ac91")
 gold_tween=create_tween().set_parallel(true)
 gold_tween.tween_method(func(number):
  gold_display_value=number
  stats_label.text=str(roundi(number)),gold_display_value,float(value),0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
 gold_tween.tween_property(stats_label,"modulate",Color.WHITE,0.5)

func refresh_report():
 var data: Array=[]
 var key="wave_damage" if report_wave else "damage"
 var total=0.0
 for record in run.records.values(): total+=record[key]
 if report_group:
  for type in AtalaiaCatalog.TYPES:
   var damage=0.0;var count=0
   for r in run.records.values():
    if r.type==type: damage+=r[key];count+=1
   if count>0: data.append({"id":-1,"type":type,"damage":damage,"detail":"%d construída(s)"%count})
 else:
  for r in run.records.values():
   var t=run.tower_by_id(int(r.id))
   data.append({"id":int(r.id),"type":r.type,"damage":r[key],"detail":"Vendida · histórico" if t.is_empty() else "Nível %d · %d abates"%[t.level,r.kills]})
 data.sort_custom(func(a,b):return a.damage>b.damage)
 var duration=run.wave_elapsed if report_wave else run.elapsed
 report_title.text="%s · %s dano · %.0f DPS"%["ONDA" if report_wave else "CAMPANHA",format_number(total),total/maxf(1,duration)]
 var visible_keys: Array=[]
 if data.is_empty():
  visible_keys.append("empty")
  if not report_rows.has("empty"):
   var hint=Label.new();hint.text="Construa uma torreta.\nO dano efetivo aparecerá aqui\nem tempo real.";hint.add_theme_color_override("font_color",UI.MUTED);hint.add_theme_font_override("font",UI.font());hint.add_theme_font_size_override("font_size",16)
   rows.add_child(hint);report_rows.empty=hint
 for i in range(data.size()):
  var r=data[i]
  var key_id="type:"+r.type if report_group else "tower:"+str(r.id)
  visible_keys.append(key_id)
  var color=Color(AtalaiaCatalog.TOWERS[r.type].color)
  if not report_rows.has(key_id):
   var row=Panel.new();row.custom_minimum_size=Vector2(389,84);rows.add_child(row)
   report_rows[key_id]=row
   UI.image(row,AtalaiaArt.tower(r.type),Rect2(2,4,75,72))
   var widgets={
    "name":UI.label(row,"",Rect2(84,6,292,25),14,UI.WHITE),
    "detail":UI.label(row,"",Rect2(84,31,292,21),11,UI.MUTED),
    "damage":UI.label(row,"",Rect2(84,54,292,20),12,color)
   }
   UI.line(row,Vector2(84,77),Vector2(376,80),Color("1c3940"))
   widgets.bar=UI.line(row,Vector2(84,77),Vector2(84,80),color)
   row.set_meta("widgets",widgets);row.set_meta("tower_id",r.id)
   if r.id>=0:
    var hit=Button.new();row.add_child(hit);hit.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);hit.flat=true
    hit.tooltip_text="Selecionar esta torreta e suas cartas"
    hit.pressed.connect(func():
     var id=int(row.get_meta("tower_id"))
     if not run.tower_by_id(id).is_empty(): selected=id;moving=false;build_type="";refresh_hud())
  var row=report_rows[key_id]
  rows.move_child(row,i)
  var widgets: Dictionary=row.get_meta("widgets")
  var name=AtalaiaCatalog.TOWERS[r.type].name
  if r.id>=0:name="T%02d · %s"%[r.id,name]
  widgets.name.text=name
  widgets.detail.text=r.detail
  widgets.damage.text="%s  ·  %.0f DPS  ·  %.1f%%"%[format_number(r.damage),r.damage/maxf(1,duration),r.damage/maxf(1,total)*100]
  widgets.bar.size.x=292*r.damage/maxf(1,total)
  var active=r.id==selected
  if not row.has_meta("selected") or bool(row.get_meta("selected"))!=active:
   row.set_meta("selected",active)
   row.add_theme_stylebox_override("panel",UI.box(Color("18332f") if active else Color("0d2228"),UI.GOLD if active else Color("304b50")))
 for key_id in report_rows.keys():
  if key_id not in visible_keys:
   var row=report_rows[key_id];rows.remove_child(row);row.queue_free();report_rows.erase(key_id)

func format_number(n: float) -> String:
 return "%.1fk"%(n/1000.0) if n>=10000 else str(int(n))

func choose_build(type: String):
 if run.phase!="prep": toast("Construa entre as ondas. Durante o combate você pode evoluir.");return
 build_type=type; moving=false;selected=-1
 sound.play("click");refresh_hud()

func on_pad(index: int):
 if moving:
  if run.move_tower(selected,index): moving=false;drain_events();save_game()
 elif build_type!="" and run.occupant(index).is_empty():
  if run.build(build_type,index):
   selected=int(run.towers[-1].id);build_type="";drain_events();save_game()
  else: toast("Ouro insuficiente ou construção indisponível.")
 else:
  var t=run.occupant(index)
  selected=int(t.id) if not t.is_empty() else -1
  moving=false
 refresh_hud()

func upgrade_selected():
 if run.upgrade(selected): drain_events();refresh_hud();save_game()

func launch_wave():
 if in_menu or paused or modal_kind!="": return
 if run.towers.is_empty(): toast("Construa sua primeira defesa antes de iniciar a onda.");return
 if run.start_wave(): build_type="";moving=false;drain_events();refresh_hud();save_game()

func toggle_speed():
 speed=2.0 if speed==1.0 else 1.0;refresh_hud()

func toggle_pause():
 if in_menu or modal_kind!="": return
 paused=not paused;toast("PAUSADO · P ou Esc para continuar" if paused else "Defesa retomada");refresh_hud()

func toast(text: String):
 toast_label.text=text;toast_time=3.8;toast_label.visible=true

func drain_events():
 var buffered=run.events.duplicate();run.events.clear()
 for e in buffered:
  board.event(e);sound.event(e)
  match e.kind:
   "cards","doctrine": show_cards();save_game()
   "map":
    selected=-1;moving=false;board.reset_visuals()
    toast("FASE %d · %s · +90 ouro e +5 integridade"%[run.stage+1,run.maps[run.stage].name]);save_game()
   "victory","defeat": show_ending();save_game()

func clear_modal():
 for n in modal.get_children(): modal.remove_child(n);n.queue_free()
 modal_kind="";card_nodes.clear();selected_card=-1;selection_locked=false

func veil(alpha: float = 0.85):
 var v=ColorRect.new();modal.add_child(v);v.size=Vector2(1600,900);v.color=Color(0.015,0.045,0.065,alpha)

func show_menu():
 clear_modal();modal_kind="menu";in_menu=true;hud.visible=false;veil(0.68)
 var p=UI.panel(modal,Rect2(370,128,860,644),Color(0.025,0.075,0.10,0.96),Color("a38b59"))
 UI.image(p,load("res://assets/icon.svg"),Rect2(388,26,84,84))
 var h=UI.label(p,"A T A L A I A",Rect2(50,118,760,72),57,UI.GOLD,true);h.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var sub=UI.label(p,"G U A R D I Õ E S   D O   C R I S T A L",Rect2(50,196,760,32),17,UI.WHITE);sub.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 UI.line(p,Vector2(110,250),Vector2(750,251),Color("75674f"))
 var d=UI.label(p,"Três territórios. Quinze ondas. Um cristal.\nErga a defesa, combine cartas e enfrente o abismo.",Rect2(70,277,720,74),19,UI.MUTED);d.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 if not saved.is_empty():
  UI.button(p,"CONTINUAR CAMPANHA · ONDA %d"%saved.wave,Rect2(210,370,440,54),continue_game,true)
  UI.button(p,"Nova campanha",Rect2(210,436,440,47),func():
   clear_modal();modal_kind="confirm";veil();var q=UI.panel(modal,Rect2(500,310,600,250));UI.label(q,"Iniciar nova campanha?",Rect2(30,30,540,45),27,UI.GOLD,true);UI.label(q,"O progresso atual será substituído.",Rect2(30,88,540,35),17,UI.MUTED);UI.button(q,"Voltar",Rect2(30,158,252,52),show_menu);UI.button(q,"Iniciar",Rect2(302,158,268,52),start_game,true))
 else: UI.button(p,"INICIAR CAMPANHA",Rect2(210,387,440,62),start_game,true)
 var f=UI.label(p,"1–6: construir   ·   Espaço: onda   ·   U: evoluir   ·   P: pausa   ·   M: áudio",Rect2(40,532,780,30),13,UI.MUTED);f.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var version=UI.label(p,"EDIÇÃO GODOT 0.2  /  EXPEDIÇÃO DO CRISTAL",Rect2(40,585,780,28),11,UI.GOLD);version.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER

func start_game():
 run=Run.new(int(Time.get_unix_time_from_system()));board.run=run;board.reset_visuals();selected=-1
 in_menu=false;paused=false;hud.visible=true;clear_modal();refresh_hud();save_game()
 toast("Escolha uma arma abaixo e construa junto ao caminho. Espaço inicia a onda.")

func continue_game():
 var loaded=Run.new()
 if not loaded.load_data(saved):toast("Não foi possível abrir o progresso.");return
 run=loaded;board.run=run;board.reset_visuals();selected=-1;in_menu=false;paused=false;hud.visible=true;clear_modal()
 if run.phase in ["cards","doctrine"]: show_cards()
 elif run.phase in ["victory","defeat"]: show_ending()
 refresh_hud()

func show_cards():
 clear_modal();modal_kind="cards";veil(0.91)
 var doctrine=run.phase=="doctrine"
 var label=UI.label(modal,"DOUTRINA DA ATALAIA" if doctrine else "O CRISTAL LHE CONCEDE UMA ESCOLHA",Rect2(230,94,1140,36),15,UI.GOLD)
 label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 label=UI.label(modal,"Fortaleça toda uma linhagem" if doctrine else "Uma carta. Uma nova possibilidade.",Rect2(220,143,1160,64),37,UI.WHITE,true);label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 label=UI.label(modal,"Afeta todas as torretas deste tipo, atuais e futuras. Não ocupa espaço individual." if doctrine else "Escolha o modificador e confirme a torreta que receberá o efeito. Até 3 cartas por torreta.",Rect2(200,212,1200,39),16,UI.MUTED);label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 for i in range(run.choices.size()):
  var c=run.choices[i].duplicate(true)
  if doctrine:
   var b=AtalaiaCatalog.TOWERS[c.type]
   c.name={"power":"Arsenal","range":"Vigília","mastery":"Maestria"}[c.effect]+" · "+b.name
   c.color=b.color;c.tag="DOUTRINA · TODAS DO TIPO"
   var mastery={"ballista":"18% menos intervalo entre tiros.","mortar":"+20 no raio da explosão.","flame":"+4 de queimadura por segundo.","tesla":"+1 alvo na cadeia de raios.","ice":"Lentidão de 65% (chefes resistem à metade).","poison":"+25% de dano de poça e +2 s de duração."}
   c.text={"power":"+18% de dano, incluindo poças e queimaduras.","range":"+15% de alcance para todas as torretas deste tipo.","mastery":mastery[c.type]}[c.effect]
  var view=Panel.new();view.set_script(CardView);modal.add_child(view);view.position=Vector2(340+i*315,282);view.setup(c,i,doctrine);view.enter(i*0.10)
  view.chosen.connect(choose_card);view.mouse_entered.connect(func():sound.play("hover",Vector2(800,450),-15))
  card_nodes.append(view)
 if not doctrine:
  target_panel=UI.panel(modal,Rect2(340,668,920,112),Color("0a2431"),Color("947c51"));target_panel.visible=false
  target_description=UI.label(target_panel,"",Rect2(18,9,884,28),14,UI.GOLD)
  target_selector=OptionButton.new();target_panel.add_child(target_selector);target_selector.position=Vector2(18,47);target_selector.size=Vector2(600,45)
  target_selector.add_theme_font_override("font",UI.font());target_selector.add_theme_font_size_override("font_size",15)
  target_selector.item_selected.connect(func(index):
   selected=target_ids[index];apply_button.text="Aplicar em T%02d"%selected;refresh_hud())
  apply_button=UI.button(target_panel,"Aplicar",Rect2(638,47,264,45),confirm_card,true)
  UI.button(modal,"Dispensar carta · +35 ouro",Rect2(625,813,350,42),func():
   if selection_locked:return
   run.skip_card();clear_modal();drain_events();refresh_hud();save_game())
 else:
  label=UI.label(modal,"Escolha uma doutrina para partir ao próximo território.",Rect2(340,690,920,52),17,UI.MUTED);label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER

func choose_card(index: int):
 if selection_locked:return
 if run.phase=="doctrine":
  selection_locked=true;card_nodes[index].consume()
  await get_tree().create_timer(0.23).timeout
  run.apply_doctrine(index);clear_modal();drain_events();refresh_hud();save_game();return
 selected_card=index
 var card=run.choices[index]
 if card.id=="treasury":
  selection_locked=true;card_nodes[index].consume()
  await get_tree().create_timer(0.23).timeout
  run.apply_card(index,-1);clear_modal();drain_events();refresh_hud();save_game();return
 target_ids.clear();target_selector.clear()
 for t in run.towers:
  if t.mods.size()<3 and card.id not in t.mods:
   target_ids.append(int(t.id));target_selector.add_item("T%02d · %s · nível %d · %d/3 cartas"%[t.id,AtalaiaCatalog.TOWERS[t.type].name,t.level,t.mods.size()])
 target_panel.visible=true
 apply_button.disabled=target_ids.is_empty()
 if target_ids.is_empty():target_description.text="Nenhuma torreta pode receber esta carta. Escolha outra ou dispense.";return
 var current=target_ids.find(selected)
 if current<0:current=0
 target_selector.select(current);selected=target_ids[current]
 target_description.text="%s → RECEBEDOR INDIVIDUAL"%card.name
 apply_button.text="Aplicar em T%02d"%selected
 refresh_hud()

func confirm_card():
 if selection_locked or selected_card<0 or target_ids.is_empty():return
 var owner=target_ids[target_selector.selected]
 selection_locked=true;card_nodes[selected_card].consume();apply_button.disabled=true
 await get_tree().create_timer(0.23).timeout
 var name=run.choices[selected_card].name
 if run.apply_card(selected_card,owner):
  clear_modal();drain_events();refresh_hud();save_game()
  toast("%s aplicada em T%02d · %s"%[name,owner,AtalaiaCatalog.TOWERS[run.tower_by_id(owner).type].name])

func show_ending():
 clear_modal();modal_kind="ending";veil(0.84)
 var win=run.phase=="victory"
 var p=UI.panel(modal,Rect2(375,210,850,480),Color("081e29"),UI.GOLD)
 var h=UI.label(p,"A Atalaia permanece." if win else "O cristal se apagou.",Rect2(50,66,750,72),37,UI.GOLD,true);h.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var text="Três territórios defendidos. O abismo recua." if win else "Reorganize a defesa, combine gelo e dano em área."
 h=UI.label(p,text+"\n%d abates · %d ondas · %d/30 de integridade"%[run.kills,run.wave,run.core],Rect2(50,162,750,84),18,UI.MUTED);h.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 UI.button(p,"Nova campanha",Rect2(220,294,410,58),start_game,true)
 UI.button(p,"Voltar ao título",Rect2(220,366,410,44),func():saved=run.to_data();show_menu())

func show_settings():
 if modal_kind!="" and not in_menu:return
 paused=true;clear_modal();modal_kind="settings";veil(0.83)
 var p=UI.panel(modal,Rect2(475,166,650,568),Color("091f2c"),UI.GOLD)
 UI.label(p,"Som e ambiente",Rect2(35,28,580,48),31,UI.GOLD,true)
 var labels={"Master":"Volume geral","Music":"Trilha ambiente","Effects":"Armas e interface","Ambience":"Paisagem sonora"}
 var i=0
 for bus in ["Master","Music","Effects","Ambience"]:
  UI.label(p,labels[bus],Rect2(36,105+i*72,250,34),16,UI.WHITE)
  var slider=HSlider.new();p.add_child(slider);slider.position=Vector2(294,109+i*72);slider.size=Vector2(310,30);slider.min_value=0;slider.max_value=1;slider.step=0.01;slider.value=sound.mix[bus]
  slider.value_changed.connect(func(value):sound.set_volume(bus,value))
  i+=1
 UI.button(p,"Retomar defesa",Rect2(35,416,580,54),close_settings,true)
 UI.button(p,"Salvar e voltar ao título",Rect2(35,486,580,43),func():save_game();save_settings();saved=run.to_data();show_menu())

func close_settings():
 clear_modal();paused=false;save_settings();refresh_hud()

func save_game():
 if qa_mode or in_menu:return
 var path=SAVE_PATH+".tmp"
 var file=FileAccess.open(path,FileAccess.WRITE)
 if file:
  file.store_string(JSON.stringify(run.to_data()));file.close()
  DirAccess.rename_absolute(path,SAVE_PATH)

func save_settings():
 if qa_mode:return
 var f=FileAccess.open(SETTINGS_PATH,FileAccess.WRITE)
 if f:f.store_string(JSON.stringify(sound.mix))

func load_settings():
 if qa_mode or not FileAccess.file_exists(SETTINGS_PATH):return
 var settings=JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
 if settings is Dictionary:
  for bus in sound.mix:
   if settings.has(bus):sound.set_volume(bus,clampf(settings[bus],0,1))

func export_damage():
 var path="user://atalaia-dano-onda-%02d.csv"%run.wave
 var f=FileAccess.open(path,FileAccess.WRITE)
 if not f:toast("Não foi possível exportar o relatório.");return
 f.store_csv_line(PackedStringArray(["Torreta","Tipo","Dano campanha","Dano onda","DPS campanha","Abates","Vendida"]),";")
 for r in run.records.values():f.store_csv_line(PackedStringArray(["T%02d"%r.id,AtalaiaCatalog.TOWERS[r.type].name,str(snappedf(r.damage,0.01)),str(snappedf(r.wave_damage,0.01)),str(snappedf(r.damage/maxf(1,run.elapsed),0.01)),str(r.kills),str(r.sold)]),";")
 f.close()
 if OS.has_feature("web"):
  JavaScriptBridge.download_buffer(FileAccess.get_file_as_bytes(path),path.get_file(),"text/csv;charset=utf-8")
  toast("Relatório CSV baixado")
 else:
  toast("CSV exportado: "+ProjectSettings.globalize_path(path))
  OS.shell_open(ProjectSettings.globalize_path("user://"))

func start_showcase(region: int = 1):
 # Explicit developer demonstration fixture, never loaded into a player's campaign.
 start_game();run.gold=1100;run.wave=6;run.set_map(clampi(region,0,2));board.reset_visuals()
 var types=["ballista","mortar","flame","tesla","ice","poison","ballista","flame"]
 var positions=[3,6,1,2,4,0,12,10]
 for i in range(types.size()):run.build(types[i],positions[i])
 run.doctrines=[{"type":"ballista","effect":"power"},{"type":"poison","effect":"mastery"}]
 run.towers[1].mods=["power","splash"];selected=run.towers[1].id
 run.events.clear();run.start_wave();drain_events();refresh_hud()
