extends Control
const Campaign = preload("res://scripts/campaign.gd")
const Fighter = preload("res://scripts/fighter.gd")
const GemIcon = preload("res://scripts/gem_icon.gd")
const Codex = preload("res://scripts/hero_codex.gd")
const AbilityArt = preload("res://scripts/ability_art.gd")
const Backdrop = preload("res://scripts/hub_backdrop.gd")
const HomeTeam = preload("res://scripts/home_team.gd")
const RulesText = preload("res://scripts/rules_text.gd")
const SURFACE := Color("0c1729f5")
const CYAN := Color("66dcff")
const VIOLET := Color("a598ff")
const WHITE := Color("eff5ff")
var app
var page := "menu"
var body: VBoxContainer
var footer: Label
var selected_hero := ""
var selected_slot := 0
var message := ""
var mission_buttons: Array[Button] = []
var gem_buttons: Dictionary = {}
var hero_buttons: Dictionary = {}
var slot_buttons: Array[Button] = []
var nav_buttons: Dictionary = {}
var gem_preview_label: Label
var transfer_buttons: Dictionary = {}
var owner_pickers: Dictionary = {}
var fill_button: Button
var remove_all_button: Button
var hero_picker: OptionButton
var remove_button: Button
var play_button: Button
var story_button: Button
var next_mission_button: Button
var team_button: Button
var notice: Label
var hero_details: TabContainer
var hero_name: Label
var hero_lore: Label
var hero_tab := 0
var scroll: ScrollContainer
var wide := true
var selected_chapter := 0
var chapter_buttons: Array[Button] = []
var mission_slots: Dictionary = {}
var subnav: HBoxContainer
var materials_label: Label
var gear_upgrade_buttons: Array[Button] = []
var gear_variant_pickers: Array[OptionButton] = []
var gear_apply_buttons: Array[Button] = []
var gear_preview_labels: Array[Label] = []
var gear_transfer_pickers: Array[OptionButton] = []
var gear_transfer_buttons: Array[Button] = []
var gear_exchange_labels: Array[Label] = []
var gem_level := 1
var gem_level_picker: OptionButton
var gem_craft_buttons: Dictionary = {}
var gem_fuse_buttons: Dictionary = {}
var gem_fusion_dialog: ConfirmationDialog
var _pending_fusion := ""
var progress_team_label: Label
var progress_hero_label: Label
var progress_milestone_labels: Array[Label] = []
var training_pickers: Dictionary = {}
var training_preview_labels: Dictionary = {}
var training_apply_buttons: Dictionary = {}
var selected_training_tab := 0
var training_tabs: TabContainer

func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	var background := TextureRect.new()
	background.texture = preload("res://assets/nexus-sanctum.png")
	background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	background.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	background.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(background)
	var shade := ColorRect.new()
	shade.color = Color("040a15b8")
	shade.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	shade.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(shade)
	var lines := Backdrop.new()
	lines.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(lines)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for side in ["left", "right"]: margin.add_theme_constant_override("margin_" + side, 28)
	for side in ["top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 20)
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	margin.add_child(column)
	var masthead := HBoxContainer.new()
	masthead.add_theme_constant_override("separation", 18)
	column.add_child(masthead)
	var logo := _heading(masthead, "NEXUS", 30, WHITE)
	logo.autowrap_mode = TextServer.AUTOWRAP_OFF
	logo.size_flags_horizontal = SIZE_SHRINK_BEGIN
	var subtitle := _text(masthead, "ECOS DO CREPÚSCULO", 11, CYAN)
	subtitle.size_flags_vertical = SIZE_SHRINK_CENTER
	masthead.add_child(app._button("⛶ Tela", app._show_display))
	masthead.add_child(app._button("Áudio e vídeo",app._show_presentation_settings))
	masthead.add_child(app._button("Sair", func(): get_tree().quit()))
	var nav := _row(column, 8)
	for item in [["Início", "menu"], ["História", "story"], ["Coleção", "heroes"], ["Batalhas", "play"], ["Extras", "extras"]]:
		var target: String = item[1]
		var button: Button = app._button(item[0], open.bind(target))
		button.custom_minimum_size = Vector2(148, 42)
		button.icon = load("res://assets/menu/%s.svg" % {"menu":"home","story":"story","heroes":"heroes","play":"battle","extras":"extras"}[target])
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width",18)
		button.add_theme_font_size_override("font_size", 14)
		nav.add_child(button)
		nav_buttons[target] = button
	subnav = HBoxContainer.new()
	subnav.add_theme_constant_override("separation", 8)
	column.add_child(subnav)
	scroll = ScrollContainer.new()
	scroll.follow_focus = true
	scroll.size_flags_vertical = SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = SIZE_EXPAND_FILL
	body.size_flags_vertical = SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 20)
	scroll.add_child(body)
	footer = app._label("", 12, app.MUTED)
	footer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(footer)
	wide = size.x >= 1180
	resized.connect(_resize_page)

func _resize_page() -> void:
	var next_wide := size.x >= 1180
	if next_wide == wide or not is_instance_valid(body): return
	wide = next_wide
	if visible: open.call_deferred(page)

func open(target: String = "menu") -> void:
	if target != page: message = ""
	page = target
	visible = true
	app.combat_view.hide()
	app._clear(body)
	mission_buttons.clear()
	mission_slots.clear()
	chapter_buttons.clear()
	app._clear(subnav)
	subnav.visible = page in ["heroes", "gems", "equipment", "progress"]
	if subnav.visible:
		for item in [["Heróis e habilidades", "heroes"], ["Engastes e gemas", "gems"], ["Oficina", "equipment"], ["Evolução", "progress"]]:
			var target_page: String = item[1]
			var entry: Button = app._button(item[0], open.bind(target_page))
			entry.custom_minimum_size = Vector2(210,38)
			entry.disabled = page == target_page
			subnav.add_child(entry)
	gem_buttons.clear()
	gem_craft_buttons.clear()
	gem_fuse_buttons.clear()
	transfer_buttons.clear()
	owner_pickers.clear()
	hero_buttons.clear()
	slot_buttons.clear()
	gear_upgrade_buttons.clear()
	gear_variant_pickers.clear()
	gear_apply_buttons.clear()
	gear_preview_labels.clear()
	gear_transfer_pickers.clear()
	gear_transfer_buttons.clear()
	gear_exchange_labels.clear()
	progress_milestone_labels.clear()
	training_pickers.clear()
	training_preview_labels.clear()
	training_apply_buttons.clear()
	hero_details = null
	hero_name = null
	hero_lore = null
	selected_slot = clampi(selected_slot, 0, 2)
	if selected_hero == "" or not app.campaign.active_hero(selected_hero): selected_hero = app.campaign.team[0]
	for id in nav_buttons:
		var active: bool = id == page or id == "heroes" and page in ["gems", "equipment", "progress"]
		nav_buttons[id].add_theme_stylebox_override("normal", _surface(Color("14344a") if active else Color("0b1527b8"), CYAN if active else Color("223448"), 10))
		nav_buttons[id].add_theme_color_override("font_color", CYAN if active else app.MUTED)
	match page:
		"story": _story()
		"gems": _gems()
		"equipment": _equipment()
		"progress": _progress()
		"heroes": _heroes()
		"play": _play_menu()
		"extras": _extras()
		_: _menu()
	footer.text = app.campaign.error_text if app.campaign.error_text != "" else message if message != "" else "Progresso salvo neste dispositivo  ·  Prepare sua equipe em Coleção  ·  Tab para navegar, Enter para selecionar"
	footer.add_theme_color_override("font_color", Color("ffb8a8") if app.campaign.error_text != "" else app.MUTED)
	scroll.set_deferred("scroll_vertical", 0)

func _surface(color: Color = SURFACE, border := Color("263b54"), padding := 18) -> StyleBoxFlat:
	var style: StyleBoxFlat = app._style(color, border)
	style.set_corner_radius_all(14)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	return style

func _text(parent: Node, value: String, font_size: int = 16, color := Color("cad7ea")) -> Label:
	var label: Label = app._label(value, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = SIZE_EXPAND_FILL
	parent.add_child(label)
	return label

func _heading(parent: Node, value: String, font_size := 30, color := WHITE) -> Label:
	var label := _text(parent, value, font_size, color)
	label.add_theme_font_override("font", preload("res://assets/space-grotesk.ttf"))
	return label

func _panel(parent: Node, border := Color("263b54")) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _surface(SURFACE, border))
	parent.add_child(panel)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	return column

func _portrait(parent: Node, hero: Dictionary, dimensions: Vector2, full := false) -> TextureRect:
	var art := TextureRect.new()
	art.texture = Fighter.portrait(int(hero.index), full)
	art.custom_minimum_size = dimensions
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.mouse_filter = MOUSE_FILTER_IGNORE
	parent.add_child(art)
	return art

