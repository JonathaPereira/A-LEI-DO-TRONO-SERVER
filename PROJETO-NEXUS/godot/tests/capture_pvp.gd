extends SceneTree
const Main = preload("res://scenes/main.tscn")
func _initialize() -> void: run.call_deferred()
func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():quit(1);return
	var app=Main.instantiate()
	root.add_child(app)
	await process_frame
	root.size=Vector2i(1600,900)
	await process_frame
	app._open_pvp()
	app.pvp_lobby.profile.team=["vesper","veyra","saira"]
	for slot in range(3):app.pvp_lobby.profile.equip("vesper",slot,"pulse" if slot==2 else "sap")
	app.pvp_lobby.refresh()
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(args[0])
	app.queue_free()
	await process_frame
	quit()
