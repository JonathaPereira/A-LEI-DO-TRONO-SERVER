extends SceneTree
const Combat = preload("res://scripts/combat.gd")
const Campaign = preload("res://scripts/campaign.gd")
const Waves = preload("res://scripts/mission_waves.gd")
const Main = preload("res://scenes/main.tscn")
const PATH := "user://waves-test.json"
const DEFINITIONS = [{"name":"Primeira guarda","healthScale":.65,"attackScale":.9},{"name":"Reforços","healthScale":.75,"attackScale":1.0}]
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
	for suffix in ["", ".tmp", ".bak", ".bak.tmp"]: DirAccess.remove_absolute(PATH+suffix)
func story() -> RefCounted:
	var missions: Array = Campaign.MISSIONS.duplicate(true)
	missions[0].waves = DEFINITIONS.duplicate(true)
	return Campaign.new(engine.catalog,PATH,missions)
func first(state: Dictionary, id: String) -> void:
	state.order.erase(id);state.order.push_front(id);state.cursor = 0
func ready_to_clear(state: Dictionary) -> String:
	for enemy in state.units.filter(func(u): return u.side == 1):
		enemy.hp = 1;enemy.shield = 0;enemy.shieldLayers = [];enemy.statuses = []
	first(state,"0-astra");engine.current(state).energy = 100
	return state.units.filter(func(u):return u.side == 1)[0].id
