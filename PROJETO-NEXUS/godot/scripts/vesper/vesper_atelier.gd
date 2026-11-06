extends Control
## Dedicated single-character art/animation study. Combat values still come from Combat.
signal return_requested
const MODEL = preload("res://assets/models/vesper/vesper.glb")
const Combat = preload("res://scripts/combat.gd")
const Receipt = preload("res://scripts/damage_receipt.gd")
const BODY_FONT = preload("res://assets/manrope.ttf")
const TITLE_FONT = preload("res://assets/cinzel.ttf")
const VIOLET := Color("ae82f2")
const SILVER := Color("e6dfd8")
const MUTED := Color("92929f")
const CLIPS := {"arrival": "Vesper_Arrival", "reap": "Vesper_ReapingArc", "eclipse": "Vesper_Eclipse", "ward": "Vesper_Ward", "hit": "Vesper_Hit"}
var viewport: SubViewport
var world: Node3D
var champion: Node3D
var camera: Camera3D
var player: AnimationPlayer
var skeleton: Skeleton3D
var tip: Node3D
var crown: Node3D
var anchor: Node3D
var left_palm: Node3D
var conjuration: Node3D
var soul_orb: MeshInstance3D
var ward_rings: Array[Node3D] = []
var ring: MeshInstance3D
var ring_light: OmniLight3D
var world_fx: Node3D
var trail: MeshInstance3D
var trail_mesh := ImmediateMesh.new()
var trail_points: Array[Dictionary] = []
var mode := "idle"
var contacted := false
var contact_count := 0
var elapsed := 0.0
var motion_time := 0.0
var camera_fov := 32.0
var orbit := -0.12
var dragging := false
var paused := false
var reduced := false
var art_hidden := false
var cue: Label
var phase: Label
var progress: ProgressBar
var buttons: Array[Button] = []
var ui: Control
var receipts: Control
var last_events: Array = []
var particles: CPUParticles3D
var impact_pulse := 0.0
var home_camera := Vector3(5.3, 3.5, 10.8)
var focus := Vector3(-1.7, 2.35, 0)

func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build_world()
	_build_ui()
	player.animation_finished.connect(_finished)
	player.get_animation("Vesper_Idle").loop_mode = Animation.LOOP_LINEAR
	play_motion("arrival")
	gui_input.connect(_pointer)

func _material(color: Color, metal := 0.0, rough := 0.5, emission := 0.0) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.metallic = metal
	mat.roughness = rough
	if emission > 0:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = emission
	return mat

func _mesh(parent: Node3D, shape: Mesh, at: Vector3, mat: Material, rotation_value := Vector3.ZERO) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = shape
	item.position = at
	item.rotation = rotation_value
	item.material_override = mat
	parent.add_child(item)
	return item

func _torus(parent: Node3D, at: Vector3, radius: float, thickness: float, mat: Material, rotation_value := Vector3.ZERO) -> MeshInstance3D:
	var shape := TorusMesh.new()
	shape.inner_radius = radius
	shape.outer_radius = radius + thickness
	shape.rings = 128
	shape.ring_segments = 8
	return _mesh(parent, shape, at, mat, rotation_value)

