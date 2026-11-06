extends RefCounted
## Deterministic combat: no scene nodes, network, rendering or save-game writes.
## Formula parameters come from src/balance.json via npm run sync:godot.
## Hero-specific attributes/powers come from src/kits.js. See BALANCING.md.
const Catalog = preload("res://scripts/catalog.gd")
var catalog = Catalog.new()
var rules: Dictionary = _load_rules()
# Kept as an instance property for HUD callers; never tune this generated alias.
var SHIELD_CAP: float = rules.shield.maxHpRatio

func _load_rules() -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/combat-rules.json"))
	assert(parsed is Dictionary and parsed.get("schemaVersion") == 1, "Fórmulas ausentes/inválidas: execute npm run sync:godot.")
	return parsed

func rounded(value: float) -> int:
	# JavaScript Math.round for the nonnegative quantities in this ruleset.
	return int(floor(value + 0.5))

func advantage(from: String, to: String) -> float:
	var affinity: Dictionary = catalog.class_by_id[from]
	return rules.affinity.advantageMultiplier if affinity.strongAgainst == to else (rules.affinity.resistanceMultiplier if affinity.weakAgainst == to else rules.affinity.neutralMultiplier)

func new_battle(team_a: Array, team_b: Array, difficulty: String = "normal", seed_value: int = 73) -> Dictionary:
	if not catalog.valid_team(team_a) or not catalog.valid_team(team_b):
		return {"error": "Cada equipe precisa de três personagens diferentes."}
	if not difficulty in ["easy", "normal", "hard"]:
		return {"error": "Dificuldade inválida."}
	var units: Array = []
	for side in range(2):
		var team: Array = team_a if side == 0 else team_b
		var scale_factor: float = rules.difficulty.enemyStatMultiplier[difficulty] if side == 1 else 1.0
		for slot in range(3):
			var hero: Dictionary = catalog.hero_by_id[team[slot]]
			units.append({
				"id": "%d-%s" % [side, hero.id], "heroId": hero.id, "side": side, "slot": slot,
				"hp": rounded(hero.hp * scale_factor), "maxHp": rounded(hero.hp * scale_factor),
				"attack": rounded(hero.attack * scale_factor), "defense": hero.defense, "speed": hero.speed,
				"energy": int(rules.energy.initial), "shield": 0, "shieldTurns": 0, "shieldLayers": [], "guarding": false, "statuses": [], "cooldowns": {},
				"stats": {"damage": 0, "healing": 0, "actions": 0, "shieldDamage": 0, "shieldGranted": 0, "protected": 0, "energyGiven": 0, "combos": 0, "shieldAbsorbed": 0},
			})
	var state := {"units": units, "order": [], "cursor": 0, "round": 1, "phase": "playing", "winner": null, "log": [], "random": seed_value & 0xffffffff, "turns": 0}
	state.order = _turn_order(state)
	for side in range(2):
		var guardian: Dictionary = {}
		for candidate in units:
			if candidate.side == side and catalog.hero_by_id[candidate.heroId].role == "Tanque":
				guardian = candidate
				break
		if not guardian.is_empty():
			for ally in units:
				if ally.side == side and ally.id != guardian.id: _status(ally, "cover", guardian.id, int(rules.tankProtection.openingTurns))
	_begin_turn(state)
	return state

func _turn_order(state: Dictionary) -> Array:
	var alive: Array = state.units.filter(func(u): return u.hp > 0)
	alive.sort_custom(func(a, b):
		if a.speed != b.speed: return a.speed > b.speed
		if a.side != b.side: return a.side < b.side
		return a.slot < b.slot)
	return alive.map(func(u): return u.id)

func unit(state: Dictionary, id: String) -> Dictionary:
	for candidate in state.units:
		if candidate.id == id:
			return candidate
	return {}

func current(state: Dictionary) -> Dictionary:
	if state.is_empty() or state.cursor >= state.order.size():
		return {}
	return unit(state, state.order[state.cursor])

func get_action(actor: Dictionary, id: String) -> Dictionary:
	return catalog.guard if id == "guard" else actor.get("campaignActions",{}).get(id,catalog.hero_by_id[actor.heroId].get(id, {}))

