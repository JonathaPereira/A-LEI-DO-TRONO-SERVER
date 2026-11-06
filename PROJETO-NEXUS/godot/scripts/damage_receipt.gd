extends Control
## Presentation only: every amount and applied effect comes from combat receipts.
## Use configure_events for complete attack detail; configure keeps the 2D director compatible.
const StatusStrip = preload("res://scripts/status_strip.gd")
const RulesText = preload("res://scripts/rules_text.gd")
const Combat = preload("res://scripts/combat.gd")
const WIDTH := 236.0
const POSITIVE_COLOR := Color("8de3bd")
const NEGATIVE_COLOR := Color("ffac9d")
const SHIELD_COLOR := Color("8edcff")
const MUTED_COLOR := Color("a6b9cf")
const SHORT_NAMES := {"darkmark": "Marca obscura", "elementalWard": "Égide elemental", "sentinel": "Sentinela", "burn": "Queimadura", "bleed": "Sangramento", "regen": "Regeneração", "weaken": "Enfraquecimento", "expose": "Exposição", "empower": "Fortalecimento", "fortify": "Fortificação", "cover": "Proteção", "mirror": "Espelho", "riposte": "Contra-ataque", "taunt": "Provocação", "emberguard": "Guarda de brasas", "focus": "Marca de foco", "seed": "Semente"}
var lines: Array = []
var target_name := ""
var action_name := ""
var shield_capacity := 0
var shield_remaining := -1
var accent := Color("ffb49d")
var lifetime := 2.65
var elapsed := 0.0
var rows: Array = []
var font: Font
var critical := false
var protected := false
var content_height := 0.0
var event_details := false
var compact_area := false

static func _detail(text: String, color := MUTED_COLOR) -> Dictionary:
	return {"kind": "detail", "text": text, "color": color, "height": 17.0}

static func _metric(value: String, label: String, color: Color, hits := 1, components: Array = []) -> Dictionary:
	var amount := value.replace("−", "-").to_int()
	return {"kind": "metric", "value": value, "amount": amount, "hits": hits, "components": components.duplicate() if not components.is_empty() else [amount], "text": label, "color": color, "height": 34.0}

static func _coalesce_passive_heals(events: Array) -> Array:
	var grouped: Array = []
	var sources := {}
	for raw in events:
		if not raw is Dictionary: continue
		var event: Dictionary = raw.duplicate(true)
		if event.get("type", "") == "heal" and event.get("passive", false) and not event.has("remaining"):
			# Only equal-source, equal-penalty heals from this attack share a total.
			# Keep every component and the hit count; original event_lines remain exact.
			var key := "%s/%s/%d" % [event.get("target", ""), event.get("source", ""), int(event.get("healingPenalty", 0))]
			if sources.has(key):
				var previous: Dictionary = grouped[int(sources[key])]
				previous.amount = int(previous.amount) + int(event.get("amount", 0))
				previous.receipt_hits += 1
				previous.receipt_components.append(int(event.get("amount", 0)))
				continue
			sources[key] = grouped.size()
			event.receipt_hits = 1
			event.receipt_components = [int(event.get("amount", 0))]
		grouped.append(event)
	return grouped

static func _compact_rows(value: Array) -> Array:
	var result: Array = []
	var repeated := {}
	for original in value:
		var row: Dictionary = original.duplicate(true)
		if row.kind == "metric": row.height = 30.0
		# Statuses keep their own names, polarity and final applied durations.
		if row.kind == "status":
			result.append(row)
			continue
		var key := str(row.kind) + "/" + str(row.text)
		if row.kind == "metric" and row.text in ["DANO À VIDA", "VIDA PROTEGIDA"]: key = "metric/DANO À VIDA"
		if repeated.has(key):
			var previous: Dictionary = result[int(repeated[key])]
			previous.hits = int(previous.get("hits", 1)) + int(row.get("hits", 1))
			if row.kind == "metric":
				previous.amount += int(row.amount)
				previous.value = ("−" if int(previous.amount) < 0 else "+") + str(absi(int(previous.amount)))
				previous.components.append_array(row.components)
				if key == "metric/DANO À VIDA":
					previous.value = "−" + str(absi(int(previous.amount)))
					previous.text = "DANO À VIDA" if int(previous.amount) < 0 else "VIDA PROTEGIDA"
					previous.color = NEGATIVE_COLOR if int(previous.amount) < 0 else SHIELD_COLOR
			continue
		repeated[key] = result.size()
		result.append(row)
	return result

