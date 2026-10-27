extends Control
var id="power"
var color=Color("e8c489")
var time=0.0
func _process(dt):time+=dt;queue_redraw()
func _draw():
 var center=size/2
 draw_texture_rect(AtalaiaArt.glow(),Rect2(center-Vector2(75,64),Vector2(150,128)),false,Color(color,0.17+sin(time*1.6)*0.025))
 draw_set_transform(center)
 draw_arc(Vector2.ZERO,46,0,TAU,60,Color(color,0.17),1,true)
 draw_arc(Vector2.ZERO,51,time*0.12,time*0.12+1.3,24,Color(color,0.45),1,true)
 for i in range(4):
  var p=Vector2(61,0).rotated(i*PI/2)
  draw_circle(p,1.6,Color(color,0.65))
 match id:
  "venom":
   var flask=PackedVector2Array([Vector2(-7,-28),Vector2(7,-28),Vector2(7,-9),Vector2(26,22),Vector2(23,29),Vector2(-23,29),Vector2(-26,22),Vector2(-7,-9),Vector2(-7,-28)])
   draw_polyline(flask,color,2.2,true)
   draw_colored_polygon(PackedVector2Array([Vector2(-13,4),Vector2(13,4),Vector2(23,23),Vector2(20,26),Vector2(-20,26),Vector2(-23,23)]),Color(color,0.65))
   draw_line(Vector2(-11,-30),Vector2(11,-30),color,3,true)
   for i in range(4):draw_circle(Vector2(sin(i*7.0+time)*9,20-fposmod(time*10+i*7,28)),1.8,Color(color,0.9))
  "power","pierce":
   var diamond=PackedVector2Array([Vector2(0,-34),Vector2(18,0),Vector2(0,34),Vector2(-18,0)])
   draw_colored_polygon(diamond,Color(color,0.45));diamond.append(diamond[0]);draw_polyline(diamond,color,2,true)
   draw_line(Vector2(0,-34),Vector2(5,0),color.lightened(0.5),2,true);draw_line(Vector2(5,0),Vector2(0,34),color.lightened(0.4),2,true)
  "rapid":
   draw_arc(Vector2.ZERO,27,-1.3,3.8,48,color,3,true)
   draw_polyline(PackedVector2Array([Vector2(-27,-2),Vector2(-34,-14),Vector2(-18,-10)]),color,2,true)
   draw_line(Vector2.ZERO,Vector2(0,-18),color,2,true);draw_line(Vector2.ZERO,Vector2(14,8),color,2,true)
   for i in range(12):draw_line(Vector2(34,0).rotated(i*TAU/12),Vector2(39,0).rotated(i*TAU/12),Color(color,0.7),2,true)
  "range":
   var eye=PackedVector2Array()
   for i in range(31):var f=i/30.0;eye.append(Vector2(-35+70*f,-sin(f*PI)*22))
   for i in range(30,-1,-1):var f=i/30.0;eye.append(Vector2(-35+70*f,sin(f*PI)*22))
   draw_polyline(eye,color,2,true);draw_circle(Vector2.ZERO,10,Color(color,0.5));draw_circle(Vector2.ZERO,4,color)
  "slow","shatter":
   for i in range(6):
    var angle=i*TAU/6
    draw_line(Vector2.ZERO,Vector2(31,0).rotated(angle),color,2,true)
    draw_line(Vector2(19,0).rotated(angle),Vector2(13,-7).rotated(angle),color,2,true)
    draw_line(Vector2(19,0).rotated(angle),Vector2(13,7).rotated(angle),color,2,true)
  "burn":
   var flame=PackedVector2Array([Vector2(0,-35),Vector2(8,-8),Vector2(19,-17),Vector2(28,11),Vector2(20,28),Vector2(0,34),Vector2(-20,25),Vector2(-25,5),Vector2(-12,-16),Vector2(-11,5)])
   draw_colored_polygon(flame,Color(color,0.6));flame.append(flame[0]);draw_polyline(flame,color,2,true)
  "economy","treasury":
   for i in range(3):
    draw_set_transform(Vector2(size.x/2,size.y/2+18-i*15),0,Vector2(1,0.42));draw_circle(Vector2.ZERO,27,Color(color,0.25));draw_arc(Vector2.ZERO,27,0,TAU,40,color,2,true)
  "hunter":
   draw_arc(Vector2.ZERO,26,0,TAU,48,color,2,true)
   draw_line(Vector2(-39,0),Vector2(39,0),color,1.5,true);draw_line(Vector2(0,-39),Vector2(0,39),color,1.5,true);draw_circle(Vector2.ZERO,5,color)
  _:
   for i in range(3):draw_arc(Vector2.ZERO,12+i*12,0,TAU,48,Color(color,1-i*0.25),2,true)
 draw_set_transform(Vector2.ZERO)