func can_use(actor: Dictionary, id: String) -> bool:
	var action := get_action(actor, id)
	return not action.is_empty() and actor.hp > 0 and actor.energy >= action.cost and actor.cooldowns.get(id, 0) <= 0

const POSITIVE = ["regen", "empower", "fortify", "cover", "mirror", "riposte", "taunt", "emberguard", "sentinel", "elementalWard"]

func friendly(action: Dictionary) -> bool:
	return action.kind.begins_with("heal") or action.kind.begins_with("shield") or action.kind.begins_with("support")

func legal_targets(state: Dictionary, actor: Dictionary, action: Dictionary) -> Array:
	if action.kind == "guard" or action.get("self", false): return [actor]
	var targets: Array = state.units.filter(func(u): return u.hp > 0 and u.side == (actor.side if friendly(action) else 1 - actor.side))
	if action.get("effect") == "cover": targets = targets.filter(func(u): return u.id != actor.id)
	if action.kind == "damage":
		var taunting: Array = targets.filter(func(u): return has_status(u, "taunt"))
		if not taunting.is_empty(): targets = taunting
	return targets

func _random(state: Dictionary) -> float:
	state.random = (int(state.random) * 1664525 + 1013904223) & 0xffffffff
	return float(state.random) / 4294967296.0

func _log(state: Dictionary, event: Dictionary) -> void:
	var entry := {"round": state.round}
	entry.merge(event, true)
	state.log.append(entry)
	if state.log.size() > 100: state.log.pop_front()

func _victory(state: Dictionary) -> bool:
	for side in range(2):
		if not state.units.any(func(u): return u.side == side and u.hp > 0):
			state.phase = "finished"
			state.winner = 1 - side
			return true
	return false

func healing_multiplier(state: Dictionary, target: Dictionary) -> float:
	var fracture := maxf(0.0, 1.0 - maxi(0, state.round - (int(rules.fracture.startRound) - 1)) * rules.fracture.healingReductionPerRound)
	return fracture * (rules.status.bleedHealingMultiplier if has_status(target, "bleed") else 1.0)

func _heal(state: Dictionary, target: Dictionary, amount: float, metadata: Dictionary = {}) -> Dictionary:
	var multiplier := healing_multiplier(state, target)
	var healed: int = mini(target.maxHp - target.hp, rounded(amount * multiplier)) if target.hp > 0 else 0
	target.hp += healed
	var receipt := {"type": "heal", "target": target.id, "amount": healed, "healingPenalty": rounded((1 - multiplier) * 100)}
	receipt.merge(metadata, true)
	return receipt

func has_status(target: Dictionary, type: String) -> bool:
	return target.statuses.any(func(s): return s.type == type)

func _matching_status(target: Dictionary, config: Dictionary) -> String:
	for type in config.get("statuses", [config.get("status", "")]):
		if has_status(target, str(type)): return str(type)
	return ""

func _remove(target: Dictionary, type: String) -> void:
	target.statuses = target.statuses.filter(func(s): return s.type != type)

func _status(target: Dictionary, type: String, owner: Variant = null, duration: int = -1) -> void:
	if duration < 0: duration = int(rules.status.durationTurns)
	if type == "cleanse":
		target.statuses = target.statuses.filter(func(s): return s.type in POSITIVE)
		return
	for status in target.statuses:
		if status.type == type:
			status.turns = duration
			if type in ["cover", "darkmark"]: status.owner = owner
			return
	var status := {"type": type, "turns": duration}
	if type in ["cover", "darkmark"]: status.owner = owner
	target.statuses.append(status)

func _turn_event(state: Dictionary, events: Array, actor: Dictionary, event: Dictionary) -> void:
	event.hpAfter = actor.hp
	event.shieldAfter = actor.shield
	_log(state, event)
	events.append(event)

