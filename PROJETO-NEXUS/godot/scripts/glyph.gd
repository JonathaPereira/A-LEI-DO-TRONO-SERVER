extends Control
var symbol := "basic"
var tint := Color("e3c792")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if custom_minimum_size == Vector2.ZERO: custom_minimum_size = Vector2(30, 30)

func _draw() -> void:
	var center := size / 2
	var radius := minf(size.x, size.y) * 0.36
	match symbol:
		"igneo":
			var points := PackedVector2Array([Vector2(-0.7, 0.7), Vector2(-0.8, -0.1), Vector2(-0.2, -0.5), Vector2(0, -1), Vector2(0.3, -0.2), Vector2(0.6, -0.5), Vector2(0.9, 0.2), Vector2(0.5, 0.9)])
			for i in range(points.size()): points[i] = center + points[i] * radius
			draw_colored_polygon(points, tint)
		"natural":
			draw_arc(center, radius * 0.8, -PI * 0.9, PI * 0.8, 24, tint, 2, true)
			draw_line(center + Vector2(-radius, radius), center + Vector2(radius, -radius), tint, 2, true)
			for i in range(3):
				var at := center + Vector2(i - 1, 1 - i) * radius * 0.4
				draw_line(at, at + Vector2(-radius * 0.5, -radius * 0.3), tint, 2, true)
		"tecnico":
			_polygon(center, radius, 6, tint)
			draw_circle(center, radius * 0.25, tint)
		"arcano":
			draw_arc(center, radius, 0, TAU, 32, tint, 1.5, true)
			for angle in [0.0, PI / 3, PI * 2 / 3]:
				var direction := Vector2.from_angle(angle)
				draw_line(center - direction * radius, center + direction * radius, tint, 1.5, true)
		"sombrio":
			draw_arc(center, radius, PI * 0.25, PI * 1.75, 32, tint, 4, true)
			draw_circle(center + Vector2(radius * 0.6, 0), 2, tint)
		"lumi", "ultimate":
			for i in range(8):
				var direction := Vector2.from_angle(TAU * i / 8.0)
				draw_line(center + direction * radius * 0.35, center + direction * radius, tint, 2, true)
			draw_circle(center, radius * 0.2, tint)
		"guard":
			var points := PackedVector2Array([Vector2(-0.8, -0.8), Vector2(0, -1), Vector2(0.8, -0.8), Vector2(0.6, 0.4), Vector2(0, 1), Vector2(-0.6, 0.4), Vector2(-0.8, -0.8)])
			for i in range(points.size()): points[i] = center + points[i] * radius
			draw_polyline(points, tint, 2, true)
		_:
			draw_line(center + Vector2(-radius, radius), center + Vector2(radius, -radius), tint, 3, true)
			draw_line(center + Vector2(-radius * 0.5, -radius * 0.2), center + Vector2(radius * 0.2, radius * 0.5), tint, 2, true)

func _polygon(center: Vector2, radius: float, sides: int, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(sides + 1): points.append(center + Vector2.from_angle(TAU * i / sides - PI / 2) * radius)
	draw_polyline(points, color, 2, true)
