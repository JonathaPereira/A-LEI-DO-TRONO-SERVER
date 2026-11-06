extends RefCounted
## Arena modifiers are captured on actors; free kits and saved training stay intact.
static func _signed(value: int) -> String:
	return ("+" if value >= 0 else "")+str(value)

static func brief(mission: Dictionary) -> String:
	var field: Variant = mission.get("field")
	if not field is Dictionary: return ""
	return "Campo %s: básicos %s EN recuperados; técnicas %s EN de custo. Vale para as duas equipes." % [field.name,_signed(int(field.basicEnergyGain)),_signed(int(field.skillCostDelta))]

static func attach(engine, state: Dictionary, mission: Dictionary) -> String:
	if not mission.has("field"): return ""
	if state.has("campaignField"): return "O campo já foi preparado."
	var field: Variant = mission.field
	if not field is Dictionary: return "Campo de batalha inválido."
	if field.keys().any(func(key): return key not in ["id","name","basicEnergyGain","skillCostDelta"]): return "Parâmetro de campo desconhecido."
	for text in ["id","name"]:
		if not field.get(text) is String or field[text].strip_edges().is_empty() or field[text].length() > 64: return "Identidade de campo inválida."
	for key in ["basicEnergyGain","skillCostDelta"]:
		var value: Variant = field.get(key)
		var limit := 8 if key == "basicEnergyGain" else 15
		if not (value is int or value is float) or not is_finite(float(value)) or value != floor(float(value)) or absf(float(value)) > limit: return "Modificador de energia inválido."
	var prepared := {}
	for actor in state.units:
		var overrides: Dictionary = actor.get("campaignActions",{}).duplicate(true)
		var basic: Dictionary = engine.get_action(actor,"basic").duplicate(true)
		var previous_gain: int = basic.get("energyGain",engine.rules.energy.basicGain)
		var gain: int = previous_gain+int(field.basicEnergyGain)
		var skill: Dictionary = engine.get_action(actor,"skill").duplicate(true)
		var previous_cost: int = skill.cost
		var cost: int = previous_cost+int(field.skillCostDelta)
		if gain < 0 or gain > engine.rules.energy.maximum or cost < 0 or cost > engine.rules.energy.maximum: return "O campo excede os limites de energia de uma habilidade."
		basic.energyGain = gain
		basic.fieldLabel = field.name
		basic.description = basic.description.replace("%d de energia" % previous_gain,"%d de energia" % gain).replace("%d energia" % previous_gain,"%d energia" % gain)
		basic.description += " Campo %s: %s EN por básico." % [field.name,_signed(int(field.basicEnergyGain))]
		skill.cost = cost
		skill.fieldLabel = field.name
		skill.description = skill.description.replace("Custo: %d EN." % previous_cost,"Custo: %d EN." % cost)
		skill.description += " Campo %s: custo final %d EN." % [field.name,cost]
		overrides.basic = basic;overrides.skill = skill
		prepared[actor.id] = overrides
	# No actor is changed until every adjusted action has been validated.
	for actor in state.units: actor.campaignActions = prepared[actor.id]
	state.campaignField = field.duplicate(true)
	return ""