func _begin_turn(state: Dictionary, turn_events: Array = [], round_checkpoint: Callable = Callable(), turn_checkpoint: Callable = Callable()) -> void:
	while state.phase == "playing":
		if state.cursor >= state.order.size():
			state.round += 1
			state.cursor = 0
			state.order = _turn_order(state)
			var restart_round := false
			if round_checkpoint.is_valid(): restart_round = round_checkpoint.call(state) == true
			if state.phase != "playing": return
			if restart_round:
				state.order = []
				state.cursor = 0
				continue
			for target in state.units:
				var before: int = target.shield
				_normalize_shields(target, state.round - 1)
				target.shieldLayers = target.shieldLayers.filter(func(layer): return layer.expiresRound > state.round)
				_sync_shields(target, state.round)
				if before > target.shield:
					_turn_event(state, turn_events, target, {"type":"shieldExpired","actor":target.id,"target":target.id,"amount":before-target.shield})
		var actor := current(state)
		if actor.is_empty() or actor.hp <= 0:
			state.cursor += 1
			continue
		actor.guarding = false
		for id in actor.cooldowns:
			actor.cooldowns[id] = maxi(0, actor.cooldowns[id] - 1)
		if state.round >= rules.fracture.startRound:
			var amount: int = mini(actor.hp, int(ceil(actor.maxHp * minf(rules.fracture.maxHpRatioCap, rules.fracture.initialMaxHpRatio + (state.round - int(rules.fracture.startRound)) * rules.fracture.perRoundMaxHpRatio))))
			actor.hp -= amount
			var healing_percent: float = rules.fracture.healingReductionPerRound * 100
			_turn_event(state, turn_events, actor, {"type": "fracture", "actor": actor.id, "target": actor.id, "amount": amount, "healingPenalty": mini(100, (state.round - (int(rules.fracture.startRound) - 1)) * healing_percent)})
			if actor.hp <= 0: _turn_event(state, turn_events, actor, {"type": "defeated", "actor": actor.id, "target": actor.id})
		for status in actor.statuses:
			if actor.hp <= 0: break
			if status.turns <= 0: continue
			if status.type in ["burn", "bleed", "darkmark"]:
				var amount: int = mini(actor.hp, rounded(actor.maxHp * {"burn": rules.status.burnMaxHpRatio, "bleed": rules.status.bleedMaxHpRatio, "darkmark": rules.status.darkmarkMaxHpRatio}[status.type]))
				actor.hp -= amount
				_turn_event(state, turn_events, actor, {"type": status.type, "actor": actor.id, "target": actor.id, "amount": amount, "remaining": status.turns - 1})
				if status.type == "darkmark":
					var owner := unit(state, status.get("owner", ""))
					if not owner.is_empty() and owner.hp > 0 and owner.side != actor.side:
						var receipt := _heal(state, owner, amount * rules.status.darkmarkDrainRatio, {"actor": owner.id, "passive": true, "source": "darkmark"})
						owner.stats.healing += receipt.amount
						owner.stats.damage += amount
						_turn_event(state, turn_events, owner, receipt)
				if actor.hp <= 0:
					_turn_event(state, turn_events, actor, {"type": "defeated", "actor": actor.id, "target": actor.id})
					break
			if status.type == "regen":
				var receipt := _heal(state, actor, actor.maxHp * rules.status.regenMaxHpRatio, {"actor": actor.id, "passive": true, "remaining": status.turns - 1})
				_turn_event(state, turn_events, actor, receipt)
			status.turns -= 1
		actor.statuses = actor.statuses.filter(func(s): return s.turns > 0 or (s.turns == 0 and not s.type in ["burn", "bleed", "darkmark", "regen"]))
		var restart_round := false
		if turn_checkpoint.is_valid(): restart_round = turn_checkpoint.call(state) == true
		if state.phase != "playing": return
		# A checkpoint may replace a defeated group and request fresh scheduling.
		if restart_round:
			state.order = []
			state.cursor = 0
			continue
		if _victory(state): return
		if actor.hp <= 0:
			state.cursor += 1
			continue
		return

func _normalize_shields(target: Dictionary, round_number: int) -> void:
	if not target.has("shieldLayers"): target.shieldLayers = []
	if target.shield == 0: target.shieldLayers = []
	elif target.shieldLayers.is_empty(): target.shieldLayers.append({"amount":target.shield,"expiresRound":round_number+(target.shieldTurns if target.shieldTurns > 0 else int(rules.shield.durationRounds))})

