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
 board=Node2D.new(); board.set_script(preload("res://scripts/board.gd")); add_child(board)
 board.position=Vector2(16,174); board.scale=Vector2(1.16,1.0); board.run=run
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
 if "--showcase" in OS.get_cmdline_user_args(): start_showcase()
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
 var header=UI.panel(hud,Rect2(16,10,1568,66),Color("061a25"),Color("6c634d"))
 UI.image(header,load("res://assets/icon.svg"),Rect2(12,8,43,49))
 UI.label(header,"A T A L A I A",Rect2(65,1,310,39),29,UI.GOLD,true)
 UI.label(header,"G U A R D I Õ E S   D O   C R I S T A L",Rect2(65,39,330,19),10,Color("d6e1df"))
 UI.line(header,Vector2(406,13),Vector2(407,53),Color("435256"))
 map_label=UI.label(header,"",Rect2(428,10,340,46),18,UI.GOLD,true)
 stats_label=UI.label(header,"",Rect2(790,8,478,49),19,UI.WHITE)
 pause_button=UI.button(header,"Ⅱ",Rect2(1268,12,48,42),toggle_pause)
 speed_button=UI.button(header,"1×",Rect2(1324,12,48,42),toggle_speed)
 UI.button(header,"Salvar",Rect2(1380,12,82,42),func():save_game();toast("Campanha salva"))
 UI.button(header,"⚙",Rect2(1470,12,76,42),show_settings)
 quick=UI.panel(hud,Rect2(30,94,1132,68),Color("061a25"),Color("b1935e"))
 quick_icon=UI.image(quick,AtalaiaArt.tower("ballista"),Rect2(6,0,80,66))
 quick_label=UI.label(quick,"",Rect2(96,4,570,29),19,UI.WHITE,true)
 quick_mods=UI.label(quick,"",Rect2(96,35,660,25),12,UI.MUTED)
 upgrade_button=UI.button(quick,"EVOLUIR [U]",Rect2(750,10,198,48),upgrade_selected,true)
 move_button=UI.button(quick,"Mover",Rect2(958,10,76,48),func():
  moving=not moving;build_type="";toast("Escolha um espaço para mover ou trocar. Sem custo entre ondas.");refresh_hud())
 sell_button=UI.button(quick,"Vender",Rect2(1042,10,78,48),func():
  if run.sell(selected): selected=-1;drain_events();refresh_hud();save_game())
 var bottom=UI.panel(hud,Rect2(16,813,1160,75),Color("071b25"),Color("716448"))
 for i in range(6):
  var type=AtalaiaCatalog.TYPES[i]
  var b=AtalaiaCatalog.TOWERS[type]
  var x=7+i*192
  var button=UI.button(bottom,"",Rect2(x,7,184,61),func():choose_build(type))
  UI.image(button,AtalaiaArt.tower(type),Rect2(2,0,62,60))
  var short_name={"ice":"Glacial","flame":"Chamas","poison":"Alquimista"}.get(type,b.name)
  UI.label(button,short_name,Rect2(65,7,118,24),15,Color(b.color))
  UI.label(button,"%d ouro · [%d]"%[b.cost,i+1],Rect2(65,32,118,19),11,UI.MUTED)
  button.tooltip_text=b.role+"\nEscolha o tipo e clique em um círculo junto à estrada."
  arsenal_buttons[type]=button
 doctrine_tray=UI.panel(hud,Rect2(30,748,1132,48),Color(0.02,0.075,0.10,0.94),Color("56634e"))
 doctrine_label=UI.label(doctrine_tray,"",Rect2(14,9,1104,30),12,UI.WHITE)
 sidebar=UI.panel(hud,Rect2(1192,88,392,800),Color("061923"),Color("52636a"))
 UI.label(sidebar,"Dano da defesa",Rect2(20,13,352,37),25,UI.GOLD,true)
 UI.label(sidebar,"DANO EFETIVO · SEM EXCESSO",Rect2(20,51,350,23),10,UI.MUTED)
 UI.button(sidebar,"Torretas",Rect2(18,84,169,38),func():report_group=false;refresh_hud())
 UI.button(sidebar,"Tipos",Rect2(201,84,169,38),func():report_group=true;refresh_hud())
 UI.button(sidebar,"Campanha / onda",Rect2(18,130,352,30),func():report_wave=not report_wave;refresh_hud())
 report_title=UI.label(sidebar,"",Rect2(20,166,350,26),12,UI.MUTED)
 var scroll=ScrollContainer.new(); sidebar.add_child(scroll); scroll.position=Vector2(16,200); scroll.size=Vector2(360,470)
 scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
 rows=VBoxContainer.new(); scroll.add_child(rows); rows.size_flags_horizontal=Control.SIZE_EXPAND_FILL
 rows.add_theme_constant_override("separation",7)
 UI.button(sidebar,"Exportar dano · CSV",Rect2(18,682,352,36),export_damage)
 wave_button=UI.button(sidebar,"INICIAR ONDA  ·  ESPAÇO",Rect2(18,734,352,49),launch_wave,true)
 toast_label=UI.label(hud,"",Rect2(225,721,820,38),15,UI.GOLD)
 toast_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 toast_label.add_theme_stylebox_override("normal",UI.box(Color(0.02,0.07,0.1,0.92),Color("aa915c")))
 toast_label.visible=false

