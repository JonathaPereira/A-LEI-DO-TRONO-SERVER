extends Control
## Two stable lanes belong to the recipient: buffs above, debuffs below.
## Pictogram, +/− marker, turn counter and accessible description all convey meaning.
const Combat = preload("res://scripts/combat.gd")
const RulesText = preload("res://scripts/rules_text.gd")
const GREEN := Color("8df1b7")
const RED := Color("ff8b92")
const ICON_SIZE := 25
const GAP := 3
const TYPES := ["guard", "regen", "empower", "fortify", "cover", "mirror", "riposte", "taunt", "emberguard", "sentinel", "elementalWard", "burn", "bleed", "darkmark", "weaken", "expose", "tauntRisk", "focus", "seed"]
static var textures: Dictionary = {}
var entries: Array = []
var badges: Array[Button] = []
var owner_name := ""
var popup: PopupPanel
var revision := ""
var positive_count := 0
var negative_count := 0

static func icon(type: String) -> Texture2D:
	if not textures.has(type): textures[type] = load("res://assets/status/%s.svg" % (type if type in TYPES else "guard"))
	return textures[type]

static func positive(type: String) -> bool:
	return type == "guard" or type in Combat.POSITIVE

static func explanation(type: String) -> String:
	var s: Dictionary = RulesText.rules.status
	return {
		"guard": "Reduz o dano recebido em %s até a próxima ação." % RulesText.percent(1-RulesText.rules.guard.incomingDamageMultiplier),
		"burn": "Perde %s da vida máxima por ativação; ignora escudos." % RulesText.percent(s.burnMaxHpRatio),
		"bleed": "Perde %s da vida por ativação; toda cura recebida é reduzida em %s." % [RulesText.percent(s.bleedMaxHpRatio),RulesText.percent(1-s.bleedHealingMultiplier)],
		"darkmark": "Perde %s da vida por ativação; o autor vivo recupera %s do dano real." % [RulesText.percent(s.darkmarkMaxHpRatio),RulesText.percent(s.darkmarkDrainRatio)],
		"weaken": "Ataque reduzido em %s." % RulesText.percent(1-s.weakenAttackMultiplier),
		"expose": "Defesa reduzida em %s." % RulesText.percent(1-s.exposeDefenseMultiplier),
		"focus": "O próximo golpe inimigo causa %s mais dano e consome este selo." % RulesText.percent(s.focusDamageMultiplier-1),
		"seed": "O próximo adversário a atingir este personagem recupera %s da própria vida máxima e consome a Semente." % RulesText.percent(s.seedHealMaxHpRatio),
		"regen": "Recupera %s da vida máxima por ativação, respeitando reduções de cura." % RulesText.percent(s.regenMaxHpRatio),
		"empower": "Ataque aumentado em %s." % RulesText.percent(s.empowerAttackMultiplier-1),
		"fortify": "Recebe %s menos dano direto." % RulesText.percent(1-s.fortifyIncomingDamageMultiplier),
		"cover": "Um protetor vivo recebe %s dos golpes individuais. Área atinge normalmente." % RulesText.percent(s.coverRedirectRatio),
		"mirror": "Reflete %s do dano direto sofrido à vida. Não encadeia reações." % RulesText.percent(s.mirrorDamageRatio),
		"riposte": "Responde ao golpe com %s do ataque. Não encadeia reações." % RulesText.percent(s.riposteAttackRatio),
		"taunt": "Atrai ataques individuais. Ataques em área continuam atingindo a equipe.",
		"tauntRisk": "Defesa do provocador reduzida em %s enquanto provoca. Custo da postura; não pode ser purificado separadamente." % RulesText.percent(1-s.tauntDefenseMultiplier),
		"emberguard": "Aplica queimadura em quem atacar diretamente este personagem.",
		"sentinel": "Enfraquece o agressor depois de um golpe direto.",
		"elementalWard": "Recebe %s menos dano direto quando o atacante tem vantagem de afinidade." % RulesText.percent(1-s.elementalWardIncomingMultiplier),
	}.get(type, "Consulte a descrição da habilidade.")

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	clip_contents = false

func configure(statuses: Array, guarding: bool, hero_name: String, defeated := false) -> void:
	var next: Array = []
	if not defeated:
		if guarding: next.append({"type":"guard","turns":0})
		for status in statuses:
			next.append(status.duplicate(true))
			if status.type == "taunt" and not statuses.any(func(s): return s.type == "tauntRisk"): next.append({"type":"tauntRisk","turns":status.turns})
	var key := JSON.stringify(next) + hero_name
	if key == revision: return
	# Do not leave an inspection showing an effect removed by an in-flight action.
	if is_instance_valid(popup) and popup.visible: popup.hide()
	revision = key
	owner_name = hero_name
	entries = next
	_rebuild()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree(): _rebuild()

