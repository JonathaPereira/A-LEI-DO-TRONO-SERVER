extends SceneTree
const Combat = preload("res://scripts/combat.gd")
const Campaign = preload("res://scripts/campaign.gd")
const Objectives = preload("res://scripts/mission_objectives.gd")
const Main = preload("res://scenes/main.tscn")
var engine := Combat.new()
var checks := 0
var failures := 0
func _initialize() -> void: _run.call_deferred()
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)
func sample(goal: Dictionary) -> Dictionary:
	var state: Dictionary = engine.new_battle(["veyra","sylva","axion"],["nima","kira","maura"])
	for actor in state.units: actor.statuses = []
	Objectives.attach(state,{"id":"escort-fixture","objective":goal})
	return state
func first(state: Dictionary, id: String) -> void:
	state.order.erase(id);state.order.push_front(id);state.cursor = 0
func _run() -> void:
	var state := sample({"type":"clear","protectSlot":0})
	check(state.get("campaignObjective",{}).get("protectedId") == "0-veyra", "The protected slot resolves to the actual hero selected at launch")
	check(Objectives.brief({"objective":{"type":"clear","protectSlot":0}}).contains("primeiro") and Objectives.describe(state).contains("Veyra"), "Preparation explains the selected slot and the live HUD names its actual carrier")
	engine.unit(state,"0-veyra").hp = 0
	for actor in state.units:
		if actor.side == 1: actor.hp = 0
	Objectives.resolve(state)
	check(state.winner == 1 and state.get("missionResult",{}).get("reason") == "carrier_lost", "Carrier death has priority over defeating the final opponent")
	state = sample({"type":"clear","protectSlot":0})
	engine.unit(state,"0-sylva").hp = 0
	for actor in state.units:
		if actor.side == 1: actor.hp = 0
	Objectives.resolve(state)
	check(state.winner == 0, "Losing another ally does not fail a single-carrier mission")
	state = sample({"type":"survive","rounds":3,"protectSlot":0})
	engine.unit(state,"0-sylva").hp = 0;engine.unit(state,"0-axion").hp = 0
	var story := Campaign.new(engine.catalog,"user://escort-unused.json")
	while state.phase == "playing" and state.turns < 50:
		var actor: Dictionary = engine.current(state)
		story.act(engine,state,"guard",actor.id)
	check(state.winner == 0 and state.round == 4 and state.get("missionResult",{}).get("reason") == "survived", "The carrier can finish three complete rounds without requiring the whole trio alive")
	state = sample({"type":"clear","protectSlot":0})
	var carrier: Dictionary = engine.unit(state,"0-veyra")
	carrier.hp = 1;carrier.statuses = [{"type":"burn","turns":2}]
	first(state,"0-sylva")
	state.order = ["0-sylva","0-veyra","0-axion","1-nima","1-kira","1-maura"]
	story.act(engine,state,"guard","0-sylva")
	check(state.phase == "finished" and state.winner == 1 and state.get("missionResult",{}).get("reason") == "carrier_lost", "Periodic damage to the carrier fails the mission before a new actor may act")
	for invalid in [true,-1,3,.5,"0",null]:
		state = engine.new_battle(["veyra","sylva","axion"],["nima","kira","maura"])
		var before: Dictionary = state.duplicate(true)
		check(Objectives.attach(state,{"id":"bad-escort","objective":{"type":"clear","protectSlot":invalid}}) != "" and state == before, "Invalid carrier slot is rejected atomically: "+str(invalid))
	state = engine.new_battle(["veyra","sylva","axion"],["nima","kira","maura"])
	check(Objectives.attach(state,{"id":"bad-escort","objective":{"type":"clear","protectSlot":0,"protectAll":true}}) != "", "Conflicting individual and whole-team protection is rejected")
	state = sample({"type":"clear","protectSlot":0})
	carrier = engine.unit(state,"0-veyra");carrier.hp = engine.rounded(carrier.maxHp*.2)
	var other: Dictionary = engine.unit(state,"0-axion");other.hp = engine.rounded(other.maxHp*.05)
	first(state,"0-sylva");engine.current(state).energy = 40
	var before_ai: Dictionary = state.duplicate(true)
	var choice: Dictionary = story.choose_ai(engine,state)
	check(state == before_ai, "Carrier support lookahead does not change RNG, health or the live battle")
	check(choice.actionId == "skill" and choice.targetId == carrier.id, "Campaign support prioritizes the endangered carrier over another injured ally")
	first(state,"1-maura")
	check(story.choose_ai(engine,state) == engine.choose_ai(state), "The objective does not grant the rival campaign-specific carrier logic")
	for slot in [1,2]:
		var alternate: Dictionary = sample({"type":"clear","protectSlot":slot})
		check(alternate.campaignObjective.get("protectedId") == "0-sylva" if slot == 1 else alternate.campaignObjective.get("protectedId") == "0-axion", "Other valid slots resolve to their actual selected hero")
	first(state,"0-sylva")
	state.phase = "finished"
	check(story.choose_ai(engine,state).is_empty(), "No carrier or rival action is offered after the mission ends")
	var mission: Dictionary = Campaign.MISSIONS[6]
	check(mission.get("objective",{}).get("protectSlot") == 0 and mission.id == "forge-road", "The cargo objective is installed in the existing road to the forge, preserving its stable ID")
	var app = Main.instantiate();root.add_child(app)
	await process_frame;await process_frame
	for id in Campaign.LEGACY_ORDER.slice(0,6): app.campaign.completed[id] = Campaign.LEGACY_REWARDS[id]
	app._begin_mission(6)
	await process_frame;await process_frame
	check(app.mission_label.text.contains("07") and app.objective_label.text.contains("Axion"), "The real mission HUD identifies the chosen carrier")
	check(app.start_button.get_global_rect().end.y <= app.get_viewport_rect().size.y, "Carrier objective keeps the start control visible")
	app.queue_free();await process_frame
	print("Single-carrier objectives: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
