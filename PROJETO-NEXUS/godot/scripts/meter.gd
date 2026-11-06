extends Control
## Compact resource bar. The delayed trail represents the last damage received;
## exact values are always drawn above the fill with fixed left/right alignment.
var caption := "":
	set(next):
		caption = next
		queue_redraw()
var max_value := 100.0:
	set(next):
		max_value = next
		queue_redraw()
var value := 100.0:
	set(next):
		if next < value: trail_hold = 0.16
		value = next
		queue_redraw()
var fill := Color("83c594")
var shield_value := 0.0
var trail := -1.0
var trail_hold := 0.0
var numeric_font: Font

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var readable := FontVariation.new()
	readable.base_font = preload("res://assets/manrope.ttf")
	readable.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 700.0}
	numeric_font = readable

func _process(delta: float) -> void:
	if trail < 0: trail = value
	if trail < value: trail = value
	if trail_hold > 0:
		trail_hold = maxf(0, trail_hold - delta)
	elif trail > value:
		trail = move_toward(trail, value, max_value * delta * 0.9)
		queue_redraw()

func _draw() -> void:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("050e1b")
	box.border_color = Color("435570")
	box.set_border_width_all(1)
	box.set_corner_radius_all(4)
	draw_style_box(box, Rect2(Vector2.ZERO, size))
	var inside := Rect2(Vector2.ONE, (size - Vector2.ONE * 2).max(Vector2.ZERO))
	box.set_border_width_all(0)
	box.set_corner_radius_all(3)
	var ratio := clampf(value / maxf(1, max_value), 0, 1)
	if trail > value:
		box.bg_color = Color("efb26d")
		draw_style_box(box, Rect2(inside.position, Vector2(inside.size.x * clampf(trail / maxf(1, max_value), 0, 1), inside.size.y)))
	box.bg_color = fill.darkened(0.16)
	if ratio > 0:
		var filled := Rect2(inside.position, Vector2(inside.size.x * ratio, inside.size.y))
		draw_style_box(box, filled)
		var sheen := fill.lightened(0.35)
		sheen.a = 0.56
		draw_line(filled.position + Vector2(2, 1), filled.position + Vector2(maxf(2, filled.size.x - 2), 1), sheen, 1)
		for fraction in [0.25, 0.5, 0.75]:
			var x: float = inside.position.x + inside.size.x * fraction
			if fraction < ratio:
				draw_line(Vector2(x, 2), Vector2(x, size.y - 2), Color(0.02, 0.08, 0.14, 0.18), 1)
	if shield_value > 0:
		draw_line(Vector2(0, 1), Vector2(size.x * clampf(shield_value / maxf(1, max_value), 0, 1), 1), Color("8edbf5"), 2)

	if not caption.is_empty():
		var font: Font = numeric_font if numeric_font else get_theme_default_font()
		var font_size := 12 if size.y >= 16 else 11
		var parts := caption.split(" ", false, 1)
		var label: String = parts[0]
		var amount: String = parts[1].strip_edges() if parts.size() > 1 else ""
		while font_size > 9 and font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + font.get_string_size(amount, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > size.x - 18:
			font_size -= 1
		var y := (size.y + font.get_ascent(font_size) - font.get_descent(font_size)) * 0.5
		var at := Vector2(5, y)
		var numbers_at := Vector2(size.x - 5 - font.get_string_size(amount, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x, y)
		for entry in [[label, at], [amount, numbers_at]]:
			draw_string(font, entry[1] + Vector2(0, 1), entry[0], HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color("030913"))
			draw_string(font, entry[1], entry[0], HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color("f7fbff"))
