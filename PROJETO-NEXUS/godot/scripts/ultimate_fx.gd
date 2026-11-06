extends Control
## Presentation only: a three-stage ultimate scene on the battlefield's floor plane.
const GLOW_SHADER = preload("res://shaders/ultimate_glow.gdshader")
const EFFECT_ATLAS := "res://assets/ultimate-atlas.png"
const IMPACT_LIFETIME := 1.36
static var effect_texture: Texture2D
var origin := Vector2.ZERO
var destinations: Array[Vector2] = []
var tint := Color.WHITE
var affinity := "igneo"
var signature := ""
var title := ""
var support := false
var action_kind := "damage"
var icon: Texture2D
var stage := "charge"
var elapsed := 0.0
var stage_time := 0.0
var sprites: Array[TextureRect] = []
var glow_material: ShaderMaterial
var display_font: Font

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	display_font = load("res://assets/space-grotesk.ttf") if ResourceLoader.exists("res://assets/space-grotesk.ttf") else get_theme_default_font()

func release() -> void:
	stage = "cast"
	stage_time = 0.0

func impact() -> void:
	stage = "impact"
	stage_time = 0.0
	if not effect_texture and ResourceLoader.exists(EFFECT_ATLAS): effect_texture = load(EFFECT_ATLAS)
	if effect_texture:
		var restoring: bool = action_kind.begins_with("heal") or action_kind.begins_with("support")
		var index: int = 5 if restoring else {"igneo": 0, "natural": 1, "tecnico": 2, "arcano": 3, "sombrio": 4}.get(affinity, 3)
		var cell := Vector2(effect_texture.get_size()) / Vector2(3, 2)
		var region := Rect2(Vector2(index % 3, index / 3) * cell, cell)
		var atlas := AtlasTexture.new()
		atlas.atlas = effect_texture
		atlas.region = region
		atlas.filter_clip = true
		glow_material = ShaderMaterial.new()
		glow_material.shader = GLOW_SHADER
		glow_material.set_shader_parameter("region_rect", Vector4(region.position.x / effect_texture.get_width(), region.position.y / effect_texture.get_height(), 1.0 / 3.0, 0.5))
		glow_material.set_shader_parameter("vortex", affinity in ["arcano", "sombrio"] and not support)
		glow_material.set_shader_parameter("progress", 0.0)
		for target in destinations:
			var sprite := TextureRect.new()
			sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			sprite.stretch_mode = TextureRect.STRETCH_SCALE
			sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
			sprite.material = glow_material
			# Configure geometry before entering the scene tree. The impact callback
			# can run after this node's _process for the frame; no default atlas-size
			# rectangle may appear at (0, 0) in that intervening render.
			var dimensions := Vector2(248, 286) * 0.66
			sprite.size = dimensions
			sprite.position = target - Vector2(dimensions.x * 0.5, dimensions.y * 0.88)
			sprite.texture = atlas
			add_child(sprite)
			sprites.append(sprite)

func _process(delta: float) -> void:
	elapsed += delta
	stage_time += delta
	if stage == "impact" and not sprites.is_empty():
		var p := clampf(stage_time / IMPACT_LIFETIME, 0, 1)
		glow_material.set_shader_parameter("progress", p)
		var dimensions := Vector2(248, 286) * (0.66 + sin(p * PI * 0.5) * 0.55)
		for i in range(sprites.size()):
			sprites[i].size = dimensions
			sprites[i].position = destinations[i] - Vector2(dimensions.x * 0.5, dimensions.y * 0.88)
	queue_redraw()
	if elapsed > 4.6 or (stage == "impact" and stage_time > IMPACT_LIFETIME): queue_free()

