extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://equipment-test.json"
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
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".v4.bak", ".v4.bak.1", ".invalid.bak", ".invalid.bak.1"]: DirAccess.remove_absolute(PATH+suffix)
func write(text: String) -> void:
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	file.store_string(text)
	file.close()
func play(story, index: int) -> Dictionary:
	var state: Dictionary = story.battle(engine,index)
	while state.phase == "playing" and state.turns < 400:
		var choice: Dictionary = story.choose_ai(engine,state)
		var result: Dictionary = story.act(engine,state,choice.actionId,choice.targetId)
		if result.has("error"): break
	return state

func _run() -> void:
	clean()
	var legacy := '{"schemaVersion":4,"completed":{"gate":"ember","court":"sap","eclipse":"pulse"},"team":["axion","veyra","astra"],"equipped":{"veyra":["ember","",""],"astra":["pulse","",""]}}'
	write(legacy)
	var story := Campaign.new(engine.catalog,PATH)
	check(story.materials() == 24, "Migration credits real first victories and the first chapter bonus, without replay rewards")
	check(story.slots("veyra")[0] == "ember" and story.piece("veyra",0) == {"variant":"standard","tier":1}, "Existing gems stay in the corresponding basic weapon/protection/relic socket")
	check(story.save_progress() and FileAccess.get_file_as_string(PATH+".v4.bak") == legacy and JSON.parse_string(FileAccess.get_file_as_string(PATH)).schemaVersion == 8, "Version four is preserved byte-for-byte before the equipment schema is written")
	var baseline: Dictionary = story.battle(engine,0)
	var attack_before: int = engine.unit(baseline,"0-veyra").attack
	check(story.upgrade_piece("veyra",0) and story.piece("veyra",0).tier == 2 and story.materials() == 21, "Weapon upgrade spends exactly three shared fragments")
	check(story.slots("veyra")[0] == "ember", "Upgrading the same piece preserves its socketed gem")
	var improved: Dictionary = story.battle(engine,0)
	check(engine.unit(improved,"0-veyra").attack > attack_before and engine.unit(baseline,"0-veyra").attack == attack_before, "Equipment changes the next actual campaign battle, never an existing battle snapshot")
	check(not story.upgrade_piece("veyra",0) and story.piece("veyra",0).tier == 2, "The final tier remains locked until the second chapter is completed")
	check(story.change_piece("veyra",0,"channel") and story.slots("veyra")[0] == "" and story.available("ember") == 4, "Changing weapon specialization returns its exact gem to shared inventory")
	var channel: Dictionary = story.battle(engine,0)
	check(engine.unit(channel,"0-veyra").energy == 52 and engine.unit(channel,"0-veyra").attack < engine.catalog.hero_by_id.veyra.attack, "Channeling trades base attack for twelve initial energy at tier two")
	check(story.equip("astra","sap",0), "Another hero can socket a gem before exchanging pieces")
	var funds: int = story.materials()
	check(story.transfer_piece("veyra","astra",0) and story.piece("astra",0).variant == "channel" and story.piece("astra",0).tier == 2 and story.piece("veyra",0).tier == 1, "A piece transfer preserves its tier and specialization instead of cloning the investment")
	check(story.materials() == funds and story.slots("astra")[0] == "" and story.available("sap") == 4, "Piece exchange conserves materials and returns both affected socket gems")
	var reopened := Campaign.new(engine.catalog,PATH)
	check(reopened.gear == story.gear and reopened.equipped == story.equipped and reopened.materials() == funds, "Equipment, gems and material balance survive reopening together")
	var free: Dictionary = engine.new_battle(story.team,engine.catalog.default_teams[1])
	check(engine.unit(free,"0-astra").attack == engine.catalog.hero_by_id.astra.attack and engine.unit(free,"0-astra").energy == engine.rules.energy.initial, "Equipment cannot change free or PvP base attributes")
	clean()
	story = Campaign.new(engine.catalog,PATH)
	check(not story.upgrade_piece("veyra",0) and not story.change_piece("veyra",0,"channel") and not story.upgrade_piece("missing",0), "Fresh or invalid heroes cannot bypass equipment unlocks")
	var victory := play(story,0)
	check(victory.winner == 0 and story.materials() == 0, "Playing an actual victory does not mint rewards before the result is claimed")
	var reward: Dictionary = story.claim_victory(victory)
	check(reward.get("saved",false) and reward.get("first",false) and story.materials() == 6 and story.copies("ember") == 4, "First result claims its gem and six fragments atomically")
	story.claim_victory(victory)
	check(story.materials() == 6 and story.copies("ember") == 4, "Rendering the same result again cannot duplicate fragments or gems")
	victory = play(story,0)
	reward = story.claim_victory(victory)
	check(reward.get("saved",false) and not reward.get("first",true) and story.materials() == 8 and story.copies("ember") == 4, "A new real replay earns two fragments without repeating the first-clear gem")
	check(Campaign.new(engine.catalog,PATH).materials() == 8, "Repeat rewards persist with the same material balance")
	var foreign := Campaign.new(engine.catalog,"user://foreign-equipment.json")
	foreign.battle(engine,0)
	check(foreign.claim_victory(victory).has("error") and foreign.materials() == 0, "Another model's battle cannot claim a reward using a coincidental mission index")
	var loss: Dictionary = story.battle(engine,0)
	loss.phase = "finished"; loss.winner = 1
	check(story.claim_victory(loss).has("error") and story.materials() == 8, "A defeat cannot issue a repeat reward")
	var denied := Campaign.new(engine.catalog,"user://equipment-missing-directory/progress.json")
	denied.completed = Campaign.LEGACY_REWARDS.duplicate()
	denied.equipped = {"veyra":["ember","",""]}
	var before: Dictionary = denied.equipped.duplicate(true)
	check(not denied.upgrade_piece("veyra",0) and denied.piece("veyra",0).tier == 1 and denied.materials() == 72, "Failed saving rolls back the equipment upgrade and shared material spend")
	check(not denied.change_piece("veyra",0,"channel") and denied.equipped == before and denied.error_text != "", "Failed specialization saving restores the original piece and its gem")
	denied.gear = {"veyra":[{"variant":"channel","tier":2},{"variant":"standard","tier":1},{"variant":"standard","tier":1}]}
	var gear_before: Dictionary = denied.gear.duplicate(true)
	check(not denied.transfer_piece("veyra","astra",0) and denied.gear == gear_before and denied.equipped == before, "Failed exchange saving restores both owners, investments and affected gems")
	var pending := play(denied,0)
	var pending_reward: Dictionary = denied.claim_victory(pending)
	check(not pending_reward.saved and denied.materials() == 71 and denied.repeat_wins.get("gate") == 1, "An unsaved victorious replay keeps its earned fragments pending in memory")
	check(denied.claim_victory(pending).has("error") and denied.materials() == 71, "Refreshing an unsaved result cannot mint another repeat reward")
	clean()
	story = Campaign.new(engine.catalog,PATH)
	var campaign_ok := true
	for index in range(9):
		var result := play(story,index)
		var claimed: Dictionary = story.claim_victory(result)
		campaign_ok = result.winner == 0 and claimed.get("saved",false) and campaign_ok
		for tier in range(1,3):
			for slot in range(3):
				for hero in story.team:
					if story.piece(hero,slot).tier == tier: story.upgrade_piece(hero,slot)
	check(campaign_ok and story.cleared == 9 and story.materials() == 0 and story.gear.values().all(func(pieces):return pieces.all(func(item):return item.tier == 3)), "A new campaign can finish all nine missions and naturally improve the whole trio without grinding")
	clean()
	story = Campaign.new(engine.catalog,PATH)
	story.completed = Campaign.LEGACY_REWARDS.duplicate()
	var upgraded := true
	for hero in story.team:
		for slot in range(3):
			upgraded = story.upgrade_piece(hero,slot) and upgraded
			upgraded = story.upgrade_piece(hero,slot) and upgraded
	check(upgraded and story.materials() == 0, "Nine first victories fund all nine maximum-tier pieces for a full trio without requiring repeats")
	story.equip("veyra","pulse",0)
	story.equip("veyra","pulse",1)
	story.equip("veyra","pulse",2)
	story.change_piece("veyra",0,"channel")
	story.equip("veyra","pulse",0)
	check(story.loadout_stats("veyra").energy <= engine.rules.energy.maximum, "Equipment and gems share the combat energy cap")
	var healthy := FileAccess.get_file_as_string(PATH)
	story.save_progress()
	write("broken primary {")
	var rescue := Campaign.new(engine.catalog,PATH)
	check(rescue.error_text.contains("recuperado") and rescue.gear == story.gear and rescue.materials() == 0 and rescue.slots("veyra") == story.slots("veyra"), "Backup recovery restores material spending, pieces and gems as one checkpoint")
	var document: Dictionary = JSON.parse_string(healthy)
	var invalid: Array = []
	for bad_tier in [0,4,1.5,true]:
		var data: Dictionary = document.duplicate(true)
		data.gear.veyra[0].tier = bad_tier
		invalid.append(data)
	for bad_replays in [{"gate":-1},{"gate":0.5},{"gate":100001},{"future":1}]:
		var data: Dictionary = document.duplicate(true)
		data.repeatWins = bad_replays
		invalid.append(data)
	var unknown: Dictionary = document.duplicate(true)
	unknown.gear.veyra[0].variant = "future-weapon"
	invalid.append(unknown)
	unknown = document.duplicate(true)
	unknown.gear["lumi"] = unknown.gear.veyra
	invalid.append(unknown)
	unknown = document.duplicate(true)
	unknown.completed = {"gate":"ember"}
	invalid.append(unknown)
	unknown = document.duplicate(true)
	unknown.schemaVersion = 9
	invalid.append(unknown)
	for data in invalid:
		var original := JSON.stringify(data)
		write(original)
		var rejected := Campaign.new(engine.catalog,PATH)
		check(not rejected.save_progress() and FileAccess.get_file_as_string(PATH) == original and rejected.error_text != "", "Invalid or future equipment progression remains untouched instead of being silently downgraded")
	clean()
	var app = Main.instantiate()
	root.add_child(app)
	await process_frame
	await process_frame
	app.campaign = Campaign.new(app.catalog,PATH)
	check(app.hub.has_method("_equipment"), "Collection exposes a real workshop to manage campaign equipment")
	if app.hub.has_method("_equipment"):
		await workshop(app)
	app.voice.stop_line()
	await create_timer(0.6).timeout
	app.queue_free()
	await process_frame
	await process_frame
	clean()
	print("Equipment progression: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)

func workshop(app) -> void:
	app.hub.selected_hero = "veyra"
	app.hub.open("equipment")
	await process_frame
	await process_frame
	check(app.hub.subnav.get_child_count() == 4 and app.hub.gear_upgrade_buttons.size() == 3 and app.hub.gear_upgrade_buttons[0].disabled, "Workshop exposes three pieces and explains the first chapter upgrade lock")
	app.campaign.completed = Campaign.LEGACY_REWARDS.duplicate()
	app.campaign.equip("veyra","ember",0)
	app.hub.open("equipment")
	app.hub.gear_upgrade_buttons[0].pressed.emit()
	await process_frame
	await process_frame
	check(app.campaign.piece("veyra",0).tier == 2 and app.campaign.materials() == 69 and app.hub.materials_label.text.contains("69"), "Workshop upgrade persists the real piece and refreshes shared funds")
	var choice = app.hub.gear_variant_pickers[0]
	choice.select(1)
	choice.item_selected.emit(1)
	check(app.campaign.piece("veyra",0).variant == "standard" and app.hub.gear_preview_labels[0].text.contains("52"), "Selecting a specialization previews next-battle attributes without applying it")
	app.hub.gear_apply_buttons[0].pressed.emit()
	await process_frame
	await process_frame
	check(app.campaign.piece("veyra",0).variant == "channel" and app.campaign.slots("veyra")[0] == "", "Applying a workshop specialization returns its gem before saving")
	var picker = app.hub.gear_transfer_pickers[0]
	for index in range(picker.item_count):
		if picker.get_item_metadata(index) == "astra": picker.select(index)
	picker.item_selected.emit(picker.selected)
	app.hub.gear_transfer_buttons[0].pressed.emit()
	await process_frame
	await process_frame
	check(app.campaign.piece("astra",0).variant == "channel" and app.campaign.piece("astra",0).tier == 2 and Campaign.new(app.catalog,PATH).materials() == 69, "Workshop exchange transfers the invested piece and survives reopening")
	var copies: int = app.campaign.copies("ember")
	app.reduced_motion = true
	app._begin_mission(0)
	while app.state.phase == "playing" and app.state.turns < 400:
		var command: Dictionary = app.campaign.choose_ai(app.combat,app.state)
		app.campaign.act(app.combat,app.state,command.actionId,command.targetId)
	app._refresh()
	check(app.result_dialog.visible and app.result_dialog.dialog_text.contains("+2 fragmentos") and app.campaign.materials() == 71 and app.campaign.copies("ember") == copies, "The real result screen grants a victorious replay two fragments and no duplicate gem")
	app._refresh()
	check(app.campaign.materials() == 71 and Campaign.new(app.catalog,PATH).materials() == 71, "Refreshing and reopening the real replay result keeps a single material reward")
