extends Control
## Six deliberately different effect languages, shared by combat and the gallery.
const GLOW_SHADER = preload("res://shaders/ultimate_glow.gdshader")
static var painted_atlas: Texture2D
var origin := Vector2.ZERO
var destination := Vector2.ZERO
var tint := Color.WHITE
var affinity := "igneo"
var kind := "damage"
var signature := ""
var elapsed := 0.0
var duration := 0.8
var ultimate := false
var phase := "impact"
var tier := "basic"
var painted_sprite: TextureRect

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if phase == "impact" and tier == "skill" and kind not in ["shieldExpired", "energy"]:
		if not painted_atlas and ResourceLoader.exists("res://assets/ultimate-atlas.png"): painted_atlas = load("res://assets/ultimate-atlas.png")
		if painted_atlas:
			var index: int = 5 if kind in ["heal", "support", "supportAll"] else {"igneo": 0, "natural": 1, "tecnico": 2, "arcano": 3, "sombrio": 4}.get(affinity, 3)
			var cell := Vector2(painted_atlas.get_size()) / Vector2(3, 2)
			var atlas := AtlasTexture.new()
			atlas.atlas = painted_atlas
			atlas.filter_clip = true
			atlas.region = Rect2(Vector2(index % 3, index / 3) * cell, cell)
			painted_sprite = TextureRect.new()
			painted_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			painted_sprite.stretch_mode = TextureRect.STRETCH_SCALE
			painted_sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
			painted_sprite.modulate.a = 0.48
			var glow := ShaderMaterial.new()
			glow.shader = GLOW_SHADER
			glow.set_shader_parameter("region_rect", Vector4(atlas.region.position.x / painted_atlas.get_width(), atlas.region.position.y / painted_atlas.get_height(), 1.0 / 3.0, 0.5))
			glow.set_shader_parameter("vortex", affinity in ["arcano", "sombrio"])
			glow.set_shader_parameter("progress", 0.0)
			painted_sprite.material = glow
			painted_sprite.size = Vector2(135, 165) * 0.68
			painted_sprite.position = destination - painted_sprite.size * Vector2(0.5, 0.58)
			painted_sprite.texture = atlas
			add_child(painted_sprite)

func _process(delta: float) -> void:
	elapsed += delta
	if is_instance_valid(painted_sprite):
		var p := clampf(elapsed / duration, 0, 1)
		painted_sprite.material.set_shader_parameter("progress", p)
		painted_sprite.size = Vector2(135, 165) * (0.68 + sin(p * PI * 0.5) * 0.45)
		painted_sprite.position = destination - painted_sprite.size * Vector2(0.5, 0.58)
	queue_redraw()
	if elapsed >= duration: queue_free()