func _draw() -> void:
	var fade := clampf(elapsed * 5, 0, 1)
	if stage == "impact": fade *= clampf((IMPACT_LIFETIME - stage_time) * 3.5, 0, 1)
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.015, 0.025, 0.045, fade * 0.12))
	var font := display_font if display_font else get_theme_default_font()
	var title_width := minf(400, size.x * 0.36)
	var banner := Rect2(size.x * 0.5 - title_width * 0.5, 8, title_width, 48)
	draw_style_box(_banner(fade), banner)
	if icon: draw_texture_rect(icon, Rect2(banner.position + Vector2(7, 6), Vector2(36, 36)), false, Color(1, 1, 1, fade))
	var affinity_name: String = {"igneo": "ÍGNEO", "natural": "NATURAL", "tecnico": "TÉCNICO", "arcano": "ARCANO", "sombrio": "SOMBRIO"}.get(affinity, "NEXUS")
	draw_string(font, banner.position + Vector2(52, 16), "SUPREMO / " + affinity_name, HORIZONTAL_ALIGNMENT_LEFT, title_width - 60, 10, Color(tint.lightened(0.25), fade))
	draw_string(font, banner.position + Vector2(52, 36), title, HORIZONTAL_ALIGNMENT_LEFT, title_width - 60, 16, Color("eef7ff", fade))
	var progress := clampf(elapsed / 0.96, 0, 1) if stage == "charge" else 1.0
	draw_line(banner.position + Vector2(1, 47), banner.position + Vector2(1 + (title_width - 2) * progress, 47), Color(tint, fade), 2, true)
	if stage == "charge":
		_charge(fade)
	elif stage == "cast":
		_charge(fade * 0.6)
		var p := clampf(stage_time / 0.42, 0, 1)
		for target in destinations:
			var source := origin - Vector2(0, 90)
			var point := source.lerp(target - Vector2(0, 80), p)
			_glow(point, 32, tint, fade)
			for i in range(4):
				var path := PackedVector2Array()
				for step in range(17):
					var t := p * step / 16.0
					path.append(source.lerp(target - Vector2(0, 80), t) + Vector2(0, sin(t * PI) * sin(i + elapsed * 5) * 42))
				draw_polyline(path, Color(tint, fade * 0.55), 2, true)
	else:
		var p := clampf(stage_time / IMPACT_LIFETIME, 0, 1)
		if p < 0.14: draw_rect(Rect2(Vector2.ZERO, size), Color(tint.lightened(0.7), (1 - p / 0.14) * 0.07))
		for target in destinations:
			_ellipse(target, 32 + p * 145, 0.26, Color(tint, sin(p * PI) * 0.8), 3)
			if support: _restoration(target, p, fade)
			else: _strike(target, p, fade)
			_signature_scene(target, p, fade)

func _banner(alpha: float) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.025, 0.055, 0.085, alpha * 0.96)
	box.border_color = Color(tint, alpha * 0.8)
	box.set_border_width_all(1)
	box.set_corner_radius_all(8)
	return box

func _charge(fade: float) -> void:
	var growth := minf(1, elapsed / 0.96)
	_glow(origin - Vector2(0, 70), 65, tint, growth * fade * 0.7)
	for i in range(3):
		_ellipse(origin, 42 + growth * 36 + i * 17, 0.26, Color(tint, fade * 0.75), 2, elapsed * (0.4 if i % 2 else -0.4))
	for i in range(12):
		var angle := i * TAU / 12.0 + elapsed * 0.65
		var at := origin + Vector2(cos(angle), sin(angle) * 0.26) * (72 + growth * 24)
		_rune(at, 7, 3 if affinity == "arcano" else 6 if affinity == "tecnico" else 4, angle, Color(tint, fade), 1.5)
	for i in range(52):
		var t := fposmod(i * 0.127 + elapsed * 0.8, 1)
		var angle := i * 2.39996 + elapsed * 2
		var at := origin - Vector2(0, 85) + Vector2(cos(angle) * 95, sin(angle) * 55) * (1 - t)
		draw_circle(at, 1 + i % 3, Color(tint.lightened(t), fade * t))
	for i in range(7):
		var at := origin + Vector2((i - 3) * 19, 0)
		draw_line(at, at - Vector2(0, 30 + growth * (60 + i % 3 * 28)), Color(tint, fade * 0.18), 5, true)

