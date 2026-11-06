extends RefCounted
## PvP has free copies and its own save. It never writes campaign equipment.
const STORE := "user://pvp-loadout.json"
var rules: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/pvp-rules.json"))
var team: Array = []
var gems: Dictionary = {}
var catalog
var store_path := STORE
var error_text := ""
func _init(source, path := STORE) -> void:
	catalog = source
	store_path = path
	team = catalog.default_teams[0].duplicate()
	if FileAccess.file_exists(store_path):
		var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(store_path))
		if saved is Dictionary and catalog.valid_team(saved.get("team",[])) and saved.team.all(func(id):return catalog.heroes.any(func(hero):return hero.id==id)):
			team = saved.team.duplicate()
			if saved.get("gems") is Dictionary:
				for id in saved.gems:
					if catalog.heroes.any(func(h): return h.id==id) and _valid_slots(saved.gems[id]): gems[id]=saved.gems[id].duplicate()
func _valid_slots(value: Variant) -> bool:
	return value is Array and value.size()==int(rules.slotCount) and value.all(func(g): return g is String and (g=="" or rules.gems.any(func(item): return item.id==g)))
func slots(id: String) -> Array: return gems.get(id,["","",""]).duplicate()
func set_member(slot: int, id: String) -> bool:
	if slot<0 or slot>=3 or not catalog.heroes.any(func(h): return h.id==id): return false
	var existing := team.find(id)
	if existing>=0: team[existing]=team[slot]
	team[slot]=id
	return save()
func equip(id: String, slot: int, gem_id: String) -> bool:
	if not id in team or slot<0 or slot>=int(rules.slotCount) or (gem_id!="" and not rules.gems.any(func(g):return g.id==gem_id)): return false
	var items := slots(id)
	items[slot]=gem_id
	gems[id]=items
	return save()
func payload() -> Dictionary:
	var equipped := {}
	for id in team: equipped[id]=slots(id)
	return {"team":team.duplicate(),"gems":equipped}
func attributes(id: String) -> Dictionary:
	var hero: Dictionary=catalog.hero_by_id[id]
	var values := {"attack":float(hero.attack),"maxHp":float(hero.hp),"energy":40.0}
	var bonuses := {"attack":0.0,"maxHp":0.0,"energy":0.0}
	for type in slots(id):
		for gem in rules.gems:
			if gem.id==type: bonuses[gem.stat]+=float(gem.bonus)
	values.attack=floor(values.attack*(1+bonuses.attack)+.5)
	values.maxHp=floor(values.maxHp*(1+bonuses.maxHp)+.5)
	values.energy=minf(100,values.energy+bonuses.energy)
	return values
func save() -> bool:
	var file := FileAccess.open(store_path,FileAccess.WRITE)
	if not file:
		error_text="Não foi possível salvar a formação PvP neste dispositivo."
		return false
	file.store_string(JSON.stringify({"schemaVersion":1,"team":team,"gems":gems}))
	error_text="" if file.get_error()==OK else "Falha ao salvar a formação PvP."
	return error_text==""