func _build_world() -> void:
	var container := SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	container.stretch = true
	container.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(container)
	viewport = SubViewport.new()
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	container.add_child(viewport)
	world = Node3D.new()
	viewport.add_child(world)
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color.BLACK
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("1f2136")
	sky_mat.sky_horizon_color = Color("43404d")
	sky_mat.ground_horizon_color = Color("43404d")
	sky_mat.ground_bottom_color = Color("08090d")
	sky.sky_material = sky_mat
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("8e9eb9")
	settings.ambient_light_energy = 0.28
	settings.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	# A continuous studio void keeps the floor horizon out of the silhouette.
	settings.fog_enabled = false
	environment.environment = settings
	world.add_child(environment)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-28, -38, 0)
	key.light_color = Color("fff1de")
	key.light_energy = 1.45
	key.shadow_enabled = true
	key.directional_shadow_max_distance = 22
	world.add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-16, 145, 0)
	fill.light_color = Color("798ad6")
	fill.light_energy = 0.85
	world.add_child(fill)
	var rim := OmniLight3D.new()
	rim.position = Vector3(-1.2, 3.3, -1.5)
	rim.light_color = Color("914ef2")
	rim.light_energy = 3.0
	rim.omni_range = 7
	world.add_child(rim)
	var soft := OmniLight3D.new()
	soft.position = Vector3(2.2, 4.7, 3.5)
	soft.light_color = Color("d0e5ff")
	soft.light_energy = 1.4
	soft.omni_range = 8
	world.add_child(soft)
	champion = MODEL.instantiate()
	champion.name = "Vesper"
	champion.position.y = -.035
	champion.rotation.y = orbit
	world.add_child(champion)
	player = champion.find_children("*", "AnimationPlayer", true, false)[0]
	skeleton = champion.find_children("*", "Skeleton3D", true, false)[0]
	tip = champion.find_child("ScytheTip", true, false)
	crown = champion.find_child("ScytheCrown", true, false)
	anchor = champion.find_child("SoulAnchor", true, false)
	left_palm = champion.find_child("LeftPalm", true, false)
	camera = Camera3D.new()
	camera.position = home_camera
	camera.fov = camera_fov
	camera.near = 0.08
	camera.far = 70
	world.add_child(camera)
	camera.look_at(focus)
	camera.current = true
	_build_sanctum()
	world_fx = Node3D.new()
	world.add_child(world_fx)
	trail = MeshInstance3D.new()
	trail.mesh = trail_mesh
	var trail_mat := _material(Color("ad6bff"), 0, 0.3, 1.2)
	trail_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	trail_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	trail_mat.vertex_color_use_as_albedo = true
	trail_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	trail.material_override = trail_mat
	world.add_child(trail)
	_build_conjuration()

func _build_conjuration() -> void:
	conjuration = Node3D.new()
	world.add_child(conjuration)
	conjuration.visible = false
	var orb := SphereMesh.new()
	orb.radius = .23
	orb.height = .46
	orb.radial_segments = 32
	orb.rings = 16
	var void_mat := _material(Color("030208"))
	void_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	soul_orb = _mesh(conjuration, orb, Vector3.ZERO, void_mat)
	var mat := _material(Color("a170ed"), .2, .4, .65)
	for index in range(3):
		ward_rings.append(_torus(conjuration, Vector3.ZERO, .28+index*.05, .008, mat, Vector3(PI/2+index*.6, index*.7, 0)))
	var light := OmniLight3D.new()
	light.light_color = Color("a94bfa")
	light.light_energy = 1.2
	light.omni_range = 2
	conjuration.add_child(light)

