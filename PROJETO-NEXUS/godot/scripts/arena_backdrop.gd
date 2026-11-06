extends Control
## Animated painted stages. No combat rules or save-game changes live here.
const ATMOSPHERE = preload("res://shaders/stage_atmosphere.gdshader")
const SCREEN_FX = preload("res://shaders/screen_impact.gdshader")
const Quality = preload("res://scripts/presentation_quality.gd")
const GLOW = preload("res://assets/vfx/soft-glow.svg")
var elapsed := 0.0
var motion_enabled := true
var encounter_kind := 0:
	set(value):
		encounter_kind = value
		if is_node_ready(): _set_environment()
var painting: TextureRect
var atmosphere: ShaderMaterial
var screen: ColorRect
var screen_material: ShaderMaterial
var pulse_time := 1.0
var theme_kind := 0
var accent := Color("79ceef")
var last_quality := -1
var pulse_at := Vector2.ZERO
var pulse_tint := Color.WHITE

func floor_line() -> float: return size.y*0.30
func configure(_units: Array, _catalog) -> void: pass
func sync_units(_units: Array) -> void: pass
func select_unit(_actor: String, _target: String) -> void: pass
func cancel() -> void:
	pulse_time = 1
	if is_instance_valid(screen): screen.hide()

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	painting = TextureRect.new()
	painting.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	painting.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	painting.stretch_mode = TextureRect.STRETCH_SCALE
	painting.mouse_filter = MOUSE_FILTER_IGNORE
	painting.show_behind_parent = true
	atmosphere = ShaderMaterial.new()
	atmosphere.shader = ATMOSPHERE
	painting.material = atmosphere
	add_child(painting)
	# Screen distortion sits above bodies and VFX, below fixed resource cards.
	screen = ColorRect.new()
	screen.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	screen.mouse_filter = MOUSE_FILTER_IGNORE
	screen.z_index = 45
	screen_material = ShaderMaterial.new()
	screen_material.shader = SCREEN_FX
	screen.material = screen_material
	add_child(screen)
	screen.hide()
	_set_environment()

func _set_environment() -> void:
	theme_kind = clampi(int(encounter_kind/3.0),0,2)
	accent = [Color("79ceef"),Color("70dfd7"),Color("f7ae79")][theme_kind]
	var paths := ["res://assets/nexus-sanctum.png","res://assets/environments/tidal-observatory.png","res://assets/environments/last-foundry.png"]
	painting.texture = load(paths[theme_kind]) if ResourceLoader.exists(paths[theme_kind]) else preload("res://assets/arena.png")
	atmosphere.set_shader_parameter("theme_kind",theme_kind)
	atmosphere.set_shader_parameter("accent",accent)

func screen_impact(at: Vector2, color: Color, supreme: bool) -> void:
	if not motion_enabled: return
	pulse_time = 0
	pulse_at=at
	pulse_tint=color
	screen_material.set_shader_parameter("progress",0.0)
	screen_material.set_shader_parameter("focus",at/size.max(Vector2.ONE))
	screen_material.set_shader_parameter("tint",color)
	screen_material.set_shader_parameter("strength",0.60 if supreme else 0.28)
	# Screen reads/chromatic distortion are reserved for high-quality supremes.
	screen.visible = supreme and Quality.level==2

func _process(delta: float) -> void:
	if not is_visible_in_tree(): return
	if last_quality!=Quality.level:
		last_quality=Quality.level
		painting.material=atmosphere if last_quality==2 else null
	if motion_enabled: elapsed += delta
	atmosphere.set_shader_parameter("clock",elapsed)
	if screen.visible:
		pulse_time += delta/0.55
		screen_material.set_shader_parameter("progress",minf(1,pulse_time))
		if pulse_time >= 1 or not motion_enabled: screen.hide()
	elif pulse_time<1: pulse_time=minf(1,pulse_time+delta/.4)
	queue_redraw()

func _draw() -> void:
	if pulse_time<1 and motion_enabled and Quality.level<2:
		var glow_size := Vector2.ONE*(110+pulse_time*120)
		draw_texture_rect(GLOW,Rect2(pulse_at-glow_size*.5,glow_size),false,Color(pulse_tint,(1-pulse_time)*.24))
	# Feathered fog and embers form a separate moving layer over the painting.
	for i in range(Quality.particles(32,18,10)):
		var x := fposmod(i*137.91+sin(elapsed*.16+i)*22,maxf(1,size.x))
		var y := fposmod(i*53.73-elapsed*(6+i%5)*(1.7 if theme_kind==2 else .7),maxf(1,size.y))
		var opacity := (.08+sin(elapsed*.8+i)*.04)*(0.5+0.5*sin(float(i)))
		var at := Vector2(x,y)
		var radius := .8+float(i%3)*.45
		draw_circle(at,radius*3,Color(accent,opacity*.10),true,-1,true)
		draw_circle(at,radius,Color(accent,opacity),true,-1,true)
	if theme_kind == 1:
		for index in range(12):
			var x := fposmod(index*191.0+elapsed*19,maxf(1,size.x))
			var y := fposmod(index*73.0+elapsed*84,maxf(1,size.y))
			draw_line(Vector2(x,y),Vector2(x-2,y+13),Color("b6e8ef",.10),.7,true)
