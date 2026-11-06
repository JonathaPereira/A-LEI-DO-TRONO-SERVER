extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Quality = preload("res://scripts/presentation_quality.gd")
var app
var output := ""
var movie := false

func _initialize() -> void: run.call_deferred()
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame
func shot(filename: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png(output.path_join(filename+".png"))==OK)
	print("Captured "+filename)

func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty(): quit(1);return
	output=args[0]
	movie=args.size()>2 and args[2]=="movie"
	DirAccess.make_dir_recursive_absolute(output)
	root.size=Vector2i(1600,900)
	Quality.configure("balanced")
	app=Main.instantiate()
	root.add_child(app)
	await settle()
	app._open_pvp()
	app.pvp_lobby.profile.team=["vesper","veyra","saira"]
	for slot in range(3):app.pvp_lobby.profile.equip("vesper",slot,["ember","pulse","sap"][slot])
	app.pvp_lobby.refresh()
	app.voice.speak("vesper","select",true)
	if movie: await create_timer(1.6).timeout
	await shot("pvp-voice-gems")
	app._show_presentation_settings()
	if movie: await create_timer(1.4).timeout
	await shot("voice-settings")
	app.presentation_settings.hide()
	app.pvp_lobby._back()
	app._enter_free()
	Quality.configure("balanced")
	for hero in app.catalog.heroes:
		if args.size()>1 and not hero.id in args[1].split(","): continue
		app.mode="local"
		var others: Array=["veyra","saira","astra"].filter(func(id):return id!=hero.id)
		app.teams=[[hero.id,others[0],others[1]],["rhazen","oren","maura"]]
		app._new_battle()
		var id: String="0-"+hero.id
		app.state.order.erase(id)
		app.state.order.push_front(id)
		app.state.cursor=0
		for unit in app.state.units:
			unit.energy=100
			unit.hp=roundi(unit.maxHp*.65)
		app._start()
		await settle()
		var action: Dictionary=app.combat.get_action(app.combat.current(app.state),"ultimate")
		var targets: Array=app.combat.legal_targets(app.state,app.combat.current(app.state),action)
		var before: int=app.director.impact_count
		app._play_turn("ultimate",targets[0].id)
		var deadline := Time.get_ticks_msec()+20000
		while app.director.impact_count==before and Time.get_ticks_msec()<deadline:await process_frame
		assert(app.director.impact_count==before+1)
		await create_timer(.10).timeout
		await shot(hero.id+"-ultimate")
		while app.busy: await process_frame
		await create_timer(.15).timeout
	app.queue_free()
	await settle()
	quit()
