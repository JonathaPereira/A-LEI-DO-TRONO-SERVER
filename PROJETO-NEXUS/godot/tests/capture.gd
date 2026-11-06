extends SceneTree
## Optional rendered review; requires a real display and never changes saved teams.
const MainScene = preload("res://scenes/main.tscn")
var output := ""

func _initialize() -> void:
	_capture.call_deferred()

func shot(filename: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	if root.get_texture().get_image().save_png(output.path_join(filename + ".png")) != OK:
		push_error("Screenshot failed: " + filename)
		quit(1)

func wait_hit(director, baseline: int) -> void:
	# Software-rendered Full HD can advance slowly on shared CI CPUs.
	# Animation duration and callback counts are checked separately without rendering.
	var deadline := Time.get_ticks_msec() + 20000
	while director.impact_count <= baseline and Time.get_ticks_msec() < deadline: await process_frame
	if director.impact_count <= baseline:
		push_error("Rendered attack did not reach impact")
		quit(1)
	await create_timer(0.01).timeout

func wait_done(node) -> void:
	var deadline := Time.get_ticks_msec() + 45000
	while (node.playing if node is AcceptDialog else node.busy) and Time.get_ticks_msec() < deadline: await process_frame
	if node.playing if node is AcceptDialog else node.busy:
		push_error("Rendered action did not recover")
		quit(1)

func _capture() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 1 or args.size() > 2:
		push_error("Pass an output directory after --")
		quit(1)
		return
	output = args[0]
	var review_only: bool = args.size() == 2 and args[1] == "--review"
	var app = MainScene.instantiate()
	root.add_child(app)
	await process_frame
	app._enter_free()
	app.teams = app.catalog.default_teams.duplicate(true)
	app.mode = "training"
	app.difficulty = "normal"
	app.reduced_motion = false
	app._new_battle()
	app.display_mode = "windowed"
	app.display_resolution = Vector2i(1280,720)
	app.windowed_resolution = Vector2i(1280,720)
	app._apply_display()
	await process_frame
	var before_display: Dictionary = app.state.duplicate(true)
	var fullscreen_key := InputEventKey.new()
	fullscreen_key.keycode = KEY_F11
	fullscreen_key.pressed = true
	app._input(fullscreen_key)
	await process_frame
	await process_frame
	if root.size != Vector2i(1920,1080) or app.state != before_display:
		push_error("Fullscreen did not render Full HD or changed the battle")
		quit(1)
		return
	if args.size() == 2 and args[1] == "--campaign":
		await campaign_review(app)
		app.queue_free()
		await process_frame
		await process_frame
		quit()
		return
	await shot("godot-battle")
	app.roster_button.pressed.emit()
	await shot("godot-roster")
	app.roster_dialog.hide()
	if args.size() == 2 and args[1] == "--ultimates":
		await art_audit(app)
		await ultimate_review(app)
		app.queue_free()
		await process_frame
		await process_frame
		quit()
		return
	app.mode = "local"
	app.mode_picker.select(1)
	for case in ["shield-critical", "shield-break", "area"]:
		app._new_battle()
		app.state.random = 1972
		if case == "area":
			app.combat.current(app.state).energy = 100
			for data in app.state.units:
				if data.side == 1:
					data.shield = 120
					data.shieldTurns = 2
		else:
			var victim: Dictionary = app.combat.unit(app.state, "1-oren")
			victim.shield = app.combat.rounded(victim.maxHp * 0.25) if case == "shield-critical" else 120
			victim.shieldTurns = 2
			if case == "shield-break": victim.statuses = [{"type": "burn", "turns": 2}]
		app._start()
		app._select_target("1-oren")
		app._select_action("basic" if case == "shield-critical" else "skill" if case == "shield-break" else "ultimate")
		var baseline: int = app.director.impact_count
		app._execute()
		await wait_hit(app.director, baseline)
		if case == "area": await create_timer(0.25).timeout
		await shot("godot-" + case)
		await wait_done(app)
	app.teams = [["saira", "maura", "sylva"], ["nima", "riven", "kira"]]
	app._new_battle()
	app.state.round = 16
	app.state.order = ["0-saira", "0-maura", "0-sylva", "1-nima", "1-riven", "1-kira"]
	app.state.cursor = 0
	for unit in app.state.units:
		if unit.side == 0:
			unit.hp = 200
			unit.energy = 100
			unit.statuses = [{"type": "bleed", "turns": 2}]
	app._start()
	app._select_action("skill")
	await shot("godot-healing-preview")
	var heal_baseline: int = app.director.impact_count
	app._execute()
	await wait_hit(app.director, heal_baseline)
	await shot("godot-healing")
	await wait_done(app)
	app.teams = app.catalog.default_teams.duplicate(true)
	app._new_battle()
	await create_timer(1.2).timeout
	app._open_showcase()
	await process_frame
	await process_frame
	var gallery = app.showcase
	gallery.scenario.select(1)
	if not review_only:
		for id in gallery.HEROES:
			gallery._select_hero(id)
			await process_frame
			var baseline: int = gallery.director.impact_count
			var start_msec := Time.get_ticks_msec()
			gallery._play("skill")
			await wait_hit(gallery.director, baseline)
			await shot("godot-demo-" + id)
			await wait_done(gallery)
			print("Rendered %s in %.2fs" % [id, (Time.get_ticks_msec() - start_msec) / 1000.0])
	gallery.scenario.select(2)
	gallery._select_hero("veyra")
	gallery._play("basic")
	var deadline := Time.get_ticks_msec() + 7000
	while not gallery.report.text.contains("SANGRAMENTO") and Time.get_ticks_msec() < deadline: await process_frame
	await shot("godot-debuffs")
	await wait_done(gallery)
	gallery.hide()
	app._new_battle()
	await create_timer(1.4).timeout
	app._show_lab()
	await app.lab._simulate()
	await process_frame
	await shot("godot-balance")
	app.lab.source.select(2)
	app.lab.refresh()
	await shot("godot-balance-stress")
	app.lab.hide()
	app._begin_lesson(1)
	await process_frame
	await shot("godot-lesson")
	app._end_lesson()
	var escape_key := InputEventKey.new()
	escape_key.keycode = KEY_ESCAPE
	escape_key.pressed = true
	app._input(escape_key)
	await process_frame
	if app.display_mode != "windowed":
		push_error("Escape failed to leave fullscreen")
		quit(1)
	root.size = Vector2i(960, 540)
	await process_frame
	await shot("godot-small-window")
	app.queue_free()
	await process_frame
	await process_frame
	quit()

func art_audit(app) -> void:
	app.visible = false
	var sheet := Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(sheet)
	var cell := root.get_visible_rect().size / Vector2(5, 3)
	for index in range(app.catalog.heroes.size()):
		var offset := Vector2(index % 5, index / 5) * cell
		var background := ColorRect.new()
		background.color = Color("263d43") if index % 2 else Color("3e4148")
		background.position = offset + Vector2(2, 2)
		background.size = cell - Vector2(4, 4)
		sheet.add_child(background)
		var hero: Dictionary = app.catalog.heroes[index]
		var fighter = app.Fighter.new()
		fighter.setup(hero, "audit-" + hero.id, app.catalog.affinity_color(hero.classId))
		fighter.disabled = true
		fighter.motion_enabled = false
		fighter.position = offset + Vector2(cell.x * 0.5 - 93, cell.y - 112 - 257)
		fighter.set_depth(minf(1, (cell.y - 124) / 200))
		fighter.plate.position = Vector2(-5, 265)
		sheet.add_child(fighter)
		fighter.refresh({"hp": hero.hp, "maxHp": hero.hp, "energy": 100, "shield": 0, "shieldTurns": 0, "statuses": [], "guarding": false}, false, false, false)
	await shot("godot-art-audit")
	sheet.queue_free()
	app.visible = true
	await process_frame

func ultimate_review(app) -> void:
	app._open_showcase()
	await process_frame
	await process_frame
	var gallery = app.showcase
	gallery.scenario.select(0)
	for id in gallery.HEROES:
		gallery._select_hero(id)
		await process_frame
		var baseline: int = gallery.director.impact_count
		gallery._play("ultimate")
		await wait_hit(gallery.director, baseline)
		await create_timer(0.28).timeout
		await shot("godot-ultimate-" + id)
		await wait_done(gallery)
		print("Rendered ultimate: " + id)
	gallery.hide()

func campaign_review(app) -> void:
	var path := "user://campaign-capture.json"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	app.campaign = app.Campaign.new(app.catalog, path)
	app._leave_battle("menu")
	await shot("godot-menu")
	app.hub.story_button.pressed.emit()
	await shot("godot-story")
	app.hub.open("heroes")
	app.hub.selected_hero = "veyra"
	app.hub._choose_hero("veyra")
	app.hub.hero_details.current_tab = 0
	await shot("godot-heroes")
	app.hub.hero_details.current_tab = 1
	await shot("godot-hero-lore")
	app.hub.hero_details.current_tab = 2
	for slot in range(3):
		app.hub.slot_buttons[slot].pressed.emit()
		app.hub.gem_buttons.ember.pressed.emit()
		app.campaign.equip("axion", "sap", slot)
		app.campaign.equip("astra", "pulse", slot)
	await shot("godot-hero-gems")
	app.hub.open("gems")
	await shot("godot-gems")
	app.hub.open("story")
	app.hub.mission_buttons[0].pressed.emit()
	await shot("godot-minions")
	app.reduced_motion = false
	app._start()
	app._select_target("1-minion-acolyte")
	var baseline: int = app.director.impact_count
	app._execute()
	await wait_hit(app.director, baseline)
	await shot("godot-minion-hit")
	await wait_done(app)
	app._leave_battle("story")
	app.campaign.completed = app.campaign._legacy_completed(2)
	app._begin_mission(2)
	app.combat.current(app.state).energy = 100
	app._start()
	app._select_action("ultimate")
	app._select_target("1-boss-vesper")
	baseline = app.director.impact_count
	app._execute()
	await wait_hit(app.director, baseline)
	await create_timer(0.16).timeout
	await shot("godot-boss")
	await wait_done(app)
	app._leave_battle("story")
	app.display_mode = "windowed"
	app.display_resolution = Vector2i(960,540)
	app._apply_display()
	await process_frame
	await create_timer(0.3).timeout
	await shot("godot-story-small")
	app.hub.open("gems")
	await shot("godot-gems-small")
	app.hub.open("menu")
	await shot("godot-menu-small")
	app.hub.open("heroes")
	app.hub.hero_details.current_tab = 0
	await shot("godot-heroes-small")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
