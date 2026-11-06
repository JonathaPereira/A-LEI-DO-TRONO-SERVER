extends RefCounted
## Campaign encounter rules, separate from free combat, PvP and saved rewards.
const Field = preload("res://scripts/mission_field.gd")

static func attach(state: Dictionary, mission: Dictionary) -> String:
	var value: Variant = mission.get("objective", {"type":"clear"})
	if not value is Dictionary or value.get("type") not in ["clear","target","survive"]: return "Tipo de objetivo desconhecido."
	if value.type != "clear":
		var rounds: Variant = value.get("rounds")
		if not (rounds is int or rounds is float) or not is_finite(float(rounds)) or rounds < 1 or rounds > 20 or rounds != floor(float(rounds)): return "Prazo de missão inválido."
	if value.type == "target":
		if not value.get("target") is String or not state.units.any(func(u): return u.id == value.target and u.side == 1): return "Alvo da missão ausente."
	if value.has("protectAll") and not value.protectAll is bool: return "Proteção de equipe inválida."
	var protected: Dictionary = {}
	if value.has("protectSlot"):
		var slot: Variant = value.protectSlot
		if not (slot is int or slot is float) or not is_finite(float(slot)) or slot < 0 or slot > 2 or slot != floor(float(slot)): return "Posição do portador inválida."
		if value.get("protectAll",false): return "Escolha proteção do trio ou de um portador."
		var candidates: Array = state.units.filter(func(u): return u.side == 0 and u.slot == int(slot))
		if candidates.size() != 1: return "Portador da missão ausente."
		protected = candidates[0]
	state.campaignObjective = value.duplicate(true)
	if not protected.is_empty():
		state.campaignObjective.protectedId = protected.id
		state.campaignObjective.protectedName = str(protected.heroId).capitalize()
	state.campaignMissionId = mission.id
	return ""

static func _finish(state: Dictionary, winner: int, reason: String) -> void:
	state.phase = "finished"
	state.winner = winner
	state.missionResult = {"winner":winner, "reason":reason, "round":state.round, "completedRounds":state.round-1 if reason in ["deadline","survived"] else state.round, "turns":state.turns}
	state.log.append({"type":"objective", "round":state.round, "text":result_text(state)})
	if state.log.size() > 100: state.log.pop_front()

## At impact: evaluate deaths before the next actor receives status effects.
## At a new round: evaluate deadlines before shields expire or periodic damage runs.
static func resolve(state: Dictionary, boundary: bool = false, defer_clear: bool = false) -> void:
	if not state.has("campaignObjective") or state.has("missionResult"): return
	var goal: Dictionary = state.campaignObjective
	var allies: Array = state.units.filter(func(u): return u.side == 0)
	if not allies.any(func(u): return u.hp > 0):
		_finish(state,1,"team_lost")
		return
	if goal.has("protectSlot") and allies.any(func(u): return u.id == goal.protectedId and u.hp <= 0):
		_finish(state,1,"carrier_lost")
		return
	if goal.get("protectAll",false) and allies.any(func(u): return u.hp <= 0):
		_finish(state,1,"ally_lost")
		return
	if goal.type == "target" and state.units.any(func(u): return u.id == goal.target and u.hp <= 0):
		_finish(state,0,"target")
		return
	if not defer_clear and not state.units.any(func(u): return u.side == 1 and u.hp > 0):
		_finish(state,0,"cleared")
		return
	if boundary and goal.type != "clear" and state.round > goal.rounds:
		_finish(state,0 if goal.type == "survive" else 1,"survived" if goal.type == "survive" else "deadline")

static func brief(mission: Dictionary) -> String:
	var goal: Dictionary = mission.get("objective",{"type":"clear"})
	var text := "Elimine todos os inimigos."
	match goal.type:
		"target": text = "Derrote %s até o fim da rodada %d. Os demais inimigos podem sobreviver." % [goal.get("targetName","o alvo principal"),goal.rounds]
		"survive": text = "Mantenha %s por %d rodadas completas, ou elimine todos os inimigos." % ["os três aliados vivos" if goal.get("protectAll",false) else "ao menos um aliado vivo",goal.rounds]
	if mission.get("waves") is Array and mission.waves.size() > 1: text = "Enfrente %d ondas sucessivas. Vida, energia e condições do trio continuam entre elas. Recompensa apenas ao concluir todas. " % mission.waves.size()+text
	if goal.has("protectSlot"):
		text += " Proteja o %s integrante do trio: ele transporta a carga e deve sobreviver. Escolha livremente quem ocupa essa posição." % ["primeiro","segundo","terceiro"][int(goal.protectSlot)]
	var field_text := Field.brief(mission)
	if field_text != "": text += " " + field_text
	return text

static func result_text(state: Dictionary) -> String:
	return {"team_lost":"Seu trio foi derrotado.", "carrier_lost":"A proteção falhou: o portador da carga foi derrotado.", "ally_lost":"A proteção falhou: um integrante do trio caiu.", "target":"Alvo neutralizado. A missão foi concluída.", "cleared":"Todos os inimigos foram derrotados.", "survived":"Defesa concluída: o trio resistiu ao cerco.", "deadline":"O prazo terminou antes de neutralizar o alvo. A missão falhou."}.get(state.get("missionResult",{}).get("reason",""),"")

static func describe(state: Dictionary) -> String:
	var goal: Dictionary = state.get("campaignObjective",{"type":"clear"})
	if state.has("missionResult"): return result_text(state)
	var text := "Elimine todos os inimigos."
	if goal.type == "survive": text = "Defenda %s · %d/%d rodadas completas" % ["o trio" if goal.get("protectAll",false) else "ao menos um aliado",maxi(0,state.round-1),goal.rounds]
	if goal.type == "target": text = "Alvo: %s · Rodada %d/%d" % [goal.get("targetName","alvo principal"),state.round,goal.rounds]
	if goal.has("protectSlot"): text = "Portador: %s · %s" % [goal.protectedName,text]
	if state.has("campaignWaves"): text = "Onda %d/%d · %s" % [state.campaignWaveIndex+1,state.campaignWaves.size(),text]
	if state.has("campaignField"): text = "Campo: %s · %s" % [state.campaignField.name,text]
	return text
