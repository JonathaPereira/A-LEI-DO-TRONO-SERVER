extends SceneTree
## Rendered review with isolated, in-memory story examples. No player saves are written.
const Main = preload("res://scenes/main.tscn")
var output := ""
var app
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame
func shot(filename: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	var status := root.get_texture().get_image().save_png(output.path_join(filename+".png"))
	if status!=OK:
		push_error("Could not capture "+filename)
		quit(1)
	print("Captured "+filename)
func wait_done() -> void:
	var deadline := Time.get_ticks_msec()+25000
	while app.busy and Time.get_ticks_msec()<deadline: await process_frame
	if app.busy:
		push_error("The rendered action did not recover")
		quit(1)
func fixture(hero: String, encounter: int) -> void:
	app.mode="local"
	app.mode_picker.select(1)
	app.teams=[["veyra","saira","astra"],["rhazen","vesper","oren"]]
	app._new_battle()
	app.backdrop.encounter_kind=encounter
	var id := "0-"+hero
	app.state.order.erase(id)
	app.state.order.push_front(id)
	app.state.cursor=0
	app.combat.current(app.state).energy=100
	app._start()
	await settle()
func attack(action: String, target: String, filename: String, automatic := false) -> void:
	var before: int = app.director.impact_count
	if automatic: app._set_auto_play(true)
	else: app._play_turn(action,target)
	var deadline := Time.get_ticks_msec()+20000
	while app.director.impact_count==before and Time.get_ticks_msec()<deadline: await process_frame
	if app.director.impact_count==before:
		push_error("The rendered strike did not make contact")
		quit(1)
	await create_timer(.10).timeout
	await shot(filename)
	await wait_done()
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Pass an output directory after --")
		quit(1)
		return
	output=args[0]
	DirAccess.make_dir_recursive_absolute(output)
	app=Main.instantiate()
	root.add_child(app)
	await settle()
	root.size=Vector2i(1600,900)
	app.campaign=app.Campaign.new(app.catalog,"user://capture-2d.json")
	app.campaign.completed = app.campaign._legacy_completed(0)
	app.auto_play=false
	app.reduced_motion=false
	app.hub.open("menu")
	await shot("menu")
	for chapter in range(3):
		app.campaign.completed = app.campaign._legacy_completed(chapter*3)
		app.hub.selected_chapter=chapter
		app.hub.open("story")
		await shot("story-%d"%(chapter+1))
	app.hub.open("extras")
	await shot("extras")
	app._enter_free()
	await fixture("veyra",0)
	await shot("battle-2d")
	await attack("skill","1-oren","fire-hit")
	await fixture("saira",3)
	for unit in app.state.units:
		if unit.side==0: unit.hp=roundi(unit.maxHp*.48)
	app._refresh()
	await attack("ultimate","0-veyra","water-heal")
	await fixture("astra",6)
	await attack("ultimate","1-rhazen","astral-hit",true)
	app._set_auto_play(true)
	await shot("automatic")
	app._leave_battle()
	await create_timer(.6).timeout
	app.queue_free()
	await settle()
	quit()
