extends RefCounted
## Presentation only. Gameplay values live in src/kits.js and src/balance.json.
const ACCENT := Color("67e8f9")
const MUTED := Color("9eafca")
const HEADING = preload("res://assets/space-grotesk.ttf")
const BODY = preload("res://assets/manrope.ttf")

static func panel(color: Color, border := Color("263d59")) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(12)
	box.corner_detail = 8
	box.content_margin_left = 10
	box.content_margin_right = 10
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	return box

static func build() -> Theme:
	var result := Theme.new()
	var body := FontVariation.new()
	body.base_font = BODY
	body.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 550.0}
	var heading := FontVariation.new()
	heading.base_font = HEADING
	heading.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 600.0}
	result.default_font = body
	result.default_font_size = 15
	result.set_color("font_color", "Label", Color("edf5ff"))
	for type in ["Button", "OptionButton"]:
		result.set_font("font", type, heading)
		result.set_color("font_color", type, Color("e6f1ff"))
		result.set_color("font_hover_color", type, Color.WHITE)
		result.set_color("font_pressed_color", type, ACCENT)
		result.set_color("font_disabled_color", type, Color("6b819d"))
		result.set_stylebox("normal", type, panel(Color("11243a"), Color("2a4663")))
		result.set_stylebox("hover", type, panel(Color("17344d"), ACCENT))
		result.set_stylebox("pressed", type, panel(Color("143749"), ACCENT))
		result.set_stylebox("disabled", type, panel(Color("0a1829"), Color("1d3046")))
		result.set_stylebox("focus", type, panel(Color(0, 0, 0, 0), Color("c8f8ff")))
	result.set_stylebox("panel", "PanelContainer", panel(Color("0b1728f5")))
	result.set_stylebox("panel", "AcceptDialog", panel(Color("0b1728"), Color("447694")))
	result.set_stylebox("panel", "PopupMenu", panel(Color("0b1728"), Color("447694")))
	result.set_stylebox("panel", "TabContainer", panel(Color("0a1729"), Color("2c4663")))
	for type in ["TabContainer", "TabBar"]:
		result.set_font("font", type, heading)
		result.set_color("font_selected_color", type, ACCENT)
		result.set_color("font_unselected_color", type, MUTED)
		result.set_stylebox("tab_selected", type, panel(Color("153347"), ACCENT))
		result.set_stylebox("tab_unselected", type, panel(Color("0d1d30"), Color("263e59")))
	result.set_constant("separation", "VBoxContainer", 10)
	result.set_constant("separation", "HBoxContainer", 12)
	result.set_constant("h_separation", "GridContainer", 10)
	result.set_constant("v_separation", "GridContainer", 10)
	return result
