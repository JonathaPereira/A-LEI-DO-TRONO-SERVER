extends Control
## Supreme title, charge and floor light; painted contact animation lives in impact_bloom.gd.
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
var font: Font

func _ready() -> void:
	mouse_filter=MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	font=preload("res://assets/space-grotesk.ttf")

func release() -> void:
	stage="cast"
	stage_time=0

func impact() -> void:
	stage="impact"
	stage_time=0
	if not effect_texture: effect_texture=preload("res://assets/vfx/elemental-impact.png")
func _process(delta: float) -> void:
	elapsed+=delta
	stage_time+=delta
	queue_redraw()
	if elapsed>4.6 or stage=="impact" and stage_time>1.15: queue_free()

func _draw() -> void:
	var fade := minf(1,elapsed*7)
	if stage=="impact": fade*=1-smoothstep(.5,1.15,stage_time)
	draw_rect(Rect2(Vector2.ZERO,size),Color("030b14",fade*.08))
	var width := minf(405,size.x*.35)
	var banner := Rect2(size.x*.5-width*.5,8,width,48)
	var box := StyleBoxFlat.new()
	box.bg_color=Color("07121dea",fade)
	box.border_color=Color(tint,fade*.55)
	box.set_border_width_all(1)
	box.set_corner_radius_all(8)
	draw_style_box(box,banner)
	if icon: draw_texture_rect(icon,Rect2(banner.position+Vector2(8,7),Vector2(34,34)),false,Color(1,1,1,fade))
	draw_string(font,banner.position+Vector2(53,17),"SUPREMO",HORIZONTAL_ALIGNMENT_LEFT,width-62,10,Color(tint,fade))
	draw_string(font,banner.position+Vector2(53,36),title,HORIZONTAL_ALIGNMENT_LEFT,width-62,16,Color("e9f4ff",fade))
	var p := clampf(stage_time/1.1,0,1) if stage=="impact" else clampf(elapsed/.96,0,1)
	var color := Color("65ddea") if signature=="runes" else tint
	var points: Array = destinations if stage=="impact" else [origin]
	for at in points:
		for ring in range(2):
			var path := PackedVector2Array()
			var radius := (32+p*42+ring*9) if stage=="impact" else (48-p*12+ring*7)
			for i in range(97):
				var angle := TAU*float(i)/96
				path.append(at+Vector2(cos(angle),sin(angle)*.21)*radius)
			draw_polyline(path,Color(color,fade*.4),2 if ring==0 else 1,true)
