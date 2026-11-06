extends Control
const Profile = preload("res://scripts/pvp_profile.gd")
const Fighter = preload("res://scripts/fighter.gd")
const GemIcon = preload("res://scripts/gem_icon.gd")
const AbilityArt = preload("res://scripts/ability_art.gd")
const Backdrop = preload("res://scripts/hub_backdrop.gd")
var app
var profile
var client
var selected_slot := 0
var class_filter := ""
var endpoint: LineEdit
var nickname: LineEdit
var room_code: LineEdit
var status_label: Label
var room_label: Label
var ready_button: Button
var connect_buttons: Array[Button] = []
var roster: GridContainer
var team_row: HBoxContainer
var details: VBoxContainer
var hero_buttons: Dictionary = {}
var gem_pickers: Array[OptionButton] = []
var team_buttons: Array[Button] = []
var message := "Escolha seu trio. Crie uma sala ou entre usando o código de outra pessoa."
var elapsed := 0.0
func _ready() -> void:
	profile=Profile.new(app.catalog)
	client=app.pvp_client
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	var background := Backdrop.new()
	background.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(background)
	var shade := ColorRect.new()
	shade.color=Color("040b16bf")
	shade.mouse_filter=MOUSE_FILTER_IGNORE
	shade.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(shade)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,24)
	add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus=true
	margin.add_child(scroll)
	var body := VBoxContainer.new()
	body.size_flags_horizontal=SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation",16)
	scroll.add_child(body)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation",18)
	body.add_child(header)
	header.add_child(app._button("← Início",_back))
	var title: Label = app._label("ARENA PvP",30,app.ACCENT)
	title.size_flags_horizontal=SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(app._label("EXPERIMENTAL · GEMAS LIVRES",12,Color("9bf0c3")))
	header.add_child(app._button("Áudio e vídeo",app._show_presentation_settings))
	label(body,"Monte seu trio. Combine classes, ajuste os engastes e enfrente outro jogador.",16)
	var server_panel := panel(body)
	var connection := HBoxContainer.new()
	connection.add_theme_constant_override("separation",10)
	server_panel.add_child(connection)
	endpoint=LineEdit.new()
	endpoint.text=client.endpoint
	endpoint.placeholder_text="wss://seu-servidor.onrender.com/pvp"
	endpoint.tooltip_text="Endereço do servidor de partidas. Em sites HTTPS, use wss://."
	endpoint.size_flags_horizontal=SIZE_EXPAND_FILL
	connection.add_child(endpoint)
	nickname=LineEdit.new()
	nickname.text=client.nickname
	nickname.max_length=24
	nickname.placeholder_text="Seu nome"
	nickname.custom_minimum_size.x=160
	connection.add_child(nickname)
	var rooms := HBoxContainer.new()
	rooms.add_theme_constant_override("separation",10)
	server_panel.add_child(rooms)
	var create: Button = app._button("Criar sala",func():_connect("create"))
	rooms.add_child(create)
	connect_buttons.append(create)
	room_code=LineEdit.new()
	room_code.placeholder_text="Código da sala"
	room_code.max_length=6
	room_code.custom_minimum_size.x=170
	rooms.add_child(room_code)
	var join: Button = app._button("Entrar por código",func():_connect("join"))
	rooms.add_child(join)
	connect_buttons.append(join)
	var resume: Button = app._button("Retomar sessão",func():_connect("resume"))
	resume.tooltip_text="Recupera a última sala deste dispositivo após recarregar o jogo."
	rooms.add_child(resume)
	connect_buttons.append(resume)
	rooms.add_child(app._button("Sair da sala",func():client.leave()))
	room_label=label(server_panel,"SEM SALA · monte sua equipe enquanto o servidor é iniciado",13,app.ACCENT)
	status_label=label(server_panel,message,13,app.MUTED)
	var columns: BoxContainer=HBoxContainer.new() if get_viewport_rect().size.x>=1180 else VBoxContainer.new()
	columns.add_theme_constant_override("separation",16)
	body.add_child(columns)
	var collection := panel(columns)
	label(collection,"01 · ESCOLHA OS HERÓIS",15,app.ACCENT)
	label(collection,"Selecione uma posição do trio e clique no herói para ocupá-la.",12,app.MUTED)
	var filter := OptionButton.new()
	filter.add_item("Todas as classes")
	for affinity in app.catalog.classes:filter.add_item(affinity.name)
	filter.item_selected.connect(func(index):
		class_filter="" if index==0 else str(app.catalog.classes[index-1].id)
		_refresh_roster())
	collection.add_child(filter)
	roster=GridContainer.new()
	roster.columns=3
	roster.add_theme_constant_override("h_separation",8)
	roster.add_theme_constant_override("v_separation",8)
	collection.add_child(roster)
	var lineup := panel(columns)
	label(lineup,"02 · SEU TRIO",15,app.ACCENT)
	label(lineup,"Posição 1 fica à frente. Todos podem receber ataques.",12,app.MUTED)
	team_row=HBoxContainer.new()
	team_row.add_theme_constant_override("separation",8)
	lineup.add_child(team_row)
	var preview := TextureRect.new()
	preview.name="SelectedHeroArt"
	preview.custom_minimum_size=Vector2(200,255)
	preview.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	lineup.add_child(preview)
	preview.set_meta("pvp_art",true)
	ready_button=app._button("Confirmar equipe",_ready_team)
	ready_button.custom_minimum_size.y=50
	ready_button.add_theme_stylebox_override("normal",app._style(Color("124858"),app.ACCENT))
	lineup.add_child(ready_button)
	label(lineup,"Os dois jogadores precisam confirmar. Heróis e gemas ficam travados ao iniciar a partida.",12,app.MUTED)
	details=panel(columns)
	client.received.connect(_packet)
	client.connection_changed.connect(refresh)
	client.failed.connect(func(text):
		message=text
		refresh())
	refresh()
