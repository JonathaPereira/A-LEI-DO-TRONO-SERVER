extends Control
var tint := Color("a9a0f6")
const TEXTURES := {
	"ember": preload("res://assets/gems/ember.svg"),
	"pulse": preload("res://assets/gems/pulse.svg"),
	"sap": preload("res://assets/gems/sap.svg"),
}

static func texture_for(id: String) -> Texture2D:
	return TEXTURES.get(id)

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func _draw() -> void:
	var center := size * 0.5
	var radius := minf(size.x, size.y) * 0.41
	var top := center + Vector2(0, -radius)
	var left := center + Vector2(-radius * 0.72, -radius * 0.20)
	var right := center + Vector2(radius * 0.72, -radius * 0.20)
	var bottom := center + Vector2(0, radius)
	var middle := center + Vector2(0, -radius * 0.05)
	draw_circle(center, radius * 1.15, Color(tint, 0.07), true, -1, true)
	draw_polygon(PackedVector2Array([top, left, middle]), PackedColorArray([tint.lightened(0.5), tint, tint.lightened(0.2)]))
	draw_polygon(PackedVector2Array([top, middle, right]), PackedColorArray([tint.lightened(0.5), tint, tint.darkened(0.2)]))
	draw_polygon(PackedVector2Array([left, bottom, middle]), PackedColorArray([tint, tint.darkened(0.45), tint.lightened(0.15)]))
	draw_polygon(PackedVector2Array([middle, bottom, right]), PackedColorArray([tint, tint.darkened(0.45), tint.darkened(0.2)]))
	draw_polyline(PackedVector2Array([top, left, bottom, right, top]), tint.lightened(0.5), 1.5, true)
	draw_line(left, right, Color(tint.lightened(0.7), 0.55), 1.0, true)
