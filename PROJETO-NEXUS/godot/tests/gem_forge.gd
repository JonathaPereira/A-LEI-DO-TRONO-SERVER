extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://gem-forge-test.json"
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
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".v5.bak", ".invalid.bak", ".invalid.bak.1"]: DirAccess.remove_absolute(PATH+suffix)
func write(text: String) -> void:
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	file.store_string(text)
	file.close()

func _run() -> void:
	clean()
	var old := '{"schemaVersion":5,"completed":{"gate":"ember","court":"sap","eclipse":"pulse"},"team":["axion","veyra","astra"],"equipped":{"veyra":["ember","",""]},"gear":{"veyra":[{"variant":"standard","tier":2},{"variant":"standard","tier":1},{"variant":"standard","tier":1}]},"repeatWins":{}}'
	write(old)
	var story := Campaign.new(engine.catalog,PATH)
	check(story.materials() == 21 and story.copies("ember") == 4 and story.slots("veyra")[0] == "ember", "Migration preserves invested fragments and every old gem")
	check(story.craft_gem("ember") and story.materials() == 20 and story.copies("ember") == 7, "One fragment fabricates exactly three chosen level-one copies")
	check(story.fuse_gem("ember") and story.copies("ember") == 4 and story.copies("ember:2") == 1, "Fusion consumes three free base copies and produces one level-two gem")
	check(story.slots("veyra")[0] == "ember" and story.available("ember") == 3, "Fusion never consumes an equipped copy or changes its owner")
	check(story.fuse_gem("ember") and not story.fuse_gem("ember") and story.copies("ember") == 1, "Equipped copies cannot satisfy a recipe when the free stock is insufficient")
	check(story.gem("ember:2").get("bonus") == 0.05 and story.gem("sap:3").get("bonus") == 0.08 and story.gem("pulse:3").get("bonus") == 12, "Every upgraded gem exposes its defined capped bonus")
	check(story.equip("astra","ember:2",0), "A fused gem can be equipped in an existing socket")
	if not story.gem("ember:2").is_empty():
		var stats: Dictionary = story.loadout_stats("astra")
		check(stats.attack == engine.rounded(engine.catalog.hero_by_id.astra.attack*1.07), "The next mission uses a fused gem's bonus exactly once")
	check(story.save_progress() and FileAccess.get_file_as_string(PATH+".v5.bak") == old and JSON.parse_string(FileAccess.get_file_as_string(PATH)).schemaVersion == 8, "Version five is preserved byte-for-byte before the gem schema is written")
	var reopened := Campaign.new(engine.catalog,PATH)
	check(reopened.slots("astra")[0] == "ember:2" and reopened.copies("ember:2") == 2 and reopened.materials() == 20, "Fused stock, owners, equipment and material spending survive reopening together")
	check(not story.craft_gem("ember:2") and not story.fuse_gem("ember:3") and not story.fuse_gem("unknown"), "Fabrication cannot mint high-level or unknown gems and fusion stops at level three")
	check(story.craft_gem("ember") and story.fuse_gem("ember") and not story.fuse_gem("ember:2"), "An equipped level-two gem remains protected when fusing toward level three")
	story.equip("astra","",0)
	check(not story.fuse_gem("ember:2"), "Level-three fusion remains locked until the second chapter is completed")
	story.completed = story._legacy_completed(6)
	check(story.fuse_gem("ember:2") and story.copies("ember:2") == 0 and story.copies("ember:3") == 1 and story.copies("ember") == 2, "Three free level-two gems produce one level-three copy, preserving the new chapter's base reward")
	check(story.equip("astra","ember:3",1) and story.transfer_gem("astra",1,"veyra",2) and story.slots("veyra")[2] == "ember:3", "Transferring a fused copy preserves its level and does not duplicate it")
	check(story.change_piece("veyra",2,"anchor") and story.available("ember:3") == 1, "Changing a piece returns its socketed fused copy at the same level")
	var fresh := Campaign.new(engine.catalog,"user://never-written-forge.json")
	check(not fresh.craft_gem("sap") and not fresh.fuse_gem("sap") and fresh.copies("sap") == 3, "Fresh campaigns cannot bypass first-victory crafting or chapter fusion locks")
	var denied := Campaign.new(engine.catalog,"user://forge-missing-directory/progress.json")
	denied.completed = Campaign.LEGACY_REWARDS.duplicate()
	check(not denied.craft_gem("ember") and denied.materials() == 72 and denied.copies("ember") == 6, "Failed fabrication saving restores both material balance and stock")
	check(not denied.fuse_gem("ember") and denied.copies("ember") == 6 and denied.copies("ember:2") == 0, "Failed fusion saving restores all consumed and produced copies")
	check(story.available("ember:3") == 1 and engine.new_battle(story.team,engine.catalog.default_teams[1]).units.all(func(u):return not u.has("gem")), "Fused campaign gems never enter free or PvP battle state")
	check(story.remove_gems("veyra") and story.fill_gems("veyra") and story.slots("veyra")[0] == "ember:3", "Recommended socketing uses the highest free level of the preferred type without stealing another hero's copy")
	var state: Dictionary = story.battle(engine,0)
	check(engine.unit(state,"0-veyra").attack == story.loadout_stats("veyra").attack, "An actual campaign battle applies equipment and fused gems from the same preview")
	var weighted := 0
	for level in range(1,4):
		for item in story.gems_at_level(level): weighted += story.copies(item.id)*int(pow(3,level-1))
	check(weighted == 21, "Fusion conserves all twenty-one earned base-copy equivalents across all types and levels")
	story.save_progress()
	var healthy := FileAccess.get_file_as_string(PATH)
	story.save_progress()
	write("interrupted forge save {")
	var rescued := Campaign.new(engine.catalog,PATH)
	check(rescued.error_text.contains("recuperado") and rescued.gem_crafts == story.gem_crafts and rescued.gem_fusions == story.gem_fusions and rescued.slots("veyra") == story.slots("veyra") and rescued.materials() == story.materials(), "Recovery restores recipes, upgraded copies, sockets and material spending as one checkpoint")
	check(rescued.save_progress() and FileAccess.get_file_as_string(PATH+".invalid.bak") == "interrupted forge save {", "Saving recovered fusion progress preserves the exact damaged primary")
	var document: Dictionary = JSON.parse_string(healthy)
	var invalid: Array = []
	for crafts in [{"ember":-1},{"ember":0.5},{"ember":true},{"ember":2000001},{"ember:2":1},{"unknown":1},{"ember":500}]:
		var data: Dictionary = document.duplicate(true)
		data.gemCrafts = crafts
		invalid.append(data)
	for fusions in [{"ember":999},{"ember":-1},{"ember":0.5},{"ember:3":1},{"unknown":1}]:
		var data: Dictionary = document.duplicate(true)
		data.gemFusions = fusions
		invalid.append(data)
	var malformed: Dictionary = document.duplicate(true)
	malformed.equipped.astra = ["ember:3","ember:3",""]
	invalid.append(malformed)
	malformed = document.duplicate(true)
	malformed.equipped.astra = ["ember:4","",""]
	invalid.append(malformed)
	malformed = document.duplicate(true)
	malformed.completed = {"gate":"ember","court":"sap","eclipse":"pulse"}
	invalid.append(malformed)
	malformed = document.duplicate(true)
	malformed.erase("gemFusions")
	invalid.append(malformed)
	malformed = document.duplicate(true)
	malformed.schemaVersion = 9
	invalid.append(malformed)
	for data in invalid:
		var original := JSON.stringify(data)
		write(original)
		var rejected := Campaign.new(engine.catalog,PATH)
		check(not rejected.save_progress() and not rejected.craft_gem("ember") and not rejected.fuse_gem("ember") and FileAccess.get_file_as_string(PATH) == original and rejected.error_text != "", "Invalid, excessive, locked or future gem records remain untouched and block further spending")
	write(healthy)
	var blocked := Campaign.new(engine.catalog,PATH)
	DirAccess.remove_absolute(PATH+".bak")
	DirAccess.make_dir_absolute(PATH+".bak")
	var balance: int = blocked.materials()
	var copies: int = blocked.copies("sap")
	check(not blocked.craft_gem("sap") and blocked.materials() == balance and blocked.copies("sap") == copies and FileAccess.get_file_as_string(PATH) == healthy, "Backup replacement failure cannot consume crafting materials or alter the healthy primary")
	check(not blocked.fuse_gem("sap") and blocked.copies("sap") == copies and blocked.copies("sap:2") == 0, "Backup failure rolls back fusion as well as fabrication")
	DirAccess.remove_absolute(PATH+".bak")
	clean()
	write(old)
	DirAccess.copy_absolute(ProjectSettings.globalize_path(PATH),ProjectSettings.globalize_path(PATH+".bak"))
	write("interrupted legacy primary {")
	var legacy_recovery := Campaign.new(engine.catalog,PATH)
	check(legacy_recovery.craft_gem("sap") and legacy_recovery.craft_gem("sap") and FileAccess.file_exists(PATH+".v5.bak") and FileAccess.get_file_as_string(PATH+".v5.bak") == old, "A recovered old-schema backup is archived before a later healthy save rotates it away")
	economy()
	clean()
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	app.campaign = Campaign.new(app.catalog,PATH)
	app.campaign.completed = Campaign.LEGACY_REWARDS.duplicate()
	check(app.hub.has_method("_request_fusion"), "Collection provides fabrication, level selection and an explicit fusion confirmation")
	if app.hub.has_method("_request_fusion"): await workshop(app)
	app.voice.stop_line()
	await create_timer(0.6).timeout
	app.queue_free()
	await settle()
	clean()
	print("Gem fabrication and fusion: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)

func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func play(story, index: int) -> Dictionary:
	var state: Dictionary = story.battle(engine,index)
	while state.phase == "playing" and state.turns < 400:
		var choice: Dictionary = story.choose_ai(engine,state)
		story.act(engine,state,choice.actionId,choice.targetId)
	return story.claim_victory(state)

func economy() -> void:
	clean()
	var story := Campaign.new(engine.catalog,PATH)
	var owners := {"ember":"veyra","sap":"axion","pulse":"astra"}
	for type in owners:
		for slot in range(3): story.equip(owners[type],type,slot)
	var complete := true
	for index in range(9):
		complete = play(story,index).get("saved",false) and complete
		for tier in range(1,3):
			for slot in range(3):
				for hero in story.team:
					if story.piece(hero,slot).tier == tier: story.upgrade_piece(hero,slot)
	check(complete and story.materials() == 0 and story.cleared == 9, "Campaign can finish with nine protected base gems and improve all nine pieces without fabrication or mandatory repeats")
	for index in range(12): complete = play(story,0).get("saved",false) and complete
	check(complete and story.materials() == 24 and story.repeat_wins.get("gate") == 12, "Twelve optional real replay victories supply the twenty-four fragments for a full final gem set")
	var recipes := true
	for type in owners:
		for index in range(8): recipes = story.craft_gem(type) and recipes
		for index in range(9): recipes = story.fuse_gem(type) and recipes
		for index in range(3): recipes = story.fuse_gem(type+":2") and recipes
		for slot in range(3): recipes = story.equip(owners[type],type+":3",slot) and recipes
	check(recipes and story.materials() == 0 and story.team.all(func(hero):return story.slots(hero).all(func(id):return id.ends_with(":3"))), "That optional budget produces nine final gems while preserving the original equipped set until each replacement")
	check(story.copies("ember") == 3 and story.copies("sap") == 3 and story.copies("pulse") == 3, "The completed final trio retains all nine displaced starter copies instead of destroying them")

func workshop(app) -> void:
	app.campaign.equip("veyra","ember",0)
	app.hub.selected_hero = "veyra"
	app.hub.open("gems")
	await settle()
	check(app.hub.gem_craft_buttons.size() == 3 and app.hub.gem_fuse_buttons.size() == 3 and app.hub.gem_level_picker.item_count == 3, "The visible inventory exposes recipes and all three gem levels")
	check(app.hub.body.find_children("*","Label",true,false).any(func(label):return label.text.begins_with("72 fragmentos")), "The inventory shows the actual shared material balance instead of a formatting placeholder")
	app.hub.gem_craft_buttons.ember.pressed.emit()
	await settle()
	check(app.campaign.materials() == 71 and app.campaign.copies("ember") == 9, "Visible fabrication consumes the displayed fragment and creates the displayed batch")
	app.hub.gem_fuse_buttons.ember.pressed.emit()
	await settle()
	check(app.hub.gem_fusion_dialog.visible and app.hub.gem_fusion_dialog.dialog_text.contains("3 livres") and app.hub.gem_fusion_dialog.get_cancel_button().has_focus(), "Fusion explains exactly which free copies will be consumed and focuses Cancel")
	app.hub.gem_fusion_dialog.get_cancel_button().pressed.emit()
	await settle()
	check(not app.hub.gem_fusion_dialog.visible and app.campaign.copies("ember") == 9 and app.campaign.copies("ember:2") == 0, "Cancelling fusion leaves inventory and material balance untouched")
	app.hub.gem_fuse_buttons.ember.pressed.emit()
	await settle()
	app.hub.gem_fusion_dialog.get_ok_button().pressed.emit()
	await settle()
	check(app.campaign.copies("ember") == 6 and app.campaign.copies("ember:2") == 1 and app.campaign.slots("veyra")[0] == "ember", "Confirmed fusion consumes only free copies and leaves the equipped gem in place")
	app.hub.gem_level_picker.select(1)
	app.hub.gem_level_picker.item_selected.emit(1)
	await settle()
	check(app.hub.gem_buttons.has("ember:2") and not app.hub.gem_buttons["ember:2"].disabled, "Level selection exposes the actual fused stock for socketing")
	app.hub.gem_buttons["ember:2"].pressed.emit()
	await settle()
	check(app.campaign.slots("veyra")[0] == "ember:2" and Campaign.new(app.catalog,PATH).slots("veyra")[0] == "ember:2", "The visible socket action equips and persists the same fused copy")