func refresh_hud():
 if not is_instance_valid(quick): return
 board.selected=selected; board.build_type=build_type
 map_label.text="%02d / 03  ·  %s"%[run.stage+1,run.maps[run.stage].short]
 stats_label.text="♡  %d / 30     ◈  %d     ◇  %02d / 15"%[run.core,run.gold,run.wave]
 pause_button.text="▶" if paused else "Ⅱ"
 speed_button.text="%d×"%int(speed)
 wave_button.disabled=run.phase!="prep" or in_menu or paused
 wave_button.text="INICIAR ONDA %d  ·  ESPAÇO"%(run.wave+1) if run.phase=="prep" else ("ONDA EM ANDAMENTO" if run.phase=="wave" else "ESCOLHA SUA RECOMPENSA")
 for type in arsenal_buttons:
  var b=arsenal_buttons[type]
  b.disabled=run.phase!="prep" or run.gold<AtalaiaCatalog.TOWERS[type].cost
  b.add_theme_stylebox_override("normal",UI.box(Color("1e3e47") if build_type==type else Color("102b38"),UI.GOLD if build_type==type else Color("3b5968")))
 var t=run.tower_by_id(selected)
 if t.is_empty():
  quick_icon.visible=false
  quick_label.text="Erga a defesa do cristal"
  quick_mods.text="Escolha uma arma abaixo e clique em um círculo.  ·  Espaço: próxima onda  ·  U: evoluir"
  upgrade_button.visible=false; move_button.visible=false;sell_button.visible=false
  if build_type!="":
   quick_label.text="Construir · "+AtalaiaCatalog.TOWERS[build_type].name
   quick_mods.text=AtalaiaCatalog.TOWERS[build_type].role+"  ·  Clique em um círculo próximo da estrada. Esc cancela."
 else:
  var s=run.stats(t)
  quick_icon.visible=true; quick_icon.texture=AtalaiaArt.tower(t.type)
  quick_label.text="T%02d · %s  ·  Nv. %d   |   %d dano  ·  %d alcance  ·  %.2f s"%[t.id,AtalaiaCatalog.TOWERS[t.type].name,t.level,s.damage,s.range,s.rate]
  var mods: Array=[]
  for id in t.mods: mods.append(AtalaiaCatalog.card(id).name)
  quick_mods.text="Cartas %d/3: %s"%[t.mods.size()," · ".join(mods)] if not mods.is_empty() else "Sem cartas individuais · selecione no prêmio de cada onda"
  var count=run.doctrines.filter(func(d):return d.type==t.type).size()
  if count>0: quick_mods.text+="  |  ✦ %d doutrina(s)"%count
  if moving: quick_mods.text="MOVER / TROCAR · Clique no novo círculo. Nível e cartas acompanham esta torreta."
  upgrade_button.visible=true;move_button.visible=true;sell_button.visible=true
  upgrade_button.text="NÍVEL MÁXIMO" if t.level>=3 else "EVOLUIR · %d  [U]"%s.cost
  upgrade_button.disabled=t.level>=3 or run.gold<s.cost or run.phase not in ["prep","wave"]
  move_button.disabled=run.phase!="prep"; sell_button.disabled=run.phase!="prep"
 for n in doctrine_tray.get_children():
  if n!=doctrine_label:doctrine_tray.remove_child(n);n.queue_free()
 doctrine_label.visible=run.doctrines.is_empty()
 doctrine_label.text="DOUTRINAS · Derrote o chefe para fortalecer todas as torretas de um tipo, inclusive as futuras."
 for i in range(run.doctrines.size()):
  var d=run.doctrines[i]
  var b=AtalaiaCatalog.TOWERS[d.type]
  var chip=UI.panel(doctrine_tray,Rect2(6+i*373,4,365,40),Color("0c2632"),Color(b.color).darkened(0.35))
  UI.image(chip,AtalaiaArt.tower(d.type),Rect2(3,0,44,40))
  UI.label(chip,{"power":"Arsenal","range":"Vigília","mastery":"Maestria"}[d.effect]+" · "+b.name,Rect2(56,1,290,21),13,Color(b.color))
  UI.label(chip,"TODAS DO TIPO · ATUAIS E FUTURAS",Rect2(56,23,290,15),9,UI.MUTED)
 refresh_report()

