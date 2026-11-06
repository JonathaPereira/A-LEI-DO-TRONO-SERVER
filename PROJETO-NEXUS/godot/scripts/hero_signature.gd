extends Node2D
## Twenty-four readable weapon/element signatures. Decorative beats never apply damage.
const Quality = preload("res://scripts/presentation_quality.gd")
const GLOW = preload("res://assets/vfx/soft-glow.svg")
const MOTION := {
	"sweep":[-.085,2.0],"crater":[-.14,9.0],"volley":[-.035,-5.0],"eruption":[-.12,7.0],
	"bloom":[-.025,-12.0],"roots":[-.075,10.0],"thorns":[-.055,-3.0],"spiral":[-.03,-17.0],
	"hex":[-.055,4.0],"rail":[-.07,1.0],"plates":[-.11,8.0],"drones":[-.025,-13.0],
	"orbit":[-.045,-20.0],"prism":[-.08,-2.0],"runes":[-.035,-14.0],"rift":[-.095,-7.0],
	"crescent":[-.10,1.0],"threads":[-.02,-11.0],"claws":[-.12,6.0],"daggers":[-.11,-4.0],
	"lance":[-.075,1.5],"halo":[-.02,-10.0],"rays":[-.09,-4.0],"wings":[-.035,-8.0],
}
var signature := "sweep"
var tint := Color.WHITE
var tier := "basic"
var age := 0.0
var duration := .62
var radius := 58.0

func _ready() -> void:
	z_index=-11
	radius*=1.4 if tier=="ultimate" else 1.12 if tier=="skill" else .75
	duration=.8 if tier=="ultimate" else .62

func _process(delta: float) -> void:
	age+=delta
	queue_redraw()
	if age>=duration: queue_free()

func line(points: PackedVector2Array, color: Color, width := 2.0) -> void:
	if points.size()<2:return
	draw_polyline(points,Color(color,(1-age/duration)*.16),width*3,true)
	draw_polyline(points,color,width,true)

func diamond(at: Vector2, extent: float, color: Color, rotation_value := 0.0) -> void:
	var points := PackedVector2Array()
	for corner in [Vector2.UP*1.7,Vector2.RIGHT,Vector2.DOWN*1.7,Vector2.LEFT]: points.append(at+corner.rotated(rotation_value)*extent)
	draw_colored_polygon(points,Color(color,.12*(1-age/duration)))
	points.append(points[0])
	draw_polyline(points,color,1.5,true)