func _rebuild() -> void:
	for child in get_children():
		if child == popup: continue
		remove_child(child)
		child.queue_free()
	badges.clear()
	positive_count = entries.filter(func(e): return positive(e.type)).size()
	negative_count = entries.size()-positive_count
	if entries.is_empty():
		var empty := Label.new()
		empty.text = "SEM ESTADOS"
		empty.add_theme_font_size_override("font_size",9)
		empty.add_theme_color_override("font_color",Color("6d819c"))
		empty.mouse_filter = MOUSE_FILTER_IGNORE
		empty.position = Vector2(2,12)
		add_child(empty)
		return
	for lane in range(2):
		var buff := lane == 0
		var items: Array = entries.filter(func(e): return positive(e.type) == buff)
		if items.is_empty(): continue
		var capacity := maxi(2,int((size.x+GAP)/(ICON_SIZE+GAP)))
		var shown := mini(items.size(),capacity)
		var overflow := items.size() > capacity
		var visible_items := shown-1 if overflow else shown
		for index in range(shown):
			var more := overflow and index == shown-1
			var item: Dictionary = items[index] if not more else {}
			var color := GREEN if buff else RED
			var button := Button.new()
			button.name = ("buffs-more" if buff else "debuffs-more") if more else item.type
			button.position = Vector2(index*(ICON_SIZE+GAP),lane*(ICON_SIZE+2))
			button.size = Vector2.ONE*ICON_SIZE
			button.mouse_filter = MOUSE_FILTER_STOP
			button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
			button.focus_mode = FOCUS_ALL
			button.tooltip_text = _lane_text(items,buff) if more else _detail(item)
			button.pressed.connect(show_details.bind("" if more else str(item.type)))
			var normal := StyleBoxFlat.new()
			normal.bg_color = Color("102b23") if buff else Color("351b29")
			normal.border_color = color.darkened(.5)
			normal.set_border_width_all(1)
			normal.set_corner_radius_all(5)
			var hover: StyleBoxFlat = normal.duplicate()
			hover.border_color = color
			hover.bg_color = normal.bg_color.lightened(.1)
			button.add_theme_stylebox_override("normal",normal)
			button.add_theme_stylebox_override("hover",hover)
			button.add_theme_stylebox_override("pressed",hover)
			button.add_theme_stylebox_override("focus",hover)
			add_child(button)
			badges.append(button)
			if more:
				button.text = "+%d" % (items.size()-visible_items)
				button.add_theme_color_override("font_color",color)
				button.add_theme_font_size_override("font_size",11)
				continue
			var glyph := TextureRect.new()
			glyph.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			glyph.texture = icon(item.type)
			glyph.position = Vector2(4,3)
			glyph.size = Vector2(17,17)
			glyph.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			glyph.modulate = color
			glyph.mouse_filter = MOUSE_FILTER_IGNORE
			button.add_child(glyph)
			var duration := Label.new()
			duration.text = str(int(item.turns)) if int(item.turns) > 0 else "•"
			duration.add_theme_font_size_override("font_size",10)
			duration.add_theme_color_override("font_color",Color.WHITE)
			duration.add_theme_color_override("font_outline_color",Color("06101b"))
			duration.add_theme_constant_override("outline_size",4)
			duration.position = Vector2(17,11)
			duration.mouse_filter = MOUSE_FILTER_IGNORE
			button.add_child(duration)
			var sign := Label.new()
			sign.text = "+" if buff else "−"
			sign.position = Vector2(1,-4)
			sign.add_theme_font_size_override("font_size",9)
			sign.add_theme_color_override("font_color",color)
			sign.mouse_filter = MOUSE_FILTER_IGNORE
			button.add_child(sign)

func _detail(item: Dictionary) -> String:
	var kind := "BUFF +" if positive(item.type) else "DEBUFF −"
	var duration := "%d turno(s) pessoal(is) restante(s)" % int(item.turns) if int(item.turns) > 0 else "Até o fim desta ação" if item.type != "guard" else "Até o próximo turno"
	return "%s · %s\n%s\n%s\n%s" % [kind,RulesText.status_names().get(item.type,"Postura defensiva"),owner_name,explanation(item.type),duration]

func _lane_text(items: Array, buff: bool) -> String:
	return ("BUFFS +\n" if buff else "DEBUFFS −\n") + "\n\n".join(items.map(func(e): return _detail(e)))

func show_details(selected_type := "") -> void:
	if entries.is_empty(): return
	if is_instance_valid(popup): popup.queue_free()
	popup = PopupPanel.new()
	popup.name = "StatusDetails"
	popup.max_size = Vector2i(420,520)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("0b1729")
	style.border_color = GREEN if selected_type == "" or positive(selected_type) else RED
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(16)
	popup.add_theme_stylebox_override("panel",style)
	add_child(popup)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(360,240)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	popup.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation",10)
	scroll.add_child(column)
	for item in entries:
		if selected_type != "" and item.type != selected_type: continue
		var label := Label.new()
		label.text = _detail(item)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.add_theme_font_size_override("font_size",14)
		label.add_theme_color_override("font_color",GREEN if positive(item.type) else RED)
		column.add_child(label)
	var close := Button.new()
	close.text = "Fechar · Esc"
	close.pressed.connect(func(): popup.hide())
	column.add_child(close)
	column.move_child(close,0)
	popup.popup_centered(Vector2i(400,320))
	close.grab_focus()
