extends SceneTree
## Exercise real files in an isolated user directory; never touch player saves.
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const PATH := "user://recovery-test.json"
var checks := 0
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)

func write(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()

func clean() -> void:
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".invalid.bak", ".invalid.bak.1"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))

func _run() -> void:
	clean()
	var engine := Combat.new()
	var story := Campaign.new(engine.catalog, PATH)
	check(story.set_team(["axion", "veyra", "astra"]), "Team can be saved before a mission")
	check(story.equip("veyra", "ember"), "Loadout changes persist")
	check(story.complete(0).saved, "First mission persists a real reward")
	var previous := FileAccess.get_file_as_string(PATH)
	check(story.complete(1).saved, "Second mission persists a different checkpoint")
	check(FileAccess.file_exists(PATH + ".bak") and FileAccess.get_file_as_string(PATH + ".bak") == previous, "Every successful replacement keeps the exact previous save")
	var current := FileAccess.get_file_as_string(PATH)
	var reopened := Campaign.new(engine.catalog, PATH)
	check(reopened.cleared == 2 and reopened.error_text == "", "A healthy primary always wins over an older backup")
	write(PATH, "interrupted write {")
	var recovered := Campaign.new(engine.catalog, PATH)
	check(recovered.cleared == 1 and recovered.team == story.team and recovered.slots("veyra")[0] == "ember", "Corrupt primary recovers the previous mission, team and equipment together")
	check(recovered.error_text.contains("recuperado") and FileAccess.get_file_as_string(PATH) == "interrupted write {", "Recovery is visible and reading alone preserves the damaged source")
	check(recovered.copies("ember") == 4 and recovered.copies("sap") == 3 and recovered.can_play(1) and not recovered.can_play(2), "Recovery restores actual first-clear rewards and locks without inventing progress")
	check(recovered.equip("axion", "sap") and FileAccess.get_file_as_string(PATH + ".invalid.bak") == "interrupted write {", "The next edit preserves the damaged primary before replacing it")
	check(FileAccess.get_file_as_string(PATH + ".bak") == previous, "A corrupt source cannot replace the last healthy backup")
	var reload := Campaign.new(engine.catalog, PATH)
	check(reload.cleared == 1 and reload.slots("axion")[0] == "sap" and reload.error_text == "", "Recovered progress remains playable and survives a fresh reload")
	var battle: Dictionary = reload.battle(engine, 1)
	var choice: Dictionary = engine.choose_ai(battle)
	check(not engine.act(battle, choice.actionId, choice.targetId).has("error"), "Recovered progress enters its next actual mission and resolves a legal combat action")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
	var missing := Campaign.new(engine.catalog, PATH)
	check(missing.cleared == 1 and missing.error_text.contains("recuperado"), "A missing primary also recovers a verified backup")
	write(PATH, current)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + ".bak"))
	DirAccess.make_dir_absolute(ProjectSettings.globalize_path(PATH + ".bak"))
	var blocked := Campaign.new(engine.catalog, PATH)
	var before := blocked.equipped.duplicate(true)
	check(not blocked.equip("axion", "sap") and blocked.equipped == before and blocked.error_text != "", "Backup failure rolls back the requested equipment change")
	check(FileAccess.get_file_as_string(PATH) == current, "Backup failure cannot replace the only healthy primary")
	clean()
	write(PATH + ".bak", previous)
	write(PATH, '{"schemaVersion":999,"cleared":9}')
	var future := Campaign.new(engine.catalog, PATH)
	check(future.cleared == 0 and future.error_text != "", "A future schema is reported rather than silently downgraded to an older backup")
	write(PATH, "invalid")
	write(PATH + ".bak", '{"schemaVersion":3,"cleared":7,"team":["missing"],"equipped":{}}')
	var invalid_backup := Campaign.new(engine.catalog, PATH)
	check(invalid_backup.cleared == 0 and invalid_backup.error_text != "", "A backup with an invalid roster cannot grant seven missions")
	var excess: Dictionary = JSON.parse_string(previous)
	excess.equipped = {"veyra": ["ember", "ember", "ember"], "astra": ["ember", "ember", "ember"]}
	write(PATH + ".bak", JSON.stringify(excess))
	var bad_inventory := Campaign.new(engine.catalog, PATH)
	check(bad_inventory.cleared == 0 and bad_inventory.error_text != "", "A backup claiming more gem copies than earned is rejected as a whole")
	write(PATH + ".bak", "not json either")
	var both_bad := Campaign.new(engine.catalog, PATH)
	check(both_bad.cleared == 0 and both_bad.error_text != "" and FileAccess.get_file_as_string(PATH) == "invalid", "Two corrupt files stay untouched and report failure")
	clean()
	print("Campaign save recovery: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
