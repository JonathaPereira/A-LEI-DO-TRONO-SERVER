extends Node2D
var data: Dictionary
var age=0.0
var height=50.0
var frame_count=4
var fading=false
var display_health=1.0
var protection_radius=0.0

func configure(e: Dictionary, stage: int):
 data=e
 var art_type: String=AtalaiaCatalog.ENEMIES[e.type].get("art",e.type)
 var frames=AtalaiaArt.enemy_frames(art_type,stage)
 $Walk.sprite_frames=frames
 frame_count=frames.get_frame_count("default")
 height=AtalaiaCatalog.ENEMIES[e.type].size
 display_health=e.hp/e.max_hp
 var reference=AtalaiaArt.row_heights[art_type+str(stage)]
 $Walk.scale=Vector2.ONE*height/reference
 update_frame()

func update_frame():
 var stride={"skeleton":28.0,"wolf":40.0,"spider":25.0,"golem":36.0}.get(data.type,30.0)
 $Walk.frame=posmod(int(data.d/stride*frame_count)+int(data.id),frame_count)
 var texture=$Walk.sprite_frames.get_frame_texture("default",$Walk.frame)
 var float_offset=12.0+sin(age*3.8)*3.0 if data.type=="spirit" else 0.0
 var step_phase=data.d/28.0*TAU
 var bob=absf(sin(step_phase))*1.25 if data.type in ["skeleton","golem","mushroom"] else sin(step_phase)*0.7
 $Walk.position=Vector2(0,-texture.get_height()*$Walk.scale.y*0.5-float_offset+2.0-bob)
 $Walk.flip_h=cos(data.angle)<-0.15
 $Walk.modulate=Color(1.2,1.12,1.02) if data.flash>0 else Color(AtalaiaCatalog.ENEMIES[data.type].get("tint","ffffff"))
 if data.slow_time>0 and data.flash<=0: $Walk.modulate=Color(0.67,0.87,1.12)

func _process(dt):
 if data.is_empty() or fading: return
 age+=dt
 position=data.pos
 display_health=lerpf(display_health,maxf(0,data.hp/data.max_hp),1.0-exp(-dt*9.0))
 update_frame()
 queue_redraw()

func die():
 if fading: return
 fading=true
 protection_radius=0.0
 queue_redraw()
 var tween=create_tween().set_parallel(true)
 tween.tween_property(self,"modulate:a",0.0,0.28)
 tween.tween_property($Walk,"rotation",0.15,0.28)
 tween.tween_property($Walk,"scale",$Walk.scale*Vector2(1.1,0.75),0.28)
 tween.chain().tween_callback(queue_free)

func _draw():
 if data.is_empty(): return
 draw_set_transform(Vector2(0,3),0,Vector2(1,0.28))
 draw_circle(Vector2.ZERO,minf(23,height*0.3),Color(0.0,0.01,0.02,0.6))
 if data.slow_time>0: draw_arc(Vector2.ZERO,19,0,TAU,28,Color(0.5,0.85,1,0.6),2,true)
 draw_set_transform(Vector2.ZERO)
 if data.get("root_time",0.0)>0.0:
  draw_arc(Vector2(0,-7),height*0.35,0,TAU,28,Color("83dbac"),2,true)
  for direction in [-1,1]:
   draw_polyline(PackedVector2Array([Vector2(direction*20,5),Vector2(direction*10,-16),Vector2(direction*18,-32)]),Color("83dbac"),2,true)
 if protection_radius>0.0:draw_arc(Vector2.ZERO,protection_radius,0,TAU,64,Color("eab182b0"),2,true)
 if data.type=="herald":
  draw_arc(Vector2.ZERO,AtalaiaCatalog.ENEMIES.herald.marchRadius,0,TAU,48,Color("d5a7ee83"),2,true)
  var crest:=Vector2(0,-height-17)
  for offset in [0,7]:
   draw_polyline(PackedVector2Array([crest+Vector2(-7,offset+4),crest+Vector2(0,offset-3),crest+Vector2(7,offset+4)]),Color("edc7ff"),2,true)
 if data.get("jam_windup",0.0)>0.0:draw_arc(Vector2(0,-height*0.6),24,0,TAU,36,Color("9ecde7"),2,true)
 if data.type=="sapper":
  var crest:=Vector2(0,-height-21)
  draw_colored_polygon(PackedVector2Array([crest+Vector2(0,-7),crest+Vector2(6,0),crest+Vector2(0,7),crest+Vector2(-6,0)]),Color("b6e8ff"))
  draw_line(crest+Vector2(-3,-3),crest+Vector2(3,3),Color("1e4c66"),1.5,true)
 if data.hp<data.max_hp or data.type=="boss":
  var width=75.0 if data.type=="boss" else 32.0
  draw_rect(Rect2(-width/2,-height-9,width,5),Color("101c20"))
  draw_rect(Rect2(-width/2+1,-height-8,(width-2)*display_health,3),Color("efc188"))
  draw_rect(Rect2(-width/2+1,-height-8,(width-2)*maxf(0.0,data.hp/data.max_hp),3),Color("e87768") if data.type!="boss" else Color("dca973"))
 if not data.dots.is_empty():
  for i in range(mini(3,data.dots.size())):
   draw_circle(Vector2(-8+i*8,-height-13),2,Color("9ed45c") if data.dots[i].tag=="venom" else Color("ffa65a"))
