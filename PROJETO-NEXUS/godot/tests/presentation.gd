extends RefCounted
## Focused Alpha 0.8 presentation checks. Progress uses its own disposable file.
const Campaign = preload("res://scripts/campaign.gd")
const Codex = preload("res://scripts/hero_codex.gd")
const PATH := "user://presentation-test.json"

static func _clean() -> void:
	for suffix in ["", ".tmp", ".v1.bak", ".v2.bak", ".invalid.bak"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))

static func _settle(tree: SceneTree) -> void:
	await tree.process_frame
	await tree.process_frame
	await tree.process_frame

static func _visible_text(parent: Node) -> String:
	var result := ""
	if parent is Label and parent.is_visible_in_tree(): result = parent.text + "\n"
	if parent is RichTextLabel and parent.is_visible_in_tree(): result = parent.get_parsed_text() + "\n"
	for child in parent.get_children(): result += _visible_text(child)
	return result

static func _click(tree: SceneTree, button: Button) -> void:
	var at: Vector2 = button.get_global_rect().get_center()
	var viewport: Viewport = button.get_viewport()
	var motion := InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	viewport.push_input(motion, true)
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.button_mask = MOUSE_BUTTON_MASK_LEFT
	event.position = at
	event.global_position = at
	event.pressed = true
	viewport.push_input(event, true)
	await tree.process_frame
	event = event.duplicate()
	event.pressed = false
	event.button_mask = 0
	viewport.push_input(event, true)
	await _settle(tree)

static func _cards(app, check: Callable) -> void:
	for id in ["basic", "skill", "ultimate", "guard"]:
		var card = app.action_buttons[id]
		var bounds: Rect2 = card.get_global_rect()
		check.call(card.custom_minimum_size.y >= 104 and card.illustration.size.x >= 50 and card.illustration.texture != null, "%s has a large card and its own illustrated icon" % id)
		check.call(card.name_label.max_lines_visible == 2 and card.name_label.get_visible_line_count() <= 2, "%s limits the visible skill name to two lines" % id)
		var contained := true
		for element in [card.glyph, card.illustration, card.name_label, card.cost_label, card.scope_label]:
			contained = contained and bounds.encloses(element.get_global_rect())
		check.call(contained and not card.cost_label.text.is_empty() and not card.scope_label.text.is_empty(), "%s keeps its icon, name, cost and target inside the card" % id)

static func run(tree: SceneTree, scene: PackedScene, check: Callable) -> void:
	_clean()
	var original_size: Vector2i = tree.root.size
	var app = scene.instantiate()
	tree.root.add_child(app)
	await _settle(tree)
	app.campaign = Campaign.new(app.catalog, PATH)
	app.reduced_motion = true
	app.mode = "training"
	app.difficulty = "normal"
	app.hub.open("menu")
	await _settle(tree)
	var free_teams: Array = app.teams.duplicate(true)
	var baseline: Dictionary = app.combat.new_battle(free_teams[0], free_teams[1])
	var navigation: Button = app.hub.nav_buttons.get("heroes")
	check.call(navigation != null, "Main menu exposes a Heroes navigation button")
	if navigation == null:
		app.queue_free()
		await _settle(tree)
		_clean()
		return
	await _click(tree, navigation)
	check.call(app.hub.page == "heroes" and app.hub.visible and not app.combat_view.visible, "Pointer input opens the Heroes page from the menu")
	var ids: Array = app.catalog.heroes.map(func(hero): return hero.id)
	var selectable: Array = app.hub.hero_buttons.keys()
	ids.sort()
	selectable.sort()
	check.call(selectable == ids and selectable.size() == 24, "Heroes selector contains exactly the twenty-four active heroes")
	for hero in app.catalog.heroes:
		app.hub.hero_buttons[hero.id].pressed.emit()
		await _settle(tree)
		check.call(app.hub.selected_hero == hero.id and app.hub.hero_name.text.to_upper().contains(hero.name.to_upper()), "Selecting %s updates the visible hero identity" % hero.name)
		app.hub.hero_details.current_tab = 0
		await _settle(tree)
		var skills: String = _visible_text(app.hub.body)
		for key in ["basic", "skill", "ultimate"]:
			var ability: Dictionary = hero[key]
			check.call(skills.contains(ability.name) and skills.contains(ability.description), "%s shows the complete %s name and description" % [hero.name, key])
		check.call(skills.contains(hero.synergy), "%s shows its own team synergy" % hero.name)
		app.hub.hero_details.current_tab = 1
		await _settle(tree)
		var entry: Dictionary = Codex.entry(hero.id)
		var lore: String = _visible_text(app.hub.body)
		check.call(app.hub.hero_lore.is_visible_in_tree() and lore.contains(entry.story) and lore.contains(entry.connection), "%s has a visible biography and connection to the chapter" % hero.name)
	app.hub._choose_hero("veyra")
	app.hub.hero_details.current_tab = 2
	await _settle(tree)
	check.call(app.hub.slot_buttons.size() == 3 and app.hub.slot_buttons.all(func(button): return button.is_visible_in_tree()), "Each hero has three visible, selectable gem sockets")
	app.hub.slot_buttons[0].pressed.emit()
	app.hub.gem_buttons.ember.pressed.emit()
	await _settle(tree)
	app.hub.slot_buttons[1].pressed.emit()
	check.call(not app.hub.gem_buttons.ember.disabled, "A repeated gem remains selectable for another socket when a copy is free")
	app.hub.gem_buttons.ember.pressed.emit()
	await _settle(tree)
	check.call(app.campaign.slots("veyra") == ["ember", "ember", ""] and app.campaign.available("ember") == 1, "Two identical gems equip different sockets and consume two inventory copies through the interface")
	check.call(app.hub.slot_buttons.size() == 3 and not app.hub.remove_button.disabled, "Equipping preserves all three socket controls and enables removal of the selected gem")
	var reloaded = Campaign.new(app.catalog, PATH)
	check.call(reloaded.slots("veyra") == ["ember", "ember", ""], "The two gem sockets survive reopening local progress")
	for dimensions in [Vector2i(960, 540), Vector2i(1280, 720), Vector2i(1920, 1080), Vector2i(960, 640)]:
		tree.root.size = dimensions
		app.hub.open("heroes")
		app.hub.hero_details.current_tab = 0
		await _settle(tree)
		var frame: Rect2 = tree.root.get_visible_rect()
		var tabs: TabBar = app.hub.hero_details.get_tab_bar()
		var bounds: Rect2 = tabs.get_global_rect()
		check.call(bounds.position.x >= frame.position.x and bounds.end.x <= frame.end.x, "Hero tabs remain within the horizontal viewport at %s" % dimensions)
		app._enter_free()
		await _settle(tree)
		_cards(app, check)
		app._leave_battle("heroes")
	# Enter an actual equipped mission, then use the same menu path back to free
	# combat. Only campaign units may receive the socket bonuses.
	app.hub.open("story")
	app.hub.mission_buttons[0].pressed.emit()
	await _settle(tree)
	var campaign_hero: Dictionary = app.combat.unit(app.state, "0-veyra")
	var baseline_hero: Dictionary = app.catalog.hero_by_id.veyra
	check.call(campaign_hero.attack > baseline_hero.attack and campaign_hero.get("gem", "").contains("2 · Brasa"), "The equipped story mission shows both sockets and receives their attack bonus")
	app._leave_battle("menu")
	app._enter_free()
	check.call(app.state == baseline and app.teams == free_teams, "Returning through the menu restores exact baseline combat without gem bonuses or changed teams")
	tree.root.size = original_size
	app.queue_free()
	await _settle(tree)
	_clean()