func _sync_shields(target: Dictionary, round_number: int) -> void:
	target.shield = 0
	target.shieldTurns = 0
	for layer in target.shieldLayers:
		target.shield += layer.amount
		target.shieldTurns = maxi(target.shieldTurns, layer.expiresRound-round_number)

func _shield(target: Dictionary, power: float, round_number: int) -> Dictionary:
	_normalize_shields(target, round_number)
	var before: int = target.shield
	var grant: int = maxi(0,mini(rounded(target.maxHp * SHIELD_CAP)-before,rounded(target.maxHp*power)))
	if grant > 0: target.shieldLayers.append({"amount":grant,"expiresRound":round_number+int(rules.shield.durationRounds)})
	_sync_shields(target, round_number)
	return {"type":"shield","target":target.id,"amount":grant,"shieldBefore":before,"shieldAfter":target.shield,"shieldTurns":target.shieldTurns}

func _hit(target: Dictionary, total: int, pierce: float = 0.0, metadata: Dictionary = {}) -> Dictionary:
	var before: int = target.shield
	var absorbed: int = mini(before, total - rounded(total * pierce))
	target.shield -= absorbed
	var remaining := absorbed
	for layer in target.get("shieldLayers", []):
		var amount: int = mini(layer.amount,remaining)
		layer.amount -= amount
		remaining -= amount
	target.shieldLayers = target.get("shieldLayers", []).filter(func(layer): return layer.amount > 0)
	if target.shield == 0: target.shieldTurns = 0
	target.stats.shieldAbsorbed += absorbed
	var amount: int = mini(target.hp, total - absorbed)
	target.hp -= amount
	var event := {"type": "damage", "target": target.id, "amount": amount, "absorbed": absorbed, "advantage": 1, "critical": false, "total": total, "shieldBefore": before, "shieldAfter": target.shield, "hpAfter": target.hp}
	event.merge(metadata, true)
	return event

func _emit(state: Dictionary, events: Array, actor: Dictionary, event: Dictionary) -> void:
	events.append(event)
	var entry := event.duplicate(true)
	entry.actor = actor.id
	_log(state, entry)