func label(parent: Node, text: String, size_value := 14, color := Color("d4e3f3")) -> Label:
	var item: Label=app._label(text,size_value,color)
	item.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(item)
	return item
func panel(parent: Node) -> VBoxContainer:
	var surface := PanelContainer.new()
	surface.size_flags_horizontal=SIZE_EXPAND_FILL
	surface.add_theme_stylebox_override("panel",app._style(Color("0d1d30f2"),Color("29465e")))
	parent.add_child(surface)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",10)
	column.size_flags_horizontal=SIZE_EXPAND_FILL
	surface.add_child(column)
	return column
func _connect(kind: String) -> void:
	var request := {"type":kind}
	if kind=="join":request.code=room_code.text.strip_edges().to_upper()
	if kind=="resume":
		if client.session.is_empty():
			message="Não há sessão salva para retomar neste dispositivo."
			refresh()
			return
		request.merge(client.session)
	message="Conectando ao servidor…"
	client.start(endpoint.text,nickname.text,request)
	refresh()
func _packet(packet: Dictionary) -> void:
	if packet.type=="session" and client.intent.get("type") in ["create","join"]:
		client.send({"type":"loadout","loadout":profile.payload()})
	if packet.type in ["room","turn"]:
		message="Sala conectada. Ajuste sua equipe e confirme quando estiver pronto."
		if client.intent.get("type")=="resume":
			var own: Dictionary=client.own_player()
			if not own.is_empty():
				profile.team=own.loadout.team.duplicate()
				profile.gems=own.loadout.gems.duplicate(true)
				profile.save()
	if packet.type=="left":message="Você saiu da sala. Sua formação PvP foi preservada."
	refresh()
func locked() -> bool:
	return client.own_player().get("ready",false) or client.room.get("phase","")=="playing"
