extends SceneTree
## Rendered evidence of the playable 3D scene. Test progress is disposable via XDG dirs.
const Main = preload("res://scenes/main.tscn")
var output := ""
var failed := false

func _initialize() -> void:
	_run.call_deferred()

func shot(filename: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	var path := output.path_join(filename + ".png")
	if root.get_texture().get_image().save_png(path) != OK:
		failed = true
		push_error("Could not capture " + path)
	print("Captured: " + path)

func wait_contact(app, baseline: int) -> void:
	var deadline := Time.get_ticks_msec() + 30000
	while app.director.impact_count == baseline and Time.get_ticks_msec() < deadline:
		await process_frame
	if app.director.impact_count != baseline + 1:
		failed = true
		push_error("Attack did not reach contact")
	# Let the receipt settle in without changing animation or combat speed.
	await create_timer(0.14).timeout

func wait_idle(app) -> void:
	var deadline := Time.get_ticks_msec() + 30000
	while app.busy and Time.get_ticks_msec() < deadline: await process_frame
	if app.busy:
		failed = true
		push_error("Attack did not recover")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		push_error("Pass an output directory after --")
		quit(1)
		return
	output = args[0]
	DirAccess.make_dir_recursive_absolute(output)
	var app = Main.instantiate()
	root.add_child(app)
	await process_frame
	app._set_presentation(true)
	app._enter_free()
	app.mode = "local"
	app.reduced_motion = false
	app.display_mode = "windowed"
	app.display_resolution = Vector2i(1600, 900)
	app.windowed_resolution = app.display_resolution
	app._apply_display()
	app.teams = app.catalog.default_teams.duplicate(true)
	app._new_battle()
	await process_frame
	await process_frame
	await shot("battle-3d")
	app.state.random = 1972
	var victim: Dictionary = app.combat.unit(app.state, "1-vesper")
	victim.shield = 80
	victim.shieldTurns = 2
	app._start()
	app._select_target(victim.id)
	var baseline: int = app.director.impact_count
	app._execute()
	await wait_contact(app, baseline)
	await shot("attack-3d")
	await wait_idle(app)
	app._new_battle()
	app.combat.current(app.state).energy = 100
	app._start()
	app._select_action("ultimate")
	baseline = app.director.impact_count
	app._execute()
	await wait_contact(app, baseline)
	await shot("ultimate-3d")
	await wait_idle(app)
	app.teams = [["nima", "astra", "axion"], ["vesper", "oren", "kira"]]
	app._new_battle()
	app.state.order = ["0-nima", "0-astra", "0-axion", "1-vesper", "1-oren", "1-kira"]
	app.state.cursor = 0
	app._start()
	app._select_target("1-vesper")
	baseline = app.director.impact_count
	app._execute()
	await wait_contact(app, baseline)
	await shot("debuff-3d")
	await wait_idle(app)
	app.teams = [["saira", "maura", "sylva"], ["nima", "riven", "kira"]]
	app._new_battle()
	app.state.order = ["0-saira", "0-maura", "0-sylva", "1-nima", "1-riven", "1-kira"]
	app.state.cursor = 0
	for data in app.state.units:
		if data.side == 0:
			data.hp = 400
			data.energy = 100
			data.statuses = [{"type": "bleed", "turns": 2}]
	app._start()
	app._select_action("skill")
	baseline = app.director.impact_count
	app._execute()
	await wait_contact(app, baseline)
	await shot("support-3d")
	await wait_idle(app)
	app.teams = [["oren", "astra", "axion"], ["nima", "riven", "kira"]]
	app._new_battle()
	app.state.order = ["0-oren", "0-astra", "0-axion", "1-nima", "1-riven", "1-kira"]
	app.state.cursor = 0
	app.combat.current(app.state).energy = 100
	app._start()
	app._select_action("ultimate")
	baseline = app.director.impact_count
	app._execute()
	await wait_contact(app, baseline)
	await shot("buff-3d")
	await wait_idle(app)
	app._leave_battle("menu")
	app.queue_free()
	await process_frame
	await process_frame
	quit(1 if failed else 0)
