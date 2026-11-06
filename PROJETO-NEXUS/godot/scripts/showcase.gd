extends AcceptDialog
const Fighter = preload("res://scripts/fighter.gd")
const Director = preload("res://scripts/animation_director.gd")
const Backdrop = preload("res://scripts/arena_backdrop.gd")
const Art = preload("res://scripts/ability_art.gd")
const Combat = preload("res://scripts/combat.gd")
const CombatUI = preload("res://scripts/combat_ui.gd")
const HEROES = ["veyra", "rhazen", "cindra", "sylva", "oren", "nima", "axion", "kira", "vektor", "astra", "elun", "saira", "vesper", "maura", "riven", "torv", "brin", "bast", "ivo", "noct", "auren", "elyra", "solen", "zaya"]
const REPRESENTATIVES = ["veyra", "sylva", "axion", "astra", "vesper", "auren"]
var hero_picker: OptionButton
var catalog
var audio
var voice
var director = Director.new()
var selected_hero := "veyra"
var playing := false
var reduced_motion := false
var stage: Control
var effects: Control
var fighters: Dictionary = {}
var hero_buttons: Array[Button] = []
var action_buttons: Array[Button] = []
var caption: Label
var explanation: Label
var version := 0
var scenario: OptionButton
var report: RichTextLabel
var preview_state: Dictionary = {}
var omitted_receipts := 0

func _ready() -> void:
	title = "Galeria de golpes · todos os 24 personagens"
	ok_button_text = "Voltar ao combate"
	visibility_changed.connect(func():
		if not visible:
			version += 1
			director.cancel()
			if is_instance_valid(voice): voice.stop_line()
			playing = false)
	var content := VBoxContainer.new()
	content.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	content.custom_minimum_size = Vector2(1000, 590)
	add_child(content)
	var hint := Label.new()
	hint.text = "Escolha um personagem e experimente seus golpes. Esta demonstração não altera a partida."
	hint.add_theme_font_size_override("font_size", 14)
	var hint_row := HBoxContainer.new()
	content.add_child(hint_row)
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.text = "Teste golpes e indicadores sem alterar a partida."
	hint_row.add_child(hint)
	scenario = OptionButton.new()
	for label in ["Cenário: normal", "Escudo + crítico (exemplo)", "Queimadura + sangramento"]: scenario.add_item(label)
	scenario.tooltip_text = "Cenários de demonstração. Os valores são calculados pelo motor; o crítico deste exemplo usa uma semente fixa."
	hint_row.add_child(scenario)
	hero_picker = OptionButton.new()
	for id in HEROES:
		var hero: Dictionary = catalog.hero_by_id[id]
		hero_picker.add_item("%s · %s · %s" % [hero.name, catalog.class_by_id[hero.classId].name, hero.role])
	hero_picker.item_selected.connect(func(index): _select_hero(HEROES[index]))
	content.add_child(hero_picker)
	var heroes := HBoxContainer.new()
	content.add_child(heroes)
	for id in REPRESENTATIVES:
		var hero: Dictionary = catalog.hero_by_id[id]
		var button := Button.new()
		button.text = "%s\n%s" % [hero.name, catalog.class_by_id[hero.classId].name]
		button.icon = Fighter.portrait(int(hero.index))
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width", 38)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.toggle_mode = true
		button.pressed.connect(_select_hero.bind(id))
		heroes.add_child(button)
		hero_buttons.append(button)
	stage = Control.new()
	stage.custom_minimum_size = Vector2(1000, 356)
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.clip_contents = true
	content.add_child(stage)
	var background := Backdrop.new()
	background.motion_enabled = not reduced_motion
	stage.add_child(background)
	effects = Control.new()
	effects.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	effects.mouse_filter = Control.MOUSE_FILTER_IGNORE
	effects.z_index = 60
	stage.add_child(effects)
	stage.resized.connect(_position)
	caption = Label.new()
	caption.add_theme_font_size_override("font_size", 20)
	caption.add_theme_color_override("font_color", Color("e5c38c"))
	content.add_child(caption)
	report = RichTextLabel.new()
	report.bbcode_enabled = true
	report.scroll_active = false
	report.custom_minimum_size = Vector2(980, 36)
	report.add_theme_font_size_override("normal_font_size", 13)
	content.add_child(report)
	explanation = Label.new()
	explanation.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	# Give wrapping text a width before it enters the Window. Otherwise its
	# initial zero-width layout can permanently inflate the popup's height.
	explanation.custom_minimum_size = Vector2(980, 42)
	explanation.size = Vector2(980, 42)
	explanation.max_lines_visible = 2
	explanation.add_theme_font_size_override("font_size", 14)
	content.add_child(explanation)
	var actions := HBoxContainer.new()
	content.add_child(actions)
	for id in ["basic", "skill", "ultimate"]:
		var button := Button.new()
		button.text = {"basic": "Ver ataque", "skill": "Ver técnica", "ultimate": "Ver supremo"}[id]
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_play.bind(id))
		actions.add_child(button)
		action_buttons.append(button)
	_select_hero(selected_hero)