static func _effect_row(effect: String, turns: int) -> Dictionary:
	var positive: bool = effect in Combat.POSITIVE
	var descriptions := RulesText.status_names()
	var status: Dictionary = RulesText.rules.status
	descriptions.merge({
		"darkmark": RulesText.percent(status.darkmarkMaxHpRatio) + " vida · dreno " + RulesText.percent(status.darkmarkDrainRatio),
		"elementalWard": "Vantagem: dano −" + RulesText.percent(1.0 - float(status.elementalWardIncomingMultiplier)),
		"sentinel": "Agressor: ataque −" + RulesText.percent(1.0 - float(status.weakenAttackMultiplier)),
		"burn": RulesText.percent(status.burnMaxHpRatio) + " vida por ativação",
		"bleed": RulesText.percent(status.bleedMaxHpRatio) + " vida · cura −" + RulesText.percent(1.0 - float(status.bleedHealingMultiplier)),
		"regen": "+" + RulesText.percent(status.regenMaxHpRatio) + " vida por ativação",
		"cover": "Desvia " + RulesText.percent(status.coverRedirectRatio) + " ao protetor",
		"mirror": "Reflete " + RulesText.percent(status.mirrorDamageRatio) + " do dano",
		"riposte": "Revida com " + RulesText.percent(status.riposteAttackRatio) + " ATQ",
		"taunt": "Atrai golpes individuais", "emberguard": "Queima quem ataca",
		"seed": "Atacante cura " + RulesText.percent(status.seedHealMaxHpRatio) + " da vida",
	}, true)
	return {"kind": "status", "effect": effect, "text": str(SHORT_NAMES.get(effect, effect)), "description": str(descriptions.get(effect, effect)), "positive": positive, "turns": turns, "color": POSITIVE_COLOR if positive else NEGATIVE_COLOR, "height": 38.0}