func _draw() -> void:
	var p := clampf(elapsed / duration, 0, 1)
	var fade := sin(p * PI)
	var color := Color(tint, fade)
	var scale_factor := 1.45 if ultimate else 1.0
	var at := destination
	if phase == "charge":
		_charge_signature(at, p, color, scale_factor)
		var radius := (38 - p * 15) * scale_factor
		draw_arc(at, radius + 10, p * TAU, p * TAU + PI * 1.5, 40, Color(tint, fade * 0.4), 1, true)
		for i in range(16):
			var point := at + Vector2.from_angle(i * TAU / 9 + p) * (75 * (1 - p) + 10)
			draw_circle(point, 1.5 + i % 2, Color(tint.lightened(0.45), fade * 0.8))
		return
	if phase == "travel":
		var velocity := (at - origin).normalized()
		var eased := p * p * (3 - 2 * p)
		var point := origin.lerp(at, eased)
		for i in range(7):
			var tail: Vector2 = origin.lerp(at, maxf(0, eased - i * 0.035))
			draw_circle(tail, (8 - i) * scale_factor * 0.65, Color(tint, fade * (0.17 - i * 0.018)))
		draw_line(point - velocity * 21, point + velocity * 4, Color(tint.lightened(0.75), fade), 2.5, true)
		if signature in ["volley", "daggers", "thorns"]:
			for i in range(3):
				var tip := point + Vector2(0, (i - 1) * 18)
				draw_line(tip - (at - origin).normalized() * 30, tip, color, 3, true)
				_polygon(tip, 6, 3, color, (at - origin).angle())
		elif signature in ["drones", "prism", "runes", "orbit"]:
			for i in range(3):
				var orbit := point + Vector2.from_angle(p * TAU + i * TAU / 3) * 23
				_polygon(orbit, 9, 4 if signature == "drones" else 3, color, p * 3)
		elif signature == "threads":
			for i in range(4): draw_line(origin + Vector2(0, i * 8 - 12), point + Vector2(0, sin(p * TAU + i) * 24), color, 2, true)
		elif affinity in ["igneo", "sombrio"]:
			draw_line(origin, point, Color(tint, fade * 0.25), 15 * scale_factor, true)
			draw_arc(point, 24 * scale_factor, -PI * 0.8 + p * 3, PI * 0.4 + p * 3, 24, color, 4, true)
		elif affinity == "tecnico":
			draw_line(origin, point, Color(tint, fade * 0.35), 14 * scale_factor, true)
			draw_line(origin, point, Color("d9f7ff", fade), 3, true)
		else:
			point.y -= sin(p * PI) * (45 if affinity == "arcano" else 15)
			draw_circle(point, 12 * scale_factor, Color(tint, fade * 0.3))
			draw_circle(point, 5 * scale_factor, Color(tint.lightened(0.5), fade))
			_polygon(point, 18 * scale_factor, 5 if affinity == "natural" else 4, color, p * 4)
		return
	_contact_flash(at, p, tint, scale_factor)
	if kind == "shieldExpired":
		draw_arc(at, 45 * (1 + p), 0, TAU * (1 - p), 32, Color("83d8ff", 1 - p), 2, true)
		return
	if kind in ["shieldHit", "shieldBreak"]:
		var shield_color := Color("83d8ff", fade)
		for i in range(6):
			var angle := TAU * i / 6.0 - PI / 2
			var center := at + Vector2.from_angle(angle) * p * (45 if kind == "shieldBreak" else 5)
			draw_line(center + Vector2.from_angle(angle) * 46, center + Vector2.from_angle(angle + TAU / 6) * 46, shield_color, 4, true)
		_particles(at, p, Color("9be8ff"), 16, scale_factor)
		for i in range(3):
			var spread := (35 + p * (80 if kind == "shieldBreak" else 28) + i * 6) * scale_factor
			draw_arc(at, spread, -PI * 0.8 + i * 0.3, PI * 0.8 + i * 0.3, 48, Color("d4f5ff", fade * 0.5), 1.5, true)
		if kind == "shieldHit": return
	if kind in ["shield", "shieldAll", "guard"]:
		var sides := 4 if signature == "prism" else 3 if signature == "crescent" else 5 if signature == "roots" else 8 if signature in ["crater", "volley"] else 6
		for radius in [40.0, 52.0]: _polygon(at, radius * scale_factor, sides, color, p * 0.2)
		for i in range(4):
			var from := at + Vector2(-35 + i * 24, 50)
			draw_line(from, from - Vector2(0, 100), Color(tint, fade * 0.25), 2, true)
		return
	# A contact frame precedes the signature's follow-through and dispersing embers.
	# Each active hero has a distinct impact silhouette, rather than a recolored class burst.
	if kind in ["heal", "support", "supportAll", "energy"]:
		var healing := Color("9ce5bd", fade)
		for i in range(5):
			var point := at + Vector2((i - 2) * 20, -p * 60 + sin(i) * 18)
			draw_line(point - Vector2(5, 0), point + Vector2(5, 0), healing, 2, true)
			draw_line(point - Vector2(0, 5), point + Vector2(0, 5), healing, 2, true)
		_polygon(at, (30 + p * 45) * scale_factor, 6 if signature == "drones" else 5 if signature == "bloom" else 3, color, p)
		return
	if signature in ["crater", "roots"]:
		draw_set_transform(at + Vector2(0, 65), 0, Vector2(1, 0.30))
		for i in range(3): draw_arc(Vector2.ZERO, (20 + p * 100 + i * 12) * scale_factor, 0, TAU, 48, color, 3, true)
		draw_set_transform(Vector2.ZERO)
		for i in range(7):
			var bottom := at + Vector2((i - 3) * 20, 55)
			var tip := bottom - Vector2(sin(i) * 15, (25 + i % 3 * 18) * sin(p * PI))
			draw_line(bottom, tip, color, 5 if signature == "roots" else 3, true)
		_particles(at, p, tint, 14, scale_factor)
		return
	if signature in ["volley", "thorns"]:
		for i in range(5):
			var direction := Vector2.from_angle(-PI * 0.7 + i * 0.35)
			var tip := at + direction * (15 + p * 65) * scale_factor
			draw_line(at + direction * 10, tip, color, 3, true)
			_polygon(tip, 6, 3, color, direction.angle())
		_particles(at, p, tint, 9, scale_factor)
		return
	if signature == "rail":
		var direction := (at - origin).normalized()
		draw_line(origin, at + direction * p * 130, Color(tint, fade * 0.35), 18 * scale_factor, true)
		draw_line(origin, at + direction * p * 130, Color("e8f9ff", fade), 3, true)
		draw_arc(at, (14 + p * 35) * scale_factor, 0, TAU, 32, color, 2, true)
		return
	if signature in ["hex", "drones", "prism", "runes"]:
		var sides := 6 if signature == "hex" else 4 if signature == "drones" else 3
		for i in range(3 if signature != "runes" else 7):
			var node := at + Vector2.from_angle(i * TAU / (7 if signature == "runes" else 3) + p) * (18 + p * 45)
			_polygon(node, (13 if signature != "runes" else 7) * scale_factor, sides, color, -p)
			if signature == "drones": draw_line(node, at, color, 2, true)
		_polygon(at, (24 + p * 34) * scale_factor, sides, color, p)
		return
	if signature == "threads":
		for i in range(6):
			var offset := Vector2(0, (i - 2.5) * 13)
			draw_line(origin + offset, at - offset + Vector2(sin(p * PI) * 30, 0), color, 2, true)
		draw_arc(at, 34 * scale_factor, 0, TAU, 36, color, 2, true)
		return
	if signature == "daggers":
		for i in range(2):
			var direction := Vector2(1, 1 if i == 0 else -1).normalized()
			var span := (20 + p * 70) * scale_factor
			draw_line(at - direction * span, at + direction * span, color, 5, true)
			draw_line(at - direction * span, at + direction * span, Color("eadfff", fade), 2, true)
		return
	match affinity:
		"igneo":
			for i in range(3):
				var radius := (36 + p * 75 + i * 13) * scale_factor
				draw_arc(at, radius, -PI * 0.9 + p * 1.3 + i * 0.3, PI * 0.3 + p * 1.3, 40, Color(tint.lerp(Color("ffe9a4"), i * 0.25), fade), 7 - i * 2, true)
			_particles(at, p, Color("ffb353"), 18, scale_factor)
		"natural":
			for i in range(4):
				var path := PackedVector2Array()
				for step in range(25):
					var t := minf(1, p * 2) * step / 24.0
					path.append(origin.lerp(at, t) + Vector2(sin(t * PI * 4 + i) * 15, 25 + sin(t * PI * 3 + i) * 10))
				draw_polyline(path, Color(tint, fade * 0.8), 2, true)
			for i in range(9):
				var angle := TAU * i / 9.0 + p
				var leaf := at + Vector2.from_angle(angle) * (20 + p * 70) * scale_factor
				draw_set_transform(leaf, angle, Vector2(1, 0.45))
				draw_circle(Vector2.ZERO, 7, color)
				draw_set_transform(Vector2.ZERO)
			draw_arc(at + Vector2(0, 35), 60 * scale_factor, 0, TAU, 50, color, 2, true)
		"tecnico":
			var direction := (at - origin).normalized()
			var perpendicular := Vector2(-direction.y, direction.x)
			for offset in [-7.0, 0.0, 7.0]:
				draw_line(origin + perpendicular * offset, origin.lerp(at, minf(1, p * 4)) + perpendicular * offset, color, 3 if offset != 0 else 8 * fade, true)
			_polygon(at, (28 + p * 40) * scale_factor, 6, color, p * 0.4)
			_particles(at, p, tint.lightened(0.5), 10, scale_factor)
		"arcano":
			for i in range(3):
				var t := minf(1, p * 2)
				var point := origin.lerp(at, t) + Vector2(0, sin(t * PI) * (i - 1) * 100)
				draw_circle(point, 7 * scale_factor, Color(tint.lightened(0.6), fade))
				draw_arc(point, 14 * scale_factor, p * TAU + i, p * TAU + i + PI * 1.5, 24, color, 2, true)
			for radius in [35.0, 65.0]:
				draw_arc(at, radius * scale_factor * (0.5 + p), p * 2, p * 2 + TAU, 50, color, 2, true)
			_polygon(at, 50 * scale_factor, 3, color, -p)
		"sombrio":
			for i in range(7):
				var point := origin.lerp(at, (i + 1) / 7.0)
				draw_circle(point + Vector2(sin(i + p * 5) * 16, -10), 12 + i * 3, Color(tint.darkened(0.5), fade * 0.2))
			draw_arc(at, (55 + p * 50) * scale_factor, PI * 0.5 + p * 2, PI * 1.8 + p * 2, 48, color, 7, true)
			draw_arc(at, (40 + p * 50) * scale_factor, -PI * 0.5 - p * 2, PI * 0.7 - p * 2, 48, Color("e1b8ff", fade), 2, true)
			_particles(at, p, tint, 12, scale_factor)
		"lumi":
			var height := 190.0 * minf(1, p * 4)
			draw_line(at - Vector2(0, height), at + Vector2(0, 38), Color(tint, fade * 0.24), 40 * scale_factor, true)
			draw_line(at - Vector2(0, height), at + Vector2(0, 38), Color("fff2ca", fade), 5 * scale_factor, true)
			for i in range(12):
				var direction := Vector2.from_angle(TAU * i / 12 + p * 0.2)
				draw_line(at + direction * 22, at + direction * (35 + p * 70) * scale_factor, color, 2, true)
			draw_arc(at, 44 * scale_factor, 0, TAU, 48, color, 2, true)
			_particles(at, p, Color("fff3ce"), 12, scale_factor)

