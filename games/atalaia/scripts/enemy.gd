extends Node2D
var data: Dictionary
var age=0.0
var height=50.0
var frame_count=4
var fading=false

func configure(e: Dictionary, stage: int):
 data=e
 var frames=AtalaiaArt.enemy_frames(e.type,stage)
 $Walk.sprite_frames=frames
 frame_count=frames.get_frame_count("default")
 height=AtalaiaCatalog.ENEMIES[e.type].size
 var reference=AtalaiaArt.row_heights[e.type+str(stage)]
 $Walk.scale=Vector2.ONE*height/reference
 update_frame()

func update_frame():
 var stride={"skeleton":28.0,"wolf":40.0,"spider":25.0,"golem":36.0}.get(data.type,30.0)
 $Walk.frame=posmod(int(data.d/stride*frame_count)+int(data.id),frame_count)
 var texture=$Walk.sprite_frames.get_frame_texture("default",$Walk.frame)
 var float_offset=12.0+sin(age*3.8)*3.0 if data.type=="spirit" else 0.0
 $Walk.position=Vector2(0,-texture.get_height()*$Walk.scale.y*0.5-float_offset+2.0)
 $Walk.flip_h=cos(data.angle)<-0.15
 $Walk.modulate=Color(1.6,1.45,1.25) if data.flash>0 else Color.WHITE
 if data.slow_time>0 and data.flash<=0: $Walk.modulate=Color(0.67,0.87,1.12)

func _process(dt):
 if data.is_empty() or fading: return
 age+=dt
 position=data.pos
 update_frame()
 queue_redraw()

func die():
 if fading: return
 fading=true
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
 if data.hp<data.max_hp or data.type=="boss":
  var width=75.0 if data.type=="boss" else 32.0
  draw_rect(Rect2(-width/2,-height-8,width,4),Color("04131a"))
  draw_rect(Rect2(-width/2+1,-height-7,(width-2)*maxf(0.0,data.hp/data.max_hp),2),Color("e87768") if data.type!="boss" else Color("dca973"))
 if not data.dots.is_empty():
  for i in range(mini(3,data.dots.size())):
   draw_circle(Vector2(-8+i*8,-height-13),2,Color("9ed45c") if data.dots[i].tag=="venom" else Color("ffa65a"))