func _build_sanctum() -> void:
	var stone := _material(Color("191b24"), 0.34, 0.34)
	var metal := _material(Color("706979"), 0.80, 0.30)
	var dark := _material(Color("0d1019"), 0.40, 0.38)
	var etching := _material(Color("5a417a"), 0.5, 0.35, 0.12)
	var floor_shape := CylinderMesh.new()
	floor_shape.top_radius = 3.1
	floor_shape.bottom_radius = 3.18
	floor_shape.height = 0.15
	floor_shape.radial_segments = 128
	_mesh(world, floor_shape, Vector3(0, -0.09, 0), stone)
	var plane := PlaneMesh.new()
	plane.size = Vector2(100, 100)
	var floor_mat := ShaderMaterial.new()
	var floor_shader := Shader.new()
	floor_shader.code = "shader_type spatial; render_mode unshaded, fog_disabled; varying vec3 pos; void vertex(){pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;} void fragment(){float v=exp(-dot(pos.xz,pos.xz)*0.035);ALBEDO=mix(vec3(0.002,0.0024,0.004),vec3(0.012,0.010,0.018),v);}"
	floor_mat.shader = floor_shader
	_mesh(world, plane, Vector3(0, -0.18, 0), floor_mat)
	for radius in [2.36, 2.48, 2.93, 2.97]: _torus(world, Vector3(0, 0.003, 0), radius, 0.008, metal)
	for index in range(36):
		var angle := float(index) * TAU / 36
		var p := Vector3(cos(angle) * 2.72, 0.005, sin(angle) * 2.72)
		var mark := BoxMesh.new()
		mark.size = Vector3(0.014, 0.007, 0.20 if index % 3 == 0 else 0.07)
		_mesh(world, mark, p, etching, Vector3(0, -angle, 0))
	# The eclipse is a dark physical disc with a fine corona, rather than a busy backdrop.
	var eclipse_at := Vector3(-0.30, 3.15, -3.25)
	ring = _torus(world, eclipse_at, 1.65, 0.018, _material(Color("a89ac7"), 0.65, 0.3, 0.18), Vector3(PI / 2, 0, 0))
	_torus(world, eclipse_at + Vector3(0, 0, -0.01), 1.73, 0.006, etching, Vector3(PI / 2, 0, 0))
	var disc := CylinderMesh.new()
	disc.top_radius = 1.64
	disc.bottom_radius = 1.64
	disc.height = .035
	disc.radial_segments = 128
	var black := _material(Color("07080d"))
	black.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mesh(world, disc, eclipse_at, black, Vector3(PI/2,0,0))
	ring_light = OmniLight3D.new()
	ring_light.position = Vector3(0, 2.4, -1.7)
	ring_light.light_color = Color("9343ef")
	ring_light.light_energy = .5
	ring_light.omni_range = 6
	world.add_child(ring_light)
	# Low drifting motes are sparse enough to keep the silhouette clean.
	particles = CPUParticles3D.new()
	particles.amount = 32
	particles.lifetime = 8
	particles.preprocess = 8
	particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	particles.emission_box_extents = Vector3(3.8, 2.5, 2.0)
	particles.position = Vector3(0, 2.5, -0.8)
	particles.direction = Vector3(0, 1, 0)
	particles.initial_velocity_min = 0.04
	particles.initial_velocity_max = 0.13
	particles.gravity = Vector3(0, 0.015, 0)
	particles.scale_amount_min = .006
	particles.scale_amount_max = .013
	var dust := SphereMesh.new()
	dust.radius = 1
	dust.height = 2
	dust.radial_segments = 8
	dust.rings = 4
	dust.material = _material(Color("a592cc"), 0, .6, .7)
	(dust.material as StandardMaterial3D).shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	(dust.material as StandardMaterial3D).albedo_color = Color("433458")
	particles.mesh = dust
	world.add_child(particles)

func _label(parent: Node, value: String, at: Vector2, point_size: int, color := SILVER, heading := false) -> Label:
	var label := Label.new()
	label.text = value
	label.position = at
	var font := FontVariation.new()
	font.base_font = TITLE_FONT if heading else BODY_FONT
	font.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 500.0}
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", point_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label

