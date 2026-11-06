extends RefCounted
## Full actions live only for the last batch; the compact statistics history stays bounded separately.
const STORE := "user://simulations-0.16.json"
const RULES_VERSION := "0.16.0"
const GAME_VERSION := "0.16.0"

static func snapshot(state: Dictionary) -> Dictionary:
	return {"round": state.round, "phase": state.phase, "winner": state.winner, "random": state.random,
		"nextActor": state.order[state.cursor] if state.phase == "playing" else null,
		"units": state.units.map(func(u): return {"id": u.id, "hp": u.hp, "shield": u.shield, "shieldTurns": u.shieldTurns, "shieldLayers": u.shieldLayers.duplicate(true),
			"energy": u.energy, "statuses": u.statuses.duplicate(true), "cooldowns": u.cooldowns.duplicate(true)})}

static func simulate(engine, sample: Dictionary) -> Dictionary:
	var state: Dictionary = engine.new_battle(sample.teams[0], sample.teams[1], "normal", sample.seed)
	var trace := {"teams": sample.teams.duplicate(true), "seed": sample.seed, "group": sample.group,
		"difficulty": "normal", "policy": "support-or-guard" if sample.get("defensive", false) else "default-ai",
		"initial": state.duplicate(true), "steps": []}
	while state.phase == "playing" and state.turns < 400:
		var choice: Dictionary = engine.choose_ai(state)
		var actor: Dictionary = engine.current(state)
		var action: Dictionary = engine.get_action(actor, choice.actionId)
		if sample.get("defensive", false) and not engine.friendly(action) and action.get("secondary", {}).get("kind") != "heal":
			choice = {"actionId": "guard", "targetId": actor.id}
		var round_before: int = state.round
		var result: Dictionary = engine.act(state, choice.actionId, choice.targetId)
		trace.steps.append({"turn": state.turns, "round": round_before, "actor": result.actor,
			"actionId": choice.actionId, "targetId": choice.targetId,
			"events": result.events.duplicate(true), "turnEvents": result.turnEvents.duplicate(true), "after": snapshot(state)})
	trace["rounds"] = state.round
	trace["actions"] = state.turns
	trace["winner"] = state.winner
	trace["finished"] = state.phase == "finished"
	trace["finalStats"] = state.units.map(func(u): return {"id": u.id, "stats": u.stats.duplicate(true)})
	return {"state": state, "trace": trace}

static func save_batch(batch: Dictionary) -> Error:
	var file := FileAccess.open(STORE, FileAccess.WRITE)
	if not file: return FileAccess.get_open_error()
	file.store_string(JSON.stringify(batch))
	return file.get_error()

static func read_batch() -> Dictionary:
	if not FileAccess.file_exists(STORE): return {}
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(STORE))
	if not data is Dictionary or data.get("schemaVersion") != 1 or data.get("rulesVersion") != RULES_VERSION or not data.get("matches") is Array: return {}
	if not data.matches.all(func(m): return m is Dictionary and m.get("teams") is Array and m.get("steps") is Array and m.get("group") is String and m.get("seed") is float): return {}
	return data
