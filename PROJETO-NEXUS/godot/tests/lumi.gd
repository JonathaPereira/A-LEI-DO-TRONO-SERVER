extends SceneTree
const Combat = preload("res://scripts/combat.gd")
const Campaign = preload("res://scripts/campaign.gd")
const Codex = preload("res://scripts/hero_codex.gd")
const Signature = preload("res://scripts/hero_signature.gd")
const Fighter = preload("res://scripts/fighter.gd")
const Voice = preload("res://scripts/hero_voice.gd")
const PATH := "user://lumi-test.json"
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
func _run() -> void:
	clean()
	check(engine.catalog.heroes.size() == 24 and engine.catalog.classes.size() == 6 and engine.catalog.archived_heroes.is_empty(), "All original heroes and six affinities are active")
	var voice := Voice.new()
	root.add_child(voice)
	for id in ["auren","elyra","solen","zaya"]:
		var hero: Dictionary = engine.catalog.hero_by_id[id]
		var entry: Dictionary = Codex.entry(id)
		check(entry.has("origin") and entry.get("story","").length() > 150 and entry.has("connection") and entry.has("quote"), id+" has a complete original codex entry")
		check(Signature.MOTION.has(hero.animation) and Fighter.portrait(hero.index,true) != null, id+" retains original art and has its own effect signature")
		voice.prepare(id)
		for event in ["select","skill","ultimate","victory"]:
			check(voice.cache.has(id+"-"+event) and voice.cache[id+"-"+event].get_length() > .5, id+" has an actual prerecorded "+event+" line")
		var story := Campaign.new(engine.catalog,PATH)
		check(story.set_team([id,"veyra","axion"]) and story.equip(id,"pulse",0), id+" can join a free trio and own a shared gem")
		var state: Dictionary = story.battle(engine,0)
		check(engine.unit(state,"0-"+id).energy == 48, id+" receives the same socket rules as the existing roster")
		while state.phase == "playing" and state.turns < 400:
			var choice: Dictionary = story.choose_ai(engine,state)
			story.act(engine,state,choice.actionId,choice.targetId)
		check(state.winner == 0, id+" can complete the first story encounter in a mixed trio")
		var receipt: Dictionary = story.claim_victory(state)
		var restored := Campaign.new(engine.catalog,PATH)
		check(receipt.get("saved",false) and restored.team == [id,"veyra","axion"] and restored.slots(id)[0] == "pulse" and restored.mastery_experience(id) == 10, id+" wins, equipment and individual mastery reopen together")
		clean()
	voice.queue_free()
	await process_frame
	print("Lumi restoration: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
