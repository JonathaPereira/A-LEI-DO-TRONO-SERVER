extends Control
const Quality = preload("res://scripts/presentation_quality.gd")
## One shared travelling surge joins the team; all damage still resolves once.
var destinations: Array[Vector2] = []
var affinity := "igneo"
var signature := ""
var tint := Color.WHITE
var stage := "charge"
var elapsed := 0.0
var duration := .92
var center := Vector2.ZERO

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	destinations.sort_custom(func(a,b): return a.y<b.y)
	if not destinations.is_empty():
		for at in destinations: center += at
		center /= destinations.size()

func impact() -> void:
	stage = "impact"
	elapsed = 0
	z_index = -34

func _process(delta: float) -> void:
	elapsed += delta
	queue_redraw()
	if (stage == "impact" and elapsed > duration) or elapsed > 3.0: queue_free()

func _draw() -> void:
	if destinations.is_empty(): return
	var water := signature == "runes"
	var color := Color("79e5f5") if water else tint
	if stage == "charge":
		for at in destinations:
			for side in [-1,1]:
				var path := PackedVector2Array()
				for step in range(17):
					var a := PI*step/16.0
					path.append(at+Vector2(cos(a)*side,sin(a)*.22)*(39+sin(elapsed*4)*3))
				draw_polyline(path,Color(color,.22),1.5,true)
		return
	var p := clampf(elapsed/duration,0,1)
	if p >= .98: return
	var fade := 1-smoothstep(.28,1,p)
	var start: Vector2 = destinations[0]
	var finish: Vector2 = destinations[-1]
	var axis := (finish-start).normalized()
	if axis.length() < .1: axis = Vector2.RIGHT
	var normal := axis.orthogonal()
	var span := maxf(170,start.distance_to(finish))
	# A broad diagonal wave has a leading white edge and an irregular colored body.
	for ribbon in range(Quality.particles(3,2,1)):
		var edge := PackedVector2Array()
		var inside := PackedVector2Array()
		var segments := Quality.particles(56,36,24)
		for step in range(segments+1):
			var t := float(step)/segments
			var ripple := sin(t*13-p*11+ribbon)*12+sin(t*29+p*5)*4
			var width := (18+sin(t*PI)*22)*(1-p)*(.75 if affinity=="sombrio" else 1.0)
			var at := center+axis*(t-.5)*span*1.4+normal*((p-.35)*100+ribbon*15+ripple)
			edge.append(at-normal*width*.4)
			inside.append(at+normal*width)
		inside.reverse()
		var polygon := edge.duplicate()
		polygon.append_array(inside)
		draw_colored_polygon(polygon,Color(color,fade*.08))
		draw_polyline(edge,Color(color,fade*.13),12,true)
		draw_polyline(edge,Color(color.lightened(.55),fade*.72),2.0 if ribbon==0 else 1.0,true)
	for index in range(Quality.particles(24,16,9)):
		var phase := float(index)/28
		var at := center+Vector2(cos(index*2.4)*span*.6,sin(index*2.4)*80)*(p*.9+.25)
		at.y -= p*(45+index%5*8) if affinity == "igneo" else 0
		var travel := Vector2.from_angle(index*2.4)*(5+index%6)*fade
		draw_line(at-travel,at,Color(color.lightened(.35),fade*.6),1.5,true)
