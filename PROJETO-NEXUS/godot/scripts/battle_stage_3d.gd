extends Control
## Self-contained 3D presentation. Combat, targeting, and all UI stay in main.gd.
## Projected coordinates returned by this class are local to this Control.
const HeroModel = preload("res://scripts/hero_model_3d.gd")
const VesperChampion = preload("res://scripts/vesper/vesper_champion.gd")
const CombatVFX = preload("res://scripts/combat_vfx_3d.gd")

var viewport: SubViewport
var camera: Camera3D
var world: Node3D
var scenery: Node3D
var models: Dictionary = {}
var catalog
var units: Array = []
var encounter_kind := 0
var last_phase := "idle"
var last_timing: Dictionary = {}
var generation := 0
var effects: Array[Node3D] = []
var tweens: Array[Tween] = []
var camera_home := Vector3(1.5, 7.4, 16.2)
var camera_focus := Vector3(0, 2.1, 0)
var eclipse_ring: Node3D
var particles: Array[Node3D] = []
var clock := 0.0
var motion_enabled := true:
	set(value):
		motion_enabled = value
		for model in models.values():
			model.motion_enabled = value
			model.set_process(value)

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if not is_instance_valid(world): _build_world()
	resized.connect(_resize)
	_resize()

func _material(color: Color, metallic: float = 0.0, emission: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = 0.72
	if emission > 0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission
	return material

func _mesh(parent: Node3D, mesh: Mesh, at: Vector3, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.material_override = material
	item.position = at
	item.rotation = rotation_value
	parent.add_child(item)
	return item

func _box(parent: Node3D, at: Vector3, dimensions: Vector3, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = dimensions
	return _mesh(parent, mesh, at, material, rotation_value)

func _cylinder(parent: Node3D, at: Vector3, bottom: float, top: float, height: float, material: Material, vertices: int = 64) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.bottom_radius = bottom
	mesh.top_radius = top
	mesh.height = height
	mesh.radial_segments = vertices
	return _mesh(parent, mesh, at, material)

func _ring(parent: Node3D, at: Vector3, inner: float, outer: float, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mesh := TorusMesh.new()
	mesh.inner_radius = inner
	mesh.outer_radius = outer
	mesh.rings = 64
	mesh.ring_segments = 6
	return _mesh(parent, mesh, at, material, rotation_value)

func _build_world() -> void:
	var container := SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(container)
	viewport = SubViewport.new()
	viewport.name = "Sanctum3D"
	viewport.own_world_3d = true
	viewport.handle_input_locally = false
	viewport.msaa_3d = Viewport.MSAA_2X
	viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	container.add_child(viewport)
	world = Node3D.new()
	viewport.add_child(world)
	scenery = Node3D.new()
	world.add_child(scenery)
	var environment := WorldEnvironment.new()
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("071323")
	sky_material.sky_horizon_color = Color("233444")
	sky_material.ground_bottom_color = Color("06101e")
	sky_material.ground_horizon_color = Color("233444")
	sky_material.sun_angle_max = 2.0
	sky.sky_material = sky_material
	var settings := Environment.new()
	settings.background_mode = Environment.BG_SKY
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("98b8d8")
	settings.ambient_light_energy = 0.42
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	settings.fog_enabled = true
	settings.fog_light_color = Color("132333")
	settings.fog_light_energy = 0.52
	settings.fog_density = 0.009
	environment.environment = settings
	world.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("ffdbab")
	sun.light_energy = 1.25
	sun.rotation_degrees = Vector3(-43, -32, -15)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 45.0
	world.add_child(sun)
	var rim := DirectionalLight3D.new()
	rim.light_color = Color("62c7ed")
	rim.light_energy = 0.65
	rim.rotation_degrees = Vector3(-28, 145, 0)
	world.add_child(rim)
	var core_light := OmniLight3D.new()
	core_light.position = Vector3(0, 3, -4)
	core_light.light_color = Color("62dfe6")
	core_light.light_energy = 1.3
	core_light.omni_range = 14
	world.add_child(core_light)
	camera = Camera3D.new()
	camera.position = camera_home
	camera.fov = 31.0
	camera.near = 0.1
	camera.far = 100.0
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	world.add_child(camera)
	camera.look_at_from_position(camera_home, camera_focus)
	camera.current = true
	_build_arena()

func _build_arena() -> void:
	var stone := _material(Color("24313f"), 0.28)
	var slab := _material(Color("3b4652"), 0.34)
	var dark := _material(Color("101e2c"), 0.15)
	var edge := _material(Color("64594a"), 0.62)
	var gold := _material(Color("c6a36a"), 0.72)
	var cyan := _material(Color("5ed9e4"), 0.25, 0.7)
	var subtle := _material(Color("275d6e"), 0.2, 0.35)
	var amber := _material(Color("f0c785"), 0.30, 1.5)
	# Three levels of a polygonal platform sit above the dark chasm.
	_cylinder(scenery, Vector3(0, -0.80, 0), 10.8, 10.8, 0.6, dark, 12)
	_cylinder(scenery, Vector3(0, -0.43, 0), 10.3, 10.3, 0.2, edge, 12)
	_cylinder(scenery, Vector3(0, -0.18, 0), 9.9, 9.9, 0.32, stone, 12)
	_ring(scenery, Vector3(0, 0.005, 0), 8.7, 8.75, gold)
	_ring(scenery, Vector3(0, 0.01, 0), 8.47, 8.5, subtle)
	_ring(scenery, Vector3(0, 0.015, 0), 2.25, 2.29, gold)
	_ring(scenery, Vector3(0, 0.018, 0), 1.85, 1.89, cyan)
	_cylinder(scenery, Vector3(0, 0.0, 0), 1.82, 1.82, 0.04, dark, 12)
	for n in range(12):
		var angle := float(n) * TAU / 12.0
		var direction := Vector3(sin(angle), 0, cos(angle))
		# Radial inlaid seams, with restrained cyan channels at the cardinal axes.
		_box(scenery, direction * 5.4 + Vector3(0, 0.022, 0), Vector3(0.025, 0.012, 6.1), gold if n % 3 else cyan, Vector3(0, angle, 0))
		_box(scenery, direction * 9.35 + Vector3(0, 0.035, 0), Vector3(0.72, 0.035, 0.09), cyan, Vector3(0, angle, 0))
		for offset in [-0.10, 0.10]:
			_box(scenery, direction * 2.03 + Vector3(0, 0.03, 0), Vector3(0.075, 0.03, 0.32), gold, Vector3(0, angle + offset, 0))
	# Individual broad panels read as stone rather than a single featureless disk.
	for row in range(-4, 5):
		for column in range(-5, 6):
			var point := Vector3(float(column) * 1.65 + (0.82 if row % 2 else 0), -0.006, float(row) * 1.65)
			if Vector2(point.x, point.z).length() > 8.35 or Vector2(point.x, point.z).length() < 2.5: continue
			_box(scenery, point, Vector3(1.59, 0.018, 1.59), slab if (row + column) % 4 == 0 else stone)
	# Six engraved formation seals form two genuine triangles on the platform.
	for side in range(2):
		for slot in range(3):
			var point := _formation(side, slot)
			_ring(scenery, point + Vector3(0, 0.024, 0), 0.67, 0.69, subtle)
			for n in range(3):
				var angle := float(n) * TAU / 3.0
				_box(scenery, point + Vector3(sin(angle) * 0.74, 0.03, cos(angle) * 0.74), Vector3(0.09, 0.025, 0.18), gold, Vector3(0, angle, 0))
	# A grand split gateway and staggered buttresses create an actual distant skyline.
	for side in [-1.0, 1.0]:
		for n in range(4):
			var x: float = side * (7.5 + float(n) * 3.3)
			var z := -8.0 - float(n % 2) * 4.0
			var height := 5.0 + float((n * 3) % 4) * 1.0
			_pillar(Vector3(x, -0.8, z), height, stone, dark, gold, cyan)
		_box(scenery, Vector3(side * 3.0, 3.8, -11), Vector3(1.1, 9.0, 1.35), dark, Vector3(0, 0, side * -0.11))
		_box(scenery, Vector3(side * 2.47, 3.6, -10.25), Vector3(0.06, 7.7, 0.07), cyan, Vector3(0, 0, side * -0.11))
		_box(scenery, Vector3(side * 3.35, 5.2, -10.5), Vector3(0.18, 5.7, 0.12), gold, Vector3(0, 0, side * -0.11))
		_box(scenery, Vector3(side * 6.7, 0.60, -7.5), Vector3(4.5, 1.3, 1.0), dark)
		for n in range(5):
			_box(scenery, Vector3(side * (4.8 + float(n) * 0.75), 1.35, -7.5), Vector3(0.2, 0.14, 0.6), gold)
	# The broken luminous eclipse is physical geometry behind the gate.
	eclipse_ring = Node3D.new()
	eclipse_ring.position = Vector3(0, 3.9, -15)
	scenery.add_child(eclipse_ring)
	_ring(eclipse_ring, Vector3.ZERO, 2.23, 2.29, amber, Vector3(PI / 2, 0, 0))
	_ring(eclipse_ring, Vector3(0, 0, 0.02), 2.40, 2.42, gold, Vector3(PI / 2, 0, 0))
	var disc := _cylinder(eclipse_ring, Vector3(0, 0, 0.08), 2.15, 2.15, 0.04, _material(Color("070c16")))
	disc.rotation.x = PI / 2
	for n in range(16):
		var angle := float(n) * TAU / 16.0
		_box(eclipse_ring, Vector3(sin(angle) * 2.6, cos(angle) * 2.6, 0), Vector3(0.11, 0.42 if n % 4 == 0 else 0.16, 0.12), gold, Vector3(0, 0, -angle))
	# Scattered levitating shards are deterministic and inexpensive.
	for n in range(22):
		var shard := _box(scenery, Vector3(sin(float(n) * 2.399) * (8.5 + float(n % 3)), 1.2 + float(n % 7), -8.0 - float(n % 6)), Vector3(0.05, 0.12, 0.05), cyan, Vector3(0.2 * n, 0.3 * n, 0.1 * n))
		particles.append(shard)

func _pillar(at: Vector3, height: float, stone: Material, dark: Material, gold: Material, cyan: Material) -> void:
	_box(scenery, at + Vector3(0, 0.15, 0), Vector3(1.7, 0.45, 1.7), stone)
	_box(scenery, at + Vector3(0, height * 0.5, 0), Vector3(1.1, height, 1.15), dark)
	_box(scenery, at + Vector3(0, height * 0.5, 0.59), Vector3(0.055, height * 0.88, 0.06), cyan)
	for direction in [-1.0, 1.0]:
		_box(scenery, at + Vector3(direction * 0.48, height * 0.5, 0.60), Vector3(0.10, height, 0.08), gold)
	_box(scenery, at + Vector3(0, height + 0.08, 0), Vector3(1.48, 0.25, 1.48), stone)
	_cylinder(scenery, at + Vector3(0, height + 0.55, 0), 0.28, 0, 0.9, gold, 4)

func _formation(side: int, slot: int) -> Vector3:
	var sign_value := -1.0 if side == 0 else 1.0
	return Vector3(sign_value * (2.65 if slot == 0 else 5.0), 0.055, [-0.0, -2.15, 2.3][clampi(slot, 0, 2)])

func _resize() -> void:
	# SubViewportContainer.stretch owns render dimensions and follows this Control.
	pass

func configure(data: Array, hero_catalog) -> void:
	if not is_instance_valid(world): _build_world()
	cancel()
	catalog = hero_catalog
	units = data
	for model in models.values():
		world.remove_child(model)
		model.queue_free()
	models.clear()
	for unit in data:
		var hero: Dictionary = catalog.hero_by_id[unit.heroId]
		var model = VesperChampion.new() if str(hero.get("visualHero", hero.id)) == "vesper" else HeroModel.new()
		model.configure(hero, catalog.affinity_color(hero.classId))
		model.name = str(unit.id).validate_node_name()
		model.position = _formation(int(unit.side), int(unit.slot))
		world.add_child(model)
		model.rotation.y = -PI / 2.0 - 0.30 if int(unit.side) == 0 else PI / 2.0 + 0.30
		model.remember_home()
		model.reset_pose()
		model.set_state(unit)
		model.motion_enabled = motion_enabled
		model.set_process(motion_enabled)
		models[unit.id] = model
	_resize()

func sync_units(data: Array) -> void:
	units = data
	for unit in data:
		if models.has(unit.id): models[unit.id].set_state(unit)

func screen_position(unit_id: String) -> Vector2:
	if not models.has(unit_id) or not is_instance_valid(camera): return size * 0.5
	var model: Node3D = models[unit_id]
	return camera.unproject_position(model.global_position + Vector3(0, 1.68, 0))

func ground_position(unit_id: String) -> Vector2:
	if not models.has(unit_id) or not is_instance_valid(camera): return size * 0.5
	return camera.unproject_position(models[unit_id].global_position)

func head_position(unit_id: String) -> Vector2:
	if not models.has(unit_id) or not is_instance_valid(camera): return size * 0.5
	return camera.unproject_position(models[unit_id].global_position + Vector3(0, 3.2, 0))

func projected_body_rect(unit_id: String) -> Rect2:
	if not models.has(unit_id) or not is_instance_valid(camera): return Rect2()
	var model: Node3D = models[unit_id]
	var bounds := Rect2()
	var found := false
	for part in model.parts:
		if not part.visible or part == model.shield_aura or part == model.active_ring or part == model.target_ring: continue
		var box: AABB = part.get_aabb()
		for index in range(8):
			var point := camera.unproject_position(part.global_transform * box.get_endpoint(index))
			if not found:
				bounds = Rect2(point, Vector2.ZERO)
				found = true
			else: bounds = bounds.expand(point)
	return bounds

func select_unit(active_id: String, target_id: String) -> void:
	for id in models: models[id].set_selection(id == active_id, id == target_id)

func cancel() -> void:
	generation += 1
	for tween in tweens:
		if is_instance_valid(tween): tween.kill()
	tweens.clear()
	for effect in effects:
		if is_instance_valid(effect): effect.queue_free()
	effects.clear()
	for model in models.values(): model.reset_pose()
	if is_instance_valid(camera):
		camera.position = camera_home
		camera.look_at_from_position(camera_home, camera_focus)
	last_phase = "idle"

func _pose(model: Node3D, phase: String, duration: float) -> void:
	var tween := create_tween()
	tween.tween_method(func(amount: float):
		if is_instance_valid(model): model.pose(phase, amount), 0.0, 1.0, maxf(0.01, duration))
	tweens.append(tween)

func _pause(duration: float) -> void:
	await get_tree().create_timer(maxf(0.01, duration)).timeout

func _effect_root() -> Node3D:
	var root := Node3D.new()
	world.add_child(root)
	effects.append(root)
	return root

func _charge(model: Node3D, color: Color, ultimate: bool) -> Node3D:
	var root := _effect_root()
	root.position = model.position
	var material := _material(color, 0.1, 1.9)
	_ring(root, Vector3(0, 0.06, 0), 0.87, 0.91, material)
	if ultimate:
		_ring(root, Vector3(0, 0.08, 0), 1.16, 1.2, material)
		for n in range(8):
			var angle := float(n) * TAU / 8
			_box(root, Vector3(sin(angle) * 1.1, 0.6, cos(angle) * 1.1), Vector3(0.045, 0.7, 0.045), material)
	return root

func _projectile(origin: Vector3, destination: Vector3, color: Color, duration: float, ultimate: bool) -> void:
	var root := _effect_root()
	root.position = origin
	var sphere := SphereMesh.new()
	sphere.radius = 0.15 if not ultimate else 0.30
	sphere.height = sphere.radius * 2
	sphere.radial_segments = 12
	sphere.rings = 6
	_mesh(root, sphere, Vector3.ZERO, _material(color, 0.1, 2.4))
	_ring(root, Vector3.ZERO, 0.21, 0.24, _material(Color("fff0c3"), 0.1, 1.8), Vector3(PI / 2, 0, 0))
	var direction := destination - origin
	var trail := _box(root, Vector3.ZERO, Vector3(0.06, 0.06, 1.2), _material(color, 0.1, 1.2))
	if direction.length() > 0.01: root.look_at(destination)
	trail.position.z = 0.52
	var tween := create_tween()
	tween.tween_property(root, "position", destination, duration)
	tweens.append(tween)

func _slash(model: Node3D, color: Color, ultimate: bool) -> void:
	var root := _effect_root()
	root.position = model.position + Vector3(0, 1.5, 0)
	root.rotation = model.rotation
	root.rotation.z += -0.5
	# A proper partial curved blade of energy, rather than an opaque full hoop.
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var radius := 1.45 if not ultimate else 2.1
	for n in range(18):
		var a := -1.1 + float(n) * 2.2 / 18
		var b := -1.1 + float(n + 1) * 2.2 / 18
		var p1 := Vector3(sin(a) * radius, sin(a) * radius * 0.34, -cos(a) * radius)
		var p2 := Vector3(sin(b) * radius, sin(b) * radius * 0.34, -cos(b) * radius)
		for point in [p1 * 0.84, p1, p2, p1 * 0.84, p2, p2 * 0.84]: mesh.surface_add_vertex(point)
	mesh.surface_end()
	var material := _material(color.lightened(0.25), 0.1, 2.1)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mesh(root, mesh, Vector3.ZERO, material)
	var tween := create_tween()
	tween.tween_property(root, "rotation:y", root.rotation.y + 1.4, 0.18)
	tween.parallel().tween_property(root, "scale", Vector3.ONE * 0.1, 0.24).set_delay(0.08)
	tweens.append(tween)

func _impact(model: Node3D, color: Color, supportive: bool, ultimate: bool) -> void:
	var root := _effect_root()
	root.position = model.position
	var material := _material(color.lightened(0.26), 0.1, 2.3)
	var ring := _ring(root, Vector3(0, 0.10, 0), 0.35, 0.42, material)
	var tween := create_tween()
	tween.tween_property(ring, "scale", Vector3.ONE * (3.8 if ultimate else 2.7), 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(ring, "position:y", 0.65 if supportive else 0.08, 0.35)
	for n in range(9 if not ultimate else 16):
		var angle := float(n) * 2.399
		var shard := _box(root, Vector3(0, 1.4, 0), Vector3(0.055, 0.25, 0.055), material, Vector3(angle, angle, angle))
		var endpoint := Vector3(sin(angle) * (1.2 if not ultimate else 2.1), 1.3 + cos(float(n) * 1.73) * 0.9, cos(angle) * 0.9)
		if supportive: endpoint.y += 0.8
		var spark_tween := create_tween()
		spark_tween.tween_property(shard, "position", endpoint, 0.30).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		spark_tween.parallel().tween_property(shard, "scale", Vector3.ONE * 0.01, 0.40)
		tweens.append(spark_tween)
	tweens.append(tween)
	if not supportive: _pose(model, "hit", 0.28)

func play_attack(actor_id: String, target_ids: Array, action: Dictionary, reduced: bool = false, on_impact: Callable = Callable()) -> bool:
	cancel()
	if not models.has(actor_id): return false
	var token := generation
	var actor: Node3D = models[actor_id]
	if actor.has_method("prepare_action"): actor.prepare_action(action)
	var targets: Array[Node3D] = []
	for id in target_ids:
		if models.has(str(id)): targets.append(models[str(id)])
	if targets.is_empty(): targets.append(actor)
	var kind := str(action.get("kind", "damage"))
	var supportive := kind.begins_with("heal") or kind.begins_with("shield") or kind.begins_with("support") or kind == "guard"
	var ultimate := str(action.get("tier", action.get("id", ""))) == "ultimate"
	var color: Color = actor.tint
	if kind.begins_with("heal"): color = Color("75edb3")
	if kind.begins_with("shield") or kind == "guard": color = Color("70d9ff")
	last_timing = {"windup": 0.52 if ultimate else 0.30, "movement": 0.32 if ultimate else 0.25, "contact": 0.18, "recovery": 0.42 if ultimate else 0.32, "impact_count": 0, "reduced": reduced}
	if reduced:
		last_phase = "contact"
		if on_impact.is_valid(): on_impact.call()
		last_timing.impact_count = 1
		await get_tree().process_frame
		if token != generation: return false
		last_phase = "idle"
		return true
	last_phase = "windup"
	_pose(actor, "windup", float(last_timing.windup))
	var charge := _charge(actor, color, ultimate)
	if ultimate:
		var cinematic := create_tween()
		cinematic.tween_property(camera, "position", camera_home.lerp(actor.position + Vector3(0, 5.4, 8.6), 0.27), 0.40).set_trans(Tween.TRANS_SINE)
		tweens.append(cinematic)
	await _pause(float(last_timing.windup))
	if token != generation: return false
	charge.visible = false
	last_phase = "movement"
	var movement := float(last_timing.movement)
	if supportive:
		_pose(actor, "cast", movement)
	elif bool(actor.ranged):
		_pose(actor, "cast", movement)
		for target in targets: _projectile(actor.position + Vector3(0, 1.9, 0), target.position + Vector3(0, 1.5, 0), color, movement, ultimate)
	else:
		var target: Node3D = targets[0]
		var direction := (target.position - actor.position).normalized()
		var contact_position := target.position - direction * (1.25 if not ultimate else 1.50)
		_pose(actor, "advance", movement)
		var advance := create_tween()
		advance.tween_property(actor, "position", contact_position, movement).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
		tweens.append(advance)
	await _pause(movement)
	if token != generation: return false
	last_phase = "strike"
	_pose(actor, "cast" if supportive or bool(actor.ranged) else "strike", 0.15)
	if not supportive and not bool(actor.ranged): _slash(actor, color, ultimate)
	# Damage/state updates happen exactly once at visible contact.
	await _pause(0.09)
	if token != generation: return false
	last_phase = "contact"
	if on_impact.is_valid(): on_impact.call()
	last_timing.impact_count = 1
	for target in targets:
		_impact(target, color, supportive, ultimate)
		CombatVFX.emit(self, target.position, color, str(actor.hero.get("classId", "")), ultimate, supportive)
	if ultimate:
		var reset_camera := create_tween()
		reset_camera.tween_property(camera, "position", camera_home, 0.38).set_trans(Tween.TRANS_SINE)
		tweens.append(reset_camera)
	await _pause(0.19)
	if token != generation: return false
	last_phase = "recovery"
	_pose(actor, "recover", float(last_timing.recovery))
	var retreat := create_tween()
	retreat.tween_property(actor, "position", actor.home, float(last_timing.recovery)).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tweens.append(retreat)
	await _pause(float(last_timing.recovery))
	if token != generation: return false
	for model in models.values(): model.reset_pose()
	for effect in effects:
		if is_instance_valid(effect): effect.queue_free()
	effects.clear()
	tweens.clear()
	camera.position = camera_home
	camera.look_at(camera_focus)
	last_phase = "idle"
	return true

func _process(delta: float) -> void:
	if not motion_enabled: return
	clock += delta
	for index in range(particles.size()):
		var shard: Node3D = particles[index]
		shard.position.y += sin(clock * 0.9 + float(index)) * delta * 0.10
		shard.rotation.y += delta * 0.12
	if is_instance_valid(camera) and last_phase != "idle": camera.look_at(camera_focus)
