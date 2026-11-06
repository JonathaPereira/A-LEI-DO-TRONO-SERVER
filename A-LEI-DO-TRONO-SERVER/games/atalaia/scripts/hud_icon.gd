extends Control

var kind="gold"
var tint=Color("eac47e")

func _ready():
 mouse_filter=Control.MOUSE_FILTER_IGNORE

func _draw():
 var factor=minf(size.x,size.y)/32.0
 draw_set_transform((size-Vector2.ONE*32*factor)*0.5,0,Vector2.ONE*factor)
 match kind:
  "gold":
   draw_circle(Vector2(16,18),12,Color("75502b"))
   draw_circle(Vector2(16,15),12,tint)
   draw_arc(Vector2(16,15),8.5,0,TAU,32,Color("89613a"),1.4,true)
   draw_line(Vector2(16,9),Vector2(16,21),Color("77502c"),2,true)
   draw_line(Vector2(12,12),Vector2(20,12),Color("77502c"),2,true)
   draw_line(Vector2(12,18),Vector2(20,18),Color("77502c"),2,true)
  "core":
   var points=PackedVector2Array([Vector2(16,2),Vector2(27,16),Vector2(16,30),Vector2(5,16)])
   draw_colored_polygon(points,tint.darkened(0.22))
   draw_colored_polygon(PackedVector2Array([Vector2(16,2),Vector2(16,30),Vector2(5,16)]),tint)
   draw_polyline(PackedVector2Array([Vector2(16,2),Vector2(27,16),Vector2(16,30),Vector2(5,16),Vector2(16,2)]),tint.lightened(0.5),1,true)
   draw_line(Vector2(5,16),Vector2(27,16),tint.lightened(0.25),1,true)
  "wave":
   draw_line(Vector2(9,3),Vector2(9,29),tint,2,true)
   draw_colored_polygon(PackedVector2Array([Vector2(10,4),Vector2(28,4),Vector2(23,11),Vector2(28,18),Vector2(10,18)]),tint)
   draw_line(Vector2(4,29),Vector2(17,29),tint,2,true)
  "target":
   draw_arc(Vector2(16,16),11,0,TAU,32,tint,1.5,true)
   draw_arc(Vector2(16,16),5,0,TAU,24,tint,1.5,true)
   draw_line(Vector2(16,1),Vector2(16,8),tint,1.5,true)
   draw_line(Vector2(24,16),Vector2(31,16),tint,1.5,true)
   draw_line(Vector2(16,24),Vector2(16,31),tint,1.5,true)
   draw_line(Vector2(1,16),Vector2(8,16),tint,1.5,true)