func _row(parent: Node, gap := 14, adaptive := false) -> BoxContainer:
	var row: BoxContainer = HBoxContainer.new() if not adaptive or wide else VBoxContainer.new()
	row.size_flags_horizontal = SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", gap)
	parent.add_child(row)
	return row

func _menu() -> void:
	var chapter: int = app.campaign.next_chapter()
	var record: Dictionary = Campaign.CHAPTERS[chapter]
	var next_mission: int = app.campaign.next_mission()
	var row := _row(body,26,true)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = SIZE_EXPAND_FILL
	left.size_flags_stretch_ratio = 1.04
	left.add_theme_constant_override("separation",16)
	row.add_child(left)
	var welcome := VBoxContainer.new()
	welcome.add_theme_constant_override("separation",6)
	left.add_child(welcome)
	_text(welcome,"BEM-VINDO AO FAROL",11,CYAN)
	_heading(welcome,"Sua jornada continua." if app.campaign.cleared>0 else "O Farol precisa de você.",36)
	_text(welcome,"Avance na história ou prepare seu trio para o próximo confronto.",15,app.MUTED)
	var journey := _panel(left,Color("397a94"))
	journey.get_parent().add_theme_stylebox_override("panel",_surface(Color("10283aef"),Color("397a94"),20))
	var chapter_line := _row(journey,10)
	var chapter_icon := TextureRect.new()
	chapter_icon.texture = load("res://assets/menu/story.svg")
	chapter_icon.custom_minimum_size = Vector2(32,32)
	chapter_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	chapter_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	chapter_icon.modulate = Color(record.color)
	chapter_line.add_child(chapter_icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = SIZE_EXPAND_FILL
	chapter_line.add_child(words)
	_text(words,record.eyebrow + (" · CONCLUÍDO" if app.campaign.cleared>=app.campaign.missions.size() else " · EM ANDAMENTO"),10,Color(record.color))
	_heading(words,record.name,23)
	_text(journey,"Sua próxima missão\n"+app.campaign.missions[next_mission].name if app.campaign.cleared<app.campaign.missions.size() else "Jornada concluída. Revisite as missões e experimente novos trios.",14)
	var progress_line := _row(journey,8)
	for index in range(app.campaign.missions.size()):
		var segment := ColorRect.new()
		segment.custom_minimum_size = Vector2(8,4)
		segment.size_flags_horizontal = SIZE_EXPAND_FILL
		segment.color = CYAN if app.campaign.is_complete(index) else Color("2b425a")
		segment.mouse_filter = MOUSE_FILTER_IGNORE
		progress_line.add_child(segment)
	_text(journey,"%d de %d missões concluídas · 3 capítulos" % [app.campaign.cleared,app.campaign.missions.size()],11,app.MUTED)
	story_button = app._button("Começar história  →" if app.campaign.cleared==0 else "Continuar história  →" if app.campaign.cleared<app.campaign.missions.size() else "Revisitar história  →",_continue_story)
	story_button.custom_minimum_size.y = 48
	story_button.add_theme_font_size_override("font_size",16)
	story_button.add_theme_stylebox_override("normal",_surface(Color("4ed8ef"),Color("9cecff"),10))
	story_button.add_theme_color_override("font_color",Color("062235"))
	journey.add_child(story_button)
	_text(left,"ESCOLHA O PRÓXIMO PASSO",10,app.MUTED)
	var shortcuts := GridContainer.new()
	shortcuts.columns = 2
	shortcuts.size_flags_horizontal = SIZE_EXPAND_FILL
	shortcuts.add_theme_constant_override("h_separation",10)
	shortcuts.add_theme_constant_override("v_separation",10)
	left.add_child(shortcuts)
	_home_shortcut(shortcuts,"Heróis","Habilidades, classes e sinergias","heroes",open.bind("heroes"))
	_home_shortcut(shortcuts,"Gemas","Equipar, remover e transferir","gems",open.bind("gems"))
	play_button = _home_shortcut(shortcuts,"Treino rápido","Pratique contra a IA","battle",_quick_training)
	_home_shortcut(shortcuts,"Aprender a jogar","Treinos guiados e regras","extras",app._show_lessons)
	var right := _panel(row,Color("2b405b"))
	right.get_parent().add_theme_stylebox_override("panel",_surface(Color("0b1826b8"),Color("2b405b"),20))
	var team_header := _row(right,10)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = SIZE_EXPAND_FILL
	team_header.add_child(titles)
	_text(titles,"SEU TRIO",11,CYAN)
	_heading(titles,"Prontos para partir",24)
	team_button = app._button("Editar equipe",app._open_roster)
	team_header.add_child(team_button)
	var team_art := HomeTeam.new()
	team_art.configure(app.campaign.team,app.catalog)
	team_art.motion_enabled = not app.reduced_motion
	team_art.size_flags_horizontal = SIZE_EXPAND_FILL
	team_art.size_flags_vertical = SIZE_EXPAND_FILL
	right.add_child(team_art)
	var roles := _row(right,9)
	for index in [1,0,2]:
		var id: String = app.campaign.team[index]
		var hero: Dictionary = app.catalog.hero_by_id[id]
		var detail := VBoxContainer.new()
		detail.size_flags_horizontal = SIZE_EXPAND_FILL
		roles.add_child(detail)
		_text(detail,app.catalog.class_by_id[hero.classId].name.to_upper()+" · "+hero.role.to_upper(),10,app.catalog.affinity_color(hero.classId))
		_text(detail,hero.get("specialty",hero.role),12)
		var used: int = app.campaign.slots(id).filter(func(g): return g!="").size()
		_text(detail,"%d/3 engastes ocupados" % used,11,app.MUTED)
	_text(right,"%d heróis disponíveis · Você pode misturar classes e funções." % app.catalog.heroes.size(),12,app.MUTED)

func _home_shortcut(parent: Node, title: String, detail: String, icon: String, callback: Callable) -> Button:
	var button: Button = app._button("",callback)
	button.custom_minimum_size = Vector2(0,76)
	button.size_flags_horizontal = SIZE_EXPAND_FILL
	button.tooltip_text = title+" · "+detail
	button.add_theme_stylebox_override("normal",_surface(Color("0e1e30e8"),Color("2c435b"),12))
	parent.add_child(button)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for side in ["left","right"]: margin.add_theme_constant_override("margin_"+side,14)
	for side in ["top","bottom"]: margin.add_theme_constant_override("margin_"+side,10)
	margin.mouse_filter = MOUSE_FILTER_IGNORE
	button.add_child(margin)
	var line := HBoxContainer.new()
	line.mouse_filter = MOUSE_FILTER_IGNORE
	line.add_theme_constant_override("separation",12)
	margin.add_child(line)
	var glyph := TextureRect.new()
	glyph.texture = load("res://assets/menu/%s.svg" % icon)
	glyph.modulate = CYAN
	glyph.custom_minimum_size = Vector2(28,28)
	glyph.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glyph.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	glyph.mouse_filter = MOUSE_FILTER_IGNORE
	line.add_child(glyph)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = SIZE_EXPAND_FILL
	words.mouse_filter = MOUSE_FILTER_IGNORE
	line.add_child(words)
	var name_label := _heading(words,title,16)
	name_label.mouse_filter = MOUSE_FILTER_IGNORE
	var description := _text(words,detail,11,app.MUTED)
	description.mouse_filter = MOUSE_FILTER_IGNORE
	return button

func _quick_training() -> void:
	app.mode = "training"
	app.mode_picker.select(0)
	app._save_preferences()
	app._enter_free()

func _continue_story() -> void:
	selected_chapter = app.campaign.next_chapter()
	open("story")
	next_mission_button.grab_focus()

func _chapter_art(index: int) -> Texture2D:
	if index == 1 and ResourceLoader.exists("res://assets/environments/tidal-observatory.png"): return load("res://assets/environments/tidal-observatory.png")
	return preload("res://assets/arena.png") if index == 2 else preload("res://assets/nexus-sanctum.png")

func _play_menu() -> void:
	_text(body, "BATALHAS  /  ESCOLHA SEU MODO", 11, CYAN)
	_heading(body, "Seu ritmo. Sua equipe.", 38)
	var row := _row(body,18,true)
	var online := _panel(body,Color("397a94"))
	_heading(online,"Arena PvP online",28)
	_text(online,"Enfrente outro jogador por código de sala. Prepare seu trio em uma tela exclusiva, com três engastes por herói e gemas ilimitadas para balanceamento.",15,app.MUTED)
	online.add_child(app._button("Preparar equipe PvP  →",app._open_pvp))
	for item in [["Contra a IA", "Pratique combinações, escolha a dificuldade e ative o automático quando quiser.", "training"], ["Duelo local", "Duas pessoas no mesmo dispositivo, com os mesmos atributos e regras.", "local"]]:
		var card := _panel(row)
		_heading(card,item[0],26)
		_text(card,item[1],16,app.MUTED)
		var chosen_mode: String = item[2]
		var launch: Button = app._button("Preparar equipes  →", func():
			app.mode = chosen_mode
			app.mode_picker.select(0 if chosen_mode == "training" else 1)
			app._save_preferences()
			app._enter_free())
		launch.custom_minimum_size.y = 48
		card.add_child(launch)
	_text(body,"Na campanha, equipamentos e gemas aprimoram seus heróis. O combate livre preserva os atributos de referência.",14,app.MUTED)

func _extras() -> void:
	_text(body,"EXTRAS  /  APRENDER E EXPLORAR",11,CYAN)
	_heading(body,"Tudo no seu lugar.",36)
	var grid := GridContainer.new()
	grid.columns = 2 if wide else 1
	grid.add_theme_constant_override("h_separation",16)
	grid.add_theme_constant_override("v_separation",16)
	body.add_child(grid)
	for item in [["Aprender a jogar","Treinos guiados sobre afinidades, escudos e estados.",app._show_lessons], ["Galeria de golpes","Explore as habilidades dos %d heróis." % app.catalog.heroes.size(),app._open_showcase], ["Afinidades e regras","Consulte vantagens e funcionamento do combate.",app._show_classes], ["Laboratório","Simulações, resultados e registros de balanceamento.",app._show_lab], ["Arquivo 3D · Vesper","O estudo de modelo e animações permanece disponível.",app._open_vesper]]:
		var card := _panel(grid)
		_heading(card,item[0],23)
		_text(card,item[1],14,app.MUTED)
		card.add_child(app._button("Abrir  →",item[2]))

func _team_row(parent: Node) -> void:
	var row := _row(parent)
	for index in range(3):
		var hero: Dictionary = app.catalog.hero_by_id[app.campaign.team[index]]
		var card := _panel(row, app.catalog.affinity_color(hero.classId).darkened(0.55))
		var identity := _row(card, 10)
		_portrait(identity, hero, Vector2(43, 60))
		var labels := VBoxContainer.new()
		labels.size_flags_horizontal = SIZE_EXPAND_FILL
		identity.add_child(labels)
		_heading(labels, hero.name, 18)
		_text(labels, "FRENTE" if index == 0 else "RETAGUARDA", 10, app.MUTED)
		_text(labels, app.campaign.summary(hero.id), 11, CYAN)
	var buttons := VBoxContainer.new()
	row.add_child(buttons)
	team_button = app._button("Escolher trio", app._open_roster)
	buttons.add_child(team_button)
	buttons.add_child(app._button("Engastes", open.bind("gems")))
	buttons.add_child(app._button("Oficina", open.bind("equipment")))

func _select_chapter(index: int) -> void:
	selected_chapter = clampi(index,0,Campaign.CHAPTERS.size()-1)
	open("story")
	chapter_buttons[selected_chapter].grab_focus()

func _story() -> void:
	_text(body,"MODO HISTÓRIA  /  JORNADA DO FAROL",11,CYAN)
	var top := _row(body,18,true)
	_heading(top,"Sua jornada",36)
	var next_mission: int = app.campaign.next_mission()
	next_mission_button = app._button("Continuar · " + app.campaign.missions[next_mission].name + "  →" if app.campaign.cleared < app.campaign.missions.size() else "Revisitar o desfecho  →",app._begin_mission.bind(next_mission))
	next_mission_button.custom_minimum_size = Vector2(285,48)
	next_mission_button.disabled = not app.campaign.can_play(next_mission)
	next_mission_button.add_theme_color_override("font_color",CYAN)
	top.add_child(next_mission_button)
	_text(body,"%d/%d missões concluídas · Primeira vitória: gema e fragmentos. Novas vitórias na mesma missão: 2 fragmentos." % [app.campaign.cleared,app.campaign.missions.size()],13,app.MUTED)
	var chapters := _row(body,12,true)
	for index in range(Campaign.CHAPTERS.size()):
		var chapter: Dictionary = Campaign.CHAPTERS[index]
		var unlocked: bool = app.campaign.chapter_available(index)
		var completed: int = app.campaign.chapter_cleared(index)
		var button: Button = app._button("%s  ·  %d/%d\n%s%s" % [chapter.eyebrow,completed,app.campaign.chapter_missions(index).size(),chapter.name,"  ·  BLOQUEADO" if not unlocked else ""],_select_chapter.bind(index))
		button.custom_minimum_size.y = 76
		button.size_flags_horizontal = SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size",15)
		button.add_theme_stylebox_override("normal",_surface(Color("103044") if selected_chapter == index else SURFACE,Color(chapter.color) if selected_chapter == index else Color("263b54"),12))
		button.tooltip_text = "Você pode consultar este capítulo. Para jogar, conclua o anterior." if not unlocked else chapter.summary
		chapters.add_child(button)
		chapter_buttons.append(button)
	var chapter: Dictionary = Campaign.CHAPTERS[selected_chapter]
	var overview := _panel(body,Color(chapter.color).darkened(.5))
	var chapter_row := _row(overview,20,true)
	var art := TextureRect.new()
	art.texture = _chapter_art(selected_chapter)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.custom_minimum_size = Vector2(270,140)
	chapter_row.add_child(art)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation",8)
	chapter_row.add_child(words)
	_heading(words,chapter.name,28,Color(chapter.color))
	_text(words,chapter.summary,15)
	_text(words,chapter.lesson,13,app.MUTED)
	_team_row(body)
	var missions := _row(body,14,true)
	for index in app.campaign.chapter_missions(selected_chapter):
		var mission: Dictionary = app.campaign.missions[index]
		var intel: Dictionary = Codex.mission_record(mission)
		var unlocked: bool = app.campaign.can_play(index)
		var complete: bool = app.campaign.is_complete(index)
		var card := _panel(missions,Color("447080") if unlocked else Color("253348"))
		_text(card,"CONCLUÍDA" if complete else "DISPONÍVEL" if unlocked else "BLOQUEADA · CONCLUA A ANTERIOR",11,CYAN if unlocked else app.MUTED)
		_heading(card,mission.name,21)
		_text(card,mission.location,10,app.MUTED)
		var enemies := _row(card,8)
		enemies.alignment = BoxContainer.ALIGNMENT_CENTER
		for id in mission.enemies: _portrait(enemies,app.catalog.hero_by_id[id],Vector2(54,65))
		_text(card,intel.before,14)
		_text(card,"OBJETIVO  /  "+Campaign.Objectives.brief(mission),13,CYAN)
		_text(card,"TÁTICA  /  "+mission.tip,12,Color("a7c3de"))
		var reward: Dictionary = app.campaign.mission_reward(index)
		_text(card,("RECEBIDA  /  " if complete else "PRIMEIRA VITÓRIA  /  ")+reward.name,12,Color(reward.color))
		_text(card,"Nova vitória: +2 fragmentos" if complete else "+%d fragmentos" % Campaign.Equipment.first_reward(mission.id),12,CYAN)
		var launch: Button = app._button("Rejogar missão" if complete else "Jogar missão  →" if unlocked else "Missão bloqueada",app._begin_mission.bind(index))
		launch.disabled = not unlocked
		launch.tooltip_text = mission.name + "\n" + (mission.tip if unlocked else "Conclua a missão anterior para desbloquear.")
		launch.custom_minimum_size.y = 46
		card.add_child(launch)
		mission_buttons.append(launch)
		mission_slots[index] = launch
		if complete:
			var archive := _panel(card,Color("263b4a"))
			_text(archive,"REGISTRO RECUPERADO",10,CYAN)
			_text(archive,intel.after,12,app.MUTED)
	if app.campaign.chapter_cleared(selected_chapter) == app.campaign.chapter_missions(selected_chapter).size():
		var ending := _panel(body,Color(chapter.color).darkened(.4))
		_heading(ending,"Capítulo concluído",25,Color(chapter.color))
		_text(ending,app.campaign.missions[app.campaign.chapter_final(selected_chapter)].ending,15)

func _heroes() -> void:
	var introduction := VBoxContainer.new()
	introduction.add_theme_constant_override("separation", 5)
	body.add_child(introduction)
	_text(introduction, "ARQUIVO DE RESSONÂNCIA  /  20 HERÓIS", 11, CYAN)
	_heading(introduction, "Cada herói, uma razão para lutar.", 30)
	_text(introduction, "Afinidade define vantagens. Função define o estilo. Você escolhe livremente os três integrantes da equipe.", 13, app.MUTED)
	introduction.add_child(app._button("Nível da equipe e maestria →",open.bind("progress")))
	var split := _row(body, 20, true)
	var roster := _panel(split)
	if wide:
		roster.get_parent().size_flags_horizontal = SIZE_FILL
		roster.get_parent().custom_minimum_size.x = 310
	_text(roster, "ELENCO  /  SELECIONE UM HERÓI", 11, CYAN)
	var grid := GridContainer.new()
	grid.columns = 3 if wide else 5
	grid.size_flags_horizontal = SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	roster.add_child(grid)
	for entry in app.catalog.heroes:
		var hero: Dictionary = entry
		var color: Color = app.catalog.affinity_color(hero.classId)
		var button: Button = app._button("", _choose_hero.bind(hero.id))
		button.custom_minimum_size = Vector2(82, 104 if wide else 86)
		button.size_flags_horizontal = SIZE_EXPAND_FILL
		button.add_theme_stylebox_override("normal", _surface(color.darkened(0.80) if selected_hero == hero.id else Color("0b1423"), color if selected_hero == hero.id else Color("20334b"), 5))
		button.tooltip_text = "%s · %s · %s" % [hero.name, app.catalog.class_by_id[hero.classId].name, hero.role]
		grid.add_child(button)
		var content := VBoxContainer.new()
		content.mouse_filter = MOUSE_FILTER_IGNORE
		content.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		content.offset_top = 5
		content.offset_bottom = -5
		content.add_theme_constant_override("separation", 1)
		button.add_child(content)
		var portrait := _portrait(content, hero, Vector2(0, 57 if wide else 43))
		portrait.size_flags_horizontal = SIZE_EXPAND_FILL
		var name_label := _text(content, hero.name, 12, WHITE)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_label.mouse_filter = MOUSE_FILTER_IGNORE
		var role := _text(content, hero.role.to_upper(), 9, color)
		role.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		role.mouse_filter = MOUSE_FILTER_IGNORE
		hero_buttons[hero.id] = button
	var detail := VBoxContainer.new()
	detail.size_flags_horizontal = SIZE_EXPAND_FILL
	detail.add_theme_constant_override("separation", 16)
	split.add_child(detail)
	var selected: Dictionary = app.catalog.hero_by_id[selected_hero]
	var record: Dictionary = Codex.entry(selected_hero)
	var tint: Color = app.catalog.affinity_color(selected.classId)
	var top := _panel(detail, tint.darkened(0.30))
	var identity := _row(top, 20)
	var portrait := _portrait(identity, selected, Vector2(166 if wide else 120, 205 if wide else 180), true)
	portrait.size_flags_vertical = SIZE_EXPAND_FILL
	var words := VBoxContainer.new()
	words.size_flags_horizontal = SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", 7)
	identity.add_child(words)
	var affinity: Dictionary = app.catalog.class_by_id[selected.classId]
	_text(words, "%s  /  %s" % [affinity.name.to_upper(), selected.role.to_upper()], 12, tint)
	hero_name = _heading(words, selected.name.to_upper(), 34)
	_text(words, selected.title, 16, WHITE)
	_text(words, selected.get("specialty", selected.role) + " · " + selected.identity + ".", 13, app.MUTED)
	var stats := _row(words, 9)
	for item in [["VIDA", selected.hp], ["ATQ", selected.attack], ["DEF", selected.defense], ["VEL", selected.speed]]:
		var stat := _panel(stats, Color("21374f"))
		stat.get_parent().add_theme_stylebox_override("panel", _surface(Color("0a1322"), Color("21374f"), 10))
		stat.add_theme_constant_override("separation", 2)
		_text(stat, item[0], 10, app.MUTED)
		_heading(stat, str(int(item[1])), 20)
	var strong: Dictionary = app.catalog.class_by_id[affinity.strongAgainst]
	var weak: Dictionary = app.catalog.class_by_id[affinity.weakAgainst]
	_text(words, "Vantagem contra %s  +%s  ·  Resistência de %s  −%s" % [strong.name, RulesText.percent(app.combat.rules.affinity.advantageMultiplier - 1), weak.name, RulesText.percent(1 - app.combat.rules.affinity.resistanceMultiplier)], 11, tint)
	hero_details = TabContainer.new()
	hero_details.size_flags_horizontal = SIZE_EXPAND_FILL
	hero_details.custom_minimum_size.y = 350
	hero_details.add_theme_stylebox_override("panel", _surface(SURFACE, Color("263b54"), 16))
	hero_details.add_theme_stylebox_override("tab_selected", _surface(Color("16344b"), CYAN, 11))
	hero_details.add_theme_stylebox_override("tab_unselected", _surface(Color("0b1526"), Color("223448"), 11))
	hero_details.add_theme_color_override("font_selected_color", CYAN)
	detail.add_child(hero_details)
	var skills := _tab("Habilidades")
	_text(skills, "SINERGIA  /  " + selected.synergy, 14, tint)
	var skill_row := _row(skills, 12, true)
	for action_id in ["basic", "skill", "ultimate"]:
		var action: Dictionary = app.campaign.trained_action(selected_hero,action_id)
		var card := _panel(skill_row, tint.darkened(0.57))
		var header := _row(card, 9)
		var image := TextureRect.new()
		image.texture = AbilityArt.icon(int(selected.index), action_id)
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		image.custom_minimum_size = Vector2(60, 60)
		header.add_child(image)
		var action_words := VBoxContainer.new()
		action_words.size_flags_horizontal = SIZE_EXPAND_FILL
		header.add_child(action_words)
		_text(action_words, {"basic": "ATAQUE", "skill": "TÉCNICA", "ultimate": "SUPREMO"}[action_id], 10, tint)
		_heading(action_words, action.name, 17)
		_text(card, "+%d energia" % int(action.get("energyGain",app.combat.rules.energy.basicGain)) if action_id == "basic" else "%d energia  ·  %s" % [action.cost, "recarga de %d ações" % action.cooldown if action.cooldown > 0 else "sem recarga"], 12, CYAN)
		_text(card, action.description, 14)
	_text(skills, "Prévia base das variantes da campanha, antes de defesa, afinidade, crítico e efeitos. Campos alteram energia na preparação da missão. Livre/PvP usa as habilidades originais. Camadas somam até %s da vida; cada aplicação dura %d rodadas globais. Sangramento reduz cura em %s." % [RulesText.percent(app.combat.rules.shield.maxHpRatio), int(app.combat.rules.shield.durationRounds), RulesText.percent(1 - app.combat.rules.status.bleedHealingMultiplier)], 12, app.MUTED)
	var story := _tab("História")
	_text(story, record.origin.to_upper(), 11, tint)
	_heading(story, "“" + record.quote + "”", 22, WHITE)
	hero_lore = _text(story, record.story, 16)
	_text(story, "MOTIVAÇÃO  /  " + record.calling, 14, tint)
	_text(story, "NO FAROL  /  " + record.connection, 14, app.MUTED)
	var gems := _tab("Engastes")
	_gem_loadout(gems, true)
	hero_details.current_tab = clampi(hero_tab, 0, 2)
	hero_details.tab_changed.connect(func(index): hero_tab = index)

func _tab(title: String) -> VBoxContainer:
	var container := ScrollContainer.new()
	container.name = title
	container.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	hero_details.add_child(container)
	var contents := VBoxContainer.new()
	contents.size_flags_horizontal = SIZE_EXPAND_FILL
	contents.add_theme_constant_override("separation", 14)
	container.add_child(contents)
	return contents

func _choose_hero(id: String) -> void:
	app.voice.speak(id,"select")
	selected_hero = id
	selected_slot = 0
	selected_training_tab = 0
	message = ""
	open(page)

func _stats_line(values: Dictionary) -> String:
	return "%d VIDA · %d ATQ · %d DEF · %d EN" % [values.maxHp,values.attack,values.defense,values.energy]

func _progress() -> void:
	var model = app.campaign
	var settings: Dictionary = Campaign.Progression.settings
	var level: int = model.team_level()
	var xp: int = model.team_experience()
	var maximum: int = settings.teamThresholds.size()
	_text(body,"COLEÇÃO  /  TREINAMENTO E MAESTRIA",11,CYAN)
	_heading(body,"O Farol cresce com seu trio.",32)
	var shared := _panel(body,Color("355770"))
	progress_team_label = _heading(shared,"EQUIPE · NÍVEL %d/%d · %d EXP" % [level,maximum,xp],22,CYAN)
	var lower: int = settings.teamThresholds[level-1]
	var upper: int = settings.teamThresholds[level] if level < maximum else lower
	var bar := ProgressBar.new()
	bar.custom_minimum_size.y = 16
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background",_surface(Color("081525"),Color("294659"),0))
	bar.add_theme_stylebox_override("fill",_surface(Color("3ca8c6"),CYAN,0))
	bar.max_value = upper-lower if level < maximum else 1
	bar.value = xp-lower if level < maximum else 1
	shared.add_child(bar)
	_text(shared,"Faltam %d EXP para o nível %d." % [upper-xp,level+1] if level < maximum else "Nível máximo desta etapa. A experiência extra não aumenta o teto de atributos.",13,app.MUTED)
	_text(shared,"Cada nível após o primeiro soma 2% VIDA, 1% ATQ e 1% DEF base na campanha. Todos os heróis recebem o treinamento comum, inclusive ao trocar de trio.",13)
	_text(shared,"Primeira vitória: 100 EXP. Nova vitória em missão concluída: 25 EXP. Maestria: 10 pontos para cada integrante que iniciou a missão, sem depender de abates. Derrota preserva o que já foi conquistado.",12,app.MUTED)
	var layout := _row(body,16,true)
	var selected: Dictionary = app.catalog.hero_by_id[selected_hero]
	var character := _panel(layout,app.catalog.affinity_color(selected.classId).darkened(.4))
	character.get_parent().size_flags_stretch_ratio = .65
	character.get_parent().size_flags_vertical = SIZE_SHRINK_BEGIN
	hero_picker = OptionButton.new()
	hero_picker.custom_minimum_size.y = 38
	for hero in app.catalog.heroes: hero_picker.add_item(hero.name)
	hero_picker.select(app.catalog.heroes.find(selected))
	hero_picker.item_selected.connect(func(index):_choose_hero(app.catalog.heroes[index].id))
	character.add_child(hero_picker)
	_portrait(character,selected,Vector2(180,185),true)
	_heading(character,selected.name.to_upper(),24)
	_text(character,_stats_line(model.loadout_stats(selected_hero)),13,CYAN)
	_text(character,"Atributos da próxima missão, incluindo nível, maestria, peças e gemas. Combate livre/PvP usa a referência normalizada.",12,app.MUTED)
	var training := _panel(layout,Color("524774"))
	var points: int = model.mastery_experience(selected_hero)
	var rank: int = model.mastery_rank(selected_hero)
	progress_hero_label = _heading(training,"MAESTRIA %s · %d/60 pontos" % [["INICIAL","I","II","III"][rank],points],22,VIOLET)
	_text(training,"O histórico anterior não identifica os trios utilizados. A maestria individual começa com participações vitoriosas nesta etapa; as vitórias antigas já contam para o nível comum.",12,app.MUTED)
	training_tabs = TabContainer.new()
	training_tabs.custom_minimum_size.y = 330
	training_tabs.add_theme_stylebox_override("panel",_surface(SURFACE,Color("355770"),10))
	training_tabs.add_theme_stylebox_override("tab_selected",_surface(Color("16344b"),CYAN,9))
	training_tabs.add_theme_stylebox_override("tab_unselected",_surface(Color("0b1526"),Color("263b54"),9))
	training_tabs.add_theme_color_override("font_selected_color",CYAN)
	training.add_child(training_tabs)
	for index in range(1,4):
		var card := _panel(training_tabs,Color("4e707e") if rank >= index else Color("263b54"))
		var milestone: String = ["I","II","III"][index-1]
		card.get_parent().name = milestone+" · "+{1:"Técnica",2:"Supremo",3:"Ataque"}[index]
		var status: String = "CONQUISTADA" if rank >= index else "%d pontos para conquistar" % (int(settings.masteryThresholds[index])-points)
		progress_milestone_labels.append(_text(card,"MAESTRIA %s · %s" % [milestone,status],13,CYAN if rank >= index else app.MUTED))
		var benefit: String = "+%s ATQ base" % RulesText.percent(.005*index) if selected.role == "Dano" else "+%d%% VIDA base" % index if selected.role == "Tanque" else "+%d EN inicial" % index
		_text(card,benefit+" na campanha. Cada marco substitui o bônus anterior.",12)
		var action_id: String = {1:"skill",2:"ultimate",3:"basic"}[index]
		var recipe: Dictionary = Campaign.AbilityTraining.settings[action_id]
		_text(card,"TREINAMENTO · " + {"skill":"TÉCNICA","ultimate":"SUPREMO","basic":"ATAQUE"}[action_id],11,VIOLET)
		_text(card,recipe.detail,12,app.MUTED)
		var picker := OptionButton.new()
		picker.size_flags_horizontal = SIZE_EXPAND_FILL
		picker.add_item("Versão original")
		picker.set_item_metadata(0,"")
		picker.add_item(recipe.name + (" · Maestria %s necessária" % milestone if rank < index else " · liberada"))
		picker.set_item_metadata(1,recipe.id)
		picker.set_item_disabled(1,rank < index)
		picker.select(0 if model.ability_choices.get(selected_hero,{}).get(action_id,"") == "" else 1)
		card.add_child(picker)
		training_pickers[action_id] = picker
		training_preview_labels[action_id] = _text(card,"",12,app.MUTED)
		var apply: Button = app._button("Aplicar na próxima missão · grátis",_apply_training.bind(action_id))
		apply.add_theme_font_size_override("font_size",12)
		_tight_button(apply,32)
		card.add_child(apply)
		training_apply_buttons[action_id] = apply
		picker.item_selected.connect(func(_index):_preview_training(action_id))
		_preview_training(action_id)
	training_tabs.current_tab = clampi(selected_training_tab,0,2)
	training_tabs.tab_changed.connect(func(index):selected_training_tab = index)
	_text(training,"Teto: 60 pontos por herói. Trocar a equipe mantém toda a maestria já conquistada.",12,app.MUTED)
	training.add_child(app._button("Escolher a próxima missão →",open.bind("story")))

func _preview_training(action_id: String) -> void:
	var picker: OptionButton = training_pickers[action_id]
	var choice: String = picker.get_item_metadata(picker.selected)
	var action: Dictionary = Campaign.AbilityTraining.build(app.catalog.hero_by_id[selected_hero],action_id,choice,int(app.combat.rules.energy.basicGain))
	var energy: String = "%d EN" % action.cost
	if action_id == "basic": energy += " · recupera %d EN" % int(action.get("energyGain",app.combat.rules.energy.basicGain))
	training_preview_labels[action_id].text = "PRÉVIA BASE · " + action.name + " · " + energy + "\n" + action.description
	training_apply_buttons[action_id].disabled = app.campaign.ability_choices.get(selected_hero,{}).get(action_id,"") == choice or choice != "" and not Campaign.AbilityTraining.unlocked(action_id,app.campaign.mastery_experience(selected_hero))

func _apply_training(action_id: String) -> void:
	var picker: OptionButton = training_pickers[action_id]
	if app.campaign.set_ability(selected_hero,action_id,picker.get_item_metadata(picker.selected)):
		message = "Habilidade preparada. A próxima missão usará esta variante; nenhuma moeda foi consumida."
	var position := scroll.scroll_vertical
	open("progress")
	scroll.set_deferred("scroll_vertical",position)

func _equipment() -> void:
	var model = app.campaign
	var config: Dictionary = Campaign.Equipment.settings
	_text(body,"COLEÇÃO  /  EQUIPAMENTOS DE CAMPANHA",11,CYAN)
	_heading(body,"Oficina do Farol",32)
	materials_label = _text(body,"%d fragmentos disponíveis" % model.materials(),20,CYAN)
	_text(body,"Cada herói possui arma, proteção e relíquia. Melhorias mantêm a gema; mudar a especialização ou trocar peças devolve as gemas afetadas ao inventário. Trocas são gratuitas.",13,app.MUTED)
	_text(body,"Vitórias: 6 fragmentos na primeira conclusão (+6 no fim de capítulo); novas vitórias em missões concluídas: 2. Patamar II e especializações: fim do capítulo I. Patamar III: fim do capítulo II.",12,app.MUTED)
	var hero_row := _row(body,12,true)
	hero_picker = OptionButton.new()
	hero_picker.custom_minimum_size = Vector2(240,40)
	for entry in app.catalog.heroes: hero_picker.add_item(entry.name)
	hero_picker.select(app.catalog.heroes.find(app.catalog.hero_by_id[selected_hero]))
	hero_picker.item_selected.connect(func(index): _choose_hero(app.catalog.heroes[index].id))
	hero_row.add_child(hero_picker)
	_text(hero_row,"Próxima missão: " + _stats_line(model.loadout_stats(selected_hero)),14)
	var layout := _row(body,14,true)
	for slot in range(3):
		var item: Dictionary = model.piece(selected_hero,slot)
		var definition: Dictionary = config.slots[slot]
		var card := _panel(layout,Color("355770"))
		card.add_theme_constant_override("separation",8)
		_text(card,definition.name.to_upper() + "  /  PATAMAR %s" % ["I","II","III"][int(item.tier)-1],11,CYAN)
		_heading(card,definition.variants[item.variant].name,20)
		var socket: Dictionary = model.gem(model.slots(selected_hero)[slot])
		_text(card,"Gema: " + (socket.name if not socket.is_empty() else "engaste vazio"),12,app.MUTED)
		var upgrade: Button = app._button("Patamar máximo" if item.tier == 3 else "Melhorar · %d fragmentos" % config.upgradeCosts[int(item.tier)],_upgrade_piece.bind(slot))
		upgrade.add_theme_font_size_override("font_size",13)
		_tight_button(upgrade,34)
		upgrade.disabled = item.tier >= Campaign.Equipment.unlocked_tier(model.completed) or item.tier == 3 or model.materials() < config.upgradeCosts[int(item.tier)]
		var improvement := _text(card,"Patamar máximo atingido.",12,app.MUTED)
		if item.tier < 3:
			var next: Dictionary = item.duplicate()
			next.tier += 1
			improvement.text = "Após melhorar: " + _stats_line(model.loadout_stats(selected_hero,slot,next))
			if item.tier >= Campaign.Equipment.unlocked_tier(model.completed): improvement.text += "\nConclua o capítulo %s para liberar." % ("I" if item.tier == 1 else "II")
			elif upgrade.disabled: improvement.text += "\nFragmentos insuficientes."
		card.add_child(upgrade)
		gear_upgrade_buttons.append(upgrade)
		_text(card,"ESPECIALIZAÇÃO",10,CYAN)
		var picker := OptionButton.new()
		picker.fit_to_longest_item = false
		picker.size_flags_horizontal = SIZE_EXPAND_FILL
		picker.add_theme_font_size_override("font_size",12)
		var variants: Array = definition.variants.keys()
		for variant in variants:
			picker.add_item(definition.variants[variant].name)
			var index: int = picker.item_count-1
			picker.set_item_metadata(index,variant)
			picker.set_item_disabled(index,not Campaign.Equipment.variant_unlocked(model.completed,variant))
		picker.select(variants.find(item.variant))
		card.add_child(picker)
		gear_variant_pickers.append(picker)
		var preview := _text(card,"",12,app.MUTED)
		preview.custom_minimum_size.y = 118
		gear_preview_labels.append(preview)
		var apply: Button = app._button("Aplicar especialização",_change_piece.bind(slot))
		apply.add_theme_font_size_override("font_size",12)
		_tight_button(apply,34)
		card.add_child(apply)
		gear_apply_buttons.append(apply)
		picker.item_selected.connect(func(_index):_preview_piece(slot))
		_text(card,"TROCAR PEÇA COM",10,CYAN)
		var recipient := OptionButton.new()
		recipient.fit_to_longest_item = false
		recipient.size_flags_horizontal = SIZE_EXPAND_FILL
		recipient.add_theme_font_size_override("font_size",12)
		for hero in app.catalog.heroes:
			if hero.id == selected_hero: continue
			var other: Dictionary = model.piece(hero.id,slot)
			recipient.add_item("%s · %s %d" % [hero.name,definition.variants[other.variant].name,other.tier])
			recipient.set_item_metadata(recipient.item_count-1,hero.id)
		card.add_child(recipient)
		gear_transfer_pickers.append(recipient)
		gear_exchange_labels.append(_text(card,"",11,app.MUTED))
		var exchange: Button = app._button("Trocar peças · grátis",_exchange_piece.bind(slot))
		exchange.add_theme_font_size_override("font_size",12)
		_tight_button(exchange,34)
		card.add_child(exchange)
		gear_transfer_buttons.append(exchange)
		recipient.item_selected.connect(func(_index):_preview_exchange(slot))
		_preview_piece(slot)
		_preview_exchange(slot)
	body.add_child(app._button("Engastar gemas →",open.bind("gems")))

func _preview_piece(slot: int) -> void:
	var picker := gear_variant_pickers[slot]
	var variant: String = picker.get_item_metadata(picker.selected)
	var item: Dictionary = app.campaign.piece(selected_hero,slot)
	var changed: bool = item.variant != variant
	item.variant = variant
	gear_apply_buttons[slot].disabled = not changed or not Campaign.Equipment.variant_unlocked(app.campaign.completed,variant)
	gear_preview_labels[slot].text = Campaign.Equipment.settings.slots[slot].variants[variant].detail + "\n" + ("Após aplicar: " if changed else "Atual: ") + _stats_line(app.campaign.loadout_stats(selected_hero,slot,item,slot if changed else -1)) + ("\nA gema deste engaste será devolvida." if changed else "")

func _preview_exchange(slot: int) -> void:
	var picker := gear_transfer_pickers[slot]
	var target: String = picker.get_item_metadata(picker.selected)
	var model = app.campaign
	var preview: String = "Após trocar (gemas devolvidas):\n%s: %s\n%s: %s" % [app.catalog.hero_by_id[selected_hero].name,_stats_line(model.loadout_stats(selected_hero,slot,model.piece(target,slot),slot)),app.catalog.hero_by_id[target].name,_stats_line(model.loadout_stats(target,slot,model.piece(selected_hero,slot),slot))]
	gear_transfer_buttons[slot].tooltip_text = preview
	gear_exchange_labels[slot].text = preview
	gear_transfer_buttons[slot].disabled = model.piece(target,slot) == model.piece(selected_hero,slot)

func _upgrade_piece(slot: int) -> void:
	if app.campaign.upgrade_piece(selected_hero,slot): message = "Peça melhorada. A gema foi mantida; atributos valem na próxima missão."
	open(page)

func _change_piece(slot: int) -> void:
	var picker := gear_variant_pickers[slot]
	if app.campaign.change_piece(selected_hero,slot,picker.get_item_metadata(picker.selected)): message = "Especialização aplicada. A gema voltou ao inventário."
	open(page)

func _exchange_piece(slot: int) -> void:
	var picker := gear_transfer_pickers[slot]
	if app.campaign.transfer_piece(selected_hero,picker.get_item_metadata(picker.selected),slot): message = "Peças trocadas com seus patamares. Gemas devolvidas ao inventário."
	open(page)

func _gems() -> void:
	var hero: Dictionary = app.catalog.hero_by_id[selected_hero]
	var tint: Color = app.catalog.affinity_color(hero.classId)
	var introduction := VBoxContainer.new()
	introduction.add_theme_constant_override("separation", 5)
	body.add_child(introduction)
	_text(introduction, "COLEÇÃO  /  OFICINA DE RESSONÂNCIA", 11, CYAN)
	_heading(introduction, "Prepare seu herói", 32)
	_text(introduction, "Selecione um engaste, confira os atributos e escolha uma gema. Trocas e remoções são gratuitas; bônus valem na história.", 14, app.MUTED)
	var layout := _row(body, 16, true)
	var character := _panel(layout, tint.darkened(.4))
	character.get_parent().size_flags_stretch_ratio = .85
	_text(character, "PERSONAGEM", 11, tint)
	hero_picker = OptionButton.new()
	hero_picker.custom_minimum_size.y = 40
	for entry in app.catalog.heroes: hero_picker.add_item("%s · %s" % [entry.name, entry.get("specialty", entry.role)])
	hero_picker.select(app.catalog.heroes.find(hero))
	hero_picker.item_selected.connect(func(index): _choose_hero(app.catalog.heroes[index].id))
	character.add_child(hero_picker)
	var portrait := _portrait(character, hero, Vector2(230, 240), true)
	portrait.size_flags_horizontal = SIZE_EXPAND_FILL
	_heading(character, hero.name.to_upper(), 28, tint)
	_text(character, "%s · %s" % [app.catalog.class_by_id[hero.classId].name, hero.get("specialty", hero.role)], 13)
	_text(character, hero.identity, 12, app.MUTED)
	character.add_child(app._button("Habilidades e sinergias →", open.bind("heroes")))
	var equipment := _panel(layout, Color("355770"))
	equipment.get_parent().size_flags_stretch_ratio = .95
	_text(equipment, "ENGASTES  /  3 ESPAÇOS", 11, CYAN)
	var equipped: Array = app.campaign.slots(selected_hero)
	for index in range(Campaign.SLOT_COUNT):
		var item: Dictionary = app.campaign.gem(equipped[index])
		var row := _row(equipment, 6)
		var button: Button = app._button("%02d  %s\n%s" % [index+1, item.name if not item.is_empty() else "Engaste vazio", item.effect if not item.is_empty() else "Selecione para equipar"], _select_slot.bind(index))
		button.size_flags_horizontal = SIZE_EXPAND_FILL
		button.custom_minimum_size.y = 65
		button.add_theme_font_size_override("font_size", 13)
		button.add_theme_stylebox_override("normal", _surface(Color("153348") if selected_slot == index else Color("0a1424"), CYAN if selected_slot == index else Color("2b4056"), 9))
		button.tooltip_text = "Engaste %d · %s" % [index+1, item.detail if not item.is_empty() else "Aceita qualquer tipo de gema."]
		row.add_child(button)
		slot_buttons.append(button)
		var remove: Button = app._button("×", _remove_slot.bind(index))
		remove.disabled = item.is_empty()
		remove.tooltip_text = "Desengastar a gema do espaço %d e devolver ao inventário" % (index+1)
		remove.custom_minimum_size = Vector2(36, 40)
		_tight_button(remove, 40)
		row.add_child(remove)
		if index == selected_slot: remove_button = remove
	_text(equipment, "ATRIBUTOS NA PRÓXIMA MISSÃO", 10, CYAN)
	var attributes: Dictionary = app.campaign.loadout_stats(selected_hero)
	for stat in [["Vida", hero.hp, attributes.maxHp, "8bd5a4"], ["Ataque", hero.attack, attributes.attack, "f49b70"], ["Defesa", hero.defense, attributes.defense, "a598ff"], ["Energia inicial", int(app.combat.rules.energy.initial), attributes.energy, "a9a0f6"]]:
		var delta: int = stat[2]-stat[1]
		_text(equipment, "%s   %d → %d  (%s%d)" % [stat[0], stat[1], stat[2], "+" if delta >= 0 else "", delta], 14, Color(stat[3]))
	var fill: Button = app._button("Preencher vazios por função", _fill_gems)
	fill.disabled = not equipped.has("") or not [1,2,3].any(func(level):return app.campaign.gems_at_level(level).any(func(g): return app.campaign.available(g.id) > 0))
	fill.tooltip_text = "Usa somente cópias livres: dano prioriza ataque, tanque vida e suporte energia; prefere o maior nível disponível do tipo. Preserva engastes ocupados e os outros heróis."
	fill_button = fill
	equipment.add_child(fill)
	var remove_all: Button = app._button("Desengastar tudo", _remove_all_gems)
	remove_all.disabled = equipped.all(func(id): return id == "")
	remove_all_button = remove_all
	equipment.add_child(remove_all)
	var inventory := _panel(layout, Color("524774"))
	inventory.get_parent().size_flags_stretch_ratio = 1.15
	inventory.add_theme_constant_override("separation", 8)
	_text(inventory, "INVENTÁRIO COMPARTILHADO", 11, VIOLET)
	_text(inventory,"%d fragmentos · Lapidar: 1 fragmento → 3 gemas I escolhidas. Fusão: 3 livres → 1 do próximo nível. Sem custo de fragmentos na fusão." % app.campaign.materials(),12,app.MUTED)
	_text(inventory,"Lapidação: primeira vitória. Fusão II: fim do capítulo I; III: fim do II. Cópias equipadas são protegidas.",11,app.MUTED)
	gem_level_picker = OptionButton.new()
	for title in ["Nível I · gemas básicas","Nível II · gemas fundidas","Nível III · gemas finais"]: gem_level_picker.add_item(title)
	gem_level_picker.select(gem_level-1)
	gem_level_picker.item_selected.connect(_select_gem_level)
	inventory.add_child(gem_level_picker)
	_text(inventory, "DESTINO  /  %s · engaste %02d" % [hero.name, selected_slot+1], 13, CYAN)
	gem_preview_label = _text(inventory, "Passe sobre uma gema ou use Tab para conferir os atributos após a troca.", 12, app.MUTED)
	gem_preview_label.custom_minimum_size.y = 32
	for type in app.campaign.gems_at_level(gem_level):
		var card := _panel(inventory, Color(type.color).darkened(.55))
		card.get_parent().add_theme_stylebox_override("panel", _surface(Color("091323"), Color(type.color).darkened(.55), 8))
		card.add_theme_constant_override("separation", 3)
		var line := _row(card, 9)
		var icon := GemIcon.new()
		icon.tint = Color(type.color)
		icon.custom_minimum_size = Vector2(28, 28)
		line.add_child(icon)
		var words := VBoxContainer.new()
		words.size_flags_horizontal = SIZE_EXPAND_FILL
		line.add_child(words)
		_heading(words, type.name + " · " + type.effect, 15, Color(type.color))
		var free: int = app.campaign.available(type.id)
		_text(card, "%d livres   ·   %d equipadas   ·   %d no total" % [free, app.campaign.copies(type.id)-free, app.campaign.copies(type.id)], 11, app.MUTED)
		var current: bool = equipped[selected_slot] == type.id
		var button: Button = app._button("Já neste engaste" if current else "Engastar no espaço %02d →" % (selected_slot+1) if free > 0 else "Sem cópias livres", _equip.bind(type.id))
		button.disabled = current or free <= 0
		button.tooltip_text = _gem_preview(type.id)
		var preview_text: String = button.tooltip_text
		button.mouse_entered.connect(func(): gem_preview_label.text = preview_text)
		button.focus_entered.connect(func(): gem_preview_label.text = preview_text)
		button.add_theme_font_size_override("font_size", 12)
		_tight_button(button, 28)
		card.add_child(button)
		gem_buttons[type.id] = button
		var owners: Array = []
		var owner_row := _row(card, 5)
		var picker := OptionButton.new()
		picker.size_flags_horizontal = SIZE_EXPAND_FILL
		picker.add_theme_font_size_override("font_size", 11)
		for entry in app.catalog.heroes:
			var slots: Array = app.campaign.slots(entry.id)
			for index in range(Campaign.SLOT_COUNT):
				if slots[index] != type.id: continue
				if entry.id == selected_hero and index == selected_slot: continue
				owners.append({"hero": entry.id, "slot": index})
				picker.add_item("%s · espaço %02d" % [entry.name, index+1])
		if owners.is_empty(): picker.add_item("Nenhuma cópia para transferir")
		_tight_button(picker, 28)
		owner_row.add_child(picker)
		var bring: Button = app._button("Trazer", _transfer_gem.bind(picker, owners))
		bring.disabled = owners.is_empty()
		bring.tooltip_text = "Move a cópia do herói escolhido para este engaste. A gema substituída volta ao inventário."
		bring.add_theme_font_size_override("font_size", 12)
		_tight_button(bring, 28)
		owner_row.add_child(bring)
		transfer_buttons[type.id] = bring
		owner_pickers[type.id] = picker
		var craft: Button = app._button("Lapidar 3 gemas I · 1 fragmento",_craft_gem.bind(type.base))
		craft.add_theme_font_size_override("font_size",12)
		_tight_button(craft,30)
		craft.disabled = not app.campaign.completed.has(Campaign.GemForge.settings.craftUnlock) or app.campaign.materials() < Campaign.GemForge.settings.craftMaterials
		craft.tooltip_text = "Cria três cópias básicas de %s, sem alterar engastes. Requer a primeira vitória e um fragmento." % app.campaign.gem(type.base).name
		card.add_child(craft)
		gem_craft_buttons[type.base] = craft
		if gem_level < 3:
			var fusion: Button = app._button("Fundir 3 livres → nível %s" % ("II" if gem_level == 1 else "III"),_request_fusion.bind(type.id))
			fusion.add_theme_font_size_override("font_size",12)
			_tight_button(fusion,30)
			var unlocked: bool = app.campaign.completed.has(Campaign.GemForge.settings.levelUnlocks[gem_level])
			fusion.disabled = not unlocked or free < 3
			fusion.tooltip_text = "Conclua o capítulo %s para liberar esta fusão." % ("I" if gem_level == 1 else "II") if not unlocked else "Requer três cópias livres deste nível. Cópias equipadas nunca são consumidas."
			card.add_child(fusion)
			gem_fuse_buttons[type.id] = fusion
		else: _text(card,"Nível máximo · nenhuma fusão adicional",11,app.MUTED)

func _select_gem_level(index: int) -> void:
	gem_level = clampi(index+1,1,3)
	_refresh_gem_inventory()
	gem_level_picker.grab_focus()

func _refresh_gem_inventory() -> void:
	var position := scroll.scroll_vertical
	open("gems")
	scroll.set_deferred("scroll_vertical",position)

func _craft_gem(type: String) -> void:
	if app.campaign.craft_gem(type): message = "Três gemas básicas de %s adicionadas ao estoque. Um fragmento utilizado." % app.campaign.gem(type).name
	_refresh_gem_inventory()

func _request_fusion(type: String) -> void:
	var item: Dictionary = app.campaign.gem(type)
	if item.is_empty() or item.level >= 3 or app.campaign.available(type) < 3 or not app.campaign.completed.has(Campaign.GemForge.settings.levelUnlocks[item.level]): return
	if not is_instance_valid(gem_fusion_dialog):
		gem_fusion_dialog = ConfirmationDialog.new()
		gem_fusion_dialog.title = "Confirmar fusão de gemas"
		gem_fusion_dialog.ok_button_text = "Consumir 3 e fundir"
		gem_fusion_dialog.cancel_button_text = "Cancelar"
		gem_fusion_dialog.confirmed.connect(_confirm_fusion)
		gem_fusion_dialog.canceled.connect(func():_pending_fusion = "")
		add_child(gem_fusion_dialog)
	_pending_fusion = type
	var next: Dictionary = app.campaign.gem(Campaign.GemForge.key(item.base,item.level+1))
	var free: int = app.campaign.available(type)
	gem_fusion_dialog.dialog_text = "Consumir 3 livres de %s (nível %d).\nProduzir 1 %s: %s.\n\nCópias livres do nível atual: %d → %d.\nGemas equipadas permanecem com seus heróis.\nCusto de fragmentos: zero.\n\nAs três cópias consumidas não podem ser recuperadas." % [item.name,item.level,next.name,next.effect,free,free-3]
	gem_fusion_dialog.popup_centered(Vector2i(540,320))
	gem_fusion_dialog.get_cancel_button().grab_focus()

func _confirm_fusion() -> void:
	var type := _pending_fusion
	_pending_fusion = ""
	if type == "": return
	if app.campaign.fuse_gem(type): message = "Fusão concluída. Uma gema do próximo nível entrou no estoque; engastes preservados."
	_refresh_gem_inventory()

func _gem_preview(type: String) -> String:
	return "Após a troca: " + _stats_line(app.campaign.loadout_stats(selected_hero,-1,{},selected_slot,type)) + ". A gema anterior retorna ao inventário."

func _remove_slot(index: int) -> void:
	selected_slot = index
	_equip("")

func _remove_all_gems() -> void:
	if app.campaign.remove_gems(selected_hero): message = "Todas as gemas de %s voltaram ao inventário." % app.catalog.hero_by_id[selected_hero].name
	open(page)

func _fill_gems() -> void:
	if app.campaign.fill_gems(selected_hero): message = "Espaços vazios preenchidos com cópias livres. Os outros heróis mantiveram seus engastes."
	open(page)

func _transfer_gem(picker: OptionButton, owners: Array) -> void:
	if picker.selected < 0 or picker.selected >= owners.size(): return
	var source: Dictionary = owners[picker.selected]
	if app.campaign.transfer_gem(source.hero, source.slot, selected_hero, selected_slot): message = "Gema transferida de %s para %s. A cópia substituída voltou ao inventário." % [app.catalog.hero_by_id[source.hero].name, app.catalog.hero_by_id[selected_hero].name]
	open(page)

func _gem_loadout(parent: Node, compact := false) -> void:
	var hero: Dictionary = app.catalog.hero_by_id[selected_hero]
	var equipped: Array = app.campaign.slots(selected_hero)
	var attributes: Dictionary = app.campaign.loadout_stats(selected_hero)
	var summary := _panel(parent, Color("355770"))
	if compact:
		parent.add_theme_constant_override("separation", 6)
		summary.get_parent().add_theme_stylebox_override("panel", _surface(SURFACE, Color("355770"), 10))
		summary.add_theme_constant_override("separation", 6)
	else:
		_text(summary, "ENGASTES DE " + hero.name.to_upper() + "  /  HISTÓRIA", 11, CYAN)
	var initial_energy: int = int(app.combat.rules.energy.initial)
	_text(summary, "VIDA %d → %d   ·   ATQ %d → %d   ·   DEF %d → %d   ·   EN INICIAL %d → %d" % [hero.hp, attributes.maxHp, hero.attack, attributes.attack, hero.defense, attributes.defense, initial_energy, attributes.energy], 13)
	var row := _row(summary, 6 if compact else 10)
	for index in range(3):
		var item: Dictionary = app.campaign.gem(equipped[index])
		var button: Button = app._button("%02d  ·  %s" % [index + 1, item.name if not item.is_empty() else "ESPAÇO VAZIO"], _select_slot.bind(index))
		button.size_flags_horizontal = SIZE_EXPAND_FILL
		button.custom_minimum_size.y = 43
		button.add_theme_font_size_override("font_size", 11)
		button.add_theme_stylebox_override("normal", _surface(Color("16344b") if selected_slot == index else Color("0b1526"), CYAN if selected_slot == index else Color("2c4058"), 10))
		if compact: _tight_button(button, 34)
		button.tooltip_text = "Selecionar engaste %d. %s" % [index + 1, item.effect if not item.is_empty() else "Pode receber qualquer gema disponível."]
		row.add_child(button)
		slot_buttons.append(button)
	var target := _row(summary, 6 if compact else 12)
	_text(target, "ENGASTE %02d  ·  escolha uma gema abaixo" % (selected_slot + 1) if compact else "EDITANDO ENGASTE %02d  ·  escolha uma gema abaixo" % (selected_slot + 1), 11, CYAN)
	remove_button = app._button("Remover gema", _equip.bind(""))
	remove_button.disabled = equipped[selected_slot] == ""
	remove_button.add_theme_font_size_override("font_size", 12)
	if compact:
		remove_button.add_theme_font_size_override("font_size", 11)
		_tight_button(remove_button, 28)
	target.add_child(remove_button)
	var choices := _row(parent, 12, not compact)
	for type in Campaign.GEMS:
		var current: bool = equipped[selected_slot] == type.id
		var free: int = app.campaign.available(type.id)
		var can_replace: int = app.campaign.available(type.id, selected_hero, selected_slot)
		var card := _panel(choices, Color(type.color) if current else Color("263b54"))
		if compact:
			card.get_parent().add_theme_stylebox_override("panel", _surface(SURFACE, Color(type.color) if current else Color("263b54"), 10))
			card.get_parent().tooltip_text = type.detail
			card.add_theme_constant_override("separation", 6)
		var header := _row(card, 6 if compact else 10)
		var icon := GemIcon.new()
		icon.tint = Color(type.color)
		icon.custom_minimum_size = Vector2(32 if compact else 54, 32 if compact else 58)
		header.add_child(icon)
		var title := VBoxContainer.new()
		title.size_flags_horizontal = SIZE_EXPAND_FILL
		if compact: title.add_theme_constant_override("separation", 2)
		header.add_child(title)
		_heading(title, type.name, 14 if compact else 20, Color(type.color))
		_text(title, type.effect, 15 if compact else 22, WHITE)
		if not compact: _text(card, type.detail, 14)
		_text(card, "%d livres  /  %d cópias no inventário" % [free, app.campaign.copies(type.id)], 11, app.MUTED)
		var owners: Array[String] = []
		for id in app.campaign.equipped:
			var count: int = app.campaign.slots(id).count(type.id)
			if count > 0: owners.append("%s ×%d" % [app.catalog.hero_by_id[id].name, count])
		_text(card, "Em uso: " + (", ".join(owners) if not owners.is_empty() else "ninguém"), 10, app.MUTED)
		var button: Button = app._button("No engaste %02d" % (selected_slot + 1) if current else "Engastar  →" if can_replace > 0 else "Cópias em uso", _equip.bind(type.id))
		button.disabled = current or can_replace <= 0
		button.custom_minimum_size.y = 39
		button.add_theme_font_size_override("font_size", 12)
		if compact:
			_tight_button(button, 32)
			button.tooltip_text = type.detail
		card.add_child(button)
		gem_buttons[type.id] = button
	parent.add_child(app._button("Inventário, fabricação e fusão →",open.bind("gems")))

func _tight_button(button: Button, height: int) -> void:
	button.custom_minimum_size.y = height
	for state_name in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style: StyleBox = button.get_theme_stylebox(state_name).duplicate() if button.has_theme_stylebox_override(state_name) else app.get_theme_stylebox(state_name, "Button").duplicate()
		style.content_margin_top = 6
		style.content_margin_bottom = 6
		style.content_margin_left = 8
		style.content_margin_right = 8
		button.add_theme_stylebox_override(state_name, style)

func _select_slot(index: int) -> void:
	selected_slot = clampi(index, 0, 2)
	message = ""
	if page == "heroes": hero_tab = 2
	open(page)

func _equip(type: String) -> void:
	if app.campaign.equip(selected_hero, type, selected_slot):
		message = "Engaste %02d vazio. A cópia voltou ao inventário." % (selected_slot + 1) if type == "" else "%s no engaste %02d de %s. Bônus aplicado na próxima missão." % [app.campaign.gem(type).name, selected_slot + 1, app.catalog.hero_by_id[selected_hero].name]
	if page == "heroes": hero_tab = 2
	open(page)
