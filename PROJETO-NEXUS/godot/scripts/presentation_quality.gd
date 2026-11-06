extends Node
## Rendering budget only: never changes battle timings, results or PvP packets.
static var mode := "auto"
static var level := 1 if OS.has_feature("web") else 2
static var noise_map: ImageTexture
var app
var warmup := 2.0
var slow_time := 0.0
var average := 1.0/60.0

static func configure(value: String) -> void:
	mode = value if value in ["auto","high","balanced","light"] else "auto"
	level = {"high":2,"balanced":1,"light":0}.get(mode,1 if OS.has_feature("web") else 2)

static func particles(high: int, balanced: int, light: int) -> int:
	return [light,balanced,high][level]

static func noise_texture() -> Texture2D:
	if noise_map: return noise_map
	var image := Image.create(64,64,false,Image.FORMAT_L8)
	var noise := FastNoiseLite.new()
	noise.seed=1427
	noise.frequency=.13
	for y in range(64):
		for x in range(64):
			var v := noise.get_noise_2d(x,y)*.5+.5
			image.set_pixel(x,y,Color(v,v,v))
	image.generate_mipmaps()
	noise_map=ImageTexture.create_from_image(image)
	return noise_map

func _process(delta: float) -> void:
	if mode!="auto" or level==0 or not is_instance_valid(app) or not app.combat_view.is_visible_in_tree(): return
	if warmup>0:
		warmup-=delta
		return
	average=lerpf(average,minf(delta,.25),.08)
	slow_time=slow_time+minf(delta,.1) if average>.032 else maxf(0,slow_time-delta*.5)
	if slow_time>1.8:
		level-=1
		slow_time=0
		average=1.0/60.0