# Optional encounter checkpoints may end combat at safe resolution boundaries.
# Empty defaults preserve the shared free-combat/PvP behavior and result protocol.
func act(state: Dictionary, action_id: String, target_id: String, critical_override: Variant = null, impact_checkpoint: Callable = Callable(), round_checkpoint: Callable = Callable()) -> Dictionary:
	if state.phase != "playing": return {"error": "A batalha terminou."}
	var actor := current(state)
	if not can_use(actor, action_id): return {"error": "Ação indisponível: energia ou recarga."}
	var action := get_action(actor, action_id)
	var targets := legal_targets(state, actor, action)
	var selected: Dictionary = {}
	for candidate in targets:
		if candidate.id == target_id: selected = candidate
	if selected.is_empty(): return {"error": "Escolha um alvo válido."}
	var hero: Dictionary = catalog.hero_by_id[actor.heroId]
	var events: Array = []
	actor.energy -= action.cost
	actor.stats.actions += 1
	state.turns += 1
	if action.cooldown > 0: actor.cooldowns[action_id] = action.cooldown + 1
	_log(state, {"type": "action", "actor": actor.id, "name": action.name, "actionId": action_id})
	var recipients: Array = targets if action.kind in ["aoe", "healAll", "shieldAll", "supportAll"] else [selected]
	var extra: Dictionary = action.get("secondary", {})
	var boosted_secondary: bool = not extra.is_empty() and recipients.any(func(t): return not _matching_status(t, {"statuses": extra.get("whenStatuses", [extra.get("whenStatus", "")])}).is_empty())
	var spreading: Dictionary = {}
	if action.get("spread", false):
		for status in selected.statuses:
			if status.type in ["burn", "bleed", "darkmark"] and status.turns > 0:
				spreading = status.duplicate(true)
				break
	var stored_shield: int = actor.shield if action.has("shieldScale") else 0
	if stored_shield > 0:
		actor.shield = 0
		actor.shieldTurns = 0
		actor.shieldLayers = []
		_emit(state, events, actor, {"type": "converted", "target": actor.id, "shieldSpent": stored_shield})
	if action.kind == "guard":
		actor.guarding = true
		var event := _shield(actor, rules.guard.shieldMaxHpRatio, state.round)
		event.type = "guard"
		_emit(state, events, actor, event)
		actor.stats.shieldGranted += event.amount
		actor.energy = mini(int(rules.energy.maximum), actor.energy + int(rules.energy.guardGain))
	else:
		for target in recipients:
			var event: Dictionary
			if action.kind.begins_with("heal"):
				event = _heal(state, target, target.maxHp * action.power)
				actor.stats.healing += event.amount
			elif action.kind.begins_with("shield"):
				event = _shield(target, action.power, state.round)
				actor.stats.shieldGranted += event.amount
			elif action.kind.begins_with("support"):
				event = {"type": "support", "target": target.id, "amount": 0}
			else:
				var weak: float = rules.status.weakenAttackMultiplier if has_status(actor, "weaken") else 1.0
				var empowered: float = rules.status.empowerAttackMultiplier if has_status(actor, "empower") else 1.0
				var defense: float = target.defense * (rules.status.exposeDefenseMultiplier if has_status(target, "expose") else 1.0) * (rules.status.tauntDefenseMultiplier if has_status(target, "taunt") else 1.0) * (rules.classPassives.arcanoDefenseMultiplier if hero.classId == "arcano" else 1.0)
				var multiplier := advantage(hero.classId, catalog.hero_by_id[target.heroId].classId)
				var critical: bool = _random(state) < minf(1.0, rules.critical.chance + (rules.classPassives.igneoCriticalChance if hero.classId == "igneo" else 0) + action.get("criticalChance", 0))
				if critical_override != null: critical = bool(critical_override)
				var bonus := 1.0
				var combo := ""
				if action.has("combo") and not _matching_status(target, action.combo).is_empty():
					bonus *= action.combo.multiplier
					combo = _matching_status(target, action.combo)
					actor.stats.combos += 1
					if action.combo.consume: _remove(target, combo)
				if has_status(target, "focus"):
					bonus *= rules.status.focusDamageMultiplier
					_remove(target, "focus")
					if combo.is_empty(): combo = "focus"
					actor.stats.combos += 1
				if action.has("executeThreshold") and float(target.hp) / target.maxHp < action.executeThreshold:
					bonus *= action.executeMultiplier
					if combo.is_empty(): combo = "execute"
					actor.stats.combos += 1
				# Keep the same multiplication order and single rounding as engine.js.
				var total: int = maxi(int(rules.damage.minimumHit), rounded(
					(actor.attack * weak * empowered * action.power + stored_shield * action.get("shieldScale", 0))
					* rules.damage.defenseBaseline / (rules.damage.defenseBaseline + defense * rules.damage.defenseWeight)
					* multiplier
					* (rules.guard.incomingDamageMultiplier if target.guarding else 1.0)
					* (rules.status.fortifyIncomingDamageMultiplier if has_status(target, "fortify") else 1.0)
					* (rules.status.elementalWardIncomingMultiplier if has_status(target, "elementalWard") and multiplier > 1 else 1.0)
					* bonus * (rules.critical.damageMultiplier if critical else 1.0)
				))
				var protections: Array = target.statuses.filter(func(s): return s.type == "cover") if action.kind == "damage" else []
				var guardian: Dictionary = unit(state, protections[0].owner) if not protections.is_empty() else {}
				if not guardian.is_empty() and guardian.hp > 0 and guardian.side == target.side and guardian.id != target.id:
					var share := rounded(total * rules.status.coverRedirectRatio)
					var receipt := _hit(guardian, share, action.get("pierce", 0), {"intercepted": true})
					_emit(state, events, actor, receipt)
					total -= receipt.amount + receipt.absorbed
					guardian.stats.protected += receipt.amount + receipt.absorbed
					actor.stats.damage += receipt.amount
					actor.stats.shieldDamage += receipt.absorbed
					if guardian.hp == 0: _emit(state, events, actor, {"type": "defeated", "target": guardian.id})
				event = _hit(target, total, action.get("pierce", 0), {"advantage": multiplier, "critical": critical})
				if not combo.is_empty(): event.combo = combo
				actor.stats.damage += event.amount
				actor.stats.shieldDamage += event.absorbed
				if has_status(target, "seed") and actor.hp > 0:
					_remove(target, "seed")
					var receipt := _heal(state, actor, actor.maxHp * rules.status.seedHealMaxHpRatio, {"passive": true, "source": "seed"})
					_emit(state, events, actor, receipt)
					actor.stats.healing += receipt.amount
				if hero.classId == "sombrio" and event.amount > 0 and actor.hp > 0:
					var receipt := _heal(state, actor, event.amount * rules.classPassives.sombrioDrainRatio, {"passive": true, "source": "drain"})
					if receipt.amount > 0:
						_emit(state, events, actor, receipt)
						actor.stats.healing += receipt.amount
				if target.hp > 0 and actor.hp > 0:
					var defender: Dictionary = catalog.hero_by_id[target.heroId]
					var reflect: float = (rules.status.mirrorDamageRatio if has_status(target, "mirror") else 0.0) + (rules.classPassives.igneoReflectRatio if defender.classId == "igneo" and defender.role in ["Tanque", "Suporte"] else 0.0)
					var retaliation: int = rounded(event.amount * reflect) + (rounded(target.attack * rules.status.riposteAttackRatio) if has_status(target, "riposte") else 0)
					if retaliation > 0:
						var receipt := _hit(actor, retaliation, 0, {"reaction": true})
						_emit(state, events, actor, receipt)
						target.stats.damage += receipt.amount
						target.stats.shieldDamage += receipt.absorbed
						if actor.hp == 0: _emit(state, events, actor, {"type": "defeated", "target": actor.id})
					if has_status(target, "sentinel") and actor.hp > 0:
						_status(actor, "weaken")
						_emit(state, events, actor, {"type": "status", "target": actor.id, "effect": "weaken", "effectTurns": int(rules.status.durationTurns), "source": "sentinel"})
					if has_status(target, "emberguard") and actor.hp > 0:
						_status(actor, "burn")
						_emit(state, events, actor, {"type": "status", "target": actor.id, "effect": "burn", "effectTurns": int(rules.status.durationTurns), "source": "emberguard"})
			if target.hp > 0:
				for effect in [action.get("effect", ""), action.get("extraEffect", "")]:
					if effect.is_empty(): continue
					if not event.has("effect"):
						event.effect = effect
						event.effectTurns = 0 if effect == "cleanse" else int(action.get("duration", rules.status.durationTurns))
					else:
						event.extraEffect = effect
						event.extraEffectTurns = int(action.get("duration", rules.status.durationTurns))
					if effect == "cleanse": event.cleansed = target.statuses.filter(func(s): return not s.type in POSITIVE).map(func(s): return s.type)
					_status(target, effect, actor.id, int(action.get("duration", rules.status.durationTurns)))
			_emit(state, events, actor, event)
			if target.hp == 0: _emit(state, events, actor, {"type": "defeated", "target": target.id})
		if not spreading.is_empty() and actor.hp > 0:
			for destination in state.units:
				if destination.side == selected.side and destination.hp > 0 and destination.id != selected.id and not has_status(destination, spreading.type):
					_status(destination, spreading.type, spreading.get("owner", null), spreading.turns)
					_emit(state, events, actor, {"type": "status", "target": destination.id, "effect": spreading.type, "effectTurns": spreading.turns, "source": "spread"})
					break
		if not extra.is_empty() and actor.hp > 0:
			var allies: Array = state.units.filter(func(u): return u.side == actor.side and u.hp > 0)
			var destinations: Array = [selected]
			match extra.target:
				"allies": destinations = allies
				"actor": destinations = [actor]
				"lowestAlly":
					var weakest: Dictionary = allies[0]
					for candidate in allies:
						if float(candidate.hp) / candidate.maxHp < float(weakest.hp) / weakest.maxHp: weakest = candidate
					destinations = [weakest]
			for target in destinations:
				if target.hp <= 0: continue
				var power: float = extra.get("power", 0) * (extra.multiplier if boosted_secondary else 1.0)
				match extra.kind:
					"heal":
						var receipt := _heal(state, target, target.maxHp * power, {"source": "secondary"})
						actor.stats.healing += receipt.amount
						_emit(state, events, actor, receipt)
					"shield":
						var receipt := _shield(target, power, state.round)
						actor.stats.shieldGranted += receipt.amount
						_emit(state, events, actor, receipt)
					"energy":
						var amount: int = mini(int(rules.energy.maximum) - target.energy, extra.amount)
						target.energy += amount
						actor.stats.energyGiven += amount
						_emit(state, events, actor, {"type": "energy", "target": target.id, "amount": amount, "energyAfter": target.energy})
		if action_id == "basic": actor.energy = mini(int(rules.energy.maximum), actor.energy + int(action.get("energyGain",rules.energy.basicGain)))
	actor.statuses = actor.statuses.filter(func(s): return s.turns > 0)
	var impact_units: Array = state.units.duplicate(true)
	var turn_events: Array = []
	var restart_round := false
	if impact_checkpoint.is_valid(): restart_round = impact_checkpoint.call(state) == true
	if restart_round and state.phase == "playing":
		state.order = [];state.cursor = -1
	if state.phase == "playing" and not _victory(state):
		state.cursor += 1
		_begin_turn(state, turn_events, round_checkpoint, impact_checkpoint)
	return {"actor": actor.id, "heroId": actor.heroId, "actionId": action_id, "animation": hero.animation, "events": events, "impactUnits": impact_units, "turnEvents": turn_events}