func _select_hero(id: String) -> void:
	if is_instance_valid(voice): voice.stop_line()
	version += 1
	director.cancel()
	playing = false
	if is_instance_valid(scenario): scenario.disabled = false
	selected_hero = id
	if is_instance_valid(hero_picker): hero_picker.select(HEROES.find(id))
	for fighter in fighters.values():
		stage.remove_child(fighter)
		fighter.queue_free()
	fighters.clear()
	for child in effects.get_children():
		effects.remove_child(child)
		child.queue_free()
	var hero: Dictionary = catalog.hero_by_id[id]
	var dummy: Dictionary = catalog.hero_by_id["axion" if id != "axion" else "vesper"]
	for entry in [[hero, "actor"], [dummy, "target"]]:
		var fighter = Fighter.new()
		fighter.setup(entry[0], entry[1], catalog.affinity_color(entry[0].classId))
		fighter.disabled = true
		fighter.motion_enabled = not reduced_motion
		stage.add_child(fighter)
		fighter.refresh({"hp": entry[0].hp, "maxHp": entry[0].hp, "energy": 100, "shield": 0, "shieldTurns": 0, "statuses": [], "guarding": false}, entry[1] == "actor", false, false)
		if entry[1] == "target":
			fighter.title.text = "Alvo de treino"
			fighter.artwork.flip_h = true
		fighters[entry[1]] = fighter
	for index in range(REPRESENTATIVES.size()): hero_buttons[index].set_pressed_no_signal(REPRESENTATIVES[index] == id)
	for index in range(action_buttons.size()):
		var button: Button = action_buttons[index]
		button.disabled = false
		button.icon = Art.icon(int(hero.index), ["basic", "skill", "ultimate"][index])
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width", 28)
	caption.text = "%s · %s" % [hero.name, catalog.class_by_id[hero.classId].name]
	explanation.text = "Antecipação, ataque, impacto e retorno. Escolha um golpe abaixo para assistir."
	report.text = "Vida, escudo, crítico e estados aparecerão aqui no impacto."
	_position.call_deferred()

func _position() -> void:
	if fighters.size() != 2: return
	for pair in [["actor", 0.25], ["target", 0.75]]:
		var fighter = fighters[pair[0]]
		fighter.position = Vector2(stage.size.x * pair[1] - 93, stage.size.y - 164 - 257)
		fighter.set_depth(0.95)
		fighter.plate.position = Vector2(-5, stage.size.y - fighter.plate.size.y - 4 - fighter.position.y)

