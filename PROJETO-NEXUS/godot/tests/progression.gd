extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Combat = preload("res://scripts/combat.gd")
const Campaign = preload("res://scripts/campaign.gd")
const Receipt = preload("res://scripts/damage_receipt.gd")
const PATH := "user://class-progression-test.json"
var checks := 0
var failures := 0
func _initialize() -> void: _run.call_deferred()
func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame
func conservation(progress) -> bool:
	for type in Campaign.GEMS:
		var used := 0
		for id in progress.equipped: used += progress.slots(id).count(type.id)
		if used + progress.available(type.id) != progress.copies(type.id): return false
	return true
func _run() -> void:
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))
	var engine := Combat.new()
	var progress := Campaign.new(engine.catalog, PATH)
	progress.equip("veyra", "ember", 0)
	progress.equip("veyra", "ember", 1)
	progress.equip("astra", "sap", 0)
	check(progress.transfer_gem("veyra", 1, "astra", 0), "A real equipped copy transfers between heroes")
	check(progress.slots("veyra") == ["ember", "", ""] and progress.slots("astra") == ["ember", "", ""] and progress.available("sap") == 3, "Transfer returns the replaced copy and preserves neighboring slots")
	check(progress.transfer_gem("astra", 0, "astra", 2) and progress.slots("astra") == ["", "", "ember"], "A transfer within one hero moves exactly one copy")
	var before: Dictionary = progress.equipped.duplicate(true)
	check(not progress.transfer_gem("astra", 0, "bast", 0) and not progress.transfer_gem("unknown", 0, "bast", 0) and not progress.transfer_gem("veyra", 0, "bast", 3) and progress.equipped == before, "Invalid transfers never change equipment")
	check(progress.fill_gems("bast") and progress.slots("bast")[0] == "sap" and progress.slots("bast")[1] == "sap", "Tank recommendations prioritize life using free copies")
	check(progress.slots("veyra") == before.veyra and progress.slots("astra") == before.astra and conservation(progress), "Recommendations do not take gems from other heroes")
	var filled: Array = progress.slots("bast")
	progress.fill_gems("bast")
	check(progress.slots("bast") == filled, "Filling empty slots preserves every occupied slot")
	var reloaded := Campaign.new(engine.catalog, PATH)
	check(reloaded.equipped == progress.equipped and conservation(reloaded), "Transfers and recommendations persist without generating copies")
	check(progress.remove_gems("bast") and progress.slots("bast") == ["", "", ""] and conservation(progress), "Remove all returns all three real copies atomically")
	var blocked := Campaign.new(engine.catalog, "user://missing-gem-directory/progress.json")
	blocked.equipped = {"veyra": ["ember", "", ""], "bast": ["sap", "", ""]}
	before = blocked.equipped.duplicate(true)
	check(not blocked.transfer_gem("veyra", 0, "bast", 0) and blocked.equipped == before, "Failed persistence rolls back both ends of a transfer")
	check(not blocked.remove_gems("veyra") and blocked.equipped == before, "Failed persistence rolls back remove all")
	check(not blocked.fill_gems("bast") and blocked.equipped == before, "Failed persistence rolls back all recommended slots")
	for type in ["darkmark", "elementalWard", "sentinel"]:
		var description: Dictionary = Receipt.describe_events([{"type": "status", "target": "0-veyra", "effect": type, "effectTurns": 2}])
		var rows: Array = description.rows.filter(func(row): return row.get("kind") == "status")
		check(rows.size() == 1 and rows[0].positive == (type != "darkmark"), "Receipts classify %s and expose its rule duration" % type)
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	root.size = Vector2i(1600, 900)
	var owner = app.fighters["0-axion"]
	owner.display_data.guarding = true
	owner.apply_tick({"type": "heal", "source": "darkmark", "hpAfter": owner.display_data.hp, "shieldAfter": owner.display_data.shield})
	check(owner.display_data.guarding, "An off-turn mark heal preserves the author’s guard in the visible fighter state")
	app.campaign = progress
	app.hub.selected_hero = "bast"
	app.hub.open("gems")
	await settle()
	check(app.hub.hero_picker.item_count == 24 and app.hub.slot_buttons.size() == 3, "RPG workshop exposes twenty-four heroes and three independent sockets")
	check(app.hub.transfer_buttons.ember.disabled == false, "An equipped copy offers an explicit transfer action")
	app.hub.transfer_buttons.ember.pressed.emit()
	await settle()
	check(progress.slots("bast")[0] == "ember" and progress.slots("veyra")[0] == "", "The visible transfer button moves the selected owner's gem")
	app.hub.fill_button.pressed.emit()
	await settle()
	check(not progress.slots("bast").has("") and conservation(progress), "The visible fill button completes empty sockets without stealing equipment")
	app.hub.gem_buttons.pulse.mouse_entered.emit()
	check(app.hub.gem_preview_label.text.contains("Após a troca:"), "Hover shows the actual resulting health, attack and starting energy")
	app.hub.remove_all_button.pressed.emit()
	await settle()
	check(progress.slots("bast") == ["", "", ""] and app.hub.remove_all_button.disabled, "Remove all refreshes the RPG panel and inventory together")
	for dimensions in [Vector2i(960, 540), Vector2i(1280, 720), Vector2i(1920, 1080)]:
		root.size = dimensions
		app.hub.open("gems")
		await settle()
		for button in app.hub.slot_buttons:
			check(button.get_global_rect().end.x <= app.hub.get_global_rect().end.x, "Sockets fit horizontally at %s" % dimensions)
		check(app.hub.scroll.follow_focus, "Keyboard focus scrolls to inventory controls at %s" % dimensions)
	app.queue_free()
	await settle()
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))
	print("Classes and RPG workshop: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