func _refresh_roster() -> void:
	app._clear(roster)
	hero_buttons.clear()
	for hero in app.catalog.heroes:
		if class_filter!="" and hero.classId!=class_filter:continue
		var id: String=hero.id
		var button: Button=app._button("",func():
			if locked():return
			profile.set_member(selected_slot,id)
			app.voice.speak(id,"select")
			_changed())
		button.name="Hero_"+id
		button.accessibility_name=hero.name+", "+hero.role
		button.custom_minimum_size=Vector2(120,58)
		button.size_flags_horizontal=SIZE_EXPAND_FILL
		button.toggle_mode=true
		button.set_pressed_no_signal(id in profile.team)
		button.tooltip_text="%s · %s\n%s" % [app.catalog.class_by_id[hero.classId].name,hero.role,hero.get("specialty",hero.role)]
		button.disabled=locked()
		roster.add_child(button)
		var inset := MarginContainer.new()
		inset.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		for side in ["left","right"]: inset.add_theme_constant_override("margin_"+side,7)
		for side in ["top","bottom"]: inset.add_theme_constant_override("margin_"+side,5)
		inset.mouse_filter=MOUSE_FILTER_IGNORE
		button.add_child(inset)
		var identity := HBoxContainer.new()
		identity.add_theme_constant_override("separation",7)
		identity.mouse_filter=MOUSE_FILTER_IGNORE
		inset.add_child(identity)
		var portrait := TextureRect.new()
		portrait.texture=Fighter.portrait(int(hero.index))
		portrait.custom_minimum_size=Vector2(32,44)
		portrait.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.mouse_filter=MOUSE_FILTER_IGNORE
		identity.add_child(portrait)
		var words := VBoxContainer.new()
		words.size_flags_horizontal=SIZE_EXPAND_FILL
		words.size_flags_vertical=SIZE_SHRINK_CENTER
		words.add_theme_constant_override("separation",2)
		words.mouse_filter=MOUSE_FILTER_IGNORE
		identity.add_child(words)
		var hero_name := label(words,hero.name,14)
		hero_name.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
		hero_name.autowrap_mode=TextServer.AUTOWRAP_OFF
		var role := label(words,hero.role,11,app.catalog.affinity_color(hero.classId).lightened(.2))
		role.name="HeroRole"
		role.autowrap_mode=TextServer.AUTOWRAP_OFF
		for text in [hero_name,role]: text.mouse_filter=MOUSE_FILTER_IGNORE
		hero_buttons[id]=button
func _changed() -> void:
	if not client.room.is_empty():client.send({"type":"loadout","loadout":profile.payload()})
	if profile.error_text!="":message=profile.error_text
	refresh()