func _play(action_id: String) -> void:
	if playing: return
	playing = true
	scenario.disabled = true
	var stamp := version
	for button in action_buttons: button.disabled = true
	var hero: Dictionary = catalog.hero_by_id[selected_hero]
	var action: Dictionary = hero[action_id]
	if is_instance_valid(voice) and action_id in ["skill","ultimate"]: voice.speak(hero.id,action_id)
	caption.text = "%s · %s" % [hero.name, action.name]
	explanation.text = action.description
	if reduced_motion: explanation.text += " Animações reduzidas estão ativadas."
	var combat = Combat.new()
	var dummy: String = "axion" if selected_hero != "axion" else "vesper"
	var rest: Array = catalog.heroes.map(func(h): return h.id).filter(func(id): return id not in [selected_hero, dummy])
	preview_state = combat.new_battle([selected_hero, dummy, rest[0]], [dummy, rest[1], rest[2]], "normal", 1972 if scenario.selected == 1 else 73)
	var actor_id := "0-" + selected_hero
	var friendly: bool = combat.friendly(action)
	var target_id := ("0-" if friendly else "1-") + dummy
	var actor := combat.unit(preview_state, actor_id)
	var target := combat.unit(preview_state, target_id)
	actor.energy = 100
	actor.hp = combat.rounded(actor.maxHp * 0.75)
	target.hp = combat.rounded(target.maxHp * 0.70)
	# Only the displayed pair may receive action effects. Hidden stand-ins used
	# to contribute AoE drain/healing, making the displayed numbers disagree.
	for member in preview_state.units:
		if member.id in [actor_id, target_id]: continue
		if member.side == actor.side or not friendly: member.hp = 0
	if scenario.selected == 1 and not friendly:
		target.shield = combat.rounded(target.maxHp * 0.25)
		target.shieldTurns = 2
	if scenario.selected == 2:
		target.statuses = [{"type": "burn", "turns": 2}, {"type": "bleed", "turns": 2}]
	# Explicit two-person preview order; the real battle and its RNG stay untouched.
	preview_state.order = [actor_id, target_id]
	preview_state.cursor = 0
	fighters.actor.refresh(actor, true, false, false)
	fighters.target.refresh(target, false, false, false)
	fighters.target.title.text = "Aliado de treino" if friendly else "Alvo de treino"
	fighters.target.set_relationship(combat.advantage(hero.classId, catalog.hero_by_id[dummy].classId), not friendly)
	var result := combat.act(preview_state, action_id, actor_id if action.get("self", false) else target_id)
	var mapped: Array = []
	omitted_receipts = 0
	for event in result.events:
		if event.target not in [actor_id, target_id]:
			omitted_receipts += 1
			continue
		var copy: Dictionary = event.duplicate(true)
		copy.target = "actor" if event.target == actor_id else "target"
		mapped.append(copy)
	var presentation := {"actor": "actor", "actionId": action_id, "events": mapped}
	report.text = "Preparação…" + (" Crítico demonstrativo; escudo inicial de 25% da vida." if scenario.selected == 1 and not friendly else "")
	var completed: bool = await director.play(self, effects, fighters, hero, action, presentation, reduced_motion, func():
		if is_instance_valid(audio): audio.strike(hero,action,mapped,action_id)
		for pair in [["actor", actor_id], ["target", target_id]]:
			var data: Dictionary = result.impactUnits.filter(func(u): return u.id == pair[1])[0]
			fighters[pair[0]].refresh(data, pair[0] == "actor", false, false)
		report.text = "\n".join(mapped.filter(func(e): return e.has("amount")).map(func(e): return CombatUI.event_detail(e)))
		report.tooltip_text = CombatUI._plain(report.text))
	if stamp != version or not completed: return
	var ticks: Array = []
	for event in result.turnEvents:
		if event.target not in [actor_id, target_id]: continue
		var copy: Dictionary = event.duplicate(true)
		copy.target = "actor" if event.target == actor_id else "target"
		ticks.append(copy)
	if not ticks.is_empty():
		completed = await director.play_ticks(self, effects, fighters, ticks, reduced_motion, func(event):
			for fighter in fighters.values(): fighter.refresh(fighter.display_data, fighter.unit_id == event.target, false, false)
			fighters[event.target].apply_tick(event)
			report.text = CombatUI.event_detail(event)
			report.tooltip_text = CombatUI._plain(report.text))
		if stamp != version or not completed: return
	for pair in [["actor", actor_id], ["target", target_id]]:
		fighters[pair[0]].refresh(combat.unit(preview_state, pair[1]), pair[0] == "actor", false, false)
	playing = false
	scenario.disabled = false
	for button in action_buttons: button.disabled = false
