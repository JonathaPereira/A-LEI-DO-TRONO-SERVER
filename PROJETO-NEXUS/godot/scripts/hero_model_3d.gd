extends Node3D
## Original, articulated low-poly champions. All parts are real 3D meshes.
## Replacing this presentation with imported rigs will not affect combat rules.

var hero: Dictionary = {}
var tint := Color("54e5e5")
var body: Node3D
var head: Node3D
var right_arm: Node3D
var left_arm: Node3D
var right_leg: Node3D
var left_leg: Node3D
var weapon: Node3D
var mantle: Node3D
var core: MeshInstance3D
var shield_aura: MeshInstance3D
var active_ring: MeshInstance3D
var target_ring: MeshInstance3D
var home := Vector3.ZERO
var home_rotation := Vector3.ZERO
var elapsed := 0.0
var acting := false
var motion_enabled := true:
	set(value):
		motion_enabled = value
		if not value and not acting and is_instance_valid(body): reset_pose()
var defeated := false
var heavy := false
var ranged := false
var support := false
var armor: StandardMaterial3D
var dark: StandardMaterial3D
var gold: StandardMaterial3D
var glow: StandardMaterial3D
var cloth: StandardMaterial3D
var parts: Array[MeshInstance3D] = []

func configure(data: Dictionary, color: Color) -> void:
	hero = data
	tint = color
	heavy = str(data.get("role", "")) in ["Tanque", "Chefe"]
	support = str(data.get("role", "")) == "Suporte"
	ranged = str(data.get("weapon", "")) in ["staff", "bow", "rifle", "cannon", "drone", "orb", "cards", "grimoire"] or support or str(data.get("classId", "")) == "arcano"
	_build()

