extends RefCounted
## Basic pieces exist for every active hero. Improved pieces can be exchanged,
## preserving investment; shared gems and materials never belong to a battle.
static var settings: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment.json"))

static func defaults() -> Array:
	return [{"variant":"standard","tier":1},{"variant":"standard","tier":1},{"variant":"standard","tier":1}]

static func row(gear: Dictionary, hero: String) -> Array:
	return gear.get(hero,defaults()).duplicate(true)

static func valid_piece(value: Variant, slot: int) -> bool:
	return value is Dictionary and value.size() == 2 and value.get("variant") is String and settings.slots[slot].variants.has(value.variant) and (value.get("tier") is int or value.get("tier") is float) and is_finite(float(value.tier)) and value.tier >= 1 and value.tier <= 3 and value.tier == floor(float(value.tier))

static func unlocked_tier(completed: Dictionary) -> int:
	return 3 if completed.has(settings.tierUnlocks[2]) else 2 if completed.has(settings.tierUnlocks[1]) else 1

static func variant_unlocked(completed: Dictionary, variant: String) -> bool:
	return variant == "standard" or completed.has(settings.variantUnlock)

static func invested(tier: int) -> int:
	var cost := 0
	for index in range(1,tier): cost += int(settings.upgradeCosts[index])
	return cost

static func spent(gear: Dictionary) -> int:
	var cost := 0
	for pieces in gear.values():
		for item in pieces: cost += invested(int(item.tier))
	return cost

static func first_reward(id: String) -> int:
	return int(settings.firstClearMaterials) + (int(settings.chapterBonusMaterials) if id in settings.chapterEnds else 0)

static func earned(completed: Dictionary, replays: Dictionary) -> int:
	var total := 0
	for id in completed: total += first_reward(id)
	for count in replays.values(): total += int(count) * int(settings.replayMaterials)
	return total

static func validate(gear: Variant, replays: Variant, completed: Dictionary, active_ids: Array) -> String:
	if not gear is Dictionary or gear.size() > active_ids.size(): return "Inventário de equipamentos inválido."
	if not replays is Dictionary or replays.size() > completed.size(): return "Recompensas de repetição inválidas."
	for id in replays:
		var count: Variant = replays[id]
		if not id is String or not completed.has(id) or not (count is int or count is float) or not is_finite(float(count)) or count != floor(float(count)) or count < 0 or count > 100000: return "Recompensas de repetição desconhecidas ou inválidas."
	for hero in gear:
		if not hero is String or hero not in active_ids or not gear[hero] is Array or gear[hero].size() != 3: return "Dono ou peças de equipamento desconhecidos."
		for slot in range(3):
			var item: Variant = gear[hero][slot]
			if not valid_piece(item,slot) or item.tier > unlocked_tier(completed) or not variant_unlocked(completed,item.variant): return "Equipamento desconhecido, inválido ou ainda bloqueado."
	if spent(gear) > earned(completed,replays): return "O investimento supera os materiais conquistados."
	return ""

static func bonuses(pieces: Array) -> Dictionary:
	var result := {"attack":0.0,"health":0.0,"defense":0.0,"energy":0}
	for slot in range(3):
		var item: Dictionary = pieces[slot]
		var values: Dictionary = settings.slots[slot].variants[item.variant].bonuses[int(item.tier)-1]
		for stat in values: result[stat] += values[stat]
	return result
