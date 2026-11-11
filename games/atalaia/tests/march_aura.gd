extends SceneTree
const Main=preload("res://scenes/main.tscn")
const C=preload("res://scripts/catalog.gd")
const Run=preload("res://scripts/run.gd")
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,why: String):
 checks+=1
 if not ok:failures+=1;push_error(why)
func place(battle,enemy,distance: float):
 enemy.d=distance;enemy.pos=C.route_point(battle.routes[int(enemy.lane)],distance)
func fixture():
 var battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",20);battle.start_wave();battle.spawn_count=battle.spawn_total
 var herald=battle.spawn_enemy("herald",2);var wolf=battle.spawn_enemy("wolf",2)
 place(battle,herald,200);place(battle,wolf,240)
 return battle
func run():
 var battle=Run.new(381,"chronicle")
 battle.prepare_scenario("replay",20);battle.start_wave()
 for step in range(4):battle.tick(.52)
 check(battle.enemies.any(func(enemy):return enemy.type=="herald"),"The authored foundry wave sends a herald with the runners")
 var duel=fixture();var herald=duel.enemies[0];var wolf=duel.enemies[1]
 var start: float=wolf.d;var own_start: float=herald.d;duel.tick(.1)
 check(is_equal_approx(wolf.d-start,wolf.speed*.12),"A nearby runner advances 20% farther while the herald is alive")
 check(is_equal_approx(herald.d-own_start,herald.speed*.1),"The herald cannot accelerate itself")
 var second=duel.spawn_enemy("herald",2);place(duel,second,210)
 start=wolf.d;duel.tick(.1)
 check(is_equal_approx(wolf.d-start,wolf.speed*.12),"Overlapping herald auras never stack")
 duel.damage(herald,100000,-1,true);duel.damage(second,100000,-1,true)
 start=wolf.d;duel.tick(.1)
 check(is_equal_approx(wolf.d-start,wolf.speed*.1),"Defeating every source removes the march bonus on the next simulation step")
 duel=fixture();herald=duel.enemies[0];wolf=duel.enemies[1];place(duel,wolf,400)
 start=wolf.d;duel.tick(.1)
 check(is_equal_approx(wolf.d-start,wolf.speed*.1),"A runner outside the visible aura keeps its normal speed")
 duel=fixture();wolf=duel.enemies[1];wolf.slow=.55;wolf.slow_time=2.5
 start=wolf.d;duel.tick(.1)
 check(is_equal_approx(wolf.d-start,wolf.speed*.054),"Glacial slow still overcomes the 20% march bonus")
 duel=fixture();wolf=duel.enemies[1];wolf["root_time"]=.55
 start=wolf.d;duel.tick(.1)
 check(wolf.d==start,"Roots stop a marching runner instead of being cancelled by haste")
 duel=fixture();var reopened=Run.new()
 check(reopened.load_data(JSON.parse_string(JSON.stringify(duel.to_data()))),"An active herald wave reopens through the existing version-one save")
 duel.tick(.1);reopened.tick(.1)
 check(JSON.stringify(reopened.to_data())==JSON.stringify(duel.to_data()),"Reloading recomputes the same aura and movement without serialized buff timers")
 var pristine=reopened.to_data();var forged=JSON.parse_string(JSON.stringify(pristine));forged.enemies[1]["marchMultiplier"]=9.0
 check(not reopened.load_data(forged) and reopened.to_data()==pristine,"A forged personal haste cannot replace a valid checkpoint")
 duel=fixture();var reordered=Run.new();reordered.load_data(JSON.parse_string(JSON.stringify(duel.to_data())));reordered.enemies.reverse()
 duel.tick(.1);reordered.tick(.1)
 check(duel.enemies.all(func(enemy):return reordered.enemies.any(func(other):return other.id==enemy.id and is_equal_approx(other.d,enemy.d))),"A frame-start aura snapshot gives the same movement after enemy array reordering")
 duel=fixture();var boss=duel.spawn_enemy("boss",2);herald=duel.enemies[0];herald.lane=boss.lane;place(duel,herald,200);place(duel,boss,240)
 start=boss.d;duel.tick(.1)
 check(is_equal_approx(boss.d-start,boss.speed*.1),"The herald cannot add haste to a boss's separate phase pattern")
 var classic=Run.new();classic.start_wave();classic.spawn_count=classic.spawn_total;classic.spawn_enemy("herald",0)
 var forbidden=JSON.parse_string(JSON.stringify(classic.to_data()));var healthy=Run.new();var before=healthy.to_data()
 check(not healthy.load_data(forbidden) and healthy.to_data()==before,"The classic campaign rejects a Chronicle herald in a forged save")
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.start_scenario("challenge",20,1)
 check(app.phase_label.tooltip_text.contains("Arauto") and app.phase_label.tooltip_text.contains("20%") and app.phase_label.tooltip_text.contains("raízes"),"Preparation explains the march radius, haste and control counterplay")
 app.run=fixture();app.board.run=app.run;app.board.reset_visuals();app.paused=true;await process_frame;await process_frame
 check(app.board.enemy_nodes.size()==2,"The actual board renders both the distinct herald and its marching ally")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(.15).timeout
 print("March aura: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
