extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://ability-training-test.json"
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
	for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".v7.bak", ".invalid.bak"]: DirAccess.remove_absolute(PATH+suffix)
func first(state: Dictionary, hero: String) -> Dictionary:
	var id := "0-"+hero
	state.order.erase(id);state.order.push_front(id);state.cursor = 0
	return engine.current(state)

func _run() -> void:
	clean()
	var source := {"schemaVersion":7,"completed":Campaign.LEGACY_REWARDS.duplicate(),"team":["axion","veyra","astra"],"equipped":{},"gear":{},"repeatWins":{},"gemCrafts":{},"gemFusions":{},"mastery":{"veyra":60,"vektor":30,"maura":30,"astra":10}}
	var original := JSON.stringify(source)
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	file.store_string(original);file.close()
	var story := Campaign.new(engine.catalog,PATH)
	var old: Dictionary = story.battle(engine,0)
	check(not story.set_ability("astra","ultimate","economy") and not story.set_ability("axion","skill","burst"), "Mastery gates reject training before the corresponding hero milestone")
	var funds: int = story.materials()
	check(story.set_ability("veyra","skill","burst") and story.materials() == funds, "Mastery one enables a free skill specialization without spending items")
	var action: Dictionary = story.trained_action("veyra","skill")
	check(action.cost == 40 and is_equal_approx(action.power,engine.catalog.hero_by_id.veyra.skill.power*1.15), "Burst trades ten extra energy for fifteen percent more primary power")
	check(engine.get_action(engine.unit(old,"0-veyra"),"skill").cost == 30, "Changing preparation leaves an already-created battle's action unchanged")
	var battle: Dictionary = story.battle(engine,0)
	var actor := first(battle,"veyra")
	check(engine.get_action(actor,"skill").cost == 40, "The next real campaign battle uses the trained action")
	var result: Dictionary = story.act(engine,battle,"skill","1-minion-acolyte",false)
	check(not result.has("error") and actor.energy == 0, "The trained skill consumes its actual forty energy in combat")
	check(story.set_ability("veyra","basic","rhythm"), "Mastery three unlocks the basic resource alternative")
	battle = story.battle(engine,0)
	actor = first(battle,"veyra")
	var before: int = actor.energy
	result = story.act(engine,battle,"basic","1-minion-acolyte",false)
	check(not result.has("error") and actor.energy == before+28 and is_equal_approx(engine.get_action(actor,"basic").power,.9), "Rhythm's reduced-power basic actually recovers twenty-eight energy")
	check(story.set_ability("veyra","ultimate","economy") and story.trained_action("veyra","ultimate").cost == 70 and is_equal_approx(story.trained_action("veyra","ultimate").power,engine.catalog.hero_by_id.veyra.ultimate.power*.9), "Mastery two enables a cheaper ultimate with ten percent less primary power")
	check(story.set_ability("vektor","skill","burst") and story.trained_action("vektor","skill").secondary.amount == 35 and engine.catalog.hero_by_id.vektor.skill.secondary.amount == 30, "Pure-energy support training changes the actual transfer without mutating the base kit")
	check(story.set_ability("maura","ultimate","economy") and story.trained_action("maura","ultimate").secondary.amount == 18, "A pure-utility ultimate preserves its cleanse and trades secondary energy for the cheaper cost")
	check(story.save_progress() and FileAccess.file_exists(PATH+".v7.bak") and FileAccess.get_file_as_string(PATH+".v7.bak") == original and JSON.parse_string(FileAccess.get_file_as_string(PATH)).schemaVersion == 8, "Training migrates schema seven with an exact original backup")
	var reopened := Campaign.new(engine.catalog,PATH)
	check(reopened.trained_action("veyra","basic").get("energyGain") == 28 and reopened.trained_action("veyra","skill").cost == 40, "Chosen training reopens with the same real action parameters")
	check(story.set_ability("veyra","skill","") and story.trained_action("veyra","skill").cost == 30 and engine.get_action(engine.unit(battle,"0-veyra"),"skill").cost == 40, "Resetting to the original skill is free and affects only the next mission")
	check(not story.set_ability("veyra","guard","rhythm") and not story.set_ability("veyra","skill","economy") and not story.set_ability("missing","basic","rhythm"), "Unknown heroes, actions and incompatible training choices are rejected")
	var free: Dictionary = engine.new_battle(story.team,engine.catalog.default_teams[1])
	check(free.units.all(func(unit):return not unit.has("campaignActions")) and engine.get_action(engine.unit(free,"0-veyra"),"basic").get("energyGain",24) == 24, "Training cannot enter normalized free or PvP actions")
	var denied := Campaign.new(engine.catalog,"user://training-missing-directory/progress.json")
	denied.completed = Campaign.LEGACY_REWARDS.duplicate();denied.mastery = {"veyra":60}
	check(not denied.set_ability("veyra","skill","burst") and denied.trained_action("veyra","skill").cost == 30, "Failed training saving restores the original prepared ability")
	story.save_progress()
	var healthy := FileAccess.get_file_as_string(PATH)
	story.save_progress()
	file = FileAccess.open(PATH,FileAccess.WRITE);file.store_string("interrupted training {");file.close()
	var rescued := Campaign.new(engine.catalog,PATH)
	check(rescued.error_text.contains("recuperado") and rescued.ability_choices == story.ability_choices and rescued.trained_action("veyra","basic").get("energyGain") == 28, "Backup recovery restores actual prepared variants together with mastery and inventory")
	var document: Dictionary = JSON.parse_string(healthy)
	var invalid: Array = []
	for choices in [{"missing":{"skill":"burst"}},{"veyra":{"guard":"rhythm"}},{"veyra":{"skill":"economy"}},{"veyra":{"basic":1}},{"veyra":{"skill":"unknown"}},{"astra":{"ultimate":"economy"}}]:
		var data: Dictionary = document.duplicate(true)
		data.abilityChoices = choices
		invalid.append(data)
	var forged: Dictionary = document.duplicate(true)
	forged.mastery.veyra = 0
	invalid.append(forged)
	forged = document.duplicate(true)
	forged.erase("abilityChoices")
	invalid.append(forged)
	forged = document.duplicate(true)
	forged.schemaVersion = 9
	invalid.append(forged)
	for data in invalid:
		var raw := JSON.stringify(data)
		file = FileAccess.open(PATH,FileAccess.WRITE);file.store_string(raw);file.close()
		var rejected := Campaign.new(engine.catalog,PATH)
		check(not rejected.save_progress() and not rejected.set_ability("veyra","skill","") and FileAccess.get_file_as_string(PATH) == raw and rejected.error_text != "", "Invalid, locked or future training cannot overwrite a player's original progression")
	file = FileAccess.open(PATH,FileAccess.WRITE);file.store_string(healthy);file.close()
	var blocked := Campaign.new(engine.catalog,PATH)
	DirAccess.remove_absolute(PATH+".bak");DirAccess.make_dir_absolute(PATH+".bak")
	check(not blocked.set_ability("veyra","skill","burst") and blocked.trained_action("veyra","skill").cost == 30 and FileAccess.get_file_as_string(PATH) == healthy, "Backup failure rolls back the prepared ability and preserves the only healthy primary")
	DirAccess.remove_absolute(PATH+".bak")
	all_heroes()
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	app.campaign = Campaign.new(app.catalog,PATH)
	check(app.hub.has_method("_preview_training"), "Evolution provides preview and apply controls for milestone training")
	if app.hub.has_method("_preview_training"): await interface(app)
	app.voice.stop_line()
	await create_timer(0.6).timeout
	app.queue_free()
	await settle()
	clean()
	print("Ability training: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)

func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func all_heroes() -> void:
	var path := "user://all-training-sample.json"
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(path+suffix)
	var story := Campaign.new(engine.catalog,path)
	story.completed = Campaign.LEGACY_REWARDS.duplicate();story.repeat_wins = {"gate":engine.catalog.heroes.size() * 2 - Campaign.LEGACY_ORDER.size()}
	for hero in engine.catalog.heroes: story.mastery[hero.id] = 60
	for hero in engine.catalog.heroes:
		var team: Array = [hero.id]
		for candidate in ["axion","veyra","astra","sylva"]:
			if candidate not in team and team.size() < 3: team.append(candidate)
		story.team = team
		for action_id in ["basic","skill","ultimate"]:
			var selected: String = Campaign.AbilityTraining.settings[action_id].id
			var applied: bool = story.set_ability(hero.id,action_id,selected)
			var state: Dictionary = story.battle(engine,0)
			var actor := first(state,hero.id)
			actor.energy = 100
			var action := engine.get_action(actor,action_id)
			var targets: Array = engine.legal_targets(state,actor,action)
			if targets.is_empty():
				check(false,hero.id+" trained action has no legal target")
				continue
			var prediction: Dictionary = engine.preview(state,action_id,targets[0].id).normal
			var result: Dictionary = story.act(engine,state,action_id,targets[0].id,false)
			check(applied and not result.has("error") and result.events == prediction.events, "%s %s training executes exactly its public preview" % [hero.id,action_id])
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(path+suffix)

func interface(app) -> void:
	app.hub.selected_hero = "veyra"
	app.hub.open("progress")
	await settle()
	check(app.hub.training_pickers.size() == 3 and app.hub.training_apply_buttons.size() == 3, "Evolution exposes one training choice for each of the three actions")
	var picker = app.hub.training_pickers.skill
	picker.select(1);picker.item_selected.emit(1)
	check(app.campaign.trained_action("veyra","skill").cost == 30 and app.hub.training_preview_labels.skill.text.contains("40 EN"), "Selecting training shows the actual cost before changing the prepared skill")
	app.hub.training_apply_buttons.skill.pressed.emit()
	await settle()
	check(app.campaign.trained_action("veyra","skill").cost == 40 and Campaign.new(app.catalog,PATH).trained_action("veyra","skill").cost == 40, "Apply commits the chosen variant and reopens with the same action")
	app._begin_mission(0)
	first(app.state,"veyra")
	app._refresh()
	check(app.action_buttons.skill.cost_label.text.contains("40 ENERGIA") and app.action_buttons.basic.cost_label.text.contains("+28 ENERGIA"), "The real combat cards display trained skill costs and basic energy gain")
	check(app.start_button.get_global_rect().end.y <= app.get_viewport_rect().size.y, "Training labels keep the mission start button fully visible")
	app.campaign.set_ability("veyra","basic","")
	app._refresh()
	check(app.action_buttons.basic.cost_label.text.contains("+28 ENERGIA"), "Changing future preparation cannot alter the live battle's trained card")
	app.hub.selected_hero = "astra"
	app.hub.open("progress")
	await settle()
	check(app.hub.training_pickers.ultimate.is_item_disabled(1) and app.hub.training_pickers.basic.is_item_disabled(1), "The real preparation controls keep higher mastery training locked for another hero")
