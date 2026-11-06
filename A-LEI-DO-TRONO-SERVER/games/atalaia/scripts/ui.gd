class_name AtalaiaUI
extends RefCounted

static var normal: Font = preload("res://assets/fonts/Interface.ttf")
static var title: Font = preload("res://assets/fonts/Title.ttf")
const GOLD = Color("edc98c")
const WHITE = Color("eef2ef")
const MUTED = Color("9fb4b5")

static func font() -> Font: return normal

static func box(bg: Color = Color("0c191e"), border: Color = Color("34464a"), radius: int = 10) -> StyleBoxFlat:
 var b=StyleBoxFlat.new()
 b.bg_color=bg
 b.border_color=border
 b.set_border_width_all(1)
 b.set_corner_radius_all(radius)
 b.shadow_color=Color(0.0,0.01,0.015,0.24)
 b.shadow_size=5
 b.shadow_offset=Vector2(0,3)
 b.content_margin_left=14
 b.content_margin_right=14
 b.content_margin_top=8
 b.content_margin_bottom=8
 return b

static func panel(parent: Node, rect: Rect2, color: Color = Color("081c27"), border: Color = Color("36515d")) -> Panel:
 var p=Panel.new()
 parent.add_child(p)
 p.position=rect.position; p.size=rect.size
 p.add_theme_stylebox_override("panel",box(color,border))
 return p

static func label(parent: Node, text: String, rect: Rect2, size: int = 16, color: Color = WHITE, serif: bool = false) -> Label:
 var l=Label.new()
 parent.add_child(l)
 l.position=rect.position; l.size=rect.size
 l.text=text
 l.add_theme_font_override("font",title if serif else normal)
 l.add_theme_font_size_override("font_size",size)
 l.add_theme_color_override("font_color",color)
 l.mouse_filter=Control.MOUSE_FILTER_IGNORE
 return l

static func button(parent: Node, text: String, rect: Rect2, callback: Callable, accent: bool = false) -> Button:
 var b=Button.new()
 parent.add_child(b)
 b.position=rect.position; b.size=rect.size
 b.text=text
 b.add_theme_font_override("font",normal)
 b.add_theme_font_size_override("font_size",15)
 b.add_theme_color_override("font_color",Color("211b12") if accent else WHITE)
 b.add_theme_color_override("font_hover_color",Color("211b12") if accent else Color("fff0c9"))
 b.add_theme_color_override("font_disabled_color",Color("647885"))
 b.add_theme_stylebox_override("normal",box(Color("ddb77c") if accent else Color("102b38"),Color("bc985f") if accent else Color("3b5968")))
 b.add_theme_stylebox_override("hover",box(Color("f0d39c") if accent else Color("1a3b48"),GOLD))
 b.add_theme_stylebox_override("pressed",box(Color("c39d64") if accent else Color("254752"),GOLD))
 b.add_theme_stylebox_override("disabled",box(Color("13242c"),Color("2b3b43")))
 b.add_theme_stylebox_override("focus",box(Color(0,0,0,0),Color("f5dcab")))
 b.pressed.connect(callback)
 b.mouse_default_cursor_shape=Control.CURSOR_POINTING_HAND
 return b

static func image(parent: Node, texture: Texture2D, rect: Rect2) -> TextureRect:
 var i=TextureRect.new()
 parent.add_child(i)
 i.position=rect.position; i.size=rect.size
 i.texture=texture
 i.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
 i.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
 i.mouse_filter=Control.MOUSE_FILTER_IGNORE
 return i

static func icon(parent: Node, kind: String, rect: Rect2, color: Color = GOLD) -> Control:
 var node=Control.new()
 node.set_script(preload("res://scripts/hud_icon.gd"))
 node.kind=kind;node.tint=color
 parent.add_child(node)
 node.position=rect.position;node.size=rect.size
 return node

static func meter(parent: Node, rect: Rect2, color: Color) -> ProgressBar:
 var bar=ProgressBar.new()
 parent.add_child(bar)
 bar.position=rect.position;bar.size=rect.size
 bar.show_percentage=false;bar.max_value=1.0
 bar.mouse_filter=Control.MOUSE_FILTER_IGNORE
 var track=StyleBoxFlat.new()
 track.bg_color=Color("1a2c2e");track.set_corner_radius_all(2)
 bar.add_theme_stylebox_override("background",track)
 var fill=StyleBoxFlat.new()
 fill.bg_color=color;fill.set_corner_radius_all(2)
 bar.add_theme_stylebox_override("fill",fill)
 bar.size=rect.size
 return bar

static func line(parent: Node, from: Vector2, to: Vector2, color: Color):
 var n=ColorRect.new()
 parent.add_child(n)
 n.position=from; n.size=to-from; n.color=color
 n.mouse_filter=Control.MOUSE_FILTER_IGNORE
 return n
