extends "res://scripts/hero_model_3d.gd"
## The authored Vesper asset adapts to the existing battle presentation contract.
const MODEL = preload("res://assets/models/vesper/vesper.glb")
var avatar: Node3D
var animation_player: AnimationPlayer
var skeleton: Skeleton3D
var current_kind := "reap"
var current_clip := ""

func configure(data: Dictionary, color: Color) -> void:
	hero = data
	tint = color
	heavy = true
	ranged = false
	support = false
	avatar = MODEL.instantiate()
	avatar.rotation.y = PI
	avatar.scale = Vector3.ONE * .76
	avatar.position.y = -.027
	add_child(avatar)
	body = avatar
	animation_player = avatar.find_children("*", "AnimationPlayer", true, false)[0]
	skeleton = avatar.find_children("*", "Skeleton3D", true, false)[0]
	for item in avatar.find_children("*", "MeshInstance3D", true, false): parts.append(item)
	animation_player.get_animation("Vesper_Idle").loop_mode = Animation.LOOP_LINEAR
	active_ring = _torus(self, Vector3(0, .035, 0), .74, .77, _mat(Color("b49acb"), .2, .3))
	target_ring = _torus(self, Vector3(0, .045, 0), .87, .90, _mat(Color("e6a6c4"), .1, .3))
	active_ring.visible = false
	target_ring.visible = false
	shield_aura = _sphere(self, Vector3(0, 1.5, 0), 1, _mat(Color("79b8e2")), Vector3(.80,1.65,.80))
	var mat := shield_aura.material_override as StandardMaterial3D
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color.a = .06
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shield_aura.visible = false
	animation_player.play("Vesper_Idle")

func prepare_action(action: Dictionary) -> void:
	var kind := str(action.get("kind", "damage"))
	var supportive := kind == "guard" or kind.begins_with("shield") or kind.begins_with("support")
	current_kind = "ward" if supportive else "eclipse" if str(action.get("tier", action.get("id", ""))) == "ultimate" else "reap"

func reset_pose() -> void:
	acting = false
	position = home
	rotation = home_rotation
	if not is_instance_valid(animation_player): return
	avatar.rotation.z = -.58 if defeated else 0.0
	avatar.position.y = .20 if defeated else -.027
	current_clip = "Vesper_Hit" if defeated else "Vesper_Idle"
	animation_player.play(current_clip, .12)
	if defeated:
		animation_player.seek(.25, true)
		animation_player.pause()
	elif not motion_enabled:
		animation_player.seek(0, true)
		animation_player.pause()

func pose(phase: String, amount: float) -> void:
	if not is_instance_valid(animation_player): return
	acting = true
	var clip := "Vesper_Hit" if phase == "hit" else "Vesper_Ward" if current_kind == "ward" else "Vesper_Eclipse" if current_kind == "eclipse" else "Vesper_ReapingArc"
	var segments: Dictionary = {"windup": Vector2(0,.97), "advance":Vector2(.97,1.2), "strike":Vector2(1.2,1.60), "cast":Vector2(.7,1.6), "recover":Vector2(1.8,3.6), "hit":Vector2(0,1.2)}
	if current_kind == "eclipse" and phase != "hit":
		segments = {"windup":Vector2(0,2.2), "advance":Vector2(2.2,2.63), "strike":Vector2(2.63,3.0), "cast":Vector2(2.63,3.0), "recover":Vector2(3.0,5.4)}
	elif current_kind == "ward" and phase != "hit":
		segments = {"windup":Vector2(0,.4), "cast":Vector2(.4,1.9), "recover":Vector2(1.9,3.6)}
	var segment: Vector2 = segments.get(phase, Vector2.ZERO)
	if current_clip != clip:
		current_clip = clip
		animation_player.play(clip)
	animation_player.pause()
	animation_player.seek(lerpf(segment.x, segment.y, clampf(amount,0,1)), true)

func _process(_delta: float) -> void:
	if not acting and not defeated and motion_enabled and is_instance_valid(animation_player) and not animation_player.is_playing():
		current_clip = "Vesper_Idle"
		animation_player.play(current_clip, .18)
