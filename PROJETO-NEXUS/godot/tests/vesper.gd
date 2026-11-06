extends SceneTree
const Main = preload("res://scenes/main.tscn")
var checks := 0
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)

func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func seek(art, clip: String, time: float) -> void:
	art.player.play(clip)
	art.player.pause()
	art.player.seek(time, true)
	await settle()

func key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	root.push_input(event, true)
	await process_frame

func _run() -> void:
	root.size = Vector2i(1600,900)
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	var teams: Array = app.teams.duplicate(true)
	var progress: int = app.campaign.cleared
	app._open_vesper()
	await settle()
	var art = app.vesper_atelier
	check(is_instance_valid(art) and art.visible and not app.hub.visible and not app.combat_view.visible, "The menu opens the dedicated Vesper scene")
	check(art.skeleton.get_bone_count() == 32, "The authored Vesper imports with its complete skeleton")
	var meshes: Array = art.champion.find_children("*","MeshInstance3D",true,false)
	check(meshes.any(func(part): return part.skin != null and part.mesh.get_surface_count() >= 8), "Vesper uses a skinned mesh with distinct material surfaces")
	for name in ["Vesper_Idle","Vesper_Arrival","Vesper_ReapingArc","Vesper_Eclipse","Vesper_Ward","Vesper_Hit"]:
		check(art.player.has_animation(name), "%s imports as an animation" % name)
		var animation: Animation = art.player.get_animation(name)
		var moving := 0
		for index in range(animation.get_track_count()):
			if animation.track_get_key_count(index) < 3: continue
			var first: Variant = animation.track_get_key_value(index,0)
			if range(animation.track_get_key_count(index)).any(func(frame): return animation.track_get_key_value(index,frame) != first): moving += 1
		check(moving >= 8, "%s contains real changing keys, not only named static tracks" % name)
	var arm: int = art.skeleton.find_bone("forearm.R")
	var cape: int = art.skeleton.find_bone("cape.2.2")
	await seek(art,"Vesper_ReapingArc",0)
	var rest_arm: Transform3D = art.skeleton.get_bone_global_pose(arm)
	var rest_cape: Transform3D = art.skeleton.get_bone_global_pose(cape)
	var rest_tip: Vector3 = art.tip.global_position
	check(rest_tip.y > 3.1 and rest_tip.y < 3.5, "The trail marker sits on the authored blade tip at rest")
	await seek(art,"Vesper_ReapingArc",1.23)
	check(rest_arm.basis.get_rotation_quaternion().angle_to(art.skeleton.get_bone_global_pose(arm).basis.get_rotation_quaternion()) > .25, "The attack deforms the actual arm skeleton")
	check(rest_tip.distance_to(art.tip.global_position) > 1.0, "The blade marker follows a substantial physical sweep")
	check(rest_cape.origin.distance_to(art.skeleton.get_bone_global_pose(cape).origin) > .03, "The cape has separate secondary skeletal motion")
	await seek(art,"Vesper_Idle",0)
	var cape_start: Quaternion = art.skeleton.get_bone_pose_rotation(cape)
	await seek(art,"Vesper_Idle",4.8)
	check(cape_start.angle_to(art.skeleton.get_bone_pose_rotation(cape)) < .01, "The idle cape loop closes without a pose discontinuity")
	art._finished("Vesper_Arrival")
	art.play_motion("reap")
	await create_timer(1.08).timeout
	var count: int = art.contact_count
	await key(KEY_SPACE)
	var position: float = art.player.current_animation_position
	var trail_count: int = art.trail_points.size()
	await create_timer(.18).timeout
	check(art.paused and is_equal_approx(position,art.player.current_animation_position), "Space pauses the skeletal animation")
	check(art.trail_points.size() <= trail_count, "A paused attack cannot accumulate unbounded trail geometry")
	await key(KEY_SPACE)
	await create_timer(.50).timeout
	check(art.contact_count == count+1 and not art.last_events.is_empty(), "The animated contact resolves exactly once and uses real combat receipts")
	art.play_motion("arrival")
	await create_timer(.6).timeout
	check(art.mode == "arrival" and art.contact_count == count+1, "Restarting the entrance cancels an earlier sequence without stale contacts")
	art._finished("Vesper_Arrival")
	art.play_motion("eclipse")
	art.player.pause()
	art._resolve_contact()
	await settle()
	check(art.last_events.any(func(event): return event.type == "heal" and event.target == "0-vesper" and event.amount > 0) and art.receipts.get_child_count() == 2, "The supreme shows its real self-heal separately from damage to the training target")
	await key(KEY_H)
	check(not art.ui.visible, "Photo mode hides the interface")
	await key(KEY_H)
	check(art.ui.visible, "Photo mode can restore the interface")
	await key(KEY_ESCAPE)
	await settle()
	check(not is_instance_valid(app.vesper_atelier) and app.hub.visible, "Escape returns to the game menu")
	check(app.teams == teams and app.campaign.cleared == progress, "The character study preserves teams and campaign progression")
	app._set_presentation(true)
	app._enter_free()
	await settle()
	var model = app.backdrop.models["1-vesper"]
	check(model.has_method("prepare_action") and model.skeleton.get_bone_count() == 32, "The authored Vesper remains usable in the archived 3D battle study")
	model.prepare_action({"kind": "shield", "id": "skill"})
	check(model.current_kind == "ward", "Vesper's shield technique selects the defensive skeletal animation")
	model.prepare_action({"kind": "aoe", "id": "ultimate"})
	check(model.current_kind == "eclipse", "Vesper's supreme selects Eclipse through the normal battle action contract")
	app.queue_free()
	await settle()
	var standalone = load("res://scenes/vesper/atelier.tscn").instantiate()
	root.add_child(standalone)
	current_scene = standalone
	await settle()
	await key(KEY_ESCAPE)
	await settle()
	check(not is_instance_valid(standalone) and is_instance_valid(current_scene) and current_scene.has_method("_open_vesper"), "The standalone F6 scene can also return to the main menu")
	current_scene.queue_free()
	await settle()
	print("Vesper art and animation: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