func _restoration(at: Vector2, p: float, fade: float) -> void:
	var color := tint.lerp(Color("b7f7ce"), 0.45)
	_glow(at - Vector2(0, 70), 86, color, fade * 0.65)
	for i in range(3): _ellipse(at - Vector2(0, p * 110 + i * 28), 52 + sin(p * PI) * 18, 0.28, Color(color, fade * 0.65), 2)
	for i in range(30):
		var t := fposmod(i * 0.173 + p, 1)
		var point := at + Vector2(sin(i * 2.4 + p * 4) * (25 + i % 4 * 12), -t * 180)
		if affinity == "natural":
			var leaf := PackedVector2Array([point + Vector2(-5, 0), point + Vector2(0, -9), point + Vector2(5, 0), point + Vector2(0, 3)])
			draw_colored_polygon(leaf, Color(color, fade * sin(t * PI)))
		else:
			_rune(point, 3 + i % 3, 6 if affinity == "tecnico" else 4, elapsed + i, Color(color, fade * sin(t * PI)), 1.5)
	if affinity == "tecnico":
		for row in range(3):
			for col in range(3): _rune(at + Vector2((col - 1) * 28 + (row % 2) * 14, -30 - row * 25), 16, 6, 0, Color(tint, fade * 0.75), 2)
	elif affinity == "sombrio":
		for i in range(6):
			var angle := i * TAU / 6 + p * 3
			draw_arc(at - Vector2(0, 70), 60 + i * 5, angle, angle + PI * 0.6, 24, Color(tint.lightened(0.3), fade), 2, true)
	elif affinity == "arcano":
		_rune(at - Vector2(0, 85), 64, 3, elapsed, Color(tint.lightened(0.5), fade), 2)
		_rune(at - Vector2(0, 85), 64, 3, -elapsed + PI, Color(tint.lightened(0.5), fade), 2)
	elif affinity == "igneo":
		for i in range(12):
			var point := at + Vector2((i - 5.5) * 9, -sin(p * PI) * (35 + i % 4 * 22))
			_glow(point, 9, Color("ffc76b"), fade * 0.45)

func _strike(at: Vector2, p: float, fade: float) -> void:
	var center := at - Vector2(0, 75)
	var color := Color(tint, fade)
	_glow(center, 85, tint, fade)
	match affinity:
		"igneo":
			for i in range(11):
				var start := at + Vector2((i - 5) * 14, -240 - i % 3 * 28)
				var end := at + Vector2((i - 5) * 11, -15)
				var t := clampf(p * 2.7 - i * 0.035, 0, 1)
				var point := start.lerp(end, t)
				draw_line(point - Vector2(18, 50), point, Color("ff761c", fade * 0.4), 13, true)
				draw_line(point - Vector2(9, 25), point, Color("fff3bd", fade), 3, true)
			for i in range(8):
				var angle := i * TAU / 8.0
				var path := PackedVector2Array([at, at + Vector2(cos(angle) * 55, sin(angle) * 18), at + Vector2(cos(angle + 0.15) * (50 + p * 100), sin(angle + 0.15) * (18 + p * 25))])
				draw_polyline(path, Color("ffbd62", fade), 3, true)
		"natural":
			for i in range(9):
				var root := at + Vector2((i - 4) * 18, 5)
				var height := sin(p * PI) * (80 + i % 4 * 25)
				var path := PackedVector2Array()
				for j in range(13):
					var t := j / 12.0
					path.append(root - Vector2(sin(t * PI * 2 + i) * t * 15, height * t))
				draw_polyline(path, Color("297543", fade), 8, true)
				draw_polyline(path, Color("baf59b", fade), 2, true)
				_rune(path[-1], 9, 3, -PI / 2, color, 2)
		"tecnico":
			var intensity := sin(p * PI)
			draw_line(at - Vector2(0, 290), at, Color(tint, intensity * 0.20), 72, true)
			draw_line(at - Vector2(0, 290), at, Color(tint.lightened(0.6), intensity * 0.85), 14, true)
			draw_line(at - Vector2(0, 290), at, Color("e5fdff", intensity), 4, true)
			for i in range(3): _rune(center, 35 + i * 22 + p * 15, 6, p * (1 if i % 2 else -1), color, 2)
			for i in range(4):
				var point := center + Vector2.from_angle(i * PI / 2 + PI / 4) * 85
				draw_line(point, center.lerp(point, 0.5), color, 2, true)
		"arcano":
			for i in range(3):
				_rune(center, 45 + i * 22, 3, p * 2 * (1 if i % 2 else -1) + i, color, 2)
				_ellipse(center, 58 + i * 16, 0.6, Color(tint.lightened(0.35), fade), 2, elapsed + i)
			for i in range(12):
				var point := center + Vector2.from_angle(i * TAU / 12.0 + p * 2) * (30 + p * 90)
				_glow(point, 8, Color("e8d9ff"), fade)
		"sombrio":
			draw_circle(center, 62, Color(0.015, 0.005, 0.035, fade * 0.85))
			draw_arc(center, 65, p * 4, p * 4 + PI * 1.7, 64, Color("dbb7ff", fade), 4, true)
			for i in range(9):
				var path := PackedVector2Array()
				for j in range(24):
					var t := j / 23.0
					var angle := i * TAU / 9 + t * 3 + p * 3
					path.append(center + Vector2.from_angle(angle) * t * (90 + p * 40))
				draw_polyline(path, Color(tint, fade * 0.7), 3, true)
	for i in range(36):
		var angle := i * 2.39996
		var point := center + Vector2.from_angle(angle) * (15 + p * (55 + i % 7 * 10)) + Vector2(0, p * p * 40)
		draw_circle(point, (1 - p) * (2 + i % 3), Color(tint.lightened(0.5), fade))

