extends Node2D
## A bounded silhouette snapshot trails a moving pose; never captures the viewport.
const SHADER = preload("res://shaders/afterimage.gdshader")
var age := 0.0
var duration := 0.28

func snapshot(fighter, color: Color) -> void:
	position = fighter.position + fighter.visual_root.position
	rotation = fighter.visual_root.rotation
	scale = fighter.visual_root.scale
	z_index = -36
	var image := TextureRect.new()
	image.texture = fighter.artwork.texture
	image.position = fighter.artwork.position
	image.size = fighter.artwork.size
	image.flip_h = fighter.artwork.flip_h
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_SCALE
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("spectral_color", Color(color, 0.25))
	for parameter in ["excluded_regions", "exclusion_count"]:
		material.set_shader_parameter(parameter, fighter.material_fx.get_shader_parameter(parameter))
	image.material = material
	add_child(image)

func _process(delta: float) -> void:
	age += delta
	modulate.a = maxf(0, 1 - age / duration)
	if age >= duration: queue_free()