func _run() -> void:
	clean()
	var bare: Dictionary = engine.new_battle(["axion","veyra","astra"],["nima","kira","maura"])
	var unchanged: Dictionary = bare.duplicate(true)
	check(Waves.attach(engine,bare,{"id":"plain"}) == "" and bare == unchanged, "A mission without reinforcements keeps its exact initial state")
	for invalid in [[],[DEFINITIONS[0]],DEFINITIONS+DEFINITIONS+[DEFINITIONS[0]],true,"two",[{"name":"bad","healthScale":true,"attackScale":1},DEFINITIONS[1]],[{"name":"bad","healthScale":0,"attackScale":1},DEFINITIONS[1]],[{"name":"bad","healthScale":.6,"attackScale":4},DEFINITIONS[1]],[{"name":"bad","healthScale":.6,"attackScale":1,"unknown":1},DEFINITIONS[1]]]:
		bare = unchanged.duplicate(true)
		check(Waves.attach(engine,bare,{"id":"bad","waves":invalid}) != "" and bare == unchanged, "Malformed wave definitions are rejected atomically")
	bare = unchanged.duplicate(true)
	check(Waves.attach(engine,bare,{"id":"bad-goal","waves":DEFINITIONS,"objective":{"type":"target","rounds":3,"target":"1-kira"}}) != "", "A commander goal cannot silently ignore unplayed waves")
	bare = unchanged.duplicate(true)
	check(Waves.attach(engine,bare,{"id":"malformed-goal","waves":DEFINITIONS,"objective":false}) != "" and bare == unchanged, "Malformed goal data is rejected before changing wave state")
	var premature = story()
	var early: Dictionary = premature.battle(engine,0)
	early.phase = "finished";early.winner = 0;early.missionResult = {"winner":0}
	check(premature.claim_victory(early).has("error") and premature.cleared == 0, "A terminal flag cannot grant a reward while required waves remain")
	clean()
	var campaign = story()
	var state: Dictionary = campaign.battle(engine,0)
	check(state.get("campaignWaveIndex",-1) == 0 and Waves.pending(state), "An actual campaign attempt begins at wave one and retains a pending second wave")
	check(not Waves.advance(engine,state), "A living enemy prevents premature reinforcements")
	var initial_player_hp: int = engine.unit(state,"0-veyra").hp
	engine.unit(state,"0-axion").hp = 0
	var shielded: Dictionary = engine.unit(state,"0-veyra")
	shielded.shield = 100;shielded.shieldTurns = 1;shielded.shieldLayers = [{"amount":100,"expiresRound":2}]
	var target := ready_to_clear(state)
	var result: Dictionary = campaign.act(engine,state,"ultimate",target,false)
	check(state.phase == "playing" and state.get("campaignWaveIndex",-1) == 1 and state.round == 2, "Clearing the first wave starts exactly one new global round without ending the mission")
	check(result.get("impactUnits",[]).filter(func(u):return u.side == 1).all(func(u):return u.hp == 0), "The strike snapshot shows the defeated wave before reinforcements arrive")
	check(engine.unit(state,"0-axion").hp == 0 and engine.unit(state,"0-astra").energy == 20 and engine.unit(state,"0-veyra").hp == initial_player_hp, "Player losses, spent energy and health survive the wave transition")
	check(shielded.shield == 0 and result.get("turnEvents",[]).any(func(e):return e.type == "shieldExpired" and e.target == shielded.id), "A new wave ages shields through the regular global-round boundary")
	check(campaign.claim_victory(state).has("error") and campaign.cleared == 0 and campaign.copies("ember") == 3 and campaign.mastery_experience("astra") == 0, "Intermediate waves grant no mission clear, gem or mastery")
	if state.phase == "playing":
		target = ready_to_clear(state)
		campaign.act(engine,state,"ultimate",target,false)
		var award: Dictionary = campaign.claim_victory(state)
		check(state.winner == 0 and award.get("saved",false) and campaign.cleared == 1 and campaign.copies("ember") == 4, "Only the final wave awards the mission's single gem and stable-ID victory")
		var once: int = campaign.mastery_experience("astra")
		campaign.claim_victory(state)
		check(once == 10 and campaign.mastery_experience("astra") == once and Campaign.new(engine.catalog,PATH).cleared == 1, "Final rewards reopen and cannot be claimed twice")
	else:
		check(false,"Final-wave reward path must remain reachable after the first wave")
	clean()
	campaign = story();state = campaign.battle(engine,0)
	var enemies: Array = state.units.filter(func(u):return u.side == 1)
	for enemy in enemies: enemy.hp = 0
	var last: Dictionary = enemies[-1]
	last.hp = 1;last.statuses = [{"type":"burn","turns":2}]
	state.order = ["0-astra",last.id];state.cursor = 0
	campaign.act(engine,state,"guard","0-astra")
	check(state.phase == "playing" and state.get("campaignWaveIndex",-1) == 1 and state.round == 2 and not engine.current(state).is_empty(), "A wave ended by periodic damage restarts turn scheduling without an invalid cursor")
	var before_reattach: Dictionary = state.duplicate(true)
	check(Waves.attach(engine,state,{"id":"reapply","waves":DEFINITIONS}) != "" and state == before_reattach, "Reattaching wave definitions cannot reset a running encounter")
	clean()
	var longer: Array = Campaign.MISSIONS.duplicate(true)
	longer[0].waves = DEFINITIONS+[DEFINITIONS[0].duplicate(true)]
	campaign = Campaign.new(engine.catalog,PATH,longer)
	state = campaign.battle(engine,0)
	for wave in range(3):
		target = ready_to_clear(state)
		campaign.act(engine,state,"ultimate",target,false)
		check(state.get("campaignWaveIndex",-1) == mini(wave+1,2) and state.phase == ("finished" if wave == 2 else "playing"), "Three-wave encounters advance through every group exactly once")
	check(campaign.claim_victory(state).get("saved",false) and campaign.copies("ember") == 4, "A longer encounter still yields exactly one mission reward")
	clean()
	campaign = story();state = campaign.battle(engine,0)
	for actor in state.units: actor.hp = 0
	campaign._checkpoint(state,engine)
	check(state.winner == 1 and state.campaignWaveIndex == 0 and state.units.filter(func(u):return u.side == 1).all(func(u):return u.hp == 0), "A defeated trio loses before reinforcements can conceal simultaneous elimination")
	check(Campaign.MISSIONS[3].get("waves",[]).size() == 2, "The two-wave encounter is installed on the existing tidal stairway")
	var app = Main.instantiate();root.add_child(app)
	await process_frame;await process_frame
	for id in Campaign.LEGACY_ORDER.slice(0,3): app.campaign.completed[id] = Campaign.LEGACY_REWARDS[id]
	app._begin_mission(3)
	await process_frame;await process_frame
	check(app.objective_label.text.contains("Onda 1/2") and app.objective_label.tooltip_text.contains("2 ondas"), "Preparation and HUD expose the real number of waves")
	if app.state.has("campaignWaveIndex"):
		app.reduced_motion = true
		var hit_target := ready_to_clear(app.state)
		app._refresh();app._start()
		await app._play_turn("ultimate",hit_target)
		check(app.state.phase == "playing" and app.objective_label.text.contains("Onda 2/2") and app.state.units.filter(func(u):return u.side == 1).all(func(u):return app.fighters[u.id].display_data.hp > 0 and not app.fighters[u.id].dead), "The real presentation replaces defeated enemies with readable reinforcements")
	app._leave_battle()
	await create_timer(.6).timeout
	app.queue_free();await process_frame
	clean()
	print("Campaign waves: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