func _signature_scene(at: Vector2, p: float, fade: float) -> void:
	var center := at - Vector2(0, 82)
	var light := Color(tint.lightened(0.55), fade)
	var color := Color(tint, fade * 0.7)
	match signature:
		"sweep":
			for i in range(3):
				var sweep := clampf(p * 2.0 - i * 0.12, 0, 1)
				draw_arc(center, 52 + i * 22, -PI * 0.9 + sweep * 2, -PI * 0.9 + sweep * 2 + PI * 0.9, 64, light if i == 1 else color, 5 - i, true)
		"crater":
			for i in range(10):
				var angle := i * TAU / 10
				var distance := 35 + p * (50 + i % 3 * 16)
				var point := at + Vector2(cos(angle) * distance, sin(angle) * distance * 0.27 - sin(p * PI) * (22 + i % 3 * 18))
				_rune(point, (8 + i % 3 * 3) * (1 - p * 0.6), 4, angle + p * 2, Color("ffd19e", fade), 3)
		"volley":
			for i in range(7):
				var t := clampf(p * 2.4 - i * 0.08, 0, 1)
				var point := center + Vector2((i - 3) * 20, -110 + t * 165)
				draw_line(point - Vector2(6, 33), point, light, 2, true)
				_rune(point, 6, 3, PI, color, 2)
		"bloom":
			for i in range(7):
				var angle := i * TAU / 7 + p * 0.4
				var point := center + Vector2.from_angle(angle) * (48 + p * 42)
				draw_set_transform(point, angle, Vector2(1, 0.38))
				draw_arc(Vector2.ZERO, 22 + sin(p * PI) * 13, 0, TAU, 40, light, 2, true)
				draw_set_transform(Vector2.ZERO)
		"roots":
			for i in range(3):
				var path := PackedVector2Array()
				for j in range(49):
					var t := j / 48.0
					var angle := -PI + t * TAU
					path.append(at + Vector2(cos(angle) * (60 + i * 16), -sin(t * PI) * (130 + i * 15)))
				draw_polyline(path, Color(tint, fade * (0.7 - i * 0.15)), 3, true)
		"thorns":
			for i in range(9):
				var angle := -PI + i * PI / 8
				var start := center + Vector2.from_angle(angle) * 115
				var tip := start.lerp(center, clampf(p * 2.2 - i * 0.03, 0, 1))
				draw_line(start, tip, Color(tint, fade * 0.45), 2, true)
				_rune(tip, 10, 3, angle - PI * 0.5, light, 2)
		"hex":
			for i in range(6):
				var angle := i * TAU / 6
				var point := center + Vector2.from_angle(angle) * 65
				_rune(point, 23, 6, 0, color, 2)
				if i % 2 == 0: draw_line(point, center, Color(tint, fade * 0.35), 2, true)
		"rail":
			for i in range(4):
				var angle := i * PI / 2
				var radial := Vector2.from_angle(angle)
				var perpendicular := Vector2(-radial.y, radial.x)
				var corner := center + radial * (58 + p * 18)
				draw_polyline(PackedVector2Array([corner + perpendicular * 14, corner, corner - radial * 14]), light, 3, true)
			for offset in [-12.0, 12.0]: draw_line(at - Vector2(offset, 265), at + Vector2(-offset, 8), color, 1, true)
		"drones":
			for i in range(3):
				var point := center + Vector2.from_angle(i * TAU / 3 + elapsed * 0.5) * 76
				_rune(point, 13, 6, 0, light, 3)
				_rune(point, 23, 6, 0, Color(tint, fade * 0.35), 1)
				draw_line(point, center, Color(tint, fade * 0.55), 2, true)
		"orbit":
			for i in range(6):
				var angle := i * TAU / 6 + p * 2.0
				var point := center + Vector2(cos(angle) * (80 + p * 35), sin(angle) * (50 + p * 15))
				_glow(point, 14, tint, fade * 0.85)
				draw_circle(point, 3, light)
				draw_line(point, center, Color(tint, fade * 0.16), 1, true)
		"prism":
			for i in range(4):
				var point := center + Vector2((i - 1.5) * 40, sin(i + p) * 30)
				_rune(point, 30 + sin(p * PI) * 8, 3, -PI / 2 + i * PI, light, 2)
				draw_line(center, point, color, 2, true)
		"runes":
			for i in range(9):
				var angle := i * TAU / 9 - p * 0.8
				var point := center + Vector2.from_angle(angle) * (76 + sin(p * PI) * 12)
				_rune(point, 10, 4 if i % 2 else 3, angle, light, 2)
			_ellipse(center, 94, 0.52, color, 2, p)
		"crescent":
			for i in range(4):
				var angle := i * PI / 2 + p * 0.9
				draw_arc(center, 65 + i * 9, angle, angle + PI * 0.65, 48, light if i % 2 == 0 else color, 4 if i % 2 == 0 else 2, true)
		"threads":
			for i in range(9):
				var path := PackedVector2Array()
				for j in range(33):
					var t := j / 32.0
					path.append(center + Vector2((t - 0.5) * 190, sin(t * PI * 2 + p * 4 + i * 0.7) * (18 + i * 5)))
				draw_polyline(path, light if i % 3 == 0 else color, 1.5, true)
		"daggers":
			for i in range(4):
				var angle := PI * 0.25 + i * PI * 0.5
				var direction := Vector2.from_angle(angle)
				var span := 40 + clampf(p * 2, 0, 1) * 72
				draw_line(center - direction * span, center + direction * span, color, 8, true)
				draw_line(center - direction * span, center + direction * span, light, 2, true)

func _glow(at: Vector2, radius: float, color: Color, strength: float) -> void:
	for i in range(5, 0, -1): draw_circle(at, radius * i / 5.0, Color(color, strength * (0.025 + (5 - i) * 0.012)))

func _ellipse(at: Vector2, radius: float, squash: float, color: Color, width: float, rotation_value := 0.0) -> void:
	var points := PackedVector2Array()
	for i in range(65):
		var angle := i * TAU / 64 + rotation_value
		points.append(at + Vector2(cos(angle) * radius, sin(angle) * radius * squash))
	draw_polyline(points, color, width, true)

func _rune(at: Vector2, radius: float, sides: int, rotation_value: float, color: Color, width: float) -> void:
	var points := PackedVector2Array()
	for i in range(sides + 1): points.append(at + Vector2.from_angle(i * TAU / sides + rotation_value) * radius)
	draw_polyline(points, color, width, true)