func _charge_signature(at: Vector2, p: float, color: Color, scale_factor: float) -> void:
	var radius := (26 + p * 14) * scale_factor
	var bright := Color(tint.lightened(0.6), color.a)
	# Distinct preparation silhouettes make even shared class colors recognizable.
	match signature:
		"sweep":
			for i in range(3): draw_arc(at, radius + i * 9, -PI * 0.9 + p * 1.3, PI * 0.2 + p * 1.3, 48, bright if i == 1 else color, 2 + i, true)
		"crater":
			_floor_ring(at + Vector2(0, 77), radius + 38, color, 2)
			for i in range(7):
				var point := at + Vector2((i - 3) * 15, 61 - p * (16 + i % 3 * 12))
				_polygon(point, 4 + i % 3, 4, bright, i + p)
		"volley":
			for i in range(3):
				var y := at.y + (i - 1) * 20
				draw_line(Vector2(at.x - 36 + p * 12, y), Vector2(at.x + 24, y), color, 2, true)
				_polygon(Vector2(at.x + 26, y), 6, 3, bright, PI * 0.5)
		"bloom":
			for i in range(5):
				var angle := i * TAU / 5 + p * 0.45
				var petal := at + Vector2.from_angle(angle) * radius
				draw_set_transform(petal, angle, Vector2(1, 0.5))
				draw_arc(Vector2.ZERO, 20 + p * 6, 0, TAU, 32, color, 2, true)
				draw_set_transform(Vector2.ZERO)
		"roots":
			_floor_ring(at + Vector2(0, 77), radius + 32, color, 2)
			for i in range(5):
				var path := PackedVector2Array()
				for j in range(13):
					var t := j / 12.0
					path.append(at + Vector2((i - 2) * 20 + sin(t * TAU + i) * 6, 77 - t * p * 80))
				draw_polyline(path, color, 2, true)
		"thorns":
			for i in range(5):
				var angle := -PI + i * PI / 4
				var tip := at + Vector2.from_angle(angle) * (radius + 12)
				draw_line(tip, at, Color(tint, color.a * 0.35), 2, true)
				_polygon(tip, 9, 3, bright, angle + PI * 0.5)
		"hex":
			_polygon(at, radius, 6, color, p)
			_polygon(at, radius * 0.63, 6, bright, -p)
			for i in range(6):
				var point := at + Vector2.from_angle(i * TAU / 6 + p) * (radius + 13)
				draw_circle(point, 2, bright)
		"rail":
			for y in [-9.0, 9.0]:
				draw_line(at + Vector2(-55, y), at + Vector2(45, y), color, 2, true)
				draw_line(at + Vector2(-25 + p * 55, y - 4), at + Vector2(-25 + p * 55, y + 4), bright, 3, true)
			_glow(at + Vector2(38, 0), 16 + p * 12, color, 0.15)
		"drones":
			for i in range(3):
				var point := at + Vector2.from_angle(i * TAU / 3 + p * 2) * (radius + 12)
				_polygon(point, 10, 6, bright, 0)
				draw_line(at, point, Color(tint, color.a * 0.35), 1, true)
		"orbit":
			for i in range(3):
				draw_set_transform(at, i * PI / 3, Vector2(1, 0.42))
				draw_arc(Vector2.ZERO, radius + 11, 0, TAU, 48, color, 1.5, true)
				draw_circle(Vector2.from_angle(p * TAU + i) * (radius + 11), 4, bright)
				draw_set_transform(Vector2.ZERO)
		"prism":
			for i in range(3): _polygon(at + Vector2(0, (i - 1) * 9), radius + i * 7, 3, bright if i == 1 else color, p * 0.4 + i * PI)
		"runes":
			for i in range(7):
				var point := at + Vector2.from_angle(i * TAU / 7 - p) * (radius + 9)
				_polygon(point, 5, 4, bright, i)
				draw_line(point, at, Color(tint, color.a * 0.18), 1, true)
		"crescent":
			for i in range(3): draw_arc(at, radius + i * 8, -PI * 0.7 - p * 0.6, PI * 0.65 - p * 0.6, 48, bright if i == 0 else color, 3 if i == 0 else 1, true)
		"threads":
			for i in range(5):
				var path := PackedVector2Array()
				for j in range(25):
					var t := j / 24.0
					path.append(at + Vector2((t - 0.5) * 90, sin(t * TAU + p * TAU + i) * (7 + i * 4)))
				draw_polyline(path, color, 1.5, true)
		"daggers":
			for i in range(2):
				var direction := Vector2.from_angle((PI * 0.25 if i == 0 else PI * 0.75) + p * 0.15)
				draw_line(at - direction * radius, at + direction * radius, color, 4, true)
				draw_line(at - direction * radius, at + direction * radius, bright, 1.5, true)
		_:
			_polygon(at, radius, 6, color, p)

