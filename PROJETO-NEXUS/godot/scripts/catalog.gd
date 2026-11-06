extends RefCounted
## Generated catalog is shared with the browser prototype. No Node runtime needed.
var heroes: Array = []
var archived_heroes: Array = []
var classes: Array = []
var hero_by_id: Dictionary = {}
var class_by_id: Dictionary = {}
var default_teams: Array = []
var guard: Dictionary = {}

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
	assert(data.get("schemaVersion") == 1, "Unsupported catalog schema")
	heroes = data.heroes
	archived_heroes = data.get("archivedHeroes", [])
	classes = data.classes
	default_teams = data.defaultTeams
	guard = data.guard
	for hero in heroes:
		hero_by_id[hero.id] = hero
	for affinity in classes:
		class_by_id[affinity.id] = affinity

func valid_team(ids: Variant) -> bool:
	if not ids is Array or ids.size() != 3:
		return false
	var seen := {}
	for id in ids:
		if not id is String or not hero_by_id.has(id) or seen.has(id):
			return false
		seen[id] = true
	return true

func affinity_color(id: String) -> Color:
	return Color(class_by_id[id].color)