func _button(parent: Node, value: String, callback: Callable, minimum := Vector2(200, 52)) -> Button:
	var button := Button.new()
	button.text = value
	button.custom_minimum_size = minimum
	var font := FontVariation.new()
	font.base_font = BODY_FONT
	font.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 550.0}
	button.add_theme_font_override("font", font)
	button.add_theme_font_size_override("font_size", 13)
	button.add_theme_color_override("font_color", SILVER)
	button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	var box := StyleBoxFlat.new()
	box.bg_color = Color("13101be8")
	box.border_color = Color("4d405e")
	box.set_border_width_all(1)
	box.set_corner_radius_all(3)
	var hover: StyleBoxFlat = box.duplicate()
	hover.bg_color = Color("292035")
	hover.border_color = VIOLET
	button.add_theme_stylebox_override("normal", box)
	button.add_theme_stylebox_override("disabled", box)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _build_ui() -> void:
	ui = Control.new()
	ui.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	ui.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(ui)
	_label(ui, "N E X U S", Vector2(54, 38), 19, SILVER, true)
	_label(ui, "ECOS DO CREPÚSCULO", Vector2(54, 67), 10, MUTED)
	var back := _button(ui, "←  VOLTAR", _return_to_menu, Vector2(118, 38))
	back.set_anchors_and_offsets_preset(PRESET_TOP_RIGHT)
	back.offset_left = -172
	back.offset_right = -54
	back.offset_top = 38
	back.offset_bottom = 76
	var identity := Control.new()
	identity.position = Vector2(57, 278)
	identity.mouse_filter = MOUSE_FILTER_IGNORE
	ui.add_child(identity)
	_label(identity, "VIGÍLIA DO ECLIPSE", Vector2(4, 0), 11, VIOLET)
	_label(identity, "VESPER", Vector2(-2, 28), 71, SILVER, true)
	_label(identity, "O ÚLTIMO JURAMENTO", Vector2(4, 126), 12, Color("c5b3d5"))
	var rule := ColorRect.new()
	rule.color = Color("78628e")
	rule.position = Vector2(4, 168)
	rule.size = Vector2(46, 1)
	rule.mouse_filter = MOUSE_FILTER_IGNORE
	identity.add_child(rule)
	var lore := _label(identity, "A lealdade o manteve de pé.\nA sombra aprendeu a obedecer.", Vector2(4, 192), 14, MUTED)
	lore.add_theme_constant_override("line_spacing", 8)
	_label(identity, "SOMBRIO   /   GUARDIÃO", Vector2(4, 260), 10, Color("82728e"))
	var controls := HBoxContainer.new()
	controls.set_anchors_and_offsets_preset(PRESET_BOTTOM_WIDE)
	controls.position = Vector2(58, -102)
	controls.offset_right = -58
	controls.add_theme_constant_override("separation", 10)
	ui.add_child(controls)
	for item in [["1   CEIFA DA PENUMBRA", "reap"], ["2   ECLIPSE ABSOLUTO", "eclipse"], ["3   JURAMENTO", "ward"], ["4   ENTRADA", "arrival"]]:
		var selected_mode: String = item[1]
		buttons.append(_button(controls, item[0], play_motion.bind(selected_mode)))
	cue = _label(ui, "", Vector2(62, 655), 13, SILVER)
	phase = _label(ui, "", Vector2(62, 684), 10, VIOLET)
	progress = ProgressBar.new()
	progress.position = Vector2(62, 711)
	progress.size = Vector2(220, 2)
	progress.show_percentage = false
	progress.add_theme_font_size_override("font_size", 1)
	progress.mouse_filter = MOUSE_FILTER_IGNORE
	var fill := StyleBoxFlat.new()
	fill.bg_color = VIOLET
	progress.add_theme_stylebox_override("fill", fill)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color("27202e")
	progress.add_theme_stylebox_override("background", bg)
	ui.add_child(progress)
	progress.size = Vector2(220, 2)
	var note := _label(ui, "ARRASTE PARA GIRAR   ·   RODA PARA APROXIMAR   ·   ESPAÇO PAUSA   ·   H OCULTA A INTERFACE", Vector2(62, 866), 9, MUTED)
	note.set_anchors_and_offsets_preset(PRESET_BOTTOM_LEFT)
	note.offset_left = 62
	note.offset_top = -30
	note.offset_bottom = -12
	receipts = Control.new()
	receipts.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	receipts.mouse_filter = MOUSE_FILTER_IGNORE
	ui.add_child(receipts)

func play_motion(value: String) -> void:
	if mode != "idle" and value != "arrival": return
	_clear_fx()
	mode = value
	contacted = false
	motion_time = 0
	paused = false
	player.speed_scale = 1
	player.play(CLIPS[value], 0.18)
	for button in buttons: button.disabled = true
	cue.text = {"arrival": "O ÚLTIMO JURAMENTO", "reap": "CEIFA DA PENUMBRA", "eclipse": "ECLIPSE ABSOLUTO", "ward": "JURAMENTO INQUEBRÁVEL", "hit": "REAÇÃO AO IMPACTO"}[value]
	phase.text = "PREPARAÇÃO"
	progress.value = 0

func _finished(_animation: StringName) -> void:
	mode = "idle"
	player.play("Vesper_Idle", 0.32)
	for button in buttons: button.disabled = false
	cue.text = "O silêncio antes da ceifa."
	phase.text = "PRONTO"
	progress.value = 100
	trail_points.clear()
	trail_mesh.clear_surfaces()

