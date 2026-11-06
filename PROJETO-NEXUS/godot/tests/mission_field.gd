extends SceneTree
const Combat = preload("res://scripts/combat.gd")
const Campaign = preload("res://scripts/campaign.gd")
const Field = preload("res://scripts/mission_field.gd")
const Main = preload("res://scenes/main.tscn")
const DEFINITION = {"id":"aether-current","name":"Corrente do éter","basicEnergyGain":4,"skillCostDelta":5}
const PATH := "user://field-test.json"
var engine := Combat.new()
var checks := 0
var failures := 0
func _initialize() -> void: _run.call_deferred()
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)
func clean() -> void:
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(PATH+suffix)
func first(state: Dictionary, id: String) -> void:
	state.order.erase(id);state.order.push_front(id);state.cursor = 0
func sample() -> Dictionary: return engine.new_battle(["axion","veyra","astra"],["vesper","oren","kira"])
func _run() -> void:
	clean()
	var state := sample()
	var untouched: Dictionary = state.duplicate(true)
	check(Field.attach(engine,state,{"id":"plain"}) == "" and state == untouched, "An ordinary arena preserves the exact battle snapshot")
	for invalid in [false,"current",{},DEFINITION.merged({"basicEnergyGain":true},true),DEFINITION.merged({"basicEnergyGain":.5},true),DEFINITION.merged({"basicEnergyGain":9},true),DEFINITION.merged({"skillCostDelta":-16},true),DEFINITION.merged({"skillCostDelta":INF},true),DEFINITION.merged({"unknown":1},true)]:
		state = sample();untouched = state.duplicate(true)
		check(Field.attach(engine,state,{"id":"bad","field":invalid}) != "" and state == untouched, "Malformed arena modifiers are rejected atomically")
	for hero in engine.catalog.heroes:
		var own: Array = [hero.id]
		for id in ["axion","veyra","astra"]:
			if own.size() < 3 and id not in own: own.append(id)
		state = engine.new_battle(own,["vesper","oren","kira"])
		var original: Dictionary = engine.catalog.hero_by_id[hero.id].duplicate(true)
		check(Field.attach(engine,state,{"id":"field-fixture","field":DEFINITION}) == "", hero.id+" can enter the same arena")
		first(state,"0-"+hero.id)
		var actor: Dictionary = engine.current(state)
		actor.energy = 40
		var action: Dictionary = engine.get_action(actor,"basic")
		var target: Dictionary = engine.legal_targets(state,actor,action)[0]
		var result: Dictionary = engine.act(state,"basic",target.id,false)
		check(not result.has("error") and actor.energy == 68 and engine.get_action(actor,"skill").cost == 35, hero.id+" uses actual field energy and skill cost")
		check(engine.catalog.hero_by_id[hero.id] == original, hero.id+" keeps its free kit unmodified")
		for opponent in state.units.filter(func(u):return u.side == 1):
			check(engine.get_action(opponent,"skill").cost == 35 and engine.get_action(opponent,"basic").get("energyGain") == 28, "The same field affects the rival without a hidden player-only bonus")
	# The loop above intentionally exercises every active hero.
	state = sample();Field.attach(engine,state,{"id":"same","field":DEFINITION});untouched = state.duplicate(true)
	check(Field.attach(engine,state,{"id":"same","field":DEFINITION}) != "" and state == untouched, "Reattaching a field cannot compound its modifiers")
	state = sample();state.units[-1].campaignActions = {"skill":engine.get_action(state.units[-1],"skill").duplicate(true)};state.units[-1].campaignActions.skill.cost = 99
	untouched = state.duplicate(true)
	check(Field.attach(engine,state,{"id":"overflow","field":DEFINITION}) != "" and state == untouched, "An impossible cost on the last actor does not partially change the first five")
	state = sample()
	var calm: Dictionary = DEFINITION.merged({"basicEnergyGain":-4,"skillCostDelta":-5},true)
	check(Field.attach(engine,state,{"id":"calm","field":calm}) == "", "A bounded reduction is supported without reversing the field's meaning")
	first(state,"0-veyra");engine.current(state).energy = 95
	engine.act(state,"basic","1-vesper",false)
	check(engine.unit(state,"0-veyra").energy == 100 and engine.get_action(engine.unit(state,"0-veyra"),"skill").cost == 25, "Reduced resource modifiers keep the usual maximum-energy cap")
	var story := Campaign.new(engine.catalog,PATH)
	story.completed = Campaign.LEGACY_REWARDS.duplicate();story.mastery = {"veyra":60}
	story.set_ability("veyra","basic","rhythm");story.set_ability("veyra","skill","burst");story.set_ability("veyra","ultimate","economy")
	var choices: Dictionary = story.ability_choices.duplicate(true)
	state = story.battle(engine,5);first(state,"0-veyra")
	var trained: Dictionary = engine.current(state)
	check(engine.get_action(trained,"basic").get("energyGain") == 32 and engine.get_action(trained,"skill").cost == 45 and engine.get_action(trained,"ultimate").cost == 70, "Arena modifiers compose once with all three mastery alternatives")
	check(engine.get_action(trained,"skill").description.contains("45 EN"), "The trained description reports the final field cost")
	trained.energy = 44
	check(not engine.can_use(trained,"skill"), "A trained field skill cannot be cast below its actual cost")
	trained.energy = 45
	var use: Dictionary = story.act(engine,state,"skill",engine.legal_targets(state,trained,engine.get_action(trained,"skill"))[0].id,false)
	check(not use.has("error") and trained.energy == 0, "Casting pays the exact combined training and field cost")
	check(story.ability_choices == choices and engine.get_action(sample().units[1],"skill").cost == 30, "Leaving the arena keeps preparation and free combat normalized")
	var combined: Array = Campaign.MISSIONS.duplicate(true)
	combined[0].field = DEFINITION.duplicate(true);combined[0].waves = Campaign.MISSIONS[3].waves.duplicate(true)
	var wave_story := Campaign.new(engine.catalog,"user://field-waves-unused.json",combined)
	var wave_state: Dictionary = wave_story.battle(engine,0)
	for enemy in wave_state.units.filter(func(u):return u.side == 1):
		enemy.hp = 1;enemy.shield = 0;enemy.shieldLayers = [];enemy.statuses = []
	first(wave_state,"0-astra");engine.current(wave_state).energy = 100
	wave_story.act(engine,wave_state,"ultimate",wave_state.units.filter(func(u):return u.side == 1)[0].id,false)
	check(wave_state.phase == "playing" and wave_state.campaignWaveIndex == 1, "An arena field and reinforcements can coexist in an actual encounter")
	check(wave_state.units.all(func(u):return engine.get_action(u,"basic").get("energyGain") == 28 and engine.get_action(u,"skill").cost == 35), "Both sides retain the same field modifiers after reinforcements arrive")
	check(Campaign.MISSIONS[5].get("field",{}).get("id") == "aether-current", "The arena is installed in the existing guardian-of-memory encounter")
	var app = Main.instantiate();root.add_child(app)
	await process_frame;await process_frame
	for id in Campaign.LEGACY_ORDER.slice(0,5): app.campaign.completed[id] = Campaign.LEGACY_REWARDS[id]
	app._begin_mission(5);first(app.state,"0-veyra");app._refresh()
	await process_frame;await process_frame
	check(app.objective_label.text.contains("Corrente do éter") and app.objective_label.tooltip_text.contains("+4 EN") and app.objective_label.tooltip_text.contains("+5 EN"), "The actual HUD and preparation expose the arena and both resource changes")
	check(app.action_buttons.basic.cost_label.text.contains("+28 ENERGIA") and app.action_buttons.skill.cost_label.text.contains("35 ENERGIA"), "Combat cards show the field values used by the engine")
	app._leave_battle();app.queue_free();await process_frame
	clean()
	print("Arena fields: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
