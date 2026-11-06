extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const Impact = preload("res://scripts/impact_modern.gd")
const PATH := "user://two-d-story.json"
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
func clean() -> void:
	for suffix in ["",".tmp",".bak",".bak.tmp",".v2.bak"]: DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH+suffix))
func player_turn(app) -> void:
	app.state.order.erase("0-astra")
	app.state.order.push_front("0-astra")
	app.state.cursor = 0
	app._refresh()

func _run() -> void:
	clean()
	var engine := Combat.new()
	var story := Campaign.new(engine.catalog,PATH)
	check(Campaign.CHAPTERS.size()==3 and Campaign.MISSIONS.size()==9,"The story contains three actual chapters with nine playable missions")
	for index in range(9):
		check(story.can_play(index) and (index==8 or not story.can_play(index+1)),"Story locks enforce the next mission at step %d"%index)
		var state := story.battle(engine,index)
		while state.phase=="playing" and state.turns<400:
			var choice: Dictionary = story.choose_ai(engine,state)
			var result: Dictionary = story.act(engine,state,choice.actionId,choice.targetId)
			if result.has("error"):
				check(false,"Story AI action is legal")
				break
		check(state.phase=="finished" and state.winner==0,"The default trio can finish story mission %d with baseline resources"%index)
		var reward := story.complete(index)
		var copies := story.copies(Campaign.MISSIONS[index].reward)
		check(reward.first and reward.saved and not story.complete(index).first and story.copies(Campaign.MISSIONS[index].reward)==copies,"Each of the nine rewards is saved exactly once")
	var reload := Campaign.new(engine.catalog,PATH)
	check(reload.cleared==9 and reload.copies("ember")==6 and reload.copies("sap")==6 and reload.copies("pulse")==6,"The full three-chapter progression and earned inventory survive reopening")
	clean()
	var source := '{"schemaVersion":2,"cleared":3,"team":["axion","veyra","astra"],"equipped":{"veyra":["ember","ember",""]}}'
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	file.store_string(source)
	file.close()
	var migrated := Campaign.new(engine.catalog,PATH)
	check(migrated.cleared==3 and migrated.can_play(3) and not migrated.can_play(4) and migrated.slots("veyra")==["ember","ember",""],"A completed old chapter unlocks chapter two and preserves all sockets")
	check(migrated.save_progress() and FileAccess.get_file_as_string(PATH+".v2.bak")==source and JSON.parse_string(FileAccess.get_file_as_string(PATH)).schemaVersion==8,"The exact version-two save is backed up before migration")
	clean()
	var app = Main.instantiate()
	root.add_child(app)
	await settle()
	app.campaign = Campaign.new(app.catalog,PATH)
	app.reduced_motion = true
	app.hub.open("menu")
	await settle()
	check(app.hub.nav_buttons.size()==5 and app.hub.nav_buttons.has("extras"),"Five primary menus keep secondary tools inside Extras")
	check(not app.spatial_combat and app.backdrop.find_children("*","Camera3D",true,false).is_empty() and app.fighters.values().all(func(f):return f.visual_root.visible and not f.spatial_presentation),"Normal play starts with illustrated bodies and no 3D scene")
	app.hub.open("story")
	await settle()
	check(app.hub.chapter_buttons.size()==3 and app.hub.mission_buttons.size()==3 and not app.hub.mission_buttons[0].disabled and app.hub.mission_buttons[1].disabled,"Story navigation exposes all chapters and the current progression locks")
	app.hub.chapter_buttons[1].pressed.emit()
	await settle()
	check(app.hub.selected_chapter==1 and app.hub.mission_slots.has(3) and app.hub.mission_buttons.all(func(b):return b.disabled),"A locked chapter can be read without launching its missions")
	check(app.hub.scroll.follow_focus and app.get_viewport().gui_get_focus_owner()==app.hub.chapter_buttons[1],"Story navigation follows keyboard focus and retains it after changing chapters")
	app.hub.open("gems")
	check(app.hub.subnav.visible and app.hub.subnav.get_child_count()==4,"Heroes, gems and equipment are grouped under Collection submenus")
	var escape := InputEventKey.new()
	escape.keycode=KEY_ESCAPE
	escape.pressed=true
	app._input(escape)
	await settle()
	check(app.hub.page=="menu", "Escape returns from collection submenus to the primary menu")
	app._enter_free()
	app.mode="training"
	app._new_battle()
	await settle()
	player_turn(app)
	var before: Dictionary = app.state.duplicate(true)
	app._set_auto_play(true)
	app._start()
	check(app.ai_pending and not app._can_act() and app.auto_button.button_pressed,"Auto play schedules the team and disables conflicting manual input")
	app._set_auto_play(false)
	await create_timer(.65).timeout
	check(app.state==before and not app.busy and not app.ai_pending and app._can_act(),"Disabling auto before its delay cancels the stale request and restores manual control")
	app._set_auto_play(true)
	app._new_battle()
	await create_timer(.65).timeout
	check(not app.started and app.state.turns==0 and not app.ai_pending,"Restart cancels a queued auto request without playing into the next match")
	player_turn(app)
	app.combat.current(app.state).energy=100
	for unit in app.state.units:
		if unit.side==1: unit.hp=1
	app.restart_dialog.popup_centered()
	app._start()
	await create_timer(.65).timeout
	check(app.state.turns==0 and not app.busy,"Automatic actions wait while a confirmation dialog is open")
	app.restart_dialog.hide()
	var deadline := Time.get_ticks_msec()+6000
	while app.state.phase=="playing" and Time.get_ticks_msec()<deadline: await process_frame
	check(app.state.phase=="finished" and app.state.winner==0 and app.state.turns==1 and app.result_dialog.visible,"Auto play selects an available area supreme and resolves a real battle through the UI")
	app.result_dialog.hide()
	app.mode="local"
	app._new_battle()
	app.state.order.erase("1-vesper")
	app.state.order.push_front("1-vesper")
	app.state.cursor=0
	check(not app._wants_ai() and app._human_turn(),"Auto play controls only the user's team in local duels")
	# Tactical choices use the same legal AI, costs and cooldowns as opponents.
	var support := engine.new_battle(["saira","sylva","oren"],["veyra","rhazen","cindra"])
	support.order.erase("0-saira")
	support.order.push_front("0-saira")
	support.cursor=0
	engine.current(support).energy=40
	engine.unit(support,"0-oren").hp=180
	var choice := engine.choose_ai(support)
	check(choice.actionId=="skill" and choice.targetId=="0-oren","The automatic healer selects a wounded ally instead of wasting healing on a healthy target")
	check(Impact.choose_profile("arcano","runes","heal")==2 and Impact.choose_profile("igneo","crater","damage")==1 and Impact.choose_profile("sombrio","crescent","damage")==0 and Impact.choose_profile("tecnico","rail","shieldHit")==6,"Water, fire, weapon and shield effects use distinct modern rendering profiles")
	for encounter in [0,3,6]:
		app.backdrop.encounter_kind=encounter
		check(app.backdrop.theme_kind==int(encounter/3.0) and app.backdrop.painting.texture!=null,"Chapter %d loads its own illustrated stage and atmosphere"%encounter)
	app._begin_lesson(0)
	check(not app.auto_play and app.auto_button.disabled,"Guided lessons keep manual control so objectives remain learnable")
	app._leave_battle()
	await create_timer(.65).timeout
	check(not app.ai_pending and app.hub.visible and not app.started,"Returning to the menu cancels queued automatic turns")
	app.queue_free()
	await settle()
	clean()
	print("2D campaign, menus and automation: %d checks, %d failures."%[checks,failures])
	quit(1 if failures else 0)
