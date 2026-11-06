extends SceneTree
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Objectives = preload("res://scripts/mission_objectives.gd")
const Main = preload("res://scenes/main.tscn")
var checks := 0
var failures := 0
var engine := Combat.new()
var story

func _initialize() -> void: _run.call_deferred()
func check(ok: bool, text: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(text)

func battle(goal: Dictionary) -> Dictionary:
	var definitions: Array = Campaign.MISSIONS.duplicate(true)
	definitions[0].objective = goal
	story = Campaign.new(engine.catalog, "user://objectives-never-written.json", definitions)
	return story.battle(engine, 0)

func actor_first(state: Dictionary, id: String) -> void:
	state.order.erase(id)
	state.order.push_front(id)
	state.cursor = 0

func _run() -> void:
	var target := "1-minion-acolyte"
	var state := battle({"type":"target", "target":target, "rounds":2})
	actor_first(state, "0-veyra")
	engine.unit(state, target).hp = 1
	var result: Dictionary = story.act(engine, state, "basic", target, false)
	check(not result.has("error") and state.phase == "finished" and state.winner == 0, "Eliminating the commander ends a mission while its guards remain alive")
	check(state.units.any(func(u): return u.side == 1 and u.hp > 0), "Commander objective does not require eliminating every guard")
	check(state.get("missionResult", {}).get("reason") == "target", "A commander victory has an explicit objective receipt")
	check(story.cleared == 0, "Resolving combat alone does not persist or duplicate a first-clear reward")

	state = battle({"type":"target", "target":target, "rounds":2})
	actor_first(state, "0-veyra")
	engine.unit(state, target).hp = 1
	var fragile: Dictionary = engine.unit(state,"0-astra")
	fragile.hp = 1
	fragile.statuses = [{"type":"burn","turns":1}]
	state.order.erase(fragile.id)
	state.order.insert(1,fragile.id)
	result = story.act(engine,state,"basic",target,false)
	check(state.phase == "finished" and fragile.hp == 1 and result.turnEvents.is_empty(), "An impact victory prevents the next actor's damage-over-time from running")
	var finished: Dictionary = state.duplicate(true)
	check(story.act(engine,state,"basic",target).has("error") and state == finished, "A finished mission rejects another action without a second outcome")

	state = battle({"type":"target", "target":target, "rounds":2})
	actor_first(state,"0-veyra")
	engine.unit(state,target).hp = 1
	engine.unit(state,target).statuses = [{"type":"burn","turns":1}]
	fragile = engine.unit(state,"0-astra")
	fragile.hp = 1
	fragile.statuses = [{"type":"burn","turns":1}]
	state.order.erase(target)
	state.order.erase(fragile.id)
	state.order.insert(1,target)
	state.order.insert(2,fragile.id)
	result = story.act(engine,state,"guard","0-veyra",false)
	check(state.winner == 0 and fragile.hp == 1, "A target defeated by periodic damage ends the encounter before another actor's effects")
	check(result.turnEvents.any(func(event): return event.type == "defeated" and event.target == target) and not result.turnEvents.any(func(event): return event.target == fragile.id), "The visual receipt includes only periodic effects that actually occurred before victory")

	state = battle({"type":"target", "target":target, "rounds":1})
	actor_first(state,target)
	var ritualist: Dictionary = engine.unit(state,target)
	ritualist.hp = 1
	ritualist.statuses = [{"type":"burn","turns":1}]
	for step in range(12):
		if state.phase != "playing": break
		var actor: Dictionary = engine.current(state)
		story.act(engine,state,"guard",actor.id,false)
	check(state.phase == "finished" and state.winner == 1, "An uninterrupted ritual loses at the round deadline")
	check(ritualist.hp == 1 and state.get("missionResult",{}).get("reason") == "deadline", "The deadline is checked before effects in the next round can kill the ritualist")

	state = battle({"type":"survive", "rounds":2, "protectAll":true})
	var rounds_seen: Array = []
	for step in range(20):
		if state.phase != "playing": break
		rounds_seen.append(state.round)
		var actor: Dictionary = engine.current(state)
		story.act(engine,state,"guard",actor.id,false)
	check(rounds_seen.has(2) and state.phase == "finished" and state.winner == 0, "Survival succeeds only after both complete rounds, without killing the enemies")
	check(state.units.all(func(u): return u.hp > 0), "Survival victory leaves both real teams alive")
	check(state.get("missionResult",{}).get("reason") == "survived", "Survival has a distinct result")
	check(state.missionResult.get("completedRounds") == 2 and not engine.current(state).is_empty(), "A boundary result reports completed rounds and retains a valid current actor for the HUD")

	state = battle({"type":"survive", "rounds":2, "protectAll":true})
	actor_first(state,target)
	engine.unit(state,target).energy = 100
	var victim: Dictionary = engine.unit(state,"0-veyra")
	victim.hp = 1
	victim.shield = 0
	victim.shieldLayers = []
	victim.statuses = []
	story.act(engine,state,"ultimate",victim.id,false)
	check(state.winner == 1 and state.get("missionResult",{}).get("reason") == "ally_lost", "Losing one protected ally fails the mission even while two allies survive")

	state = battle({"type":"target", "target":target, "rounds":1})
	var before: Dictionary = state.duplicate(true)
	result = story.act(engine,state,"missing-action","missing-target")
	check(result.has("error") and state == before, "An invalid command cannot advance the objective or mutate the battle")
	var free: Dictionary = engine.new_battle(engine.catalog.default_teams[0],engine.catalog.default_teams[1])
	var copy: Dictionary = free.duplicate(true)
	var choice: Dictionary = engine.choose_ai(free)
	var plain: Dictionary = engine.act(free,choice.actionId,choice.targetId)
	var wrapped: Dictionary = story.act(engine,copy,choice.actionId,choice.targetId)
	check(plain == wrapped and free == copy and not copy.has("campaignObjective"), "Campaign orchestration leaves free combat byte-for-byte equivalent")
	check(Objectives.describe(state).contains("Rodada 1/1"), "The actual mission objective exposes its deadline to the HUD")
	state = battle({"type":"target", "target":target, "rounds":4})
	actor_first(state,"0-veyra")
	engine.unit(state,"0-veyra").energy = 60
	engine.unit(state,target).hp = 10000
	engine.unit(state,target).maxHp = 10000
	choice = story.choose_ai(engine,state)
	check(choice.actionId == "basic", "Objective AI can reserve energy for the ultimate instead of spending on every available technique")
	state.round = 4
	choice = story.choose_ai(engine,state)
	check(choice.actionId != "basic", "Objective AI does not reserve energy for a turn after the deadline")
	state = battle({"type":"target", "target":target, "rounds":4})
	actor_first(state,"0-axion")
	choice = story.choose_ai(engine,state)
	check(not engine.friendly(engine.get_action(engine.current(state),choice.actionId)) and choice.targetId == target, "A healthy trio's tank contributes to the time-critical objective instead of shielding full health")
	engine.unit(state,"0-astra").hp = 1
	choice = story.choose_ai(engine,state)
	check(choice == engine.choose_ai(state) and engine.friendly(engine.get_action(engine.current(state),choice.actionId)), "An endangered ally retains the baseline healing/protection priority")
	for invalid in [{"type":"unknown"},{"type":"target","target":"1-missing","rounds":2},{"type":"target","target":target,"rounds":0},{"type":"survive","rounds":1.5},{"type":"survive","rounds":2,"protectAll":"yes"}]:
		check(battle(invalid).has("error"), "Unsupported or inconsistent objective definitions cannot start a fake playable mission")
	await interface_flow()
	print("Mission objectives: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)

func interface_flow() -> void:
	var path := "user://mission-objective-ui.json"
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(path+suffix)
	var app = Main.instantiate()
	root.add_child(app)
	await process_frame
	await process_frame
	app.campaign = Campaign.new(app.catalog,path)
	app.campaign.completed = {"gate":"ember"}
	app.reduced_motion = true
	app.auto_play = false
	app.hub.open("story")
	check(app.hub.body.find_children("*","Label",true,false).any(func(label): return label.text.contains("Acólito") and label.text.contains("rodada 4")), "The preparation menu exposes the ritual objective before starting")
	app._begin_mission(1)
	await process_frame
	await process_frame
	check(app.objective_label.visible and app.objective_label.text.contains("Rodada 1/4"), "The real battle HUD starts with the objective deadline")
	check(app.start_button.get_global_rect().end.y <= app.get_viewport_rect().size.y, "Objective HUD keeps the start button fully inside the playable viewport")
	app.state.round = 4
	app.state.order.erase("0-veyra")
	app.state.order.push_back("0-veyra")
	app.state.cursor = app.state.order.size()-1
	app._refresh()
	app._start()
	await app._play_turn("guard","0-veyra")
	check(app.state.winner == 1 and app.result_dialog.visible and app.result_dialog.dialog_text.contains("prazo terminou"), "The real action/presentation path displays a distinct deadline defeat")
	check(app.campaign.cleared == 1 and app.campaign.copies("sap") == 3 and not FileAccess.file_exists(path), "Objective defeat cannot write progression or grant a gem")
	app.result_dialog.hide()
	app.result_dialog.confirmed.emit()
	check(app.state.round == 1 and not app.state.has("missionResult") and not app.started, "Retry starts a fresh objective at full time")
	actor_first(app.state,"0-veyra")
	app.combat.unit(app.state,"1-minion-acolyte").hp = 1
	app._refresh()
	app._start()
	await app._play_turn("basic","1-minion-acolyte")
	check(app.state.winner == 0 and app.result_dialog.dialog_text.contains("Alvo neutralizado"), "Real commander victory displays the objective outcome")
	check(app.campaign.cleared == 2 and app.campaign.copies("sap") == 4 and Campaign.new(app.catalog,path).is_complete(1), "Objective victory persists the existing ID reward exactly once")
	app._refresh()
	check(app.campaign.copies("sap") == 4, "Repeated result rendering cannot duplicate an objective reward")
	app.result_dialog.hide()
	app.result_dialog.confirmed.emit()
	check(app.hub.visible and app.hub.page == "story", "Objective result returns to the campaign map")
	app._enter_free()
	check(not app.objective_label.visible and not app.state.has("campaignObjective"), "Free combat hides campaign objectives and starts without their rules")
	await create_timer(0.6).timeout
	app.queue_free()
	await process_frame
	await process_frame
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(path+suffix)