func _mat(color: Color, metallic: float = 0.0, emission: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = 0.62
	if emission > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission
	return material

func _mesh(parent: Node3D, geometry: Mesh, at: Vector3, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = geometry
	item.material_override = material
	item.position = at
	item.rotation = rotation_value
	parent.add_child(item)
	parts.append(item)
	return item

func _box(parent: Node3D, at: Vector3, dimensions: Vector3, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var geometry := BoxMesh.new()
	geometry.size = dimensions
	return _mesh(parent, geometry, at, material, rotation_value)

func _cylinder(parent: Node3D, at: Vector3, bottom: float, top: float, height: float, material: Material, vertices: int = 8, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var geometry := CylinderMesh.new()
	geometry.bottom_radius = bottom
	geometry.top_radius = top
	geometry.height = height
	geometry.radial_segments = vertices
	return _mesh(parent, geometry, at, material, rotation_value)

func _sphere(parent: Node3D, at: Vector3, radius: float, material: Material, dimensions: Vector3 = Vector3.ONE) -> MeshInstance3D:
	var geometry := SphereMesh.new()
	geometry.radius = radius
	geometry.height = radius * 2.0
	geometry.radial_segments = 12
	geometry.rings = 6
	var item := _mesh(parent, geometry, at, material)
	item.scale = dimensions
	return item

func _joint(parent: Node3D, at: Vector3) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = at
	parent.add_child(pivot)
	return pivot

func _torus(parent: Node3D, at: Vector3, inner: float, outer: float, material: Material, rotation_value: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var geometry := TorusMesh.new()
	geometry.inner_radius = inner
	geometry.outer_radius = outer
	geometry.rings = 32
	geometry.ring_segments = 6
	return _mesh(parent, geometry, at, material, rotation_value)

func _build() -> void:
	var affinity := str(hero.get("classId", "tecnico"))
	var identity := str(hero.get("id", ""))
	var warm := affinity in ["igneo", "natural"]
	armor = _mat(Color("3d4558") if not warm else Color("514738"), 0.72)
	dark = _mat(Color("101c2c"), 0.42)
	gold = _mat(Color("c9a467"), 0.78)
	glow = _mat(tint, 0.2, 0.9)
	cloth = _mat(tint.darkened(0.69), 0.04)
	# Material families give each faction a different physical language.
	match affinity:
		"igneo":
			armor.albedo_color = Color("543740")
			cloth.albedo_color = Color("702d31")
		"natural":
			armor.albedo_color = Color("4e5135")
			armor.metallic = 0.08
			dark.albedo_color = Color("302e22")
			gold.albedo_color = Color("a8aa64")
			gold.metallic = 0.18
			cloth.albedo_color = Color("294e3e")
		"tecnico":
			armor.albedo_color = Color("344b5e")
			gold.albedo_color = Color("9cadb9")
			cloth.albedo_color = Color("183843")
		"arcano":
			armor.albedo_color = Color("4b4264")
			gold.albedo_color = Color("c1b0d4")
			cloth.albedo_color = Color("46345f")
		"sombrio":
			armor.albedo_color = Color("363046")
			gold.albedo_color = Color("9f8fae")
			cloth.albedo_color = Color("4b2b65")
	cloth.cull_mode = BaseMaterial3D.CULL_DISABLED
	var width := 1.2 if heavy else 0.9
	body = _joint(self, Vector3(0, 1.45, 0))
	# A narrow waist, layered cuirass and broad shoulder plates give an adult silhouette.
	_cylinder(body, Vector3(0, 0.24, 0), 0.30 * width, 0.45 * width, 0.79, armor, 6)
	_box(body, Vector3(0, 0.23, -0.24), Vector3(0.65 * width, 0.53, 0.16), dark, Vector3(-0.11, 0, 0))
	_box(body, Vector3(0, 0.45, -0.31), Vector3(0.56 * width, 0.10, 0.09), gold)
	core = _sphere(body, Vector3(0, 0.31, -0.34), 0.105, glow, Vector3(0.8, 1.15, 0.45))
	_cylinder(body, Vector3(0, -0.23, 0), 0.31 * width, 0.28 * width, 0.15, gold)
	_box(body, Vector3(0, -0.27, -0.33), Vector3(0.16, 0.18, 0.09), glow)
	if identity in ["astra", "maura", "saira", "sylva"]:
		# Floor-length layered robes change the mage silhouette entirely.
		_cylinder(body, Vector3(0, -0.77, 0.05), 0.57, 0.27, 1.48, cloth, 10)
		_cylinder(body, Vector3(0, -1.41, 0.05), 0.58, 0.56, 0.10, gold, 10)
		for direction in [-1.0, 1.0]:
			_box(body, Vector3(direction * 0.17, -0.81, -0.33), Vector3(0.065, 1.17, 0.045), gold, Vector3(-0.18, 0, direction * 0.14))
	# Split faulds hang from the belt; there are no billboard body parts.
	for direction in [-1.0, 1.0]:
		_box(body, Vector3(direction * 0.23 * width, -0.47, -0.12), Vector3(0.34 * width, 0.41, 0.22), armor, Vector3(-0.13, 0, direction * -0.16))
		_box(body, Vector3(direction * 0.23 * width, -0.39, -0.25), Vector3(0.26 * width, 0.045, 0.04), gold)
	# Cloaks are triangular cloth surfaces with visible folds and gold hems.
	mantle = _joint(body, Vector3(0, 0.53, 0.22))
	_build_cloak(width, identity in ["astra", "maura", "saira", "vesper"])
	head = _joint(body, Vector3(0, 0.94, -0.015))
	if not heavy and identity not in ["vektor", "riven"]:
		var skin := _mat(Color("bc967d") if identity not in ["kira", "maura", "nima"] else Color("866052"))
		var hair_color := Color("e2deef") if identity in ["astra", "saira", "kira"] else Color("a34632") if affinity == "igneo" else Color("162935")
		var hair := _mat(hair_color, 0.06)
		_cylinder(head, Vector3(0, -0.02, 0), 0.18, 0.22, 0.41, skin, 8)
		_sphere(head, Vector3(0, 0.16, 0.035), 0.255, hair, Vector3(1.0, 0.65, 1.0))
		_box(head, Vector3(0.075, 0.12, -0.19), Vector3(0.26, 0.12, 0.12), hair, Vector3(0, 0, -0.25))
		_box(head, Vector3(0, -0.01, -0.205), Vector3(0.27, 0.028, 0.018), dark)
		_box(head, Vector3(0, -0.08, -0.22), Vector3(0.045, 0.075, 0.04), skin)
		for direction in [-1.0, 1.0]:
			_cylinder(head, Vector3(direction * 0.205, -0.15, 0.08), 0.075, 0.10, 0.49, hair, 5, Vector3(-0.12, 0, direction * -0.10))
		if identity in ["veyra", "nima", "kira"]:
			_cylinder(head, Vector3(0, -0.18, 0.30), 0.04, 0.13, 0.69, hair, 6, Vector3(-0.45, 0, 0))
	else:
		_cylinder(head, Vector3.ZERO, 0.21, 0.25, 0.47, dark, 8)
		_cylinder(head, Vector3(0, 0.13, 0), 0.26, 0.20, 0.16, armor, 8)
		_box(head, Vector3(0, 0.02, -0.227), Vector3(0.33, 0.052, 0.045), glow)
		_box(head, Vector3(0, -0.12, -0.21), Vector3(0.09, 0.17, 0.075), gold)
		for direction in [-1.0, 1.0]:
			_box(head, Vector3(direction * 0.22, -0.08, 0), Vector3(0.075, 0.30, 0.31), armor, Vector3(0.0, 0.0, direction * -0.11))
	if heavy or affinity == "sombrio":
		for direction in [-1.0, 1.0]:
			_cylinder(head, Vector3(direction * 0.25, 0.31, 0.02), 0.09, 0.0, 0.49 if identity == "vesper" else 0.31, gold, 4, Vector3(0, 0, direction * -0.30))
	elif affinity in ["arcano", "natural"]:
		for n in range(5):
			var angle := float(n - 2) * 0.4
			_box(head, Vector3(sin(angle) * 0.29, 0.29 + cos(angle) * 0.09, 0.04), Vector3(0.045, 0.25 + 0.15 * cos(angle), 0.055), gold, Vector3(0, 0, -angle))
	else:
		_cylinder(head, Vector3(0, 0.33, 0.04), 0.13, 0.01, 0.35, cloth, 5)
	right_arm = _arm(1.0, width)
	left_arm = _arm(-1.0, width)
	right_leg = _leg(1.0, width)
	left_leg = _leg(-1.0, width)
	weapon = _joint(right_arm, Vector3(0, -0.83, -0.04))
	_build_weapon(identity, affinity)
	if identity == "axion":
		# Twin exposed stabilizers and a reinforced helmet mark the technical tank.
		for direction in [-1.0, 1.0]:
			_cylinder(body, Vector3(direction * 0.28, 0.21, 0.40), 0.17, 0.17, 0.58, dark, 8)
			_cylinder(body, Vector3(direction * 0.28, 0.48, 0.40), 0.14, 0.14, 0.06, glow, 8)
			_box(body, Vector3(direction * 0.43, 0.38, 0.32), Vector3(0.13, 0.72, 0.26), armor)
	if identity == "astra":
		for direction in [-1.0, 1.0]:
			_cylinder(body, Vector3(direction * 0.72, 0.92, 0.02), 0.09, 0, 0.34, glow, 4)
			_cylinder(body, Vector3(direction * 0.72, 0.67, 0.02), 0, 0.09, 0.16, glow, 4)
	if identity == "oren":
		# His armor is bark grown around a broad body, with antler-like living branches.
		for direction in [-1.0, 1.0]:
			var branch := _joint(body, Vector3(direction * 0.63, 0.62, 0.10))
			_cylinder(branch, Vector3(direction * 0.16, 0.25, 0), 0.11, 0.035, 0.8, dark, 5, Vector3(0.1, 0, direction * -0.65))
			_cylinder(branch, Vector3(direction * 0.35, 0.50, 0), 0.055, 0, 0.52, gold, 4, Vector3(0, 0, direction * -0.9))
			for n in range(3):
				_sphere(branch, Vector3(direction * (0.23 + float(n) * 0.13), 0.42 + float(n) * 0.12, 0), 0.15, cloth, Vector3(1.3, 0.34, 0.75))
		for n in range(4):
			_box(body, Vector3(float(n - 2) * 0.19, 0.14, -0.35), Vector3(0.075, 0.67, 0.06), gold, Vector3(0.1, 0, float(n - 2) * 0.08))
	if heavy:
		# Massive asymmetric kite shield, slightly turned toward the opponent.
		var shield := _joint(left_arm, Vector3(-0.14, -0.55, -0.17))
		_cylinder(shield, Vector3.ZERO, 0.52, 0.36, 0.19, gold, 6, Vector3(PI / 2, 0, 0))
		_cylinder(shield, Vector3(0, 0, -0.12), 0.44, 0.31, 0.07, dark, 6, Vector3(PI / 2, 0, 0))
		_box(shield, Vector3(0, 0, -0.17), Vector3(0.065, 0.61, 0.04), glow)
		_box(shield, Vector3(0, 0, -0.17), Vector3(0.49, 0.065, 0.04), glow)
	elif identity in ["veyra", "riven"]:
		_build_blade(_joint(left_arm, Vector3(0, -0.80, -0.04)), 0.85, tint)
	elif affinity == "arcano" or support:
		_sphere(left_arm, Vector3(0, -0.90, -0.12), 0.19, glow)
		_torus(left_arm, Vector3(0, -0.9, -0.12), 0.24, 0.265, gold, Vector3(PI / 2, 0, 0))
	# Discrete floor feedback leaves the model itself readable.
	active_ring = _torus(self, Vector3(0, 0.035, 0), 0.74, 0.79, _mat(Color("f2ca83"), 0.2, 1.7))
	active_ring.visible = false
	target_ring = _torus(self, Vector3(0, 0.045, 0), 0.90, 0.93, _mat(Color("f27f88"), 0.1, 1.3))
	target_ring.visible = false
	shield_aura = _sphere(self, Vector3(0, 1.42, 0), 1.0, _mat(Color("4bc5e4")), Vector3(0.83, 1.68, 0.83))
	var barrier := shield_aura.material_override as StandardMaterial3D
	barrier.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	barrier.albedo_color.a = 0.08
	barrier.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	barrier.cull_mode = BaseMaterial3D.CULL_DISABLED
	shield_aura.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shield_aura.visible = false
	# Slightly taller heroic proportions improve readability in a tactical camera.
	scale = Vector3.ONE * (1.13 if heavy else 1.08)

func _build_cloak(width: float, long_cloak: bool) -> void:
	var length := 1.65 if long_cloak else 1.12
	var geometry := ImmediateMesh.new()
	geometry.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var left := Vector3(-0.42 * width, 0.0, 0.0)
	var right := Vector3(0.42 * width, 0.0, 0.0)
	var low_left := Vector3(-0.60 * width, -length, 0.36)
	var low_mid := Vector3(0, -length - 0.10, 0.52)
	var low_right := Vector3(0.60 * width, -length, 0.36)
	for points in [[left, low_left, low_mid], [left, low_mid, right], [right, low_mid, low_right]]:
		geometry.surface_set_normal(Vector3.BACK)
		for point in points: geometry.surface_add_vertex(point)
	geometry.surface_end()
	_mesh(mantle, geometry, Vector3.ZERO, cloth)
	for direction in [-1.0, 1.0]:
		_box(mantle, Vector3(direction * 0.50 * width, -length * 0.49, 0.18), Vector3(0.045, length * 1.015, 0.04), gold, Vector3(-0.20, 0, -direction * 0.15))

func _arm(direction: float, width: float) -> Node3D:
	var joint := _joint(body, Vector3(direction * 0.52 * width, 0.54, 0))
	_sphere(joint, Vector3(0, -0.03, 0), 0.22 * width, armor, Vector3(1.14, 0.92, 1.16))
	_box(joint, Vector3(direction * 0.04, 0.10, 0), Vector3(0.36 * width, 0.12, 0.42), gold, Vector3(0, 0, -direction * 0.20))
	_cylinder(joint, Vector3(0, -0.30, 0), 0.13, 0.17, 0.48, dark)
	_sphere(joint, Vector3(0, -0.51, -0.01), 0.145, gold)
	_cylinder(joint, Vector3(0, -0.66, -0.02), 0.15, 0.18, 0.34, armor)
	_box(joint, Vector3(0, -0.66, -0.175), Vector3(0.06, 0.24, 0.04), glow)
	_sphere(joint, Vector3(0, -0.85, -0.03), 0.13, dark)
	return joint

func _leg(direction: float, width: float) -> Node3D:
	var joint := _joint(self, Vector3(direction * 0.23 * width, 1.08, 0))
	_cylinder(joint, Vector3(0, -0.18, 0), 0.16, 0.19, 0.48, dark)
	_box(joint, Vector3(0, -0.29, -0.10), Vector3(0.30, 0.37, 0.20), armor, Vector3(-0.10, 0, 0))
	_sphere(joint, Vector3(0, -0.47, -0.07), 0.17, gold, Vector3(0.95, 0.8, 0.8))
	_cylinder(joint, Vector3(0, -0.71, 0), 0.13, 0.19, 0.46, armor, 6)
	_box(joint, Vector3(0, -0.72, -0.15), Vector3(0.065, 0.28, 0.04), glow)
	_box(joint, Vector3(0, -0.98, -0.12), Vector3(0.29, 0.17, 0.48), dark)
	_box(joint, Vector3(0, -0.90, -0.30), Vector3(0.25, 0.10, 0.12), gold)
	return joint

func _build_blade(parent: Node3D, length: float, _blade_color: Color) -> void:
	_box(parent, Vector3(0, -0.10, 0), Vector3(0.075, 0.28, 0.08), dark)
	_box(parent, Vector3(0, 0.06, 0), Vector3(0.38, 0.08, 0.10), gold)
	_cylinder(parent, Vector3(0, 0.08 + length * 0.5, 0), 0.13, 0.0, length, armor, 4)
	_box(parent, Vector3(0, 0.14 + length * 0.34, -0.08), Vector3(0.035, length * 0.70, 0.035), glow)

func _build_weapon(identity: String, affinity: String) -> void:
	if identity == "oren":
		_cylinder(weapon, Vector3(0, 0.25, 0), 0.06, 0.09, 1.5, dark, 6)
		_box(weapon, Vector3(0, 1.07, 0), Vector3(0.70, 0.50, 0.54), armor, Vector3(0, 0.15, 0))
		for direction in [-1.0, 1.0]:
			_cylinder(weapon, Vector3(direction * 0.40, 1.10, 0), 0.14, 0.02, 0.37, dark, 5, Vector3(0, 0, direction * PI / 2))
			_box(weapon, Vector3(direction * 0.21, 1.07, -0.29), Vector3(0.08, 0.53, 0.04), gold)
		_sphere(weapon, Vector3(0, 1.07, -0.29), 0.12, glow, Vector3(0.75, 1.3, 0.5))
	elif identity in ["kira", "cindra", "vektor"]:
		# Shoulder-mounted resonance cannon with a visible barrel and cooling fins.
		_box(weapon, Vector3(0, 0.05, -0.40), Vector3(0.26, 0.28, 0.95), armor)
		_cylinder(weapon, Vector3(0, 0.05, -0.95), 0.15, 0.12, 0.28, gold, 8, Vector3(PI / 2, 0, 0))
		_cylinder(weapon, Vector3(0, 0.05, -1.10), 0.09, 0.09, 0.035, glow, 8, Vector3(PI / 2, 0, 0))
		for n in range(3): _box(weapon, Vector3(0, 0.22, -0.20 - float(n) * 0.18), Vector3(0.32, 0.07, 0.08), gold)
		if identity == "kira":
			_box(weapon, Vector3(0, 0.05, -1.25), Vector3(0.10, 0.10, 0.75), dark)
			_box(weapon, Vector3(0, 0.31, -0.47), Vector3(0.12, 0.10, 0.34), dark)
			_box(weapon, Vector3(0, 0.31, -0.67), Vector3(0.075, 0.065, 0.04), glow)
		ranged = true
	elif identity == "nima":
		var bow := _joint(weapon, Vector3(0, 0.13, -0.18))
		for direction in [-1.0, 1.0]:
			_box(bow, Vector3(0, direction * 0.37, 0.10), Vector3(0.09, 0.76, 0.11), gold, Vector3(direction * -0.35, 0, 0))
			_box(bow, Vector3(0, direction * 0.69, 0.30), Vector3(0.055, 0.35, 0.07), glow, Vector3(direction * -0.70, 0, 0))
		_box(bow, Vector3(0, 0, 0.42), Vector3(0.018, 1.5, 0.018), glow)
		ranged = true
	elif support or affinity == "arcano":
		_cylinder(weapon, Vector3(0, 0.15, 0), 0.045, 0.045, 2.1, gold, 8)
		_torus(weapon, Vector3(0, 1.29, 0), 0.29, 0.34, gold, Vector3(PI / 2, 0, 0))
		_sphere(weapon, Vector3(0, 1.29, 0), 0.17, glow, Vector3(0.8, 1.4, 0.8))
		for direction in [-1.0, 1.0]:
			_cylinder(weapon, Vector3(direction * 0.23, 1.37, 0), 0.07, 0.0, 0.62, gold, 4, Vector3(0, 0, direction * -0.32))
	else:
		_build_blade(weapon, 1.40 if heavy else 1.0, tint)
		weapon.rotation.x = -0.27

func remember_home() -> void:
	home = position
	home_rotation = rotation

func reset_pose() -> void:
	acting = false
	position = home
	rotation = home_rotation
	if not is_instance_valid(body): return
	body.position = Vector3(0, 1.45, 0)
	body.rotation = Vector3.ZERO
	head.rotation = Vector3.ZERO
	right_arm.rotation = Vector3(-0.18, 0, -0.12)
	left_arm.rotation = Vector3(-0.06, 0, 0.14)
	right_leg.rotation = Vector3.ZERO
	left_leg.rotation = Vector3.ZERO
	mantle.rotation = Vector3.ZERO
	if defeated:
		body.rotation.z = -0.65
		body.position.y = 0.62
		right_leg.rotation.x = -1.15
		left_leg.rotation.x = 0.70

func pose(phase: String, amount: float) -> void:
	acting = true
	match phase:
		"windup":
			body.rotation = Vector3(0.03, -amount * (0.5 if not ranged else 0.16), amount * 0.10)
			right_arm.rotation = Vector3(-0.18 - amount * 1.45, amount * 0.25, -0.12 - amount * 0.28)
			left_arm.rotation.x = -0.06 - amount * (1.10 if support else 0.25)
			body.position.y = 1.45 - amount * 0.12
			left_leg.rotation.x = amount * 0.18
			mantle.rotation.x = amount * 0.12
		"advance":
			body.rotation.x = -0.15 * sin(amount * PI)
			right_leg.rotation.x = sin(amount * TAU * 1.5) * 0.63
			left_leg.rotation.x = -right_leg.rotation.x
			body.position.y = 1.36 + absf(sin(amount * TAU * 1.5)) * 0.14
			mantle.rotation.x = -sin(amount * PI) * 0.55
		"strike":
			body.rotation.y = lerpf(-0.5, 0.72, amount)
			right_arm.rotation = Vector3(lerpf(-1.63, -0.55, amount), lerpf(0.25, -0.28, amount), lerpf(-0.4, -1.0, amount))
			left_arm.rotation.x = -0.65
			body.position.y = 1.32 + amount * 0.12
			mantle.rotation.x = -0.35
		"cast":
			right_arm.rotation = Vector3(-1.35 + sin(amount * PI) * -0.20, 0, -0.20)
			left_arm.rotation = Vector3(-1.12, 0, 0.4)
			body.position.y = 1.40 + sin(amount * PI) * 0.12
		"hit":
			body.rotation.x = -sin(amount * PI) * 0.36
			body.position.z = sin(amount * PI) * 0.15
			head.rotation.x = -sin(amount * PI) * 0.2
		"recover":
			body.rotation = Vector3(0, 0.72 * (1.0 - amount), 0)
			right_arm.rotation = Vector3(lerpf(-0.55, -0.18, amount), -0.28 * (1.0 - amount), lerpf(-1.0, -0.12, amount))
			left_arm.rotation = Vector3(lerpf(-0.65, -0.06, amount), 0, 0.14 * amount)
			right_leg.rotation.x *= 1.0 - amount
			left_leg.rotation.x *= 1.0 - amount
			body.position = Vector3(0, 1.45, 0)
			mantle.rotation.x = -0.35 * (1.0 - amount)

func set_state(unit: Dictionary) -> void:
	var was_defeated := defeated
	defeated = int(unit.get("hp", 1)) <= 0
	shield_aura.visible = not defeated and int(unit.get("shield", 0)) > 0
	if defeated != was_defeated: reset_pose()
	active_ring.visible = active_ring.visible and not defeated

func set_selection(active: bool, targeted: bool) -> void:
	active_ring.visible = active and not defeated
	target_ring.visible = targeted and not defeated

func _process(delta: float) -> void:
	if not is_instance_valid(body) or not motion_enabled: return
	elapsed += delta
	if not acting and not defeated:
		body.position.y = 1.45 + sin(elapsed * 1.7) * 0.022
		mantle.rotation.x = sin(elapsed * 1.4) * 0.025
	if active_ring.visible: active_ring.rotation.y += delta * 0.25