## Stable text tuples are shared with combat instrumentation and the old gallery.
## Keep exact labels while the detailed window uses structured metric/status rows.
static func event_lines(events: Array) -> Array:
	var result: Array = []
	for raw in events:
		if not raw is Dictionary: continue
		var event: Dictionary = raw
		if event.has("lines"):
			result.append_array(event.lines.duplicate(true))
			continue
		if event.get("reaction", false): result.append(["CONTRA-ATAQUE", "d6bdff", 12])
		if event.get("intercepted", false): result.append(["PROTETOR", "85dcff", 12])
		if event.has("combo"): result.append(["COMBO!", "ffd17a", 15])
		if event.get("critical", false): result.append(["CRÍTICO!", "ffd17a", 22])
		var amount := int(event.get("amount", 0))
		match str(event.get("type", "")):
			"damage":
				result.append(["−%d VIDA" % amount if amount > 0 else "VIDA PROTEGIDA", "ffc5b3", 21 if amount > 0 else 15])
				if int(event.get("absorbed", 0)) > 0:
					result.append(["−%d ESCUDO" % int(event.absorbed), "85dcff", 20])
					result.append(["QUEBRADO · resta 0" if int(event.get("shieldAfter", 0)) == 0 else "Escudo restante: %d" % int(event.shieldAfter), "85dcff", 12])
				var advantage := float(event.get("advantage", 1.0))
				if not is_equal_approx(advantage, 1.0): result.append([RulesText.relationship(advantage).to_upper(), "ffbe9b" if advantage > 1.0 else "9fdcff", 11])
			"heal": result.append(["+%d VIDA" % amount, "a1e6b3", 20])
			"shieldExpired":
				result.append(["ESCUDO EXPIROU", "9ebad2", 15])
				result.append(["−%d ESCUDO · resta %d" % [amount,event.get("shieldAfter",0)], "85dcff", 15])
			"shield", "guard":
				result.append(["+%d ESCUDO" % amount if amount > 0 else "LIMITE DE ESCUDO", "85dcff", 20])
				result.append(["Escudo total: %d" % int(event.get("shieldAfter", amount)), "85dcff", 12])
			"energy": result.append(["+%d ENERGIA" % amount, "c6b4ff", 18])
			"support": result.append(["SUPORTE", "c6b4ff", 15])
			"burn", "bleed", "darkmark", "fracture":
				result.append([{"darkmark": "MARCA OBSCURA", "burn": "QUEIMADURA", "bleed": "SANGRAMENTO", "fracture": "FRATURA"}[event.type], "ffae88", 14])
				result.append(["−%d VIDA" % amount, "ffc5b3", 22])
			"converted": result.append(["−%d ESCUDO CONVERTIDO" % int(event.get("shieldSpent", 0)), "85dcff", 15])
			"defeated": result.append(["DERROTADO", "ffac9d", 14])
		if int(event.get("healingPenalty", 0)) > 0: result.append(["CURA −%d%%" % int(event.healingPenalty), "ffc18a", 13])
		if event.get("passive", false): result.append(["REGENERAÇÃO" if event.has("remaining") else "SEMENTE" if event.get("source", "") == "seed" else "DRENO DE VIDA", "a1e6b3", 12])
		if event.has("remaining"): result.append(["%d ativação(ões) restante(s)" % int(event.remaining), "d6dded", 11])
		for key in ["effect", "extraEffect"]:
			var effect := str(event.get(key, ""))
			if effect.is_empty(): continue
			if effect == "cleanse":
				result.append(["PURIFICADO", "8de3bd", 12])
				for removed in event.get("cleansed", []): result.append(["Removido: " + str(SHORT_NAMES.get(removed, removed)), "8de3bd", 11])
			else:
				var turns := int(event.get("effectTurns", RulesText.rules.status.durationTurns)) if key == "effect" else int(event.get("extraEffectTurns", RulesText.rules.status.durationTurns))
				result.append(["%s · %dT" % [RulesText.status_names().get(effect, effect), turns], "8de3bd" if effect in Combat.POSITIVE else "ffac9d", 12])
	return result

