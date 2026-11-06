extends Button
const Glyph = preload("res://scripts/glyph.gd")
const Art = preload("res://scripts/ability_art.gd")
var kind_label: Label
var name_label: Label
var cost_label: Label
var glyph: Control
var illustration: TextureRect
var scope_label: Label
var icon_frame: PanelContainer
var tint := Color.WHITE
var available := true
var reason := ""
var action_id := "basic"

func _ready() -> void:
	toggle_mode = true
	clip_contents = true
	custom_minimum_size = Vector2(0, 104)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right"]: margin.add_theme_constant_override("margin_" + side, 9)
	for side in ["top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 7)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 3)
	margin.add_child(column)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 5)
	header.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(header)
	glyph = Glyph.new()
	glyph.custom_minimum_size = Vector2(14, 14)
	header.add_child(glyph)
	kind_label = _label(11)
	kind_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kind_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(kind_label)
	scope_label = _label(10)
	scope_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	scope_label.add_theme_color_override("font_color", Color("9aafc7"))
	header.add_child(scope_label)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 9)
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(body)
	icon_frame = PanelContainer.new()
	icon_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_frame.custom_minimum_size = Vector2(54, 54)
	var icon_style := StyleBoxFlat.new()
	icon_style.bg_color = Color("071323")
	icon_style.border_color = Color("31516d")
	icon_style.set_border_width_all(1)
	icon_style.set_corner_radius_all(6)
	icon_style.set_content_margin_all(2)
	icon_frame.add_theme_stylebox_override("panel", icon_style)
	body.add_child(icon_frame)
	illustration = TextureRect.new()
	illustration.custom_minimum_size = Vector2(50, 50)
	illustration.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	illustration.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	illustration.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_frame.add_child(illustration)
	name_label = _label(15)
	if ResourceLoader.exists("res://assets/space-grotesk.ttf"):
		name_label.add_theme_font_override("font", load("res://assets/space-grotesk.ttf"))
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.max_lines_visible = 2
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	body.add_child(name_label)
	cost_label = _label(12)
	cost_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(cost_label)

func _label(font_size: int) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", font_size)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func configure(action: Dictionary, id: String, shortcut: int, color: Color, energy: int, cooldown: int, interactive: bool, hero_index: int = 0) -> void:
	action_id = id
	tint = color
	available = energy >= action.cost and cooldown <= 0
	disabled = not interactive
	reason = ""
	if cooldown > 0: reason = "Disponível em %d turno(s) deste herói." % cooldown
	elif energy < action.cost: reason = "Faltam %d de energia." % (int(action.cost) - energy)
	kind_label.text = "%d  %s" % [shortcut, {"basic": "ATAQUE", "skill": "TÉCNICA", "ultimate": "SUPREMO", "guard": "DEFESA"}[id]]
	kind_label.add_theme_color_override("font_color", color.lightened(0.15))
	scope_label.text = _scope(action.kind)
	name_label.text = action.name
	name_label.tooltip_text = action.name
	illustration.texture = Art.icon(hero_index, id)
	illustration.visible = true
	illustration.modulate = Color.WHITE if available else Color("a5b1c4")
	name_label.add_theme_color_override("font_color", Color("f3f8ff") if available else Color("a8b8cb"))
	cost_label.text = "+%d ENERGIA" % int(action.get("energyGain", 24)) if id == "basic" else ("+%d EN · ESCUDO" % int(action.get("energyGain", 25)) if id == "guard" else "%d ENERGIA" % action.cost)
	if id in ["skill", "ultimate"] and int(action.get("cooldown", 0)) > 0:
		cost_label.text += " · REC %dT" % int(action.cooldown)
	if cooldown > 0: cost_label.text = "%d EN · RECARGA %dT" % [int(action.cost), cooldown]
	elif energy < action.cost: cost_label.text += " · faltam %d" % (int(action.cost) - energy)
	cost_label.add_theme_color_override("font_color", Color("b3d5e4") if available else Color("ffc78f"))
	glyph.symbol = id if id in ["basic", "guard", "ultimate"] else "arcano"
	glyph.tint = color
	glyph.queue_redraw()
	tooltip_text = action.name + "\n" + action.description + "\nAlvo: " + scope_label.text.to_lower() + ("\nRecarga contada nas ações deste herói." if int(action.get("cooldown", 0)) > 0 else "") + ("\n" + reason if not reason.is_empty() else "")
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("101c2d")
	normal.border_color = color.darkened(0.56)
	normal.set_border_width_all(1)
	normal.border_width_top = 2
	normal.set_corner_radius_all(9)
	normal.shadow_color = Color(0, 0, 0, 0.22)
	normal.shadow_size = 3
	normal.shadow_offset = Vector2(0, 2)
	var selected: StyleBoxFlat = normal.duplicate()
	selected.bg_color = Color("122b3c").lerp(color.darkened(0.82), 0.25)
	selected.border_color = color.lightened(0.12)
	selected.set_border_width_all(2)
	selected.shadow_color = Color(color, 0.14)
	selected.shadow_size = 5
	var hover: StyleBoxFlat = normal.duplicate()
	hover.bg_color = Color("1b3048")
	hover.border_color = color.lightened(0.1)
	var focus: StyleBoxFlat = selected.duplicate()
	focus.bg_color = Color(0, 0, 0, 0)
	focus.border_color = Color("dff7ff")
	add_theme_stylebox_override("normal", normal)
	add_theme_stylebox_override("disabled", normal)
	add_theme_stylebox_override("pressed", selected)
	add_theme_stylebox_override("hover_pressed", selected)
	add_theme_stylebox_override("hover", hover)
	add_theme_stylebox_override("focus", focus)
	var art_style: StyleBoxFlat = icon_frame.get_theme_stylebox("panel")
	art_style.border_color = color.darkened(0.3)
	queue_redraw()

func _scope(kind: String) -> String:
	if kind == "guard": return "VOCÊ"
	if kind == "aoe": return "ÁREA"
	if kind.ends_with("All"): return "EQUIPE"
	if kind.begins_with("heal") or kind.begins_with("shield") or kind.begins_with("support"): return "ALIADO"
	return "1 INIMIGO"
