extends SceneTree
## Real rendered evidence; also usable with Godot --write-movie and --fixed-fps 30.
var art: Control
var clock := 0.0
var step := 0
var output := ""
var captured_contact := false

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Pass the screenshot output directory after --")
		quit(1)
		return
	output = args[0]
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(1600,900)
	art = load("res://scenes/vesper/atelier.tscn").instantiate()
	root.add_child(art)
	art.return_requested.connect(func(): quit())

func shot(name_value: String) -> void:
	await RenderingServer.frame_post_draw
	var path := output.path_join(name_value+".png")
	var status := root.get_texture().get_image().save_png(path)
	if status != OK:
		push_error("Capture failed: "+path)
		quit(1)
	print("Captured "+path)

func _process(delta: float) -> bool:
	if not is_instance_valid(art): return false
	clock += delta
	if step == 0 and clock > 4.25:
		shot("vesper-hero")
		step = 1
	elif step == 1 and clock > 4.9:
		art.play_motion("reap")
		step = 2
	elif step == 2 and art.motion_time > 1.27:
		shot("vesper-ceifa")
		step = 3
	elif step == 3 and art.mode == "idle":
		art.play_motion("eclipse")
		step = 4
	elif step == 4 and art.motion_time > 1.35:
		shot("vesper-eclipse-charge")
		step = 5
	elif step == 5 and art.motion_time > 2.90:
		shot("vesper-eclipse-impact")
		step = 6
	elif step == 6 and art.mode == "idle":
		art.play_motion("ward")
		step = 7
	elif step == 7 and art.motion_time > 1.30:
		shot("vesper-juramento")
		step = 8
	elif step == 8 and art.mode == "idle":
		art.queue_free()
		quit.call_deferred()
	if clock > 25:
		push_error("Capture sequence did not finish")
		quit(1)
	return false