## Pure event-to-display conversion: it never calculates damage, invents an effect,
## or mutates the combat event. In particular, HP loss excludes shield absorption.
static func describe_events(events: Array) -> Dictionary:
	var result := {"rows": [], "critical": false, "protected": false, "shieldAfter": -1}
	var seen_effects := {}
	for raw in _coalesce_passive_heals(events):
		if not raw is Dictionary: continue
		var event: Dictionary = raw
		var type := str(event.get("type", ""))
		if event.get("critical", false): result.critical = true
		if event.get("reaction", false): result.rows.append(_detail("CONTRA-ATAQUE", Color("d6bdff")))
		if event.get("intercepted", false): result.rows.append(_detail("DANO INTERCEPTADO PELO PROTETOR", SHIELD_COLOR))
		if event.has("combo"): result.rows.append(_detail("COMBO · " + str(SHORT_NAMES.get(event.combo, event.combo)), Color("ffd17a")))
		match type:
			"damage":
				var amount := int(event.get("amount", 0))
				result.rows.append(_metric("−%d" % amount, "DANO À VIDA" if amount > 0 else "VIDA PROTEGIDA", NEGATIVE_COLOR if amount > 0 else SHIELD_COLOR))
				if amount == 0: result.protected = true
				if int(event.get("absorbed", 0)) > 0:
					result.rows.append(_metric("−%d" % int(event.absorbed), "DANO AO ESCUDO", SHIELD_COLOR))
					if int(event.get("shieldAfter", -1)) == 0: result.rows.append(_detail("ESCUDO QUEBRADO", SHIELD_COLOR))
				if event.has("shieldAfter") and int(event.get("absorbed", 0)) > 0: result.shieldAfter = int(event.shieldAfter)
				var advantage := float(event.get("advantage", 1.0))
				if not is_equal_approx(advantage, 1.0): result.rows.append(_detail(RulesText.relationship(advantage).to_upper(), Color("ffd3a1") if advantage > 1.0 else SHIELD_COLOR))
			"heal":
				var source := "REGENERAÇÃO" if event.has("remaining") else "SEMENTE" if event.get("source", "") == "seed" else "DRENO DE VIDA" if event.get("source", "") == "drain" else "CURA"
				result.rows.append(_metric("+%d" % int(event.get("amount", 0)), source, POSITIVE_COLOR, int(event.get("receipt_hits", 1)), event.get("receipt_components", [])))
			"shield", "guard":
				var amount := int(event.get("amount", 0))
				result.rows.append(_metric("+%d" % amount, "ESCUDO RECEBIDO" if amount > 0 else "ESCUDO MANTIDO", SHIELD_COLOR))
				if event.has("shieldAfter"): result.shieldAfter = int(event.shieldAfter)
				if event.has("shieldTurns"): result.rows.append(_detail("Última camada: %d rodada(s) global(is)" % int(event.shieldTurns), SHIELD_COLOR))
				if type == "guard": result.rows.append(_detail("DEFESA · dano recebido −" + RulesText.percent(1.0 - float(RulesText.rules.guard.incomingDamageMultiplier)), POSITIVE_COLOR))
			"energy": result.rows.append(_metric("+%d" % int(event.get("amount", 0)), "ENERGIA RECEBIDA", Color("c6b4ff")))
			"burn", "bleed", "darkmark", "fracture":
				var label := "FRATURA" if type == "fracture" else str(SHORT_NAMES[type]).to_upper()
				result.rows.append(_metric("−%d" % int(event.get("amount", 0)), label, NEGATIVE_COLOR))
			"shieldExpired":
				result.rows.append(_metric("−%d" % int(event.get("amount", 0)), "CAMADA EXPIROU", SHIELD_COLOR))
				result.shieldAfter = int(event.get("shieldAfter",0))
			"converted":
				result.rows.append(_metric("−%d" % int(event.get("shieldSpent", 0)), "ESCUDO CONVERTIDO", SHIELD_COLOR))
				result.shieldAfter = 0
			"defeated": result.rows.append(_detail("DERROTADO", NEGATIVE_COLOR))
		if int(event.get("healingPenalty", 0)) > 0: result.rows.append(_detail("CURA −%d%%" % int(event.healingPenalty), Color("ffc18a")))
		if event.has("remaining"): result.rows.append(_detail("%d ativação(ões) restante(s)" % int(event.remaining)))
		for key in ["effect", "extraEffect"]:
			var effect := str(event.get(key, ""))
			if effect.is_empty(): continue
			if effect == "cleanse":
				var removed: Array = event.get("cleansed", [])
				result.rows.append(_detail("PURIFICADO · %d efeito(s) removido(s)" % removed.size(), POSITIVE_COLOR))
				for cleared in removed:
					result.rows.append(_detail("Removido: " + str(SHORT_NAMES.get(cleared, cleared)), POSITIVE_COLOR))
				continue
			var turns := int(event.get("effectTurns", RulesText.rules.status.durationTurns)) if key == "effect" else int(event.get("extraEffectTurns", RulesText.rules.status.durationTurns))
			if seen_effects.has(effect):
				# A repeated application refreshes this effect; show its final receipt duration.
				result.rows[int(seen_effects[effect])].turns = turns
				continue
			seen_effects[effect] = result.rows.size()
			result.rows.append(_effect_row(effect, turns))
	return result