func _clear_fx() -> void:
	if is_instance_valid(world_fx):
		for child in world_fx.get_children(): child.queue_free()
	if is_instance_valid(receipts):
		for child in receipts.get_children(): child.queue_free()
	trail_points.clear()
	trail_mesh.clear_surfaces()
	if is_instance_valid(conjuration): conjuration.visible = false

func _resolve_contact() -> void:
	contacted = true
	contact_count += 1
	impact_pulse = 1.0
	# One invisible engine fixture supplies truthful example receipts. This scene
	# is a character/animation study; it does not advance a campaign or PvP match.
	var combat := Combat.new()
	var state := combat.new_battle(["vesper", "maura", "saira"], ["oren", "kira", "astra"])
	state.order.erase("0-vesper")
	state.order.push_front("0-vesper")
	state.cursor = 0
	var actor := combat.current(state)
	actor.energy = 100
	# Leave room for the supreme's real self-heal in this isolated training example.
	if mode == "eclipse": actor.hp = actor.maxHp - 300
	var action: String = "ultimate" if mode == "eclipse" else "skill" if mode == "ward" else "basic"
	var result := combat.act(state, action, "0-vesper" if mode == "ward" else "1-oren", false)
	last_events = result.get("events", []).duplicate(true)
	var target: String = "0-vesper" if mode == "ward" else "1-oren"
	var receipt := Receipt.new()
	var events: Array = last_events.filter(func(event): return event.target == target)
	var capacity := combat.rounded(combat.unit(state, target).maxHp * combat.SHIELD_CAP)
	receipt.configure_events(events, "Vesper" if mode == "ward" else "Alvo de treino · Oren", capacity, -1, cue.text)
	receipt.position = Vector2(size.x - receipt.size.x - 70, size.y - receipt.size.y - 150)
	receipts.add_child(receipt)
	if mode == "eclipse":
		var self_events: Array = last_events.filter(func(event): return event.target == "0-vesper")
		if not self_events.is_empty():
			var restored := Receipt.new()
			restored.configure_events(self_events, "Vesper", combat.rounded(actor.maxHp * combat.SHIELD_CAP), -1, "RETORNO DO ECLIPSE")
			restored.position = Vector2(receipt.position.x, receipt.position.y - restored.size.y - 14)
			receipts.add_child(restored)
	_impact_effect()

