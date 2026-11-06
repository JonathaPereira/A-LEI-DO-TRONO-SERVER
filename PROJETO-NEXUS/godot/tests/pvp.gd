extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Profile = preload("res://scripts/pvp_profile.gd")
var checks := 0
var failures := 0
func _initialize() -> void: run.call_deferred()
func check(value: bool, message: String) -> void:
	checks+=1
	if not value:
		failures+=1
		push_error(message)
func until(condition: Callable, message: String, seconds := 10.0) -> void:
	var limit := Time.get_ticks_msec()+int(seconds*1000)
	while not condition.call() and Time.get_ticks_msec()<limit:await process_frame
	check(bool(condition.call()),message)
func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()<2:quit(1);return
	var a=Main.instantiate()
	var b=Main.instantiate()
	root.add_child(a)
	root.add_child(b)
	await process_frame
	await process_frame
	# Two clients share the test viewport, so their result windows cannot both be exclusive.
	a.result_dialog.exclusive=false
	b.result_dialog.exclusive=false
	a._open_pvp()
	b._open_pvp()
	a.pvp_lobby.profile=Profile.new(a.catalog,"user://pvp-a-test.json")
	b.pvp_lobby.profile=Profile.new(b.catalog,"user://pvp-b-test.json")
	a.pvp_lobby.profile.team=["auren","solen","elyra"]
	b.pvp_lobby.profile.team=["zaya","veyra","axion"]
	var campaign_before: Dictionary={"team":a.campaign.team.duplicate(),"equipped":a.campaign.equipped.duplicate(true),"cleared":a.campaign.cleared}
	check(a.pvp_lobby.hero_buttons.size()==24 and a.pvp_lobby.gem_pickers.size()==3,"Exclusive PvP screen exposes all twenty-four heroes and three sockets")
	var first: String=a.pvp_lobby.profile.team[0]
	for slot in range(3):check(a.pvp_lobby.profile.equip(first,slot,"ember"),"Repeated PvP gems have unlimited copies")
	var base: Dictionary=a.catalog.hero_by_id[first]
	check(int(a.pvp_lobby.profile.attributes(first).attack)==int(floor(float(base.attack)*1.12+.5)),"Local loadout preview adds percentage bonuses before rounding")
	check(not a.pvp_lobby.profile.equip(first,3,"sap"),"Unlimited copies never create a fourth socket")
	a.pvp_lobby.endpoint.text=args[0]
	b.pvp_lobby.endpoint.text=args[0]
	a.pvp_lobby._connect("create")
	await until(func():return not a.pvp_client.room.is_empty(),"First Godot client creates a real server room")
	b.pvp_lobby.room_code.text="BADBAD"
	b.pvp_lobby._connect("join")
	await until(func():return b.pvp_lobby.message.contains("indisponível") and not b.pvp_client.connected and b.pvp_client.socket==null,"An invalid room code closes its unused connection and permits a retry")
	check(b.pvp_lobby.connect_buttons.all(func(button):return not button.disabled),"Join controls recover after a rejected room code")
	b.pvp_lobby.room_code.text=str(a.pvp_client.room.get("code",""))
	b.pvp_lobby._connect("join")
	await until(func():return not b.pvp_client.room.is_empty() and a.pvp_client.room.players[1] is Dictionary,"Second Godot client joins by invitation code")
	# Wait until the loadout message is confirmed by the server before readying.
	await until(func():return a.pvp_client.own_player().get("loadout",{}).get("gems",{}).get(first,[])==["ember","ember","ember"],"Server receives the chosen sockets")
	a.pvp_lobby.ready_button.pressed.emit()
	b.pvp_lobby.ready_button.pressed.emit()
	await until(func():return a.pvp_active and b.pvp_active,"Both confirmations start the same online match")
	check(a.state==b.state,"Both clients receive an identical authoritative initial state")
	check(a.mode_picker.visible==false and a.difficulty_picker.visible==false and a.auto_button.disabled,"Online HUD removes local mode switches and disables automatic play")
	check(a.log_button.text=="Registro PvP" and a.mission_label.text.contains("VOCÊ"),"PvP identifies its separate log and the player's side")
	check(not a.pvp_lobby.visible and a.combat_view.visible,"Online combat reuses the existing 2D presentation")
	check(a.pvp_lobby.locked() and b.pvp_lobby.locked(),"Loadouts are locked after confirmation")
	check(a.pvp_client.own_player().side!=b.pvp_client.own_player().side,"Each client owns a different side")
	var actual: Dictionary=a.state.units.filter(func(u):return u.heroId==first and int(u.side)==int(a.pvp_client.own_player().side))[0]
	check(int(actual.attack)==int(floor(float(base.attack)*1.12+.5)),"Server applies the same gem bonus shown in preparation")
	a._set_auto_play(true)
	check(not a.auto_play and not a._wants_ai(),"PvP never schedules the local AI or automatic mode")
	var saved: Dictionary=a.state.duplicate(true)
	a._new_battle()
	check(a.state==saved,"A local restart cannot replace an authoritative PvP match")
	var turns := 0
	while a.state.phase=="playing" and turns<400 and failures==0:
		var owner=a if a._human_turn() else b
		var opponent=b if owner==a else a
		check(not opponent._can_act(),"The remote player cannot control the active character")
		var choice: Dictionary=owner.combat.choose_ai(owner.state)
		var expected: Dictionary=owner.state.duplicate(true)
		owner.combat.act(expected,choice.actionId,choice.targetId)
		var sequence: int=owner.pvp_seq
		# One full animation, then fast presentation for the rest of the integration match.
		a.reduced_motion=turns>0
		b.reduced_motion=turns>0
		owner._play_turn(choice.actionId,choice.targetId)
		check(owner.pvp_client.pending_action,"Input is locked while the server validates an action")
		await until(func():return a.pvp_seq==sequence+1 and b.pvp_seq==sequence+1 and not a.busy and not b.busy,"Both Godot clients finish presenting the accepted action",15)
		var normalized: Dictionary=JSON.parse_string(JSON.stringify(expected))
		check(a.state==normalized and b.state==normalized,"Authoritative outcomes match deterministic calculation including gem bonuses")
		turns+=1
		if turns==1:
			a.pvp_client.socket.close()
			await until(func():return not a.pvp_client.connected,"A dropped Godot connection is detected")
			await until(func():return a.pvp_client.available() and b.pvp_client.available(),"The Godot client automatically resumes its authenticated seat")
			check(a.state==b.state and a.pvp_client.intent.is_empty(),"Reconnect preserves the state and finishes the resume handshake")
		await create_timer(.09).timeout
	check(a.state.phase=="finished" and b.state.phase=="finished","Two real Godot clients reach the same match conclusion")
	check(a.result_dialog.dialog_text.contains("Registro PvP") and a.result_dialog.ok_button_text=="Voltar à preparação PvP","PvP results identify their separate match log")
	check(a.campaign.team==campaign_before.team and a.campaign.equipped==campaign_before.equipped and a.campaign.cleared==campaign_before.cleared,"Playing PvP does not mutate campaign progress or gems")
	var output := FileAccess.open(args[1],FileAccess.WRITE)
	output.store_string(JSON.stringify({"checks":checks,"failures":failures,"turns":turns,"matchId":a.pvp_client.room.get("matchId",""),"state":a.state}))
	output.close()
	a._result_confirmed()
	await until(func():return a.pvp_client.room.get("phase")=="preparing" and b.pvp_client.room.get("phase")=="preparing","Rematch returns both players to editable preparation")
	check(not a.pvp_active and not b.pvp_active and a.pvp_lobby.visible and b.pvp_lobby.visible,"Both players see their dedicated preparation again")
	a.pvp_client.leave()
	b.pvp_client.leave()
	await create_timer(.1).timeout
	a.queue_free()
	b.queue_free()
	await process_frame
	print("Godot online PvP: %d checks, %d failures, %d actions." % [checks,failures,turns])
	quit(1 if failures else 0)
