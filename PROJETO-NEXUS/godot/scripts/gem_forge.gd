extends RefCounted
## Counts record recipes; stock is derived so crafting, fusion and sockets
## can be validated and recovered as one checkpoint.
const BASE_IDS := ["ember","sap","pulse"]
const STARTING_COPIES := 3
static var settings: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/gem-forge.json"))

static func key(base: String, level: int) -> String:
	return base if level == 1 else base+":"+str(level)

static func identity(id: String) -> Dictionary:
	for base in BASE_IDS:
		for level in range(1,4):
			if id == key(base,level): return {"base":base,"level":level}
	return {}

static func lookup(id: String, definitions: Array) -> Dictionary:
	var info := identity(id)
	if info.is_empty(): return {}
	for base in definitions:
		if base.id != info.base: continue
		var item: Dictionary = base.duplicate(true)
		item.id = id
		item.base = info.base
		item.level = info.level
		item.bonus = settings.bonuses[info.base][info.level-1]
		if info.level > 1:
			item.name += " · " + ("II" if info.level == 2 else "III")
			item.effect = "+%d EN inicial" % item.bonus if item.stat == "energy" else "+%s%% %s" % [str(item.bonus*100),"ATQ" if item.stat == "attack" else "VIDA"]
			item.detail = "Nível %d: %s na campanha. Bônus somados ao atributo base; energia respeita o teto normal. Não altera custos, recargas ou duração." % [info.level,item.effect]
		return item
	return {}

static func spent(crafts: Dictionary) -> int:
	var total := 0
	for count in crafts.values(): total += int(count)*int(settings.craftMaterials)
	return total

static func stock(completed: Dictionary, crafts: Dictionary, fusions: Dictionary) -> Dictionary:
	var result := {}
	for base in BASE_IDS:
		result[base] = STARTING_COPIES + completed.values().count(base) + int(crafts.get(base,0))*int(settings.craftCopies) - int(fusions.get(base,0))*int(settings.fusionCopies)
		result[key(base,2)] = int(fusions.get(base,0)) - int(fusions.get(key(base,2),0))*int(settings.fusionCopies)
		result[key(base,3)] = int(fusions.get(key(base,2),0))
	return result

static func count_valid(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= 2000000 and value == floor(float(value))

static func validate(crafts: Variant, fusions: Variant, sockets: Variant, completed: Dictionary, budget: int, active_ids: Array) -> String:
	if not crafts is Dictionary or crafts.size() > 3 or not fusions is Dictionary or fusions.size() > 6: return "Registros de fabricação ou fusão inválidos."
	for id in crafts:
		if not id is String or id not in BASE_IDS or not count_valid(crafts[id]) or crafts[id] > 0 and not completed.has(settings.craftUnlock): return "Fabricação desconhecida, inválida ou bloqueada."
	for id in fusions:
		if not id is String: return "Fusão desconhecida."
		var info := identity(id)
		if info.is_empty() or info.level >= 3 or not count_valid(fusions[id]): return "Fusão desconhecida ou inválida."
		if fusions[id] > 0 and not completed.has(settings.levelUnlocks[info.level]): return "Patamar de fusão ainda bloqueado."
	if spent(crafts) > budget: return "A fabricação supera os fragmentos disponíveis."
	var remaining := stock(completed,crafts,fusions)
	if remaining.values().any(func(count):return count < 0): return "A fusão consome mais cópias do que as conquistadas."
	if not sockets is Dictionary or sockets.size() > active_ids.size(): return "Engastes de gemas inválidos."
	for hero in sockets:
		if not hero is String or hero not in active_ids or not sockets[hero] is Array or sockets[hero].size() != 3: return "Herói ou engastes desconhecidos."
		for id in sockets[hero]:
			if not id is String: return "Gema inválida no engaste."
			if id == "": continue
			if not remaining.has(id) or remaining[id] <= 0: return "Os engastes excedem as cópias livres de cada nível."
			remaining[id] -= 1
	return ""
