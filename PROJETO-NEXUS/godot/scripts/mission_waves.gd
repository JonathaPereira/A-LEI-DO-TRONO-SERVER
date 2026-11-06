extends RefCounted
## Campaign reinforcements reuse three battlefield slots; player state survives.
static func attach(engine, state: Dictionary, mission: Dictionary) -> String:
	if not mission.has("waves"): return ""
	if state.has("campaignWaves"): return "As ondas já foram preparadas."
	var definitions: Variant = mission.waves
	if not definitions is Array or definitions.size() < 2 or definitions.size() > 4: return "A missão precisa de duas a quatro ondas."
	var objective: Variant = mission.get("objective",{"type":"clear"})
	if not objective is Dictionary or objective.get("type") != "clear": return "Ondas exigem concluir todos os confrontos."
	for wave in definitions:
		if not wave is Dictionary or not wave.get("name") is String or wave.name.strip_edges().is_empty() or wave.name.length() > 64: return "Nome de onda inválido."
		if wave.keys().any(func(key): return key not in ["name","healthScale","attackScale"]): return "Parâmetro de onda desconhecido."
		for field in ["healthScale","attackScale"]:
			var value: Variant = wave.get(field)
			var minimum := .25 if field == "healthScale" else .5
			if not (value is int or value is float) or not is_finite(float(value)) or value < minimum or value > 1.5: return "Força de onda inválida."
	var enemies: Array = state.units.filter(func(u):return u.side == 1)
	if enemies.size() != 3: return "A onda precisa de três posições rivais."
	state.campaignWaves = definitions.duplicate(true)
	state.campaignWaveIndex = 0
	state.campaignWaveBase = {}
	for enemy in enemies:
		state.campaignWaveBase[enemy.id] = {"maxHp":enemy.maxHp,"attack":enemy.attack,"energy":enemy.energy}
	_apply(engine,state)
	return ""

static func pending(state: Dictionary) -> bool:
	return state.has("campaignWaves") and int(state.campaignWaveIndex)+1 < state.campaignWaves.size()

static func _apply(engine, state: Dictionary) -> void:
	var wave: Dictionary = state.campaignWaves[state.campaignWaveIndex]
	for enemy in state.units.filter(func(u):return u.side == 1):
		var base: Dictionary = state.campaignWaveBase[enemy.id]
		enemy.maxHp = maxi(1,engine.rounded(base.maxHp*wave.healthScale))
		enemy.hp = enemy.maxHp
		enemy.attack = engine.rounded(base.attack*wave.attackScale)
		enemy.energy = base.energy
		enemy.shield = 0;enemy.shieldTurns = 0;enemy.shieldLayers = []
		enemy.statuses = [];enemy.cooldowns = {};enemy.guarding = false

## Failure objectives are resolved by Campaign before requesting this transition.
static func advance(engine, state: Dictionary) -> bool:
	if state.get("phase") != "playing" or not pending(state): return false
	if state.units.any(func(u):return u.side == 1 and u.hp > 0) or not state.units.any(func(u):return u.side == 0 and u.hp > 0): return false
	state.campaignWaveIndex += 1
	_apply(engine,state)
	# Returning true asks the engine to schedule the new group in a fresh round.
	state.log.append({"type":"objective","round":state.round,"text":"Reforços chegaram · Onda %d/%d: %s" % [state.campaignWaveIndex+1,state.campaignWaves.size(),state.campaignWaves[state.campaignWaveIndex].name]})
	if state.log.size() > 100: state.log.pop_front()
	return true
