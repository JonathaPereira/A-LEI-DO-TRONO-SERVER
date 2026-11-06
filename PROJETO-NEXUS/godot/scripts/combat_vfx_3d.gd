extends RefCounted
## Affinity-specific impact geometry. No damage or status rules live here.

static func _material(color: Color, opacity := 0.8) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(color, opacity)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.no_depth_test = false
	return material

static func _tween(stage: Node) -> Tween:
	var tween := stage.create_tween()
	stage.tweens.append(tween)
	return tween

static func _vanish(stage: Node, root: Node3D, material: StandardMaterial3D) -> void:
	var tween := _tween(stage)
	tween.tween_property(material, "albedo_color:a", 0.0, 0.44).set_delay(0.04)
	tween.parallel().tween_property(root, "rotation:y", root.rotation.y + 0.35, 0.48)

static func _shard(stage: Node, parent: Node3D, at: Vector3, height: float, material: Material, rotation_value := Vector3.ZERO) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.bottom_radius = height * 0.15
	mesh.top_radius = 0.0
	mesh.height = height
	mesh.radial_segments = 5
	return stage._mesh(parent, mesh, at, material, rotation_value)

static func _ring(stage: Node, parent: Node3D, at: Vector3, radius: float, material: Material, rotation_value := Vector3.ZERO) -> MeshInstance3D:
	var mesh := TorusMesh.new()
	mesh.inner_radius = radius
	mesh.outer_radius = radius + 0.035
	mesh.rings = 32
	mesh.ring_segments = 5
	return stage._mesh(parent, mesh, at, material, rotation_value)

static func emit(stage: Node, at: Vector3, tint: Color, affinity: String, ultimate: bool, supportive: bool) -> void:
	var root: Node3D = stage._effect_root()
	root.name = "AffinityImpact_" + affinity
	root.position = at
	var material := _material(tint.lightened(0.12))
	var pale := _material(tint.lightened(0.65), 0.8)
	var count := 10 if ultimate else 6
	var radius := 1.35 if ultimate else 0.8
	match affinity:
		"igneo":
			# Tapered rising tongues, each with a hot inner core, follow the contact.
			for index in range(count):
				var angle := float(index) * TAU / count
				var height := 0.8 + float(index % 3) * 0.3
				var point := Vector3(cos(angle) * radius, height * 0.5, sin(angle) * radius)
				var flame := _shard(stage, root, point, height, material, Vector3(sin(angle) * 0.3, angle, cos(angle) * 0.3))
				flame.scale = Vector3(0.1, 0.1, 0.1)
				_shard(stage, flame, Vector3(0, -0.12, 0), height * 0.65, pale)
				var tween := _tween(stage).set_parallel(true)
				tween.tween_property(flame, "scale", Vector3.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
				tween.tween_property(flame, "position:y", point.y + 0.4, 0.4)
		"natural":
			# Roots surge from the shared floor; restorative casts flower upward.
			for index in range(count):
				var angle := float(index) * TAU / count
				var point := Vector3(cos(angle) * radius, -0.1, sin(angle) * radius)
				var root_shard := _shard(stage, root, point, 1.25, material, Vector3(-cos(angle) * 0.5, angle, sin(angle) * 0.5))
				root_shard.scale.y = 0.05
				var tween := _tween(stage).set_parallel(true)
				tween.tween_property(root_shard, "scale:y", 0.6 if supportive else 1.0, 0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
				tween.tween_property(root_shard, "position:y", 0.45, 0.2)
				var leaf: MeshInstance3D = stage._box(root, point + Vector3(0, 1.0, 0), Vector3(0.19, 0.025, 0.32), pale, Vector3(0.4, angle, 0.5))
				var rise := _tween(stage)
				rise.tween_property(leaf, "position", point + Vector3(-sin(angle) * 0.3, 2.2, cos(angle) * 0.3), 0.45)
		"tecnico":
			# Two staggered hexagonal scan cages read distinctly from magic rings.
			for layer in range(2):
				for index in range(6):
					var angle := float(index) * TAU / 6
					var point := Vector3(cos(angle) * radius, 0.55 + float(layer) * 1.1, sin(angle) * radius)
					var segment: MeshInstance3D = stage._box(root, point, Vector3(0.65, 0.04, 0.04), pale, Vector3(0, -angle + PI * 0.5, 0))
					var tween := _tween(stage)
					tween.tween_property(segment, "position:y", point.y + 0.5, 0.42)
			for index in range(4):
				var angle := float(index) * TAU / 4
				stage._box(root, Vector3(cos(angle) * radius, 1.25, sin(angle) * radius), Vector3(0.035, 1.5, 0.035), material)
		"arcano":
			# Crossing orbital planes and star points expand away from the target.
			for index in range(3):
				var orbit := _ring(stage, root, Vector3(0, 1.4, 0), radius, material, Vector3(float(index) * PI / 3, 0.5, float(index) * 0.6))
				orbit.scale = Vector3.ONE * 0.45
				_tween(stage).tween_property(orbit, "scale", Vector3.ONE * 1.4, 0.40).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			for index in range(count):
				var angle := float(index) * TAU / count
				_shard(stage, root, Vector3(cos(angle) * radius, 1.4 + sin(angle) * radius, 0), 0.25, pale, Vector3(0, angle, angle))
		"sombrio":
			# Curved spirals close around the contact with dark violet fragments.
			for index in range(count):
				var angle := float(index) * TAU / count
				var point := Vector3(cos(angle) * radius, 0.4 + float(index % 3) * 0.55, sin(angle) * radius)
				var wisp := _shard(stage, root, point, 0.65, material, Vector3(0.5, -angle, -0.8))
				var tween := _tween(stage)
				tween.tween_property(wisp, "position", Vector3(cos(angle + 1.1) * radius * 0.6, point.y + 0.9, sin(angle + 1.1) * radius * 0.6), 0.42)
			_ring(stage, root, Vector3(0, 1.25, 0), radius * 0.75, pale, Vector3(PI * 0.5, 0, -0.35))
	_vanish(stage, root, material)
	var fade := _tween(stage)
	fade.tween_property(pale, "albedo_color:a", 0.0, 0.4).set_delay(0.05)