func _contact_flash(at: Vector2, p: float, color: Color, scale_factor: float) -> void:
	var flash := pow(1 - p, 4)
	_glow(at, (32 + p * 65) * scale_factor, color, flash * 0.18)
	for i in range(8):
		var direction := Vector2.from_angle(i * TAU / 8 + 0.2)
		var inner := (8 + p * 25) * scale_factor
		var outer := (27 + p * 85 + i % 3 * 8) * scale_factor
		draw_line(at + direction * inner, at + direction * outer, Color(color.lightened(0.65), flash), (2.8 if i % 2 == 0 else 1.2) * scale_factor, true)
	draw_arc(at, (12 + p * 80) * scale_factor, 0, TAU, 48, Color(color, flash * 0.65), 1.5, true)

func _floor_ring(at: Vector2, radius: float, color: Color, width: float) -> void:
	draw_set_transform(at, 0, Vector2(1, 0.25))
	draw_arc(Vector2.ZERO, radius, 0, TAU, 64, color, width, true)
	draw_set_transform(Vector2.ZERO)

func _glow(at: Vector2, radius: float, color: Color, strength: float) -> void:
	for i in range(4, 0, -1): draw_circle(at, radius * i / 4.0, Color(color, strength * (5 - i) * 0.18))

func _particles(at: Vector2, p: float, color: Color, count: int, scale_factor: float) -> void:
	for i in range(count):
		var direction := Vector2.from_angle(i * 2.39996)
		var point := at + direction * (20 + p * (35 + i % 5 * 12)) * scale_factor + Vector2(0, p * p * 25)
		draw_line(point - direction * (4 + i % 4), point, Color(color, sin(p * PI) * 0.65), 1.0, true)
		draw_circle(point, (1 - p) * (2 + i % 3), Color(color, sin(p * PI)))

func _polygon(center: Vector2, radius: float, sides: int, color: Color, rotation_value: float) -> void:
	var points := PackedVector2Array()
	for i in range(sides + 1): points.append(center + Vector2.from_angle(TAU * i / sides + rotation_value - PI / 2) * radius)
	draw_polyline(points, color, 2, true)