func _draw() -> void:
	var p := clampf(age/duration,0,1)
	var fade := (1-smoothstep(.18,1,p))*smoothstep(0,.045,p)
	var color := Color(tint,fade*.85)
	var light := Color(tint.lightened(.72),fade*.95)
	var extent := radius*(.65+sin(minf(1,p*2)*PI*.5)*.5)
	var detail := Quality.particles(7,5,3)
	# A crisp contact core makes the strike readable before its softer recovery.
	if p<.28:
		var span := Vector2.ONE*extent*(1.2+p)
		draw_texture_rect(GLOW,Rect2(-span*.5,span),false,Color(tint.lightened(.5),fade*(1-p/.28)*.45))
	match signature:
		"sweep","crescent":
			for blade in range(2 if signature=="sweep" else 1):
				var path := PackedVector2Array()
				for step in range(25):
					var a := -.9+step/24.0*2.5+p*.28+blade*.42
					path.append(Vector2(cos(a),sin(a)*.55)*extent*(1-blade*.22))
				line(path,light if blade==0 else color,2.2)
			if signature=="crescent": diamond(Vector2(-extent*.2,0),extent*.32,color,PI*.5)
		"crater","eruption":
			for i in range(detail):
				var a := TAU*i/detail
				var axis := Vector2(cos(a),sin(a)*.38)
				line(PackedVector2Array([axis*extent*.12,axis*extent*.6+Vector2(4,-6),axis*extent]),color,2.4)
				if signature=="eruption": line(PackedVector2Array([axis*extent*.6,axis*extent*.6-Vector2(0,(1-p)*extent*.9)]),light,2)
		"volley","thorns":
			for i in range(3):
				var y := (i-1)*extent*.33
				var tip := Vector2(extent*(.3+p),y)
				line(PackedVector2Array([tip-Vector2(extent*.8,10),tip]),color,1.8)
				line(PackedVector2Array([tip-Vector2(9,6),tip,tip-Vector2(9,-6)]),light,1.6)
		"bloom","spiral":
			for petal in range(5):
				var path := PackedVector2Array()
				var axis := Vector2.from_angle(petal*TAU/5+p*.15)
				for step in range(19):
					var t := step/18.0
					path.append(axis*sin(t*PI)*extent+axis.orthogonal()*sin(t*TAU)*extent*.22)
				line(path,color,1.5)
			if signature=="spiral": draw_arc(Vector2.ZERO,extent*.42,p*2,p*2+PI*1.5,24,light,1.5,true)
		"roots":
			for i in range(3):
				var x := (i-1)*extent*.48
				var path := PackedVector2Array()
				for step in range(17):
					var t := step/16.0
					path.append(Vector2(x+sin(t*PI*1.3+i)*extent*.15,extent*.45-t*extent*1.2))
				line(path,color,3)
		"hex","plates":
			var path := PackedVector2Array()
			for i in range(7):path.append(Vector2.from_angle(i*TAU/6)*extent*.75)
			line(path,light,2)
			for i in range(3):
				var x := (i-1)*extent*.35
				line(PackedVector2Array([Vector2(x-8,-extent*.2),Vector2(x+6,0),Vector2(x-8,extent*.2)]),color,2)
		"rail":
			line(PackedVector2Array([Vector2(-extent,0),Vector2(extent,0)]),light,2.8)
			for side in [-1,1]: line(PackedVector2Array([Vector2(-extent*.6,side*10),Vector2(extent*.3,side*5)]),color,1.4)
			draw_arc(Vector2.ZERO,extent*.28,PI*.2,PI*1.8,24,color,1.5,true)
		"drones","orbit":
			var count := 3 if signature=="drones" else 5
			for i in range(count):
				var point := Vector2.from_angle(i*TAU/count+p*.65)*extent*.75
				line(PackedVector2Array([point,Vector2.ZERO]),color,1)
				diamond(point,5 if signature=="drones" else 8,light,p)
			draw_arc(Vector2.ZERO,extent*.6,p,p+PI*1.7,32,color,1.2,true)
		"prism":
			for i in range(detail): diamond(Vector2.from_angle(i*TAU/detail)*extent*p,extent*.15,light,i*.6)
		"runes":
			for i in range(3):
				draw_set_transform(Vector2(0,i*9),0,Vector2(1,.42))
				draw_arc(Vector2.ZERO,extent*(.45+i*.22),p*.4,p*.4+TAU*.94,32,Color("91f4ff",fade*(.8-i*.2)),1.8,true)
			draw_set_transform(Vector2.ZERO)
		"rift":
			for side in [-1,1]: line(PackedVector2Array([Vector2(side*8,-extent),Vector2(-side*14,-extent*.2),Vector2(side*11,extent*.25),Vector2(-side*4,extent)]),light,2)
		"threads":
			for i in range(detail):
				var x := (i-float(detail-1)*.5)*extent*.25
				line(PackedVector2Array([Vector2(x,-extent*.8),Vector2(-x,extent*.8)]),color,1.2)
			diamond(Vector2.ZERO,extent*.3,light)
		"claws","daggers":
			for i in range(3 if signature=="claws" else 2):
				var offset := Vector2((i-1)*extent*.3,0)
				var axis := Vector2(.4 if i%2==0 else -.4,1).normalized()
				line(PackedVector2Array([offset-axis*extent*.8,offset+axis*extent*.8]),light,2.5)
				if signature=="daggers": diamond(offset,extent*.25,color,.4 if i%2==0 else -.4)

		"lance":
			line(PackedVector2Array([Vector2(-extent,0),Vector2(extent*.8,0)]),light,2.4)
			diamond(Vector2(extent*.65,0),extent*.25,color,PI*.5)
			for side in [-1,1]: line(PackedVector2Array([Vector2(-extent*.4,side*extent*.22),Vector2(extent*.5,0)]),color,1.3)
		"halo":
			for ring in range(2): draw_arc(Vector2(0,-extent*.18),extent*(.45+ring*.3),p*.6,p*.6+TAU*.92,40,light if ring==0 else color,1.6,true)
			diamond(Vector2.ZERO,extent*.2,light)
		"rays":
			for i in range(detail+1):
				var axis := Vector2.from_angle(TAU*i/(detail+1)+p*.25)
				line(PackedVector2Array([axis*extent*.23,axis*extent]),light if i%2==0 else color,2)
			draw_arc(Vector2.ZERO,extent*.3,0,TAU,32,color,1.4,true)
		"wings":
			for side in [-1,1]:
				for feather in range(4):
					var tip := Vector2(side*extent*(1-feather*.13),extent*(-.65+feather*.3))
					line(PackedVector2Array([Vector2(0,extent*.35),tip,tip+Vector2(-side*extent*.18,extent*.28)]),light if feather==0 else color,1.8)
