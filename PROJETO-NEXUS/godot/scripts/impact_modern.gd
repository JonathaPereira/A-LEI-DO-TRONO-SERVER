extends Control
## Continuous ribbons, turbulent light and rounded particles; entirely 2D.
const SHADER = preload("res://shaders/modern_impact.gdshader")
const Quality = preload("res://scripts/presentation_quality.gd")
const GLOW = preload("res://assets/vfx/soft-glow.svg")
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
var profile := 0
var quad: ColorRect
var fx_material: ShaderMaterial

static func choose_profile(affinity_value: String, signature_value: String, kind_value: String) -> int:
	if kind_value.begins_with("shield") or kind_value == "guard": return 6
	if signature_value == "runes": return 2 # Saira's established Maré de éter.
	if kind_value.begins_with("heal") or kind_value.begins_with("support") or kind_value == "energy": return 7
	if signature_value in ["sweep","crescent","daggers","prism","rift","claws"]: return 0
	return {"igneo":1,"natural":3,"tecnico":4,"arcano":4,"sombrio":5}.get(affinity_value,0)

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	profile = choose_profile(affinity,signature,kind)
	if affinity == "igneo" and tier != "basic" and kind in ["damage","aoe"]: profile = 1
	fx_material = ShaderMaterial.new()
	fx_material.shader = SHADER
	fx_material.set_shader_parameter("profile",profile)
	fx_material.set_shader_parameter("tint",tint)
	fx_material.set_shader_parameter("seed",float(signature.hash()%97))
	fx_material.set_shader_parameter("phase",0 if phase=="charge" else 1 if phase=="travel" else 2)
	fx_material.set_shader_parameter("noise_map",Quality.noise_texture())
	quad = ColorRect.new()
	quad.mouse_filter = MOUSE_FILTER_IGNORE
	quad.material = fx_material
	quad.visible = Quality.level>0
	var extent := 290.0 if ultimate else 224.0 if tier=="skill" else 180.0
	if phase == "travel": extent *= .56
	quad.size = Vector2.ONE*extent
	quad.pivot_offset = quad.size*.5
	quad.position = destination-quad.size*.5
	add_child(quad)

func _process(delta: float) -> void:
	elapsed += delta
	var p := clampf(elapsed/maxf(.01,duration),0,1)
	fx_material.set_shader_parameter("progress",p)
	var at := origin.lerp(destination,smoothstep(0,1,p)) if phase=="travel" else destination
	quad.position = at-quad.size*.5
	quad.rotation = (destination-origin).angle() if phase=="travel" else -.25
	queue_redraw()
	if elapsed>=duration: queue_free()

func _glow(at: Vector2, radius: float, color: Color, alpha: float) -> void:
	# One cached radial sprite replaces six tessellated, overlapping circles.
	draw_texture_rect(GLOW,Rect2(at-Vector2.ONE*radius*1.5,Vector2.ONE*radius*3),false,Color(color.lightened(.15),alpha*.9))

func _ribbon(at: Vector2, p: float, radius: float, angle: float, color: Color, width: float) -> void:
	var outer := PackedVector2Array()
	var inner := PackedVector2Array()
	var edge := PackedVector2Array()
	var head := -.95+p*1.85
	var steps := Quality.particles(44,30,20)
	for i in range(steps+1):
		var t := float(i)/steps
		var a := angle+head-t*1.85
		var taper := pow(sin(t*PI),.65)
		var direction := Vector2(cos(a),sin(a)*.55)
		outer.append(at+direction*(radius+width*taper))
		inner.append(at+direction*(radius-width*taper*.45))
		edge.append(at+direction*(radius+width*taper*.75))
	inner.reverse()
	outer.append_array(inner)
	var fade := pow(1-p,.8)
	draw_colored_polygon(outer,Color(color,fade*.36))
	draw_polyline(edge,Color(color,fade*.12),8,true)
	draw_polyline(edge,Color(color.lightened(.6),fade*.85),1.6,true)

func _draw() -> void:
	var p := clampf(elapsed/maxf(.01,duration),0,1)
	var strength := 1.35 if ultimate else 1.0
	var fade := (1-p)*(1-p)
	var color := Color("80e6f1") if profile==2 else tint
	if phase=="charge":
		for i in range(Quality.particles(12,8,5)):
			var angle := float(i)*2.399+p*.9
			var at := origin+Vector2.from_angle(angle)*(70*(1-p)+12)*strength
			_glow(at,2.5+float(i%3),color,sin(p*PI)*.5)
		return
	if phase=="travel":
		var direction := (destination-origin).normalized()
		var point := origin.lerp(destination,smoothstep(0,1,p))
		for i in range(Quality.particles(3,2,1)):
			var path := PackedVector2Array()
			for sample in range(22):
				var t := float(sample)/21
				var trail := point-direction*t*95*strength
				trail += direction.orthogonal()*sin(t*4+p*8+i)*float(i+1)*3
				path.append(trail)
			draw_polyline(path,Color(color,fade*.16),8-float(i)*2,true)
		draw_line(point-direction*32,point,Color(color.lightened(.75),sin(p*PI)*.9),2,true)
		return
	if profile==0 or signature in ["sweep","crescent","prism"]:
		var angle := -.30 if origin.x<destination.x else PI+.30
		_ribbon(destination,p,65*strength,angle,color,20*strength)
		if signature in ["daggers","sweep"]: _ribbon(destination,p,48*strength,-angle+PI*.4,color,12*strength)
	if kind=="shieldExpired":
		draw_arc(destination,42+p*35,0,TAU*(1-p),72,Color("8edcff",fade*.7),1.5,true)
		return
	# Small physical droplets/embers follow ballistic arcs, with a soft luminous tail.
	var count := Quality.particles(28,16,9) if ultimate else Quality.particles(18,11,7) if tier=="skill" else Quality.particles(12,8,5)
	for index in range(count):
		var seed_value := float(index)*2.399+float(signature.length())*.2
		var direction := Vector2.from_angle(seed_value)
		var speed := (40+float(index%7)*12)*strength
		var offset := direction*p*speed
		var gravity := 18.0 if profile in [1,2] else 4.0
		offset.y += p*p*gravity
		if profile==1: offset.y -= p*38
		if profile==7: offset.y -= p*44
		var at := destination+offset
		var radius := (1.3+float(index%4)*.5)*(1-p)
		var particle_color := Color("ffd29b") if profile==1 and index%3==0 else color
		var previous := at-direction*(3+float(index%5))*fade
		draw_line(previous,at,Color(particle_color,fade*.55),maxf(.5,radius*.7),true)
		_glow(at,radius*1.8,particle_color,fade*.6)
	if profile in [2,7]:
		for ring in range(2):
			var points := PackedVector2Array()
			for i in range(81):
				var a := TAU*float(i)/80
				points.append(destination+Vector2(cos(a),sin(a)*.42)*(24+p*83+ring*11)*strength)
			draw_polyline(points,Color(color,fade*.5),1.2,true)
