extends Control
## The actual campaign trio, with painted full-body portraits and calm idle motion.
const Fighter = preload("res://scripts/fighter.gd")
var heroes: Array = []
var colors: Array[Color] = []
var artwork: Array[Texture2D] = []
var motion_enabled := true
var elapsed := 0.0
var font: Font = preload("res://assets/space-grotesk.ttf")
func configure(ids: Array, catalog) -> void:
	heroes.clear()
	colors.clear()
	artwork.clear()
	for id in ids:
		var hero: Dictionary = catalog.hero_by_id[id]
		heroes.append(hero)
		colors.append(catalog.affinity_color(hero.classId))
		artwork.append(Fighter.portrait(int(hero.index),true))
	queue_redraw()
func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(300,365)
func _process(delta: float) -> void:
	if not is_visible_in_tree(): return
	if motion_enabled:
		elapsed += delta
		queue_redraw()
func _draw() -> void:
	if artwork.size() != 3: return
	var floor_y := size.y-38
	var center := Vector2(size.x*.5,floor_y-140)
	for layer in range(8,0,-1):
		draw_circle(center,28+layer*22,Color("3189ad",.012),true,-1,true)
	for index in [1,2,0]:
		var side: int = [0,-1,1][index]
		var height := minf(size.y-52,330.0)*(1.0 if index==0 else .81)
		height *= 1+sin(elapsed*1.7+index)*.006 if motion_enabled else 1.0
		var texture: Texture2D = artwork[index]
		var width: float = minf(height*texture.get_width()/texture.get_height(),size.x*.43)
		var foot := Vector2(size.x*.5+side*size.x*.28,floor_y-(14 if index!=0 else 0))
		draw_set_transform(foot,0,Vector2(1,.15))
		draw_circle(Vector2.ZERO,width*.36,Color(0,0,0,.28),true,-1,true)
		draw_set_transform(Vector2.ZERO)
		var rect := Rect2(foot-Vector2(width*.5,height),Vector2(width,height))
		draw_texture_rect(texture,rect,false,Color.WHITE if index==0 else Color(.84,.9,1,.95))
		draw_line(foot+Vector2(-34,9),foot+Vector2(34,9),Color(colors[index],.65),2,true)
		var title: String = heroes[index].name
		var text_width := font.get_string_size(title,HORIZONTAL_ALIGNMENT_LEFT,-1,16).x
		draw_string(font,foot+Vector2(-text_width*.5,30),title,HORIZONTAL_ALIGNMENT_LEFT,-1,16,Color("ecf4ff"))