func configure_events(events: Array, name_value: String, capacity := 0, remaining := -1, ability := "", compact := false) -> void:
	var description := describe_events(events)
	target_name = name_value
	compact_area = compact
	action_name = "" if compact else ability
	shield_capacity = capacity
	shield_remaining = int(description.shieldAfter) if int(description.shieldAfter) >= 0 else remaining
	critical = bool(description.critical)
	protected = bool(description.protected)
	rows = _compact_rows(description.rows) if compact else description.rows
	if compact:
		for row in rows: row.height = 26.0 if row.kind == "metric" else 23.0 if row.kind == "status" else 14.0
	lines = event_lines(events)
	event_details = true
	accent = Color("ffd27d") if critical else SHIELD_COLOR if protected else Color("ffb49d")
	if not critical and not protected and not rows.is_empty(): accent = rows[0].color
	_measure()

func configure(value: Array, name_value: String, capacity: int, remaining: int) -> void:
	lines = value.duplicate(true)
	target_name = name_value
	action_name = ""
	shield_capacity = capacity
	shield_remaining = remaining
	critical = lines.any(func(line): return str(line[0]) == "CRÍTICO!")
	protected = lines.any(func(line): return str(line[0]) == "VIDA PROTEGIDA")
	accent = Color("ffd27d") if critical else SHIELD_COLOR if protected or lines.any(func(line): return str(line[0]).contains("ESCUDO")) else POSITIVE_COLOR if lines.any(func(line): return str(line[0]).begins_with("+")) else Color("ffb49d")
	rows.clear()
	event_details = false
	for line in lines:
		var value_text := str(line[0])
		if value_text == "CRÍTICO!": continue
		var major: bool = int(line[2]) >= 18
		var row_size := 25 if major and (value_text.ends_with("VIDA") or value_text.ends_with("ESCUDO")) else 16 if major else 12
		if value_text == "VIDA PROTEGIDA": row_size = 15
		rows.append({"kind": "legacy", "text": value_text, "color": Color(str(line[1])), "size": row_size, "height": row_size + 5.0})
	_measure()

func _measure() -> void:
	elapsed = 0.0
	content_height = 31.0 + (20.0 if not action_name.is_empty() else 0.0)
	for row in rows: content_height += float(row.height)
	if shield_remaining >= 0: content_height += 23.0
	if event_details and content_height + 8.0 > 410.0:
		rows = _compact_rows(rows)
		content_height = 31.0 + (20.0 if not action_name.is_empty() else 0.0)
		for row in rows: content_height += float(row.height)
		if shield_remaining >= 0: content_height += 23.0
	size = Vector2(206 if compact_area else WIDTH, maxf(70.0, content_height + 8.0))
	custom_minimum_size = size
	lifetime = clampf(2.65 + maxf(0.0, float(rows.size() - 3)) * 0.18, 2.65, 4.1)
	pivot_offset = size * Vector2(0.5, 0.35)
	queue_redraw()

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_as_relative = false
	z_index = 80
	var readable := FontVariation.new()
	readable.base_font = load("res://assets/space-grotesk.ttf")
	readable.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 700.0}
	font = readable
	pivot_offset = size * Vector2(0.5, 0.35)

func _process(delta: float) -> void:
	elapsed += delta
	var enter := clampf(elapsed / 0.13, 0, 1)
	var leave := clampf((lifetime - elapsed) / 0.32, 0, 1)
	modulate.a = minf(enter, leave)
	scale = Vector2.ONE * lerpf(0.96, 1.0, sin(enter * PI * 0.5))
	queue_redraw()
	if elapsed >= lifetime: queue_free()

func _label(text: String, at: Vector2, color: Color, point_size := 12, width := WIDTH - 28.0) -> void:
	var fitted := point_size
	while fitted > 9 and font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fitted).x > width: fitted -= 1
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, width, fitted, color)

