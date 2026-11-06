extends SceneTree
const Combat = preload("res://scripts/combat.gd")
const MainScene = preload("res://scenes/main.tscn")
var checks := 0
var failures: Array = []
var exported_files: Array = []

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		push_error(message)

func wait_idle(app: Node, turns: int, timeout := 8.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while (app.busy or app.ai_pending or app.state.turns < turns) and Time.get_ticks_msec() < deadline:
		await process_frame
	check(not app.busy and not app.ai_pending and app.state.turns >= turns, "Action and AI finished within timeout")

func click(button: Control) -> void:
	var viewport := button.get_viewport()
	var at := button.get_global_rect().get_center()
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
	await process_frame
	event = event.duplicate()
	event.pressed = false
	event.button_mask = 0
	viewport.push_input(event, true)
	await process_frame

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		push_error("Use npm run test:godot to supply fixtures and output paths.")
		quit(1)
		return
	var fixtures: Array = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var results: Array = []
	var combat = Combat.new()
	for fixture in fixtures:
		var state := combat.new_battle(fixture.teams[0], fixture.teams[1], fixture.difficulty, int(fixture.seed))
		var initial := state.duplicate(true)
		for data in state.units:
			data.merge(fixture.patch.get(data.id, {}).duplicate(true), true)
		var commands: Array = []
		for command in fixture.commands:
			var choice := combat.choose_ai(state)
			var prediction: Variant = combat.preview(state, command.actionId, command.targetId) if commands.is_empty() else null
			var result := combat.act(state, command.actionId, command.targetId)
			commands.append({"choice": choice, "result": result, "prediction": prediction})
		results.append({"initial": initial, "commands": commands, "final": state})
	var state := combat.new_battle(combat.catalog.default_teams[0], combat.catalog.default_teams[1])
	var before := state.duplicate(true)
	check(combat.act(state, "ultimate", "1-vesper").has("error"), "Unavailable ultimate rejected")
	check(state == before, "Invalid action cannot mutate state")
	check(combat.act(state, "basic", "0-veyra").has("error"), "Enemy attack cannot target ally")
	check(state == before, "Invalid target cannot mutate state")
	check(combat.new_battle(["veyra", "veyra", "astra"], combat.catalog.default_teams[1]).has("error"), "Duplicate team rejected")
	check(combat.new_battle(["unknown", "veyra", "astra"], combat.catalog.default_teams[1]).has("error"), "Unknown hero rejected")
	check(combat.new_battle(combat.catalog.default_teams[0], combat.catalog.default_teams[1], "invalid").has("error"), "Unknown difficulty rejected")
	for affinity in combat.catalog.classes:
		check(combat.advantage(affinity.id, affinity.strongAgainst) == 1.25, "Forward affinity edge")
		check(combat.advantage(affinity.id, affinity.weakAgainst) == 0.85, "Reverse affinity edge")
	for round_value in [11, 12, 16, 21, 24]:
		var healing := combat.new_battle(["saira", "maura", "sylva"], ["nima", "riven", "kira"])
		healing.round = round_value
		healing.order = ["0-saira", "0-maura", "0-sylva", "1-nima", "1-riven", "1-kira"]
		healing.cursor = 0
		var support := combat.current(healing)
		support.hp = 100
		support.energy = 100
		support.statuses = [{"type": "bleed", "turns": 2}]
		var expected: int = combat.rounded(support.maxHp * 0.12 * 0.65 * maxf(0, 1 - maxi(0, round_value - 11) * 0.1))
		var result := combat.act(healing, "skill", support.id, false)
		var heal: Dictionary = result.events.filter(func(e): return e.type == "heal" and e.target == support.id)[0]
		check(heal.amount == expected, "Native healing respects bleeding and progressive Fracture, including zero healing")
		check(heal.cleansed == ["bleed"] and not combat.has_status(support, "bleed"), "Native purifying heal records its penalty before removing bleeding")
	var before_ui := checks
	await preload("res://tests/campaign.gd").run(self, MainScene, check)
	await preload("res://tests/presentation.gd").run(self, MainScene, check)
	await _ui()
	if not failures.is_empty():
		quit(1)
		return
	var output := FileAccess.open(args[1], FileAccess.WRITE)
	output.store_string(JSON.stringify({"cases": results, "checks": checks, "uiChecks": checks - before_ui, "exports": exported_files}))
	output.close()
	print("Godot native validation complete: %d checks." % checks)
	quit(0)

func _ui() -> void:
	var app = MainScene.instantiate()
	root.add_child(app)
	await process_frame
	await process_frame
	check(app.hub.visible and not app.combat_view.visible, "Game starts at the main menu")
	await click(app.hub.play_button)
	check(app.combat_view.visible and not app.hub.visible, "Main menu opens free combat through pointer input")
	check(app.fighters.size() == 6, "Six illustrated fighters")
	for fighter in app.fighters.values():
		check(fighter.health.size.y >= 16 and fighter.energy.size.y >= 13, "Health and energy bars do not overlap the stats")
	await _layout(app)
	check(app.fighters["1-oren"].relationship.visible and app.fighters["1-oren"].relationship.text.contains("VULNERÁVEL"), "Weak opponent is explicitly labeled relative to current attacker")
	check(not app.fighters["1-vesper"].relationship.visible, "Sombrio is neutral to the current Igneo attacker after Lumi restores the cycle")
	var affinity_teams: Array = app.teams.duplicate(true)
	app.teams[1] = ["auren","oren","kira"]
	app._new_battle()
	await process_frame
	await process_frame
	check(app.fighters["1-auren"].relationship.visible and app.fighters["1-auren"].relationship.text.contains("RESISTENTE"), "The Lumi opponent is explicitly labeled resistant to Igneo")
	app.teams = affinity_teams
	app._new_battle()
	await process_frame
	await process_frame
	app._select_action("guard")
	check(not app.fighters["1-oren"].relationship.visible, "Support actions do not display misleading enemy weakness labels")
	app._select_action("basic")
	var Art = load("res://scripts/ability_art.gd")
	var icons: Array = []
	for hero in app.catalog.heroes:
		var body: AtlasTexture = app.Fighter.portrait(int(hero.index), true)
		check(body.atlas.resource_path != "res://assets/clean-atlas.png", "Active characters use isolated artwork rather than overlapping legacy atlas rows")
		check(body.filter_clip, "Character regions clip sampling at their own boundary")
		for action_id in ["basic", "skill", "ultimate"]:
			var icon: AtlasTexture = Art.icon(int(hero.index), action_id)
			icons.append("%s:%s" % [icon.atlas.resource_path, icon.region])
	check(icons.size() == 72 and icons.all(func(icon): return icons.count(icon) == 1), "Every hero's three skills use their own illustrated texture region")
	check(app.sound.cues.size() == 10 and app.sound.cues[0].data.size() > 0, "Synthesized audio cues loaded")
	app.roster_button.pressed.emit()
	check(app.hero_grid.get_child_count() == 24, "Roster contains 24 active heroes")
	var original_members: Array = app.roster_work[0].duplicate()
	app.roster_front_picker.select(2)
	app.roster_front_picker.item_selected.emit(2)
	check(app.roster_work[0][0] == original_members[2] and app.roster_work[0].size() == 3, "Front picker reorders the trio without removing a hero")
	app.hero_grid.get_node("veyra").pressed.emit()
	check(app.roster_dialog.get_ok_button().disabled, "Incomplete team cannot be confirmed")
	app.hero_grid.get_node("sylva").pressed.emit()
	check(not app.roster_dialog.get_ok_button().disabled, "Three distinct heroes can be confirmed")
	app.hero_grid.get_node("nima").pressed.emit()
	check(app.roster_work[0].size() == 3, "Fourth hero cannot be added")
	app.roster_side.select(1)
	app.roster_side.item_selected.emit(1)
	app.hero_grid.get_node("kira").pressed.emit()
	app.hero_grid.get_node("saira").pressed.emit()
	check("saira" in app.roster_work[1], "Both teams can be edited")
	for index in range(1, 6):
		app.roster_filter.select(index)
		app.roster_filter.item_selected.emit(index)
		check(app.hero_grid.get_child_count() == 4, "Each class filters to four heroes")
	app.roster_dialog.hide()
	app._save_roster()
	var restored = MainScene.instantiate()
	root.add_child(restored)
	await process_frame
	check(restored.teams == app.teams and "sylva" in restored.teams[0], "Team preferences survive reopening")
	restored.queue_free()
	await process_frame
	app.teams = app.catalog.default_teams.duplicate(true)
	app.mode = "training"
	app.reduced_motion = true
	app._new_battle()
	await click(app.start_button)
	check(app.started, "Viewport pointer input can start the battle")
	app.action_buttons.ultimate.pressed.emit()
	check(app.selected_action == "ultimate" and not app.action_buttons.ultimate.available, "Unavailable ultimate can be inspected")
	check(app.execute_button.disabled and app.description.text.contains("Faltam"), "Insufficient energy is explained and blocks execution")
	app._select_action("basic")
	await click(app.fighters["1-kira"].plate)
	check(app.target_id == "1-kira", "An opponent in the rear can be selected by clicking its floating vital card")
	app.fighters["1-vesper"].pressed.emit()
	app.execute_button.pressed.emit()
	var first_turns: int = app.state.turns
	app._execute()
	check(app.state.turns == first_turns, "Input during animation cannot act twice")
	await wait_idle(app, 2)
	check(app.combat.unit(app.state, "1-vesper").hp < app.combat.unit(app.state, "1-vesper").maxHp, "Player attack damaged selected rival")
	check(app.combat.current(app.state).heroId == "astra", "AI took a valid turn before next ally")
	app._select_action("guard")
	app.action_buttons.guard.grab_focus()
	var confirm := InputEventKey.new()
	confirm.keycode = KEY_ENTER
	confirm.pressed = true
	root.push_input(confirm, true)
	await wait_idle(app, 3)
	check(app.combat.unit(app.state, "0-astra").energy == 65, "Enter confirms the action even while its skill card has focus")
	check(app.roster_button.disabled, "Team edit locked while battle is running")
	app._new_battle()
	app._start()
	app._execute()
	await process_frame
	await process_frame
	app._new_battle()
	await create_timer(0.6).timeout
	check(app.state.turns == 0 and not app.started, "Restart cancels pending AI from old battle")
	app.mode = "local"
	app.difficulty = "hard"
	app._new_battle()
	check(app.combat.unit(app.state, "1-vesper").maxHp == app.catalog.hero_by_id.vesper.hp, "Local mode ignores AI difficulty scaling")
	app._start()
	var turns := 0
	while app.state.phase == "playing" and turns < 400:
		var choice: Dictionary = app.combat.choose_ai(app.state)
		app._select_action(choice.actionId)
		app._select_target(choice.targetId)
		app.execute_button.pressed.emit()
		await process_frame
		await process_frame
		turns += 1
	check(app.state.phase == "finished" and app.result_dialog.visible, "Complete local match displays a result")
	var recorded: int = app.Lab.read_records().size()
	app._refresh()
	app._refresh()
	check(app.Lab.read_records().size() == recorded, "Result refresh cannot record a match twice")
	app.result_dialog.hide()
	app.result_dialog.confirmed.emit()
	check(app.state.turns == 0 and not app.started, "Replay resets actions and battle state")
	check(app.state.units.all(func(u): return u.hp == u.maxHp), "Replay restores all six heroes")
	app.reduced_motion = false
	app._start()
	app._execute()
	await process_frame
	check(app.fighters["0-veyra"].posing, "Normal action starts an anticipation pose")
	check(app.state.turns == 0, "Turn state does not advance before impact and recovery")
	await create_timer(0.22).timeout
	check(app.effects.get_child_count() > 0, "Normal action creates procedural visual effects")
	check(app.fighters["1-vesper"].health.value == app.combat.unit(app.state, "1-vesper").hp, "Health does not change during anticipation")
	var hit_deadline := Time.get_ticks_msec() + 1500
	while app.fighters["1-vesper"].health.value == app.combat.unit(app.state, "1-vesper").hp and Time.get_ticks_msec() < hit_deadline:
		await process_frame
	check(app.fighters["1-vesper"].health.value < app.combat.unit(app.state, "1-vesper").hp and app.state.turns == 0, "Health updates at impact while the same actor is presented until recovery")
	app._set_reduced(true)
	check(app.fighters["1-vesper"].health.value < app.combat.unit(app.state, "1-vesper").hp, "Changing animation preference during impact cannot restore old health")
	app._set_reduced(false)
	await wait_idle(app, 1)
	app._execute()
	await process_frame
	app._new_battle()
	await create_timer(0.8).timeout
	check(not app.busy and app.state.turns == 0 and app.effects.get_child_count() == 0, "Restart during animation cancels stale effects and actions")
	await _new_features(app)
	await _gallery(app)
	await _feedback(app)
	var config := ConfigFile.new()
	config.set_value("teams", "0", ["unknown", "veyra", "veyra"])
	config.set_value("game", "mode", "local")
	config.set_value("game", "difficulty", "hard")
	config.set_value("game", "reduced_motion", "invalid")
	config.save("user://preferences.cfg")
	var malformed = MainScene.instantiate()
	root.add_child(malformed)
	await process_frame
	check(malformed.teams[0] == malformed.catalog.default_teams[0], "Invalid saved team falls back to defaults")
	check(not malformed.reduced_motion, "Malformed preference is ignored")
	check(malformed.combat.unit(malformed.state, "1-vesper").maxHp == malformed.catalog.hero_by_id.vesper.hp, "Saved local mode retains equal attributes")
	malformed.queue_free()
	app.queue_free()
	await process_frame

func _layout(app) -> void:
	var original := root.size
	for dimensions in [Vector2i(960, 540), Vector2i(960, 640), Vector2i(1920,1080), Vector2i(1280, 800), Vector2i(1600, 1000), Vector2i(1874, 1048)]:
		root.size = dimensions
		await process_frame
		await process_frame
		var bounds: Rect2 = app.field.get_global_rect()
		var plates: Array[Rect2] = []
		var bodies: Array[Rect2] = []
		for member in app.state.units:
			var actor = app.fighters[member.id]
			check(not actor.spatial_presentation and actor.visual_root.visible, "The main battle uses the illustrated 2D combatant")
			var body := Rect2(actor.foot_position()-Vector2(actor.artwork.size.x*actor.depth*.5,actor.artwork.size.y*actor.depth),actor.artwork.size*actor.depth)
			check(body.has_area(), "The painted body has visible bounds")
			bodies.append(Rect2(body.position+bounds.position,body.size))
		for body in bodies: check(bounds.encloses(body), "Idle character body stays inside the battlefield")
		for data in app.state.units:
			var fighter = app.fighters[data.id]
			var sample: Dictionary = data.duplicate(true)
			sample.shield = 250
			sample.shieldTurns = 2
			sample.guarding = true
			sample.statuses = ["burn", "bleed", "regen", "weaken", "expose"].map(func(type): return {"type": type, "turns": 2})
			fighter.refresh(sample, false, false, false)
			var rect: Rect2 = fighter.plate.get_global_rect()
			check(bounds.encloses(rect), "Status nameplate stays inside arena at %s" % dimensions)
			for other in plates: check(not rect.intersects(other), "Nameplates never overlap at %s" % dimensions)
			for body in bodies: check(not rect.intersects(body), "Vital cards do not cover resting character bodies at %s" % dimensions)
			plates.append(rect)
			check(fighter.title.text.contains("FRENTE" if data.slot == 0 else "ATRÁS"), "Each character has an explicit formation label at %s" % dimensions)
			check(fighter.shield.value == 250 and fighter.shield.caption.contains("250"), "Shield has its own meter and exact number")
			for line in fighter.status_label.text.split("\n"):
				check(fighter.status_label.get_theme_font("font").get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x <= fighter.status_label.size.x, "All simultaneous status labels fit their allocated row")
		for side in range(2):
			var team: Array = app.state.units.filter(func(u): return u.side == side)
			var front: Vector2 = app.fighters[team[0].id].foot_position()
			var rear_a: Vector2 = app.fighters[team[1].id].foot_position()
			var rear_b: Vector2 = app.fighters[team[2].id].foot_position()
			check(absf((rear_a-front).cross(rear_b-front))>1000,"The illustrated team keeps a clear triangular formation")
			check(absf(front.x-app.field.size.x*.5)<absf(rear_a.x-app.field.size.x*.5) and rear_a.y<front.y and rear_b.y>front.y,"The vanguard stands nearer the enemy and the rear allies remain separated")
		for fighter in app.fighters.values():
			if fighter.relationship.visible: check(bounds.encloses(fighter.relationship.get_global_rect()), "Weakness badge remains inside arena")
		check(root.get_visible_rect().encloses(app.execute_button.get_global_rect()), "Confirmation stays visible at %s" % dimensions)
		check(root.get_visible_rect().encloses(app.start_button.get_global_rect()), "Start button stays visible at %s" % dimensions)
	root.size = original
	await process_frame
	await process_frame
	app._refresh()

func _gallery(app) -> void:
	app._open_showcase()
	await process_frame
	await process_frame
	var gallery = app.showcase
	var preserved: Dictionary = app.state.duplicate(true)
	check(gallery.hero_buttons.size() == 6 and gallery.hero_picker.item_count == 24, "Gallery exposes all twenty-four heroes and six quick class buttons")
	check(gallery.size.y <= root.get_visible_rect().size.y, "Gallery window fits the viewport instead of inflating during text wrapping")
	var content := Rect2(Vector2.ZERO, Vector2(gallery.size))
	for button in gallery.action_buttons: check(content.encloses(button.get_global_rect()), "Gallery action buttons stay visible")
	var profiles: Array = []
	for id in gallery.HEROES:
		gallery._select_hero(id)
		await process_frame
		var baseline: int = gallery.director.impact_count
		await gallery._play("skill")
		check(not gallery.playing and gallery.director.impact_count == baseline + 1, "%s technique lands once and finishes" % id)
		check(gallery.fighters.actor.visual_root.position == Vector2(93, 257), "%s recovers the home pose" % id)
		check(gallery.stage.get_global_rect().encloses(gallery.fighters.actor.plate.get_global_rect()), "%s preview nameplate stays visible inside the stage" % id)
		profiles.append(gallery.director.last_profile)
		await gallery._play("basic")
		check(not gallery.playing, "%s basic attack completes" % id)
		await gallery._play("ultimate")
		check(not gallery.playing, "%s supreme completes" % id)
		check(gallery.omitted_receipts == 0, "%s supreme cannot derive hidden drain or healing from offscreen stand-ins" % id)
	check(profiles.size() == 24 and profiles.all(func(profile): return profiles.count(profile) == 1), "All twenty-four active heroes have distinct choreography profiles")
	check(gallery.director.Ultimate.effect_texture != null, "Supremes load the painted effect atlas, including its shader presentation")
	check(app.state == preserved, "The gallery does not mutate the live battle")
	gallery.scenario.select(1)
	gallery._select_hero("veyra")
	await gallery._play("basic")
	check(gallery.report.text.contains("CRÍTICO") and gallery.report.text.contains("ESCUDO"), "Gallery can demonstrate a calculated critical against shield")
	gallery.scenario.select(2)
	gallery._select_hero("veyra")
	await gallery._play("basic")
	check(gallery.report.text.contains("SANGRAMENTO") and gallery.director.last_numbers.has("QUEIMADURA"), "Gallery demonstrates both periodic damage types independently")
	check(app.state == preserved, "Gallery scenarios cannot change the real battle or its RNG")
	gallery.scenario.select(0)
	gallery.reduced_motion = true
	gallery._select_hero("veyra")
	await gallery._play("skill")
	check(gallery.effects.get_child_count() == 0 and not gallery.fighters.actor.motion_enabled, "Reduced motion is honored inside the gallery")
	gallery.hide()
	await process_frame

func _feedback(app) -> void:
	app.mode = "local"
	app.reduced_motion = false
	app.teams = app.catalog.default_teams.duplicate(true)
	app._new_battle()
	var target: Dictionary = app.combat.unit(app.state, "1-vesper")
	target.shield = 300
	target.shieldTurns = 2
	target.statuses = [{"type": "burn", "turns": 2}, {"type": "bleed", "turns": 2}]
	app.state.random = 1972
	app.state.order = ["0-veyra", "1-vesper", "1-kira", "0-astra", "0-axion", "1-oren"]
	app._start()
	var baseline: int = app.director.impact_count
	app._execute()
	var deadline := Time.get_ticks_msec() + 2500
	while app.director.impact_count == baseline and Time.get_ticks_msec() < deadline: await process_frame
	check(app.director.impact_count == baseline + 1, "Shielded attack applies exactly one logical impact")
	check(app.fighters["1-vesper"].health.value == target.maxHp and app.fighters["1-vesper"].shield.value < 300, "Shield hit updates shield independently while preserving protected HP")
	check(app.feedback.text.contains("CRÍTICO") and app.feedback.text.contains("resta"), "Persistent damage HUD explains critical absorption and remaining shield")
	check(app.director.last_numbers.has("CRÍTICO!") and app.director.last_numbers.has("VIDA PROTEGIDA"), "Fully shielded critical remains explicit in floating damage HUD")
	check(app.busy and app.state.turns == 0 and app.execute_button.disabled, "Turn remains locked until recovery and periodic damage finish")
	await wait_idle(app, 1)
	var resolved: Dictionary = app.combat.unit(app.state, target.id)
	check(resolved.hp == resolved.maxHp - 2 * app.combat.rounded(resolved.maxHp * 0.065), "Both damage-over-time ticks are presented after the direct impact")
	check(app.feedback.text.contains("SANGRAMENTO") and app.director.last_numbers.has("QUEIMADURA"), "Periodic damage has separate named HUD events")
	check(app.fighters[target.id].health.value == resolved.hp and app.fighters[target.id].shield.value == resolved.shield, "Displayed HP and remaining shield match the committed turn")
	check(app.log_view.text.contains("CRÍTICO") and app.log_view.text.contains("SANGRAMENTO") and app.log_view.text.contains("resta"), "Detailed battle log preserves shield, critical and debuff evidence")
	app._new_battle()
	await create_timer(1.2).timeout
	app.teams = [["saira", "maura", "sylva"], ["nima", "riven", "kira"]]
	app._new_battle()
	app.state.round = 16
	app.state.order = ["0-saira", "0-maura", "0-sylva", "1-nima", "1-riven", "1-kira"]
	app.state.cursor = 0
	var support: Dictionary = app.combat.current(app.state)
	support.hp = 100
	support.energy = 100
	support.statuses = [{"type": "bleed", "turns": 2}]
	app._start()
	app._select_action("skill")
	check(app.round_label.text.contains("CURA −50%"), "Fracture banner exposes the current healing reduction")
	check(app.feedback.tooltip_text.contains("CURA −68%"), "Preview details expose combined healing reduction before cleanse")
	app._execute()
	await wait_idle(app, 1)
	check(app.log_view.text.contains("CURA −68%") and app.director.last_numbers.has("CURA −68%"), "Healing receipts and floating numbers explain reduced healing")
	app.teams = app.catalog.default_teams.duplicate(true)
	app._new_battle()

func _new_features(app) -> void:
	app._new_battle()
	var previous_display: String = app.display_mode
	app._toggle_fullscreen()
	check(app.display_mode == "fullscreen" and app.display_resolution == Vector2i(1920,1080), "F11 configuration selects Full HD fullscreen")
	app._toggle_fullscreen()
	check(app.display_mode == "windowed", "Fullscreen can return to the previous window")
	app.display_mode = previous_display
	var before: Dictionary = app.state.duplicate(true)
	app._select_action("skill")
	check(app.feedback.text.contains("PRÉVIA"), "Selecting an available ability shows exact preview")
	check(app.state == before, "HUD preview cannot spend energy or advance RNG")
	for affinity in app.catalog.classes:
		var roles: Array = app.catalog.heroes.filter(func(h): return h.classId == affinity.id).map(func(h): return h.role)
		check(roles.size() == 4 and roles.has("Tanque") and roles.has("Suporte") and roles.has("Dano"), "Every affinity has all three roles")
	check(app.catalog.archived_heroes.is_empty(), "The restored original roster has no archived heroes")
	var teams_before: Array = app.teams.duplicate(true)
	for index in range(3):
		app._begin_lesson(index)
		check(app.tutorial_index == index and app.roster_button.disabled, "Guided battle locks its teaching team")
		check(app.step_label.tooltip_text.contains(app.Lessons.TITLES[index]), "Guided battle displays objectives")
		# Observe actual engine receipts rather than setting completed flags.
		var engine = Combat.new()
		var sample := engine.new_battle(app.teams[0], app.teams[1])
		var progress := {}
		if index == 0:
			for action_id in ["basic", "skill", "guard"]:
				sample.order = ["0-veyra"]
				sample.cursor = 0
				var unit := engine.unit(sample, "0-veyra")
				unit.energy = 100
				unit.cooldowns = {"skill": 0, "ultimate": 0}
				var targets := engine.legal_targets(sample, unit, engine.get_action(unit, action_id))
				app.Lessons.observe(progress, engine.act(sample, action_id, targets[0].id), 0)
		elif index == 1:
			sample.order = ["0-veyra", "1-oren"]
			sample.cursor = 0
			app.Lessons.prepare(sample, index)
			app.Lessons.observe(progress, engine.act(sample, "skill", "1-oren"), 0)
		else:
			sample.order = ["0-riven", "1-vesper"]
			sample.cursor = 0
			app.Lessons.prepare(sample, index)
			app.Lessons.observe(progress, engine.act(sample, "basic", "1-vesper"), 0)
			sample.order = ["0-riven"]
			sample.cursor = 0
			app.Lessons.observe(progress, engine.act(sample, "guard", "0-riven"), 0)
		check(app.Lessons.complete(index, progress), "Real action receipts complete all lesson objectives")
	app._end_lesson()
	check(app.teams == teams_before and app.tutorial_index == -1, "Leaving lessons restores free teams")
	app._show_lab()
	await process_frame
	await process_frame
	check(app.lab.size.y <= root.get_visible_rect().size.y, "Balance window fits the viewport")
	check(Rect2(Vector2.ZERO, Vector2(app.lab.size)).encloses(app.lab.get_ok_button().get_global_rect()), "Balance close button remains visible")
	await app.lab._simulate()
	check(app.lab.rows.size() == 72, "Lab stores exactly seventy-two AI matches in its own dataset")
	check(app.lab.rows.all(func(m): return m.rounds <= 24 and m.actions < 400), "Mixed class teams resolve within the finite Fracture window")
	check(app.lab.table.get_root().get_child_count() == 24, "Lab reports all twenty-four active heroes")
	var compositions := {}
	for match_data in app.lab.rows:
		compositions[str(match_data.units.slice(0, 3).map(func(u): return u.heroId))] = true
	check(compositions.size() >= 20, "AI sample includes varied compositions rather than repeating fixed trios")
	app.lab.source.select(2)
	app.lab.refresh()
	check(app.lab.rows.size() == 210, "Lab separates 102 sustain cases and 108 returning-hero cases from the varied sample")
	var healing_only: Array = app.lab.rows.filter(func(m): return m.mode == "stress-healing-only")
	check(healing_only.size() == 6 and healing_only.all(func(m): return m.rounds <= 21), "Reported healer mirrors cannot outheal Fracture indefinitely")
	check(app.lab.rows.filter(func(m): return m.mode == "stress-healers").size() == 30, "Reported Saira Maura Sylva trio tested against varied trios on both sides")
	await _exports(app)
	check(app.state.turns == 0, "Balance simulations cannot change the real battle")
	app.lab.source.select(0)
	app.lab.refresh()
	check(app.lab.rows.all(func(m): return m.source == "played"), "Played and simulated matches remain separated")
	app.lab.hide()
	var records: Array = app.Lab.read_records()
	var malformed := FileAccess.open(app.Lab.STORE, FileAccess.WRITE)
	malformed.store_string('{"schema":1,"matches":[{"source":"ai","rounds":2,"units":[]}]}')
	malformed.close()
	check(app.Lab.read_records().is_empty(), "Malformed balance record is ignored safely")
	app.Lab.persist(records)

func _exports(app) -> void:
	var batch: Dictionary = app.lab.SimulationLog.read_batch()
	check(batch.matches.size() == 282 and batch.matches.all(func(m): return m.finished and m.steps.size() == m.actions), "Persisted logs contain every action of all 282 simulations")
	check(batch.matches.any(func(m): return m.get("policy") == "support-or-guard" and m.steps.size() > 100), "Long defensive matches retain actions beyond the engine's bounded live log")
	for filter_index in [1, 2]:
		app.lab.source.select(filter_index)
		app.lab.refresh()
		check(not app.lab.export_json.disabled and not app.lab.export_csv.disabled, "Simulation filters offer both log and table export")
		app.lab.export_json.pressed.emit()
		await process_frame
		check(app.lab.export_dialog.file_mode == FileDialog.FILE_MODE_SAVE_FILE, "Export opens a save dialog so the player chooses the destination")
		var destination := "user://export-%d.json" % filter_index
		app.lab.export_dialog.file_selected.emit(ProjectSettings.globalize_path(destination))
		await process_frame
		check(app.lab.export_note.text.contains("Arquivo salvo:"), "Successful export reports where the file was saved")
		var content: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(destination))
		check(content.fullLogMatches == (72 if filter_index == 1 else 210), "JSON export respects the selected simulation sample")
		exported_files.append(ProjectSettings.globalize_path(destination))
		var csv_path := "user://export-%d.csv" % filter_index
		check(app.lab.export_to(csv_path, "csv") == OK, "CSV table exports successfully")
		exported_files.append(ProjectSettings.globalize_path(csv_path))
	check(app.lab.export_to("user://missing-export-folder/log.json", "json") != OK, "An unwritable destination returns an error instead of claiming success")
	app.lab.source.select(0)
	app.lab.refresh()
	check(app.lab.export_json.disabled, "Played summaries are not presented as complete simulation logs")
