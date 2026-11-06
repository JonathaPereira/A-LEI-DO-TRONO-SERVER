extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://mastery-test.json"
var checks := 0
var failures := 0
var engine := Combat.new()

func _initialize() -> void: _run.call_deferred()
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)
func clean() -> void:
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".v6.bak", ".invalid.bak"]: DirAccess.remove_absolute(PATH+suffix)
func play(story, index: int) -> Dictionary:
	var state: Dictionary = story.battle(engine,index)
	while state.phase == "playing" and state.turns < 400:
		var choice: Dictionary = story.choose_ai(engine,state)
		story.act(engine,state,choice.actionId,choice.targetId)
	return state

func _run() -> void:
	clean()
	var old := '{"schemaVersion":6,"completed":{"gate":"ember","court":"sap","eclipse":"pulse","tidal-gate":"ember"},"team":["axion","veyra","astra"],"equipped":{},"gear":{},"repeatWins":{},"gemCrafts":{},"gemFusions":{}}'
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	file.store_string(old);file.close()
	var story := Campaign.new(engine.catalog,PATH)
	check(story.team_experience() == 400 and story.team_level() == 3, "Old victories grant the real shared team level without replaying the campaign")
	check(story.mastery_experience("veyra") == 0 and story.mastery_rank("veyra") == 0, "Migration does not invent historical hero participation")
	var before: Dictionary = story.loadout_stats("veyra")
	check(before.maxHp == engine.rounded(engine.catalog.hero_by_id.veyra.hp*1.04) and before.attack == engine.rounded(engine.catalog.hero_by_id.veyra.attack*1.02), "Level three applies bounded shared growth to every active hero")
	var victory := play(story,4)
	story.set_team(["nima","riven","kira"])
	var reward: Dictionary = story.claim_victory(victory)
	check(reward.get("saved",false) and story.team_experience() == 500 and story.team_level() == 4, "A real first victory advances the shared experience curve once")
	check(story.mastery_experience("veyra") == 10 and story.mastery_experience("axion") == 10 and story.mastery_experience("astra") == 10 and story.mastery_experience("nima") == 0, "Mastery goes equally to the launch trio even if the saved team changes before claiming")
	check(story.mastery_rank("veyra") == 1 and story.mastery_rank("axion") == 1, "First successful participation unlocks each hero's first mastery milestone")
	story.claim_victory(victory)
	check(story.team_experience() == 500 and story.mastery_experience("veyra") == 10, "Refreshing the same result cannot duplicate team experience or mastery")
	check(story.save_progress() and FileAccess.get_file_as_string(PATH+".v6.bak") == old and JSON.parse_string(FileAccess.get_file_as_string(PATH)).schemaVersion == 8, "Schema six is preserved exactly before persisting progression")
	var reopened := Campaign.new(engine.catalog,PATH)
	check(reopened.team_level() == 4 and reopened.mastery_experience("veyra") == 10 and reopened.mastery_rank("axion") == 1, "Shared level and individual mastery reopen with the same campaign checkpoint")
	story.set_team(["axion","veyra","astra"])
	for index in range(5): story.claim_victory(play(story,0))
	check(story.mastery_experience("veyra") == 60 and story.mastery_rank("veyra") == 3 and story.mastery_rank("astra") == 3, "Six wins reach the final mastery milestone without kill-based credit")
	story.claim_victory(play(story,0))
	check(story.mastery_experience("veyra") == 60, "Mastery stops at its visible cap instead of growing hidden power forever")
	var loss: Dictionary = story.battle(engine,0)
	loss.phase = "finished";loss.winner = 1
	var xp_before := story.team_experience()
	check(story.claim_victory(loss).has("error") and story.team_experience() == xp_before and story.mastery_experience("veyra") == 60, "Defeat cannot grant team experience or mastery and preserves earned milestones")
	for index in range(14): story.claim_victory(play(story,0))
	check(story.team_level() == 6 and story.team_experience() == 1000, "The shared curve reaches its declared final level at exactly one thousand experience")
	var maximum_stats := story.loadout_stats("veyra")
	story.claim_victory(play(story,0))
	check(story.team_level() == 6 and story.loadout_stats("veyra") == maximum_stats, "Further victories cannot increase attributes beyond the level and mastery caps")
	var baseline: Dictionary = engine.new_battle(story.team,engine.catalog.default_teams[1])
	check(engine.unit(baseline,"0-veyra").attack == engine.catalog.hero_by_id.veyra.attack, "Campaign level and mastery cannot change normalized free/PvP attributes")
	var denied := Campaign.new(engine.catalog,"user://mastery-missing-directory/progress.json")
	var pending: Dictionary = denied.claim_victory(play(denied,0))
	check(not pending.get("saved",true) and denied.team_experience() == 100 and denied.mastery_experience("veyra") == 10, "A failed reward save keeps the earned experience pending with its victory")
	denied.claim_victory(play(denied,0))
	check(denied.team_experience() == 125 and denied.mastery_experience("veyra") == 20, "A distinct unsaved replay adds only its smaller team experience award")
	story.save_progress()
	var healthy := FileAccess.get_file_as_string(PATH)
	story.save_progress()
	file = FileAccess.open(PATH,FileAccess.WRITE);file.store_string("interrupted progression {");file.close()
	var rescued := Campaign.new(engine.catalog,PATH)
	check(rescued.error_text.contains("recuperado") and rescued.team_level() == 6 and rescued.mastery == story.mastery and rescued.team_experience() == story.team_experience(), "Backup recovery restores shared level and every participant's mastery with the same checkpoint")
	var document: Dictionary = JSON.parse_string(healthy)
	var invalid: Array = []
	for bad in [{"veyra":-10},{"veyra":0.5},{"veyra":true},{"veyra":15},{"veyra":70},{"missing":10}]:
		var data: Dictionary = document.duplicate(true)
		data.mastery = bad
		invalid.append(data)
	var forged: Dictionary = document.duplicate(true)
	forged.completed = {};forged.repeatWins = {};forged.mastery = {"veyra":10}
	invalid.append(forged)
	forged = document.duplicate(true)
	forged.completed = {"gate":"ember","court":"sap"};forged.repeatWins = {};forged.mastery = {"veyra":30}
	invalid.append(forged)
	forged = document.duplicate(true)
	forged.erase("mastery")
	invalid.append(forged)
	forged = document.duplicate(true)
	forged.schemaVersion = 9
	invalid.append(forged)
	for data in invalid:
		var original := JSON.stringify(data)
		file = FileAccess.open(PATH,FileAccess.WRITE);file.store_string(original);file.close()
		var rejected := Campaign.new(engine.catalog,PATH)
		check(not rejected.save_progress() and FileAccess.get_file_as_string(PATH) == original and rejected.error_text != "", "Invalid or future mastery is preserved instead of granting unearned ranks or overwriting the file")
	clean()
	var mixed := Campaign.new(engine.catalog,PATH)
	mixed.set_team(["veyra","oren","sylva"])
	check(mixed.claim_victory(play(mixed,0)).get("saved",false), "A mixed damage/tank/support trio earns mastery through an actual first mission")
	check(mixed.loadout_stats("veyra").attack == engine.rounded(engine.catalog.hero_by_id.veyra.attack*1.015), "Damage mastery adds half a percent attack to the shared level growth")
	check(mixed.loadout_stats("oren").maxHp == engine.rounded(engine.catalog.hero_by_id.oren.hp*1.03), "Tank mastery adds one percent health to the shared level growth")
	check(mixed.loadout_stats("sylva").energy == int(engine.rules.energy.initial)+1, "Support mastery grants its real initial-energy bonus")
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	clean()
	app.campaign = Campaign.new(app.catalog,PATH)
	check(app.hub.has_method("_progress"), "Collection exposes a real evolution screen for shared level and individual mastery")
	if app.hub.has_method("_progress"): await interface(app)
	app.voice.stop_line()
	await create_timer(0.6).timeout
	app.queue_free()
	await settle()
	clean()
	print("Team level and hero mastery: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)

func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func interface(app) -> void:
	app.hub.selected_hero = "veyra"
	app.hub.open("progress")
	await settle()
	check(app.hub.subnav.get_child_count() == 4 and app.hub.progress_team_label.text.contains("NÍVEL 1") and app.hub.progress_hero_label.text.contains("0/60"), "Evolution starts at the actual shared level and zero historical mastery")
	app.reduced_motion = true
	app._begin_mission(0)
	var initial: int = app.combat.unit(app.state,"0-veyra").attack
	while app.state.phase == "playing" and app.state.turns < 400:
		var command: Dictionary = app.campaign.choose_ai(app.combat,app.state)
		app.campaign.act(app.combat,app.state,command.actionId,command.targetId)
	app._refresh()
	check(app.result_dialog.visible and app.result_dialog.dialog_text.contains("+100 EXP") and app.result_dialog.dialog_text.contains("Maestria"), "The real result screen reports the earned team experience and participant mastery")
	check(app.campaign.team_level() == 2 and app.campaign.mastery_rank("veyra") == 1 and app.combat.unit(app.state,"0-veyra").attack == initial, "Earned progression does not retroactively mutate the finished battle snapshot")
	app._refresh()
	check(app.campaign.team_experience() == 100 and app.campaign.mastery_experience("veyra") == 10, "Refreshing the real result cannot duplicate progression rewards")
	app.result_dialog.hide()
	app.result_dialog.confirmed.emit()
	app.hub.open("progress")
	await settle()
	check(app.hub.progress_team_label.text.contains("NÍVEL 2") and app.hub.progress_hero_label.text.contains("10/60") and app.hub.progress_milestone_labels[0].text.contains("CONQUISTADA"), "Evolution refreshes to the milestone earned in the actual campaign result")
	app._begin_mission(0)
	check(app.combat.unit(app.state,"0-veyra").attack > initial, "The next real mission receives the earned shared and individual bonuses")
