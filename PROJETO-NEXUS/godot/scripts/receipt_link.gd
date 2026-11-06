extends Control
## A quiet association line below vitality cards, owned by the receipt's lifetime.
var receipt: Control
var fighter
var target_point := Vector2.ZERO
var tint := Color("9bcde7")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_as_relative = false
	z_index = 43
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _process(_delta: float) -> void:
	if not is_instance_valid(receipt) or receipt.is_queued_for_deletion():
		queue_free()
		return
	if is_instance_valid(fighter) and not fighter.is_queued_for_deletion(): target_point = fighter.hit_position()
	modulate.a = receipt.modulate.a
	queue_redraw()

func _draw() -> void:
	if not is_instance_valid(receipt): return
	var bounds := Rect2(receipt.position, receipt.size)
	var edge := Vector2(clampf(target_point.x, bounds.position.x, bounds.end.x), clampf(target_point.y, bounds.position.y, bounds.end.y))
	if edge.distance_to(target_point) < 12: return
	var direction := (target_point - edge).normalized()
	var shoulder := edge + direction * minf(18, edge.distance_to(target_point) * 0.2)
	var points := PackedVector2Array([edge, shoulder, target_point])
	draw_polyline(points, Color("04111b", 0.6), 3, true)
	draw_polyline(points, Color(tint, 0.40), 1.1, true)
	draw_circle(edge, 2, Color(tint, 0.65))
	draw_circle(target_point, 5, Color("061520", 0.55))
	draw_arc(target_point, 5, 0, TAU, 24, Color(tint, 0.6), 1.1, true)
	draw_circle(target_point, 1.6, Color(tint.lightened(0.3), 0.8))
