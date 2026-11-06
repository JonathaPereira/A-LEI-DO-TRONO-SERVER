extends Control
## Quiet interface geometry keeps painted environments separate from readable surfaces.
func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func _draw() -> void:
	var cyan := Color("56d5f8")
	for index in range(15):
		var x := size.x * (0.46 + index * 0.055)
		draw_line(Vector2(x, 0), Vector2(x - size.y * 0.35, size.y), Color(cyan, 0.018), 1.0, true)
	draw_line(Vector2(0, 115), Vector2(size.x, 115), Color(cyan, 0.13), 1.0, true)
	var origin := Vector2(size.x - 72, 48)
	for offset in [Vector2.ZERO, Vector2(-26, 0), Vector2(0, 26)]:
		draw_circle(origin + offset, 2.0, Color(cyan, 0.5), true, -1.0, true)
