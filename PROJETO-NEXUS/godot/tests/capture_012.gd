extends SceneTree
## Actual Godot capture; isolated profile and no writes to a player's progress.
const Main = preload("res://scenes/main.tscn")
var app
var output := ""
var recording := false
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame
func shot(filename: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png(output.path_join(filename+".png"))==OK)
	print("Captured "+filename)
func fixture(hero: String) -> void:
	app.mode="local"
	app.mode_picker.select(1)
	app.teams=[["veyra","saira","astra"],["vesper","rhazen","oren"]]
	app._new_battle()
	var id := "0-"+hero
	app.state.order.erase(id)
	app.state.order.push_front(id)
	app.state.cursor=0
	app.combat.current(app.state).energy=100
	if hero=="veyra": app.state.random=1972
	app._start()
	await settle()
func strike(hero: String,action: String,target: String,filename: String) -> void:
	await fixture(hero)
	if hero=="saira":
		for unit in app.state.units:
			if unit.side==0: unit.hp=roundi(unit.maxHp*.45)
		app._refresh()
	var before: int = app.director.impact_count
	app._play_turn(action,target)
	var deadline := Time.get_ticks_msec()+30000
	while app.director.impact_count==before and Time.get_ticks_msec()<deadline: await process_frame
	assert(app.director.impact_count==before+1)
	await create_timer(.07).timeout
	await shot(filename)
	while app.busy: await process_frame
	await create_timer(.65).timeout
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		quit(1)
		return
	output=args[0]
	recording=args.size()>1 and args[1]=="movie"
	DirAccess.make_dir_recursive_absolute(output)
	app=Main.instantiate()
	root.add_child(app)
	await settle()
	root.size=Vector2i(1600,900)
	await settle()
	app.campaign=app.Campaign.new(app.catalog,"user://capture-012.json")
	app.campaign.completed = app.campaign._legacy_completed(3)
	app.reduced_motion=false
	app.sound.enabled=true
	app.audio_enabled=true
	app.sound.set_mix_level(.8)
	app.hub.open("menu")
	await shot("home")
	if recording: await create_timer(1.8).timeout
	app._enter_free()
	await fixture("astra")
	for unit in app.state.units:
		if unit.side==0: unit.statuses=[{"type":"empower","turns":2},{"type":"regen","turns":1},{"type":"elementalWard","turns":2},{"type":"cover","turns":2,"owner":"0-veyra"}]
		else: unit.statuses=[{"type":"burn","turns":2},{"type":"expose","turns":1},{"type":"darkmark","turns":2,"owner":"0-astra"}]
	app._refresh()
	await shot("status-hud")
	app.fighters["1-vesper"].status_strip.show_details("darkmark")
	await shot("status-details")
	app.fighters["1-vesper"].status_strip.popup.hide()
	if recording: await create_timer(1.0).timeout
	await strike("veyra","skill","1-oren","fire-contact")
	await strike("veyra","ultimate","1-oren","area-fire")
	await strike("astra","ultimate","1-rhazen","area-arcane")
	await strike("saira","ultimate","0-veyra","water-restoration")
	app._leave_battle()
	app.hub.open("menu")
	if recording: await create_timer(1.5).timeout
	app.queue_free()
	await settle()
	quit()