func preview(state: Dictionary, action_id: String, target_id: String) -> Dictionary:
	return {"normal": act(state.duplicate(true), action_id, target_id, false), "critical": act(state.duplicate(true), action_id, target_id, true)}

func _ai_threat(target: Dictionary) -> float:
	return 1 + maxf(0,.7-float(target.hp)/target.maxHp)*2

func _ai_effect(state: Dictionary, actor: Dictionary, target: Dictionary, type: String) -> float:
	if type == "": return 0
	if type == "cleanse": return target.statuses.filter(func(s): return not s.type in POSITIVE).size()*70
	if has_status(target,type): return 0
	if type == "taunt":
		var value := 0.0
		for ally in state.units:
			if ally.side == actor.side and ally.hp > 0 and ally.id != actor.id: value += 55*_ai_threat(ally)
		return value*float(actor.hp)/actor.maxHp
	if type == "cover": return 75*_ai_threat(target)
	return {"burn":90,"bleed":110,"darkmark":85,"weaken":65,"expose":50,"focus":65,"seed":55,"regen":65,"fortify":55,"empower":65,"riposte":40,"mirror":45,"emberguard":45,"sentinel":65,"elementalWard":45}.get(type,0)

func _ai_damage(state: Dictionary, actor: Dictionary, target: Dictionary, action: Dictionary) -> float:
	var hero: Dictionary = catalog.hero_by_id[actor.heroId]
	var affinity := advantage(hero.classId,catalog.hero_by_id[target.heroId].classId)
	var defense: float = target.defense*(rules.status.exposeDefenseMultiplier if has_status(target,"expose") else 1.0)*(rules.status.tauntDefenseMultiplier if has_status(target,"taunt") else 1.0)*(rules.classPassives.arcanoDefenseMultiplier if hero.classId == "arcano" else 1.0)
	var bonus: float = action.combo.multiplier if action.has("combo") and _matching_status(target,action.combo) != "" else 1.0
	if has_status(target,"focus"): bonus *= rules.status.focusDamageMultiplier
	if action.has("executeThreshold") and float(target.hp)/target.maxHp < action.executeThreshold: bonus *= action.executeMultiplier
	var total: int = maxi(1,rounded((actor.attack*(rules.status.weakenAttackMultiplier if has_status(actor,"weaken") else 1.0)*(rules.status.empowerAttackMultiplier if has_status(actor,"empower") else 1.0)*action.power+actor.shield*action.get("shieldScale",0))*rules.damage.defenseBaseline/(rules.damage.defenseBaseline+defense*rules.damage.defenseWeight)*affinity*(rules.guard.incomingDamageMultiplier if target.guarding else 1.0)*(rules.status.fortifyIncomingDamageMultiplier if has_status(target,"fortify") else 1.0)*(rules.status.elementalWardIncomingMultiplier if has_status(target,"elementalWard") and affinity > 1 else 1.0)*bonus))
	var covers: Array = target.statuses.filter(func(s): return s.type == "cover")
	if action.kind == "damage" and not covers.is_empty() and state.units.any(func(u): return u.id == covers[0].owner and u.hp > 0 and u.side == target.side): total -= rounded(total*rules.status.coverRedirectRatio)
	var absorbed: int = mini(target.shield,total-rounded(total*action.get("pierce",0)))
	var hp_damage: int = maxi(0,total-absorbed)
	var role: String = catalog.hero_by_id[target.heroId].role
	var priority := float(rules.ai.supportPriority) if role == "Suporte" else float(rules.ai.damagePriority) if role == "Dano" else 1.0
	return mini(target.hp,hp_damage)*priority+absorbed*.6+(rules.ai.killBonus if hp_damage >= target.hp else 0)+(target.maxHp-target.hp)*.08

