extends Panel
signal chosen(index: int)
var index=0
var tween: Tween
var accent=Color("e8c489")
var rest=Vector2.ZERO

func setup(card: Dictionary, number: int, doctrine: bool = false):
 index=number
 size=Vector2(290,350)
 pivot_offset=size/2
 mouse_default_cursor_shape=Control.CURSOR_POINTING_HAND
 accent=Color(card.get("color","e8c489"))
 add_theme_stylebox_override("panel",AtalaiaUI.box(Color("0a202c"),accent.darkened(0.2),9))
 var top=ColorRect.new(); add_child(top); top.position=Vector2(1,1); top.size=Vector2(288,5); top.color=accent; top.mouse_filter=Control.MOUSE_FILTER_IGNORE
 AtalaiaUI.label(self,card.get("tag","DOUTRINA"),Rect2(22,24,246,24),12,accent)
 if doctrine:
  AtalaiaUI.image(self,AtalaiaArt.tower(card.type),Rect2(65,54,160,110))
 else:
  var art=Control.new();art.set_script(preload("res://scripts/card_art.gd"));add_child(art);art.position=Vector2(24,46);art.size=Vector2(242,114);art.id=card.id;art.color=accent;art.mouse_filter=Control.MOUSE_FILTER_IGNORE
 AtalaiaUI.line(self,Vector2(22,166),Vector2(268,167),Color(accent,0.3))
 var heading=AtalaiaUI.label(self,card.name,Rect2(22,180,246,58),21,AtalaiaUI.WHITE,true)
 heading.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 var desc=AtalaiaUI.label(self,card.text,Rect2(22,244,246,74),15,AtalaiaUI.MUTED)
 desc.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 AtalaiaUI.label(self,"TODAS DO TIPO" if doctrine else "ESCOLHER MODIFICADOR",Rect2(22,319,246,20),11,accent)
 mouse_entered.connect(func(): animate(true))
 mouse_exited.connect(func(): animate(false))
 gui_input.connect(func(e):
  if e is InputEventMouseButton and e.pressed and e.button_index==MOUSE_BUTTON_LEFT: chosen.emit(index); accept_event())

func enter(delay: float):
 rest=position
 position.y+=65
 rotation=0.04*(index-1)
 modulate.a=0
 scale=Vector2(0.9,0.9)
 tween=create_tween().set_parallel(true)
 tween.tween_property(self,"position",rest,0.55).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
 tween.tween_property(self,"modulate:a",1.0,0.35).set_delay(delay)
 tween.tween_property(self,"rotation",0.0,0.5).set_delay(delay)
 tween.tween_property(self,"scale",Vector2.ONE,0.5).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func animate(hover: bool):
 if tween and tween.is_running(): tween.kill()
 tween=create_tween().set_parallel(true)
 tween.tween_property(self,"position",rest-Vector2(0,12) if hover else rest,0.18)
 tween.tween_property(self,"scale",Vector2(1.035,1.035) if hover else Vector2.ONE,0.18)
 add_theme_stylebox_override("panel",AtalaiaUI.box(Color("123240") if hover else Color("0a202c"),accent,9))

func consume():
 mouse_filter=Control.MOUSE_FILTER_IGNORE
 if tween and tween.is_running(): tween.kill()
 tween=create_tween().set_parallel(true)
 tween.tween_property(self,"scale",Vector2(1.12,1.12),0.2)
 tween.tween_property(self,"modulate:a",0.0,0.22)