func _impact_effect() -> void:
	var root := Node3D.new()
	world_fx.add_child(root)
	root.position = Vector3(0, .06, .65)
	var mat := _material(Color("b386ef"), 0.1, .4, .9)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var wave := _torus(root, Vector3.ZERO, .55, .015, mat)
	var tween := create_tween().set_parallel(true)
	tween.tween_property(wave, "scale", Vector3.ONE * (5 if mode == "eclipse" else 2.5), .8).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	tween.tween_property(mat, "albedo_color:a", 0, .7).set_delay(.1)
	for index in range(18 if mode == "eclipse" else 9):
		var angle := index * 2.399
		var spark := SphereMesh.new()
		spark.radius = .018
		spark.height = .036
		spark.radial_segments = 8
		spark.rings = 4
		var item := _mesh(root, spark, Vector3(0, 1.2, 0), mat)
		var end := Vector3(sin(angle)*1.5, .5+float(index%6)*.42, cos(angle)*1.5)
		tween.tween_property(item, "position", end, .8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

func _update_trail(delta: float) -> void:
	var visible_motion: bool = mode == "reap" and motion_time > .83 and motion_time < 1.72 or mode == "eclipse" and motion_time > 2.25 and motion_time < 3.2
	if visible_motion and not paused and not reduced and is_instance_valid(tip) and is_instance_valid(crown):
		trail_points.append({"a": tip.global_position, "b": crown.global_position, "age": 0.0})
	for point in trail_points: point.age += delta
	trail_points = trail_points.filter(func(point): return point.age < .24)
	trail_mesh.clear_surfaces()
	if trail_points.size() < 2: return
	trail_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(trail_points.size()-1):
		var a: Dictionary = trail_points[index]
		var b: Dictionary = trail_points[index+1]
		for value in [[a.a,a.age],[a.b,a.age],[b.b,b.age],[a.a,a.age],[b.b,b.age],[b.a,b.age]]:
			trail_mesh.surface_set_color(Color(1, 1, 1, maxf(0, (1-float(value[1])/.24)*.35)))
			trail_mesh.surface_add_vertex(value[0])
	trail_mesh.surface_end()

func _process(delta: float) -> void:
	elapsed += delta
	impact_pulse = move_toward(impact_pulse, 0, delta * 1.8)
	if not is_instance_valid(player): return
	if mode != "idle" and not paused:
		motion_time = player.current_animation_position
		var length := player.current_animation_length
		progress.value = motion_time/maxf(length,.01)*100
		var impact_at := 2.78 if mode == "eclipse" else 1.23 if mode == "reap" else .78 if mode == "ward" else 99.0
		if motion_time >= impact_at and not contacted: _resolve_contact()
		phase.text = "PREPARAÇÃO" if motion_time < impact_at-.20 else "CONTATO" if motion_time < impact_at+.30 else "RECUPERAÇÃO"
	_update_trail(0 if paused else delta)
	var desired_camera := home_camera
	var desired_focus := focus
	if mode == "arrival":
		var push := sin(clampf(motion_time/3.8,0,1)*PI)*.3
		desired_camera = home_camera.lerp(Vector3(4.0, 3.3, 9.0), push)
	if mode == "eclipse" and not reduced:
		var close := smoothstep(.15,.85,motion_time)*(1-smoothstep(1.65,2.38,motion_time))
		desired_camera = home_camera.lerp(Vector3(2.0,3.45,5.6),close*.85)
		desired_focus = focus.lerp(Vector3(-.5,2.85,0),close)
		conjuration.visible = motion_time > .55 and motion_time < 2.8
	if mode == "ward": conjuration.visible = motion_time > .45 and motion_time < 2.5
	if conjuration.visible and is_instance_valid(left_palm):
		conjuration.position = left_palm.global_position + Vector3(0,.16,.10)
		var grow := smoothstep(.5,1.3,motion_time)
		conjuration.scale = Vector3.ONE * grow * (1.8 if mode == "eclipse" else 1.4)
		for index in range(ward_rings.size()):
			ward_rings[index].rotation.y = elapsed*(.5+index*.2)
			ward_rings[index].rotation.z = elapsed*(.2+index*.1)
	camera.position = camera.position.lerp(desired_camera, minf(1,delta*5))
	if impact_pulse > .8 and not reduced: camera.position += Vector3(sin(elapsed*67),cos(elapsed*51),0)*.022*impact_pulse
	camera.fov = lerpf(camera.fov, camera_fov, delta*5)
	camera.look_at(desired_focus)
	ring_light.light_energy = .5 + impact_pulse*2.0
	champion.rotation.y = lerp_angle(champion.rotation.y, orbit, delta*9)

func _pointer(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT: dragging = event.pressed
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP: camera_fov = maxf(20, camera_fov-1.5)
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN: camera_fov = minf(44, camera_fov+1.5)
	if event is InputEventMouseMotion and dragging: orbit += event.relative.x*.007

func _return_to_menu() -> void:
	if return_requested.get_connections().is_empty():
		# F6 also works without main.gd owning this scene.
		get_tree().call_deferred("change_scene_to_file", "res://scenes/main.tscn")
	else:
		return_requested.emit()

func _input(event: InputEvent) -> void:
	if not visible or not event is InputEventKey or not event.pressed or event.echo: return
	match event.keycode:
		KEY_ESCAPE: _return_to_menu()
		KEY_1: play_motion("reap")
		KEY_2: play_motion("eclipse")
		KEY_3: play_motion("ward")
		KEY_4: play_motion("arrival")
		KEY_H:
			art_hidden = not art_hidden
			ui.visible = not art_hidden
		KEY_SPACE:
			paused = not paused
			player.speed_scale = 0.0 if paused else 1.0
	get_viewport().set_input_as_handled()