func _draw() -> void:
	if not font: return
	if compact_area:
		_draw_compact_area()
		return
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("071321f5")
	panel.border_color = Color(accent, 0.60)
	panel.set_border_width_all(1)
	panel.set_corner_radius_all(9)
	panel.shadow_color = Color(0, 0, 0, 0.4)
	panel.shadow_size = 9
	draw_style_box(panel, Rect2(Vector2.ZERO, size))
	draw_rect(Rect2(0, 9, 3, size.y - 18), accent)
	draw_rect(Rect2(9, 8, size.x - 18, 19), Color(accent, 0.10))
	var header: String = target_name.to_upper() if not target_name.is_empty() else "COMBATE"
	_label(header, Vector2(13, 22), accent, 12, size.x - (94.0 if critical else 26.0))
	if critical:
		var badge := Rect2(size.x - 79, 9, 67, 17)
		draw_style_box(_track(Color("4b3521")), badge)
		_label("CRÍTICO", badge.position + Vector2(7, 12), Color("ffe5a1"), 10, 57)
	var y := 31.0
	if not action_name.is_empty():
		_label(action_name, Vector2(13, y + 12), Color("dde7f4"), 12)
		y += 20.0
	for row in rows:
		var color: Color = row.color
		match str(row.kind):
			"metric":
				_label(row.value, Vector2(13, y + 26), color, 29, 86)
				var label: String = row.text + (" · %d×" % int(row.hits) if int(row.hits) > 1 else "")
				_label(label, Vector2(100, y + 20), color, 10, WIDTH - 112)
			"status":
				draw_style_box(_track(Color(color, 0.09)), Rect2(10, y + 1, WIDTH - 20, 34))
				_label("+" if row.positive else "−", Vector2(15, y + 17), color, 17, 14)
				_label(row.text, Vector2(32, y + 15), color, 12, WIDTH - 78)
				_label("POSITIVO" if row.positive else "NEGATIVO", Vector2(32, y + 29), Color(color, 0.78), 8, 54)
				var description: String = row.description
				if description != row.text: _label(description, Vector2(89, y + 29), MUTED_COLOR, 9, WIDTH - 105)
				_label("%dT" % int(row.turns), Vector2(WIDTH - 37, y + 17), color, 12, 27)
			"legacy": _label(row.text, Vector2(13, y + float(row.size)), color, int(row.size))
			_:
				var label: String = row.text + (" · %d×" % int(row.get("hits", 1)) if int(row.get("hits", 1)) > 1 else "")
				_label(label, Vector2(13, y + 12), color, 11)
		y += float(row.height)
	if shield_remaining >= 0:
		_label("ESCUDO RESTANTE", Vector2(13, size.y - 17), MUTED_COLOR, 9, WIDTH - 90)
		_label(str(shield_remaining), Vector2(WIDTH - 65, size.y - 17), SHIELD_COLOR, 11, 52)
		var ratio := clampf(float(shield_remaining) / maxf(1.0, shield_capacity), 0, 1)
		draw_style_box(_track(Color("16364b")), Rect2(13, size.y - 11, size.x - 26, 4))
		if ratio > 0: draw_style_box(_track(SHIELD_COLOR), Rect2(13, size.y - 11, (size.x - 26) * ratio, 4))

func _track(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(3)
	return style

func _draw_compact_area() -> void:
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("071321f5")
	panel.border_color = Color(accent,.8)
	panel.set_border_width_all(1)
	panel.set_corner_radius_all(7)
	draw_style_box(panel,Rect2(Vector2.ZERO,size))
	_label(target_name.to_upper(),Vector2(10,19),accent,11,115 if critical else size.x-20)
	if critical: _label("CRÍTICO",Vector2(size.x-64,19),Color("ffe29c"),10,60)
	var y := 31.0
	for row in rows:
		var color: Color = row.color
		if row.kind == "metric":
			_label(row.value,Vector2(10,y+19),color,23,80)
			_label(row.text,Vector2(92,y+15),color,9,size.x-100)
		elif row.kind == "status":
			draw_texture_rect(StatusStrip.icon(row.effect),Rect2(10,y+1,16,16),false,color)
			_label(row.text,Vector2(30,y+14),color,10,size.x-70)
			_label("%dT" % row.turns,Vector2(size.x-30,y+14),color,10,25)
		else: _label(row.text,Vector2(10,y+11),color,10,size.x-20)
		y += float(row.height)
	if shield_remaining >= 0: _label("Escudo restante: %d" % shield_remaining,Vector2(10,size.y-12),SHIELD_COLOR,10,size.x-20)