func refresh_report():
 for n in rows.get_children(): rows.remove_child(n); n.queue_free()
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
 if data.is_empty():
  var l=Label.new(); l.text="Construa uma torreta.\nO dano efetivo aparecerá aqui\nem tempo real."; l.add_theme_color_override("font_color",UI.MUTED); l.add_theme_font_override("font",UI.font()); l.add_theme_font_size_override("font_size",16); rows.add_child(l)
 for r in data:
  var row=Panel.new();row.custom_minimum_size=Vector2(345,93);rows.add_child(row)
  var color=Color(AtalaiaCatalog.TOWERS[r.type].color)
  row.add_theme_stylebox_override("panel",UI.box(Color("102833") if r.id==selected else Color("091f2a"),UI.GOLD if r.id==selected else Color("304b58")))
  UI.image(row,AtalaiaArt.tower(r.type),Rect2(2,7,75,72))
  var name=AtalaiaCatalog.TOWERS[r.type].name
  if r.id>=0: name="T%02d · %s"%[r.id,name]
  UI.label(row,name,Rect2(84,9,248,25),14,UI.WHITE)
  UI.label(row,r.detail,Rect2(84,35,248,21),11,UI.MUTED)
  UI.label(row,"%s  ·  %.0f DPS  ·  %.1f%%"%[format_number(r.damage),r.damage/maxf(1,duration),r.damage/maxf(1,total)*100],Rect2(84,58,248,20),12,color)
  UI.line(row,Vector2(84,82),Vector2(328,85),Color("1c3945"))
  UI.line(row,Vector2(84,82),Vector2(84+244*r.damage/maxf(1,total),85),color)
  if r.id>=0:
   var hit=Button.new();row.add_child(hit);hit.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);hit.flat=true
   hit.tooltip_text="Selecionar esta torreta e suas cartas"
   hit.pressed.connect(func():
    if not run.tower_by_id(r.id).is_empty(): selected=r.id;moving=false;build_type="";refresh_hud())

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
 var version=UI.label(p,"GODOT 2D  /  PROJETO INICIAL 0.1",Rect2(40,585,780,28),11,UI.GOLD);version.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER

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

func start_showcase():
 # Explicit developer demonstration fixture, never loaded into a player's campaign.
 start_game();run.gold=1100;run.wave=6;run.set_map(1);board.reset_visuals()
 var types=["ballista","mortar","flame","tesla","ice","poison","ballista","flame"]
 var positions=[3,6,1,2,4,0,12,10]
 for i in range(types.size()):run.build(types[i],positions[i])
 run.doctrines=[{"type":"ballista","effect":"power"},{"type":"poison","effect":"mastery"}]
 run.towers[1].mods=["power","splash"];selected=run.towers[1].id
 run.events.clear();run.start_wave();drain_events();refresh_hud()
