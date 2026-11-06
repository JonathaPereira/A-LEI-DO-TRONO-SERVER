extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://mission-id-test.json"
var failures := 0
var checks := 0

func _initialize() -> void: _run.call_deferred()
func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)
func write(data: Variant) -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(data))
	file.close()
func clean() -> void:
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".v1.bak", ".v2.bak", ".v3.bak", ".invalid.bak"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))
func index_of(story, id: String) -> int:
	for index in range(story.missions.size()):
		if story.missions[index].id == id: return index
	return -1
func _run() -> void:
	clean()
	var engine := Combat.new()
	var old := {"schemaVersion":3,"cleared":4,"team":["axion","veyra","astra"],"equipped":{"veyra":["ember","ember","ember"],"astra":["pulse","",""]}}
	write(old)
	var story = Campaign.new(engine.catalog, PATH)
	check(story.cleared == 4 and story.copies("ember") == 5 and story.copies("sap") == 4, "Legacy third schema preserves all four earned rewards")
	check(story.save_progress(), "Migrated progress can be saved")
	var saved: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	check(saved.get("schemaVersion") == 8 and saved.get("completed", {}) == {"gate":"ember","court":"sap","eclipse":"pulse","tidal-gate":"ember"}, "Migration stores stable mission IDs and historical rewards")
	check(FileAccess.file_exists(PATH + ".v3.bak"), "Version-three source receives a migration backup")
	var unchanged := saved.duplicate(true)
	var reordered: Array = Campaign.MISSIONS.duplicate(true)
	reordered.reverse()
	for mission in reordered:
		if mission.id == "gate": mission.reward = "pulse"
	var shuffled = Campaign.new(engine.catalog, PATH, reordered)
	check(shuffled.is_complete(index_of(shuffled, "gate")) and not shuffled.is_complete(index_of(shuffled, "forge-heart")), "Reordering missions cannot move a clear to another mission")
	check(shuffled.copies("ember") == 5 and shuffled.copies("pulse") == 4, "Changing a mission reward preserves gems already earned under its old reward")
	check(shuffled.mission_reward(index_of(shuffled,"gate")).id == "ember", "Received-reward presentation uses the historical reward, not the rebalanced catalog")
	check(shuffled.missions[shuffled.chapter_final(0)].id == "eclipse", "A chapter's narrative finale remains the same mission after reordering")
	check(shuffled.battle(engine,index_of(shuffled,"court")).random == Campaign.new(engine.catalog,PATH).battle(engine,1).random, "A mission keeps the same seeded combat after reordering")
	check(shuffled.missions[shuffled.next_mission()].id == "tidal-archive" and shuffled.can_play(index_of(shuffled,"tidal-archive")) and not shuffled.can_play(index_of(shuffled,"forge-road")), "Continue and locks follow explicit prerequisite IDs instead of list offsets")
	check(not shuffled.complete(index_of(shuffled,"gate")).first and shuffled.copies("pulse") == 4, "Replaying a rebalanced mission cannot grant its new reward again")
	var extra: Dictionary = Campaign.MISSIONS[0].duplicate(true)
	extra.merge({"id":"optional-relay", "name":"Relay", "requires":["court"], "reward":"pulse"}, true)
	reordered.push_front(extra)
	var expanded = Campaign.new(engine.catalog, PATH, reordered)
	check(expanded.cleared == 4 and not expanded.is_complete(0) and expanded.copies("pulse") == 4, "Inserting a new mission never grants a completion or a gem automatically")
	check(expanded.can_play(0) and expanded.next_mission() == 0, "An inserted mission can be selected once its own prerequisites are met")
	check(expanded.complete(0).first and expanded.cleared == 5 and expanded.copies("pulse") == 5, "A new mission grants one real first-clear reward")
	var reopened = Campaign.new(engine.catalog, PATH, reordered)
	check(reopened.cleared == 5 and reopened.is_complete(0) and reopened.copies("pulse") == 5 and not reopened.complete(0).first, "New and old mission IDs survive reopening without duplicate rewards")
	var app = Main.instantiate()
	root.add_child(app)
	await process_frame
	app.campaign = reopened
	app.hub.selected_chapter = 0
	app.hub.open("story")
	check(app.hub.mission_slots.has(0) and app.hub.mission_slots[0].text == "Rejogar missão", "The real story menu shows the inserted completed mission by its identity")
	check(app.hub.mission_slots.size() == 4 and not app.hub.next_mission_button.disabled, "Chapter grouping and Continue remain usable after catalog reordering and insertion")
	var reward_labels: Array = app.hub.mission_slots[index_of(reopened,"gate")].get_parent().find_children("*", "Label", true, false)
	check(reward_labels.any(func(label): return label.text.contains("RECEBIDA") and label.text.contains("Brasa lapidada")), "The actual completed mission card displays the gem it awarded before rebalance")
	check(app.hub.body.find_children("*", "Label", true, false).any(func(label): return label.text == Campaign.MISSIONS[2].ending), "A completed reordered chapter shows its original narrative conclusion")
	app._begin_mission(0)
	check(app.state.campaignMission == 0 and app.state.units.size() == 6, "The inserted definition enters the actual campaign battle")
	app.queue_free()
	await process_frame
	await process_frame
	while reopened.cleared < reopened.missions.size():
		var result: Dictionary = reopened.complete(reopened.next_mission())
		if result.has("error"):
			check(false, "Every remaining mission is reachable through ID prerequisites")
			break
	check(reopened.missions[reopened.next_mission()].id == "forge-heart", "Revisiting a completed journey selects its canonical finale instead of the last array entry")
	for version in [1,2,3]:
		clean()
		var legacy := old.duplicate(true)
		legacy.schemaVersion = version
		legacy.cleared = 3
		if version == 1: legacy.equipped = {"veyra":"ember","astra":"pulse"}
		write(legacy)
		var original := FileAccess.get_file_as_string(PATH)
		var migration = Campaign.new(engine.catalog, PATH, reordered)
		check(migration.cleared == 3 and migration.copies("ember") == 4 and migration.copies("pulse") == 4 and migration.team == old.team, "Schema %d migration uses the frozen original IDs, rewards and team" % version)
		check(migration.slots("veyra")[0] == "ember" and migration.save_progress(), "Schema %d migration preserves equipment and writes successfully" % version)
		check(FileAccess.get_file_as_string(PATH + ".v%d.bak" % version) == original, "Schema %d migration preserves the exact old document" % version)
	clean()
	write(unchanged)
	var stable = Campaign.new(engine.catalog, PATH)
	check(stable.equip("axion","sap"), "A schema-four edit creates a recoverable previous snapshot")
	var corrupt := FileAccess.open(PATH, FileAccess.WRITE)
	corrupt.store_string("broken {")
	corrupt.close()
	var recovered = Campaign.new(engine.catalog, PATH)
	check(recovered.cleared == 4 and recovered.copies("ember") == 5 and recovered.slots("veyra") == old.equipped.veyra and recovered.error_text.contains("recuperado"), "Schema-four recovery restores IDs, historical rewards and equipment together")
	clean()
	write({"schemaVersion":4,"completed":{"future-mission":"ember"},"team":old.team,"equipped":{}})
	var unknown = Campaign.new(engine.catalog, PATH)
	var source := FileAccess.get_file_as_string(PATH)
	check(unknown.error_text != "" and not unknown.equip("veyra", "ember"), "A save with unknown mission IDs cannot be silently rewritten")
	check(FileAccess.get_file_as_string(PATH) == source, "Unknown mission data remains byte-for-byte preserved")
	clean()
	write(old)
	var removed: Array = Campaign.MISSIONS.duplicate(true)
	removed.remove_at(0)
	var absent = Campaign.new(engine.catalog, PATH, removed)
	var absent_source := FileAccess.get_file_as_string(PATH)
	check(absent.error_text.contains("ausentes") and not absent.save_progress(), "A legacy save containing a removed mission cannot become an invalid new save")
	check(FileAccess.get_file_as_string(PATH) == absent_source, "Removing a legacy definition never overwrites the old progress")
	clean()
	write({"schemaVersion":999,"cleared":4})
	var future = Campaign.new(engine.catalog, PATH)
	var future_source := FileAccess.get_file_as_string(PATH)
	check(not future.set_team(old.team) and not future.complete(0).get("saved",false) and FileAccess.get_file_as_string(PATH) == future_source, "Future schemas block team edits and mission rewards without downgrading data")
	clean()
	print("Mission identity progression: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
