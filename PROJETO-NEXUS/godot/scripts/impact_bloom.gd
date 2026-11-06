extends Node2D
## Four painted stages are cross-faded; this is a sprite animation, not an extra hit.
const ATLAS = preload("res://assets/vfx/elemental-impact.png")
static var regions: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/impact-frames.json"))
var element := "fire"
var duration := .68
var elapsed := 0.0
var extent := 208.0
var critical := false
var sprites: Array[Sprite2D] = []
var frames: Array[AtlasTexture] = []
var generation := -1

static func element_for(hero: Dictionary) -> String:
	return "water" if hero.get("animation") == "runes" else {"igneo":"fire","natural":"nature","tecnico":"arcane","arcano":"arcane","sombrio":"shadow"}.get(hero.classId,"arcane")

func _ready() -> void:
	for bounds in regions[element]:
		var frame := AtlasTexture.new()
		frame.atlas = ATLAS
		frame.region = Rect2(bounds[0],bounds[1],bounds[2],bounds[3])
		frame.filter_clip = true
		frames.append(frame)
	for index in range(2):
		var sprite := Sprite2D.new()
		sprite.texture = frames[0]
		sprite.offset.y = -frames[0].get_height()*{"fire":.13,"water":.12,"nature":.12,"arcane":.03,"shadow":-.03}.get(element,0)
		sprite.scale = Vector2.ONE*extent/frames[0].get_width()
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		add_child(sprite)
		sprites.append(sprite)
	_update_frame()

func _update_frame() -> void:
	var p := clampf(elapsed/duration,0,1)
	var frame_position := minf(p*4.6,3.0)
	var index := mini(2,int(frame_position))
	var blend := smoothstep(0,1,frame_position-index)
	sprites[0].texture = frames[index]
	sprites[1].texture = frames[index+1]
	var opacity := (1-smoothstep(.65,1,p))*.9
	for i in range(2):
		sprites[i].modulate.a = opacity*((1-blend) if i==0 else blend)
		sprites[i].scale = Vector2.ONE*extent/frames[0].get_width()*(.88+sin(minf(p*2,1)*PI*.5)*.18)
	queue_redraw()

func _process(delta: float) -> void:
	elapsed += delta
	_update_frame()
	if elapsed >= duration: queue_free()

func _draw() -> void:
	var p := clampf(elapsed/duration,0,1)
	if critical and p < .15:
		var fade := 1-p/.15
		for angle in [-.4,PI*.5-.4]:
			var axis := Vector2.from_angle(angle)
			draw_line(-axis*extent*.38,axis*extent*.38,Color(1,.93,.78,fade*.8),3,true)
