extends SceneTree
const Run=preload("res://scripts/run.gd")
const Main=preload("res://scenes/main.tscn")
const C=preload("res://scripts/catalog.gd")
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,why: String):
 checks+=1
 if not ok:failures+=1;push_error(why)
func advance(battle,seconds: float):
 var remaining=seconds
 while remaining>0.00001:
  var step=minf(remaining,.05);battle.tick(step);remaining-=step
func fixture():
 var battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",30)
 battle.build("ballista",3);battle.build("ballista",15);battle.start_wave();battle.spawn_count=battle.spawn_total
 for tower in battle.towers:tower.cooldown=100.0
 var boss=battle.spawn_enemy("boss",0);boss.lane=0;boss.d=200.0;boss.pos=C.route_point(battle.routes[0],boss.d);boss.speed=.001
 battle.damage(boss,boss.max_hp*.51,-1,true);battle.events.clear()
 return battle
func run():
 var battle=fixture();advance(battle,6.05)
 check(battle.towers.all(func(tower):return tower.get("jam_time",0.0)==0.0),"The final boss cannot interrupt towers before its announced pulse finishes")
 check(battle.events.any(func(event):return event.kind=="crown_warning"),"The Crown's second phase announces its recurring pulse one second before interruption")
 advance(battle,1.0)
 check(battle.towers[0].get("jam_time",0.0)>=.7 and battle.towers[0].get("jam_time",0.0)<=.8,"The completed pulse briefly interrupts the nearby tower")
 check(battle.towers[1].get("jam_time",0.0)==0.0,"A tower outside the visible144-unit ring remains operational")
 check(battle.events.filter(func(event):return event.kind=="crown_pulse").size()==1,"A completed windup resolves one pulse instead of repeating every simulation step")
 var coarse=fixture();coarse.tick(7.2)
 check(coarse.towers[0].get("jam_time",0.0)==0.0 and coarse.crown_pulse(coarse.enemies[0]).warning,"A coarse simulation step must show a full warning instead of silently skipping into interruption")
 advance(coarse,.95)
 check(coarse.towers[0].get("jam_time",0.0)==0.0,"A recovered warning lasts its full announced second")
 advance(coarse,.1)
 check(coarse.towers[0].get("jam_time",0.0)>.7,"The recovered warning still resolves after one second")
 var partial=fixture();partial.tick(6.9)
 check(partial.crown_pulse(partial.enemies[0]).remaining>=.99,"Entering late into a warning still grants the announced full second")
 partial.tick(.2)
 check(partial.towers[0].get("jam_time",0.0)==0.0,"A coarse step cannot reduce the response window to a fraction of a second")
 advance(partial,.85)
 check(partial.towers[0].get("jam_time",0.0)>.7,"The complete recovered response window resolves its pulse")
 var resumed=Run.new()
 var saved=JSON.parse_string(JSON.stringify(battle.to_data()))
 check(resumed.load_data(saved),"A saved final-boss pulse reopens without discarding the valid campaign")
 if not resumed.enemies.is_empty():
  check(is_equal_approx(resumed.enemies[0].pulse_started_at,battle.enemies[0].pulse_started_at) and is_equal_approx(resumed.towers[0].jam_time,battle.towers[0].jam_time) and is_equal_approx(resumed.wave_elapsed,battle.wave_elapsed),"Reopening restores the pulse clock and active interruption without restarting them")
  advance(battle,.4);advance(resumed,.4)
  check(is_equal_approx(battle.enemies[0].d,resumed.enemies[0].d) and is_equal_approx(battle.enemies[0].hp,resumed.enemies[0].hp) and is_equal_approx(battle.towers[0].jam_time,resumed.towers[0].jam_time) and is_equal_approx(battle.crown_pulse(battle.enemies[0]).remaining,resumed.crown_pulse(resumed.enemies[0]).remaining),"An uninterrupted and resumed pulse advance identically")
 var old=saved.duplicate(true);old.enemies[0].erase("pulse_started_at")
 var legacy=Run.new()
 check(legacy.load_data(old),"Version-one campaigns without a pulse timestamp remain readable")
 if not legacy.enemies.is_empty():
  legacy.events.clear();legacy.tick(.05)
  check(not legacy.crown_pulse(legacy.enemies[0]).warning and not legacy.events.any(func(event):return event.kind=="crown_pulse"),"A legacy phase-two boss grants a fresh period instead of an immediate pulse")
 for invalid_value in [-1.0,10000.0,"0",NAN]:
  var invalid=saved.duplicate(true);invalid.enemies[0]["pulse_started_at"]=invalid_value
  var healthy=legacy.to_data()
  check(not legacy.load_data(invalid) and legacy.to_data()==healthy,"A malformed pulse timestamp cannot replace a healthy campaign")
 var repeat=fixture();advance(repeat,6.05)
 var warning_save=Run.new()
 check(warning_save.load_data(JSON.parse_string(JSON.stringify(repeat.to_data()))) and warning_save.crown_pulse(warning_save.enemies[0]).warning,"Reopening during windup keeps the visible warning")
 advance(warning_save,1.0)
 check(warning_save.events.filter(func(event):return event.kind=="crown_pulse").size()==1,"A reopened warning resolves exactly once")
 advance(repeat,7.0)
 check(repeat.events.filter(func(event):return event.kind=="crown_warning").size()==2,"The second cycle announces itself again")
 repeat.towers[0]["jam_time"]=1.2;advance(repeat,1.0)
 check(repeat.towers[0].jam_time<=.8,"Recurring interference cannot add durations together")
 var stronger=fixture();advance(stronger,6.95);stronger.towers[0]["jam_time"]=1.2;advance(stronger,.1)
 check(stronger.towers[0].jam_time>1.0,"The Crown cannot shorten a longer saboteur interruption")
 var firing=fixture();advance(firing,7.05);firing.towers[0].cooldown=0;firing.events.clear()
 firing.add_dot(firing.enemies[0],int(firing.towers[0].id),"burn",10.0,2.0)
 var hp: float=firing.enemies[0].hp;advance(firing,.2)
 check(firing.enemies[0].hp<hp and not firing.events.any(func(event):return event.kind=="shot"),"Ongoing burning continues while a ready tower cannot fire")
 advance(firing,1.0)
 check(firing.towers[0].jam_time==0.0 and firing.events.any(func(event):return event.kind=="shot"),"A surviving tower resumes its real attacks after the pulse expires")
 var cancelled=fixture();advance(cancelled,6.05);cancelled.damage(cancelled.enemies[0],100000,-1,true);advance(cancelled,1.1)
 check(not cancelled.events.any(func(event):return event.kind=="crown_pulse"),"Defeating the Crown during its warning cancels the pulse")
 for kind in ["classic","other_boss","survival"]:
  var other=Run.new(381,"classic" if kind=="classic" else "chronicle")
  if kind!="classic":other.prepare_scenario("survival" if kind=="survival" else "replay",1 if kind=="survival" else 24)
  other.start_wave();other.spawn_count=other.spawn_total
  if kind=="survival":other.wave=30;other.set_map(4)
  var boss=other.spawn_enemy("boss",0);other.damage(boss,boss.max_hp*.51,-1,true);advance(other,8.1)
  check(other.crown_pulse().is_empty() and not other.events.any(func(event):return event.kind=="crown_warning" or event.kind=="crown_pulse"),"Classic, other Chronicle bosses and Survival retain their existing pressure: "+kind)
 for context in ["nonboss","unenraged","other_wave"]:
  var invalid=saved.duplicate(true)
  if context=="nonboss":invalid.enemies[0].type="golem";invalid.enemies[0].erase("enraged")
  elif context=="unenraged":invalid.enemies[0].enraged=false
  else:invalid.wave=29
  var healthy=legacy.to_data()
  check(not legacy.load_data(invalid) and legacy.to_data()==healthy,"A pulse timestamp outside the final boss cannot replace a valid save: "+context)
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.start_scenario("challenge",30,1)
 check(app.phase_label.tooltip_text.contains("Pulso da Coroa") and app.phase_label.tooltip_text.contains("0,8") and app.phase_label.tooltip_text.contains("144"),"Preparation explains the final pulse, range, warning and counterplay")
 app.run=fixture();app.board.run=app.run;app.board.reset_visuals();app.paused=true;app.board.reduced_effects=true
 advance(app.run,6.05);app.drain_events();await process_frame;await process_frame
 check(app.toast_label.text.contains("Pulso da Coroa") and app.toast_label.text.contains("1 s"),"The real HUD announces the incoming pulse even with reduced effects")
 check(app.board.enemy_nodes.size()==1 and app.run.crown_pulse(app.run.enemies[0]).warning,"The actual board retains the final boss and warning snapshot in the light profile")
 advance(app.run,1.0);app.drain_events()
 check(not app.toast_label.text.contains("em 1 s") and app.toast_label.text.contains("0,8 s"),"After resolution, the HUD replaces the warning with the actual brief interruption")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(.15).timeout
 print("Crown pulse: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
