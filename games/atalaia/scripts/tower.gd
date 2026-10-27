extends Node2D
var data: Dictionary
var selected=false
var time=0.0
var tint=Color.WHITE
var glow_material=CanvasItemMaterial.new()
var placed=false
var destination=Vector2.ZERO
var move_tween: Tween
var displayed_level=1
var upgrade_flash=0.0

func place_at(point: Vector2):
 if not placed:
  placed=true;position=point;destination=point
 elif not destination.is_equal_approx(point):
  destination=point
  if move_tween and move_tween.is_running():move_tween.kill()
  move_tween=create_tween()
  move_tween.tween_property(self,"position",point,0.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)

func configure(t: Dictionary):
 data=t
 displayed_level=int(t.level)
 tint=Color(AtalaiaCatalog.TOWERS[t.type].color)
 glow_material.blend_mode=CanvasItemMaterial.BLEND_MODE_ADD
 var original=AtalaiaArt.tower(t.type)
 var base=$Base
 base.texture=original
 base.scale=Vector2.ONE*104.0/original.get_width()
 base.position=Vector2(0,-43)
 if t.type in ["tesla","ice"]:
  $Gimbal/Head.visible=false
 else:
  var region=AtlasTexture.new()
  region.atlas=original.atlas
  var r: Rect2=original.region
  region.region=Rect2(r.position+Vector2(0,r.size.y*0.45),Vector2(r.size.x,r.size.y*0.55))
  base.texture=region
  base.position=Vector2(0,-14)
  var head=$Gimbal/Head
  head.texture=AtalaiaArt.head(t.type)
  head.scale=Vector2.ONE*82.0/head.texture.get_width()
 $Gimbal.position=Vector2(0,-56)
 modulate=Color(1,1,1,0)
 scale=Vector2(0.92,0.92)
 var tween=create_tween().set_parallel(true)
 tween.tween_property(self,"modulate",Color.WHITE,0.35)
 tween.tween_property(self,"scale",Vector2.ONE,0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func _process(dt):
 if data.is_empty(): return
 time+=dt
 upgrade_flash=maxf(0,upgrade_flash-dt)
 if int(data.level)!=displayed_level:
  displayed_level=int(data.level);upgrade_flash=0.8
 $Gimbal/Head.rotation=data.aim
 $Gimbal/Head.position=Vector2(-data.recoil*4.0,0).rotated(data.aim)
 $Base.scale.y=(104.0/AtalaiaArt.tower(data.type).get_width())*(1.0-data.recoil*0.015)
 queue_redraw()

func _draw():
 if data.is_empty(): return
 draw_set_transform(Vector2(0,3),0,Vector2(1,0.3))
 draw_circle(Vector2.ZERO,39,Color(0.0,0.01,0.02,0.55))
 if upgrade_flash>0:
  draw_arc(Vector2.ZERO,37+(0.8-upgrade_flash)*35,0,TAU,64,Color(tint,upgrade_flash),2,true)
 if selected:
  draw_arc(Vector2.ZERO,44,0,TAU,64,Color("e8bd75"),2.3,true)
  draw_arc(Vector2.ZERO,48,time*0.4,time*0.4+1.4,20,Color("fff1c9"),1.4,true)
 draw_set_transform(Vector2.ZERO)
 if data.recoil>0.15:
  var muzzle=AtalaiaCatalog.muzzle(data,Vector2.ZERO)
  var radius=12.0*data.recoil
  draw_texture_rect(AtalaiaArt.glow(),Rect2(muzzle-Vector2.ONE*radius,Vector2.ONE*radius*2),false,Color(tint,0.75*data.recoil))
 if data.type in ["tesla","ice"]:
  var p=Vector2(0,-76 if data.type=="tesla" else -80)
  var w=41.0+sin(time*2.3)*4.0
  draw_texture_rect(AtalaiaArt.glow(),Rect2(p-Vector2.ONE*w,Vector2.ONE*w*2),false,Color(tint,0.55))
  var direction=Vector2(20,0).rotated(data.aim)*Vector2(1,0.68)
  draw_line(p,p+direction,tint.lightened(0.6),1.5,true)
  draw_circle(p+direction,2.5,tint.lightened(0.6))
 if selected:
  draw_style_box(AtalaiaUI.box(Color("071b24"),Color("ccaa6d"),3),Rect2(-23,12,46,20))
  draw_string(AtalaiaUI.font(),Vector2(-16,27),"T%02d"%data.id,HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("f2d392"))
 for i in range(data.mods.size()):
  var c=AtalaiaCatalog.card(data.mods[i])
  var p=Vector2(-10+i*10,-101)
  draw_circle(p,3.1,Color(c.color))
 var level=int(data.level)
 for i in range(level): draw_circle(Vector2(-((level-1)*5)+i*10,6),2.5,Color("eaca8c"))
