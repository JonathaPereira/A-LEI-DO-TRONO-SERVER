extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Strip = preload("res://scripts/status_strip.gd")
const Bloom = preload("res://scripts/impact_bloom.gd")
const Wave = preload("res://scripts/area_wave.gd")
const Receipt = preload("res://scripts/damage_receipt.gd")
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
func fixture(app, hero := "astra") -> void:
	app.mode="local"
	app.auto_play=false
	app.reduced_motion=false
	app.teams=[["veyra","saira","astra"],["vesper","rhazen","oren"]]
	app._new_battle()
	app.state.order.erase("0-"+hero)
	app.state.order.push_front("0-"+hero)
	app.state.cursor=0
	app.combat.current(app.state).energy=100
	app._start()
	await settle()
func _run() -> void:
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	app._enter_free()
	await fixture(app)
	var state_before: Dictionary = app.state.duplicate(true)
	var fighter = app.fighters["0-astra"]
	var sample: Dictionary = fighter.display_data.duplicate(true)
	sample.statuses = Strip.TYPES.filter(func(t): return t!="guard").map(func(t): return {"type":t,"turns":2})
	sample.guarding = true
	fighter.refresh(sample,true,false,true)
	var strip = fighter.status_strip
	check(strip.entries.size()==19 and strip.positive_count==11 and strip.negative_count==8,"All states are classified from the recipient's perspective, including guard")
	check(not Strip.positive("seed") and not Strip.positive("focus") and Strip.positive("taunt"),"Seed and astral focus are harmful to their bearer; taunt follows the engine's positive classification")
	var icons: Array = []
	for type in Strip.TYPES:
		icons.append(Strip.icon(type))
		check(Strip.icon(type)!=null and Strip.explanation(type)!="Consulte a descrição da habilidade.","%s has its own pictogram and a rule-based explanation"%type)
	check(icons.all(func(icon): return icons.count(icon)==1),"Every status has a distinct original pictogram")
	check(strip.badges.any(func(b):return b.name=="buffs-more") and strip.badges.size()==14,"Overflow preserves both lanes and exposes a full inspection action")
	for badge in strip.badges:
		check(Rect2(Vector2.ZERO,strip.size).encloses(badge.get_rect()),"Status badges stay inside their reserved strip")
		check(badge.focus_mode==Control.FOCUS_ALL and not badge.tooltip_text.is_empty(),"Every icon supports keyboard focus and a useful description")
		for child in badge.get_children():
			if child is TextureRect: check(Rect2(Vector2.ZERO,badge.size).encloses(child.get_rect()),"Pictograms cannot overflow their badges or collide with adjacent icons")
	strip.badges.filter(func(b):return b.name=="buffs-more")[0].pressed.emit()
	await settle()
	check(strip.popup.visible and app._any_dialog(),"Inspecting all statuses opens a modal recognized by automatic combat")
	check(app.state==state_before,"Inspecting buffs never targets, attacks, spends energy or mutates the combat engine")
	strip.popup.hide()
	check(not app._any_dialog(),"Closing the status inspection restores normal battle input")
	sample.statuses=[{"type":"burn","turns":1}]
	sample.guarding=false
	fighter.refresh(sample,true,false,true)
	strip.show_details("burn")
	fighter.apply_tick({"type":"burn","remaining":0,"hpAfter":sample.hp-10,"shieldAfter":sample.shield})
	check(strip.entries.is_empty(),"An expired periodic effect disappears immediately from the displayed strip")
	check(not strip.popup.visible,"A changed effect closes an old inspection instead of showing stale combat information")
	sample.hp=0
	sample.statuses=[{"type":"regen","turns":2}]
	fighter.refresh(sample,false,false,false)
	check(strip.entries.is_empty(),"Defeated units do not advertise active buffs")
	for dimensions in [Vector2i(960,540),Vector2i(1280,720),Vector2i(1920,1080)]:
		root.size=dimensions
		app._refresh()
		await settle()
		var previous: Array[Rect2]=[]
		for unit in app.fighters.values():
			var card: Rect2=unit.plate.get_global_rect()
			check(app.field.get_global_rect().encloses(card),"Resource and state card fits the field at %s"%dimensions)
			check(previous.all(func(r):return not r.intersects(card)),"Resource cards never overlap at %s"%dimensions)
			previous.append(card)
			var statuses: Rect2=unit.status_strip.get_global_rect()
			check(card.encloses(statuses) and not statuses.intersects(unit.shield.get_global_rect()),"Status strip has its own space below the resource meters")
	root.size=Vector2i(1600,900)
	var sound=app.sound
	check(sound.bank.size()==17 and sound.voices.size()==8,"Audio has seventeen material/phase banks and a bounded eight-voice mixer")
	for key in sound.bank:
		var clips: Array=sound.bank[key]
		check(clips.size()==2 and clips[0].data!=clips[1].data,"%s has two real waveform variants"%key)
		for clip in clips: check(clip.stereo and clip.mix_rate==48000 and clip.format==AudioStreamWAV.FORMAT_16_BITS and clip.get_length()>.1,"Combat clips are full-range stereo PCM rather than 8-bit beeps")
	sound.enabled=true
	sound.set_mix_level(.8)
	for key in ["charge","slash","fire"]:sound.play_layer(key)
	check(sound.voices.filter(func(v):return v.playing).size()>=3,"Charge, weapon and element overlap without cutting earlier layers")
	sound.play_layer("slash")
	var slashes: Array = sound.voices.filter(func(v): return v.playing and v.stream in sound.bank.slash)
	check(slashes.size()==2 and slashes[0].stream.data!=slashes[1].stream.data,"Repeating the same weapon sound alternates real takes independently of other audio layers")
	sound.set_mix_level(0)
	check(sound.voices.all(func(v):return not v.playing),"Zero volume immediately silences all active voices")
	sound.enabled=false
	var calls: int=sound.played_events.size()
	sound.play_layer("critical")
	check(sound.played_events.size()==calls,"Disabled audio does not create hidden playback events")
	sound.enabled=true
	sound.set_mix_level(.8)
	var compact:=Receipt.new()
	compact.configure_events([{"type":"damage","amount":243,"absorbed":12,"shieldAfter":7,"critical":true,"effect":"burn","effectTurns":2}],"Alvo",100,7,"Explosão",true)
	check(compact.compact_area and compact.size.x<236 and compact.rows.any(func(r):return r.kind=="status" and r.effect=="burn") and compact.rows.filter(func(r):return r.kind=="metric").size()==2,"Area receipts shrink while keeping separate actual HP, shield and applied states")
	compact.free()
	await fixture(app)
	var before: int=app.director.impact_count
	var predicted: Dictionary=app.combat.act(app.state.duplicate(true),"ultimate","1-oren")
	app._play_turn("ultimate","1-oren")
	var deadline:=Time.get_ticks_msec()+10000
	while app.director.impact_count==before and Time.get_ticks_msec()<deadline: await process_frame
	check(app.director.impact_count==before+1,"An area animation commits exactly one logical impact")
	check(app.director.transients.any(func(n):return is_instance_valid(n) and n is Wave) and app.director.transients.filter(func(n):return is_instance_valid(n) and n is Bloom).size()==3,"Area contact has a shared wave plus a painted bloom for each of three targets")
	check(app.feedback.get_parsed_text().contains("3 alvo(s)"),"Reflected damage does not turn a three-target attack into a four-target label")
	while app.busy and Time.get_ticks_msec()<deadline: await process_frame
	check(not app.busy,"Area presentation recovers and returns control")
	for unit in predicted.impactUnits:
		var live: Dictionary=app.combat.unit(app.state,unit.id)
		check(live.hp==unit.hp and live.shield==unit.shield,"Painted frames and layered sound do not alter the calculated hit endpoints")
	await fixture(app,"veyra")
	before=app.director.impact_count
	app._play_turn("skill","1-oren")
	await create_timer(.08).timeout
	app._new_battle()
	await create_timer(.8).timeout
	check(app.director.impact_count==before and not app.busy and app.sound.voices.all(func(v):return not v.playing),"Restart cancels pending contact, all painted effects and all audio layers")
	app.teams=[["torv","brin","bast"],["vesper","rhazen","oren"]]
	app._new_battle()
	app.state.order.erase("0-torv")
	app.state.order.push_front("0-torv")
	app.state.cursor=0
	app.combat.current(app.state).energy=100
	app._start()
	app._select_action("skill")
	check(app.feedback.tooltip_text.contains("chance de 50%"),"Critical preview includes Torv's technique and Igneo class bonuses")
	app._select_action("basic")
	check(app.feedback.tooltip_text.contains("chance de 15%"),"Igneo basic preview shows the actual class critical chance")
	app._leave_battle()
	app.hub.open("menu")
	await settle()
	check(app.hub.nav_buttons.size()==5 and app.hub.story_button.is_visible_in_tree() and app.hub.team_button.is_visible_in_tree(),"Home keeps five clear destinations, a primary story action and the real trio editor")
	app.hub.play_button.pressed.emit()
	check(app.mode=="training" and app.combat_view.is_visible_in_tree(),"Quick training always opens AI combat even after a local duel")
	app._leave_battle()
	app.hub.open("menu")
	app.hub.story_button.pressed.emit()
	check(app.hub.page=="story","The primary home action opens the real story selector")
	app.queue_free()
	await settle()
	print("HUD, 2D impacts and sound: %d checks, %d failures."%[checks,failures])
	quit(1 if failures else 0)