func refresh() -> void:
	if not is_instance_valid(status_label):return
	endpoint.editable=not client.connected
	nickname.editable=not client.connected
	for button in connect_buttons:button.disabled=client.connected
	status_label.text=message
	var own: Dictionary=client.own_player()
	ready_button.disabled=not client.connected or own.is_empty() or client.room.get("phase")!="preparing"
	ready_button.text="Cancelar confirmação" if own.get("ready",false) else "Confirmar equipe"
	if client.room.is_empty():room_label.text="SEM SALA · três engastes por herói · estoque ilimitado"
	else:
		var players: Array=client.room.get("players",[])
		var names: Array=[]
		for player in players:
			if player is Dictionary:names.append(str(player.name)+(" · pronto" if player.ready else " · preparando")+(" · desconectado" if not player.connected else ""))
		room_label.text="SALA %s  ·  %s" % [client.room.code,"  ×  ".join(names)]
		if players.any(func(p):return p==null):room_label.text+="  · aguardando adversário"
	_refresh_roster()
	app._clear(team_row)
	team_buttons.clear()
	for slot in range(3):
		var id: String=profile.team[slot]
		var index := slot
		var button: Button=app._button("%d · %s" % [slot+1,app.catalog.hero_by_id[id].name],func():
			selected_slot=index
			refresh())
		button.text+="\n"+str(app.catalog.hero_by_id[id].role)
		button.add_theme_font_size_override("font_size",13)
		button.custom_minimum_size.y=52
		button.size_flags_horizontal=SIZE_EXPAND_FILL
		button.toggle_mode=true
		button.set_pressed_no_signal(slot==selected_slot)
		team_row.add_child(button)
		team_buttons.append(button)
	var selected: String=profile.team[selected_slot]
	var hero: Dictionary=app.catalog.hero_by_id[selected]
	for child in team_row.get_parent().get_children():
		if child is TextureRect and child.has_meta("pvp_art"):child.texture=Fighter.portrait(int(hero.index),true)
	app._clear(details)
	gem_pickers.clear()
	label(details,"03 · ENGASTES E ATRIBUTOS",15,app.ACCENT)
	label(details,hero.name+" · "+hero.role,23)
	label(details,app.catalog.class_by_id[hero.classId].name+" · "+str(hero.get("specialty",hero.role)),12,app.catalog.affinity_color(hero.classId))
	label(details,"Gemas ilimitadas neste teste. Equipar e remover não consome o inventário da campanha.",12,Color("9bf0c3"))
	var values: Dictionary=profile.attributes(selected)
	label(details,"VIDA  %d → %d\nATQ    %d → %d\nEN inicial    40 → %d" % [hero.hp,values.maxHp,hero.attack,values.attack,values.energy],15)
	var slots: Array=profile.slots(selected)
	for slot in range(3):
		var row := HBoxContainer.new()
		details.add_child(row)
		var slot_title := label(row,"Engaste %d" % (slot+1),13)
		slot_title.autowrap_mode=TextServer.AUTOWRAP_OFF
		slot_title.custom_minimum_size.x=75
		slot_title.size_flags_vertical=SIZE_SHRINK_CENTER
		var picker := OptionButton.new()
		picker.size_flags_horizontal=SIZE_EXPAND_FILL
		picker.custom_minimum_size.y=40
		picker.size_flags_vertical=SIZE_SHRINK_CENTER
		picker.add_item("Vazio · remover")
		for gem in profile.rules.gems:picker.add_icon_item(GemIcon.texture_for(gem.id),str(gem.name).split(" ")[0]+" · "+gem.effect+" · ∞")
		picker.add_theme_constant_override("icon_max_width",26)
		picker.get_popup().add_theme_constant_override("icon_max_width",26)
		var chosen := 0
		for index in range(profile.rules.gems.size()):
			if profile.rules.gems[index].id==slots[slot]:chosen=index+1
		picker.select(chosen)
		picker.disabled=locked()
		var target_slot := slot
		picker.item_selected.connect(func(index):
			if locked():return
			profile.equip(selected,target_slot,"" if index==0 else str(profile.rules.gems[index-1].id))
			_changed())
		row.add_child(picker)
		gem_pickers.append(picker)
	label(details,"HABILIDADES",12,app.ACCENT)
	for key in ["basic","skill","ultimate"]:
		var banner := panel(details)
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation",10)
		banner.add_child(line)
		var art := TextureRect.new()
		art.name="Ability_"+key
		art.texture=AbilityArt.icon(int(hero.index),key)
		art.custom_minimum_size=Vector2(46,46)
		art.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		line.add_child(art)
		var words := VBoxContainer.new()
		words.size_flags_horizontal=SIZE_EXPAND_FILL
		line.add_child(words)
		label(words,{"basic":"ATAQUE","skill":"TÉCNICA","ultimate":"SUPREMO"}[key],10,app.ACCENT)
		label(words,str(hero[key].name),14)
		label(banner,str(hero[key].description),12,app.MUTED)
func _ready_team() -> void:
	client.send({"type":"ready","ready":not client.own_player().get("ready",false)})
func _back() -> void:
	client.leave()
	hide()
	app.hub.open("play")
