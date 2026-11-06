extends SceneTree
## Rendered evidence from actual Godot controls and the deterministic combat engine.
const Main = preload("res://scenes/main.tscn")
var app
var output := ""
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame
func shot(filename: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	var status := root.get_texture().get_image().save_png(output.path_join(filename+".png"))
	assert(status == OK)
	print("Captured "+filename)
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		quit(1)
		return
	output = args[0]
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(1600, 900)
	app = Main.instantiate()
	root.add_child(app)
	await settle()
	root.size = Vector2i(1600, 900)
	await settle()
	app.campaign = app.Campaign.new(app.catalog, "user://capture-classes.json")
	app.campaign.equipped = {"vesper": ["sap", "pulse", ""], "veyra": ["ember", "", ""], "bast": ["sap", "", ""]}
	app.hub.selected_hero = "vesper"
	app.hub.selected_slot = 2
	app.hub.open("gems")
	await shot("rpg-inventory")
	app.hub.selected_hero = "noct"
	app.hub.open("heroes")
	await shot("returned-roster")
	root.size = Vector2i(960, 540)
	app.hub.open("gems")
	await shot("rpg-small")
	if args.size() > 1 and args[1] == "ui-only":
		app.queue_free()
		await settle()
		quit()
		return
	root.size = Vector2i(1600, 900)
	app._enter_free()
	app.mode = "local"
	app.mode_picker.select(1)
	app.teams = [["bast", "maura", "ivo"], ["torv", "brin", "noct"]]
	app._new_battle()
	app.state.order.erase("0-ivo")
	app.state.order.push_front("0-ivo")
	app.state.cursor = 0
	app.combat.unit(app.state, "1-noct").statuses = [{"type": "darkmark", "turns": 2, "owner": "0-maura"}]
	app.combat.unit(app.state, "0-maura").hp = 700
	app._start()
	await shot("mixed-classes")
	var before: int = app.director.impact_count
	app._play_turn("skill", "1-noct")
	while app.director.impact_count == before: await process_frame
	await create_timer(.1).timeout
	await shot("affliction-spread")
	while app.busy: await process_frame
	app._leave_battle()
	app.queue_free()
	await settle()
	quit()