func _ai_value(state: Dictionary, actor: Dictionary, target: Dictionary, action: Dictionary) -> float:
	var value := 0.0
	if action.kind.begins_with("heal"): value = mini(target.maxHp-target.hp,rounded(target.maxHp*action.power*healing_multiplier(state,target)))*rules.ai.healValue*_ai_threat(target)
	elif action.kind.begins_with("shield"): value = maxi(0,mini(rounded(target.maxHp*rules.shield.maxHpRatio)-target.shield,rounded(target.maxHp*action.power)))*rules.ai.shieldValue*_ai_threat(target)
	elif not action.kind.begins_with("support"): value = _ai_damage(state,actor,target,action)
	return value+_ai_effect(state,actor,target,action.get("effect",""))+_ai_effect(state,actor,target,action.get("extraEffect",""))

func choose_ai(state: Dictionary) -> Dictionary:
	var actor := current(state)
	if actor.is_empty() or state.phase != "playing": return {}
	var best: Dictionary = {}
	var best_score := -INF
	for id in ["basic","skill","ultimate"]:
		if not can_use(actor,id): continue
		var action := get_action(actor,id)
		var targets := legal_targets(state,actor,action)
		if friendly(action): targets.sort_custom(func(a,b): return a.slot < b.slot if float(a.hp)/a.maxHp == float(b.hp)/b.maxHp else float(a.hp)/a.maxHp < float(b.hp)/b.maxHp)
		for target in targets:
			var recipients: Array = targets if action.kind in ["aoe","healAll","shieldAll","supportAll"] else [target]
			var score: float = -action.cost*.25
			for recipient in recipients: score += _ai_value(state,actor,recipient,action)
			if id == "basic": score += 8
			if action.get("spread",false) and target.statuses.any(func(s): return s.type in ["burn","bleed","darkmark"]): score += 60
			var extra: Dictionary = action.get("secondary",{})
			if not extra.is_empty():
				var allies: Array = state.units.filter(func(u): return u.side == actor.side and u.hp > 0)
				var lowest: Array = allies.duplicate()
				lowest.sort_custom(func(a,b): return float(a.hp)/a.maxHp < float(b.hp)/b.maxHp)
				var destinations: Array = allies if extra.target == "allies" else [actor] if extra.target == "actor" else [lowest[0]] if extra.target == "lowestAlly" else [target]
				var boost: float = extra.get("multiplier",1) if recipients.any(func(t): return _matching_status(t,{"statuses":extra.get("whenStatuses",[extra.get("whenStatus","")])}) != "") else 1.0
				for destination in destinations:
					if extra.kind == "energy": score += mini(int(rules.energy.maximum)-destination.energy,int(extra.amount))*.8
					else: score += _ai_value(state,actor,destination,{"kind":extra.kind,"power":extra.get("power",0)*boost})
			score = floor(score*100+.5)
			if score > best_score:
				best_score = score
				best = {"actionId":id,"targetId":target.id}
	return best if not best.is_empty() else {"actionId":"guard","targetId":actor.id}
