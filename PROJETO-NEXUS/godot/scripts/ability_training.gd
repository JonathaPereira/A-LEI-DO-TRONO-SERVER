extends RefCounted
const Progression = preload("res://scripts/progression.gd")
const RulesText = preload("res://scripts/rules_text.gd")
const ACTIONS := ["basic","skill","ultimate"]
static var settings: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/ability-training.json"))

static func unlocked(action: String, points: int) -> bool:
	return action in ACTIONS and Progression.rank(points) >= settings[action].rank

static func build(hero: Dictionary, action: String, choice: String, basic_gain: int) -> Dictionary:
	if action not in ACTIONS or not hero.has(action): return {}
	var original: Dictionary = hero[action]
	var result: Dictionary = original.duplicate(true)
	if choice == "": return result
	if choice != settings[action].id: return {}
	var recipe: Dictionary = settings[action]
	result.cost = int(original.cost)+int(recipe.costDelta)
	result.name += " · " + recipe.name
	result.trainingLabel = recipe.name
	if float(original.power) > 0:
		result.power = float(original.power)*float(recipe.powerMultiplier)
		result.description = result.description.replace(RulesText.percent(original.power),RulesText.percent(result.power))
	elif original.get("secondary",{}).get("kind") == "energy":
		var before: int = original.secondary.amount
		result.secondary.amount = int(floor(before*float(recipe.powerMultiplier)+.5))
		result.description = result.description.replace("%d de energia" % before,"%d de energia" % result.secondary.amount).replace("%d energia" % before,"%d energia" % result.secondary.amount)
	if action == "basic":
		result.energyGain = basic_gain+int(recipe.energyGainDelta)
		result.description = result.description.replace("%d de energia" % basic_gain,"%d de energia" % result.energyGain).replace("%d energia" % basic_gain,"%d energia" % result.energyGain)
	result.description = recipe.name + ": " + result.description
	if action != "basic": result.description += " Custo: %d EN." % result.cost
	return result

static func validate(choices: Variant, mastery: Dictionary, active_ids: Array) -> String:
	if not choices is Dictionary or choices.size() > active_ids.size(): return "Treinamentos de habilidade inválidos."
	for hero in choices:
		if not hero is String or hero not in active_ids or not choices[hero] is Dictionary or choices[hero].size() > 3: return "Herói ou habilidades desconhecidos no treinamento."
		for action in choices[hero]:
			if not action is String or action not in ACTIONS: return "Habilidade de treinamento desconhecida."
			var choice: Variant = choices[hero][action]
			if not choice is String or choice not in ["",settings[action].id]: return "Alternativa de habilidade desconhecida."
			if choice != "" and not unlocked(action,int(mastery.get(hero,0))): return "Treinamento ainda bloqueado pela maestria."
	return ""
