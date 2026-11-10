extends SceneTree
const Run=preload("res://scripts/run.gd")
const Main=preload("res://scenes/main.tscn")
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,message: String):
 checks+=1
 if not ok:failures+=1;push_error(message)
func fixture():
 var battle=Run.new(381,"chronicle")
 battle.prepare_scenario("replay",23)
 battle.build("ballista",3);battle.start_wave();battle.spawn_count=battle.spawn_total
 battle.towers[0].cooldown=5.0
 var enemy=battle.spawn_enemy("sapper",0)
 enemy.d=455.0;enemy.pos=Vector2(315,185)
 return battle
func advance(battle,frames: int):
 for frame in range(frames):battle.tick(1.0/60.0)
func run():
 var battle=Run.new(381,"chronicle")
 check(battle.prepare_scenario("replay",23) and battle.start_wave(),"The foundry interference encounter starts normally")
 for spawn in range(5):battle.tick(0.68)
 check(battle.enemies.any(func(enemy):return enemy.type=="sapper"),"The authored foundry patrol actually sends a saboteur")
 var duel=fixture()
 advance(duel,1)
 var tower: Dictionary=duel.towers[0]
 var saboteur: Dictionary=duel.enemies[0]
 check(saboteur.get("jam_windup",0.0)>0.6 and duel.events.any(func(event):return event.kind=="jam_warning"),"A nearby saboteur announces its target before blocking any shots")
 var windup=Run.new()
 check(windup.load_data(JSON.parse_string(JSON.stringify(duel.to_data()))) and windup.enemies[0].get("jam_target",-1)==tower.id,"Reopening preserves the announced saboteur target")
 advance(duel,42)
 check(tower.get("jam_time",0.0)>1.0,"Finishing the windup briefly jams the selected tower")
 var resumed=Run.new()
 check(resumed.load_data(JSON.parse_string(JSON.stringify(duel.to_data()))) and is_equal_approx(resumed.towers[0].get("jam_time",0.0),tower.get("jam_time",-1.0)),"An active jam resumes with the same remaining duration")
 var pristine=resumed.to_data()
 var healthy=JSON.parse_string(JSON.stringify(pristine))
 var invalid=healthy.duplicate(true);invalid.towers[0].jam_time=1.21
 check(not resumed.load_data(invalid) and resumed.to_data()==pristine,"An overlong forged jam cannot mutate a healthy resumed battle")
 invalid=healthy.duplicate(true);invalid.enemies[0].jam_target=99999;invalid.enemies[0].jam_windup=0.3
 check(not resumed.load_data(invalid) and resumed.to_data()==pristine,"An unknown saboteur target cannot replace the resumed battle")
 resumed.enemies.clear();resumed.projectiles.clear();resumed.spawn_count=resumed.spawn_total;advance(resumed,1)
 check(resumed.towers[0].get("jam_time",0.0)==0.0,"Wave completion removes interference before the next preparation")
 var classic=Run.new();classic.build("ballista",0)
 var classic_before=classic.to_data();var classic_bad=JSON.parse_string(JSON.stringify(classic_before));classic_bad.towers[0]["jam_time"]=0.5
 check(not classic.load_data(classic_bad) and classic.to_data()==classic_before,"The classic campaign cannot acquire a Chronicle jam through a save")
 tower.cooldown=0.0;duel.events.clear()
 advance(duel,6)
 check(not duel.events.any(func(event):return event.kind=="shot"),"A ready tower cannot shoot while interference is active")
 var target=duel.spawn_enemy("golem",0);target.d=455.0;target.pos=Vector2(315,185)
 duel.damage(saboteur,100000.0,tower.id,true)
 advance(duel,96)
 check(tower.get("jam_time",0.0)==0.0 and target.hp<target.max_hp,"The surviving tower resumes real attacks when the jam expires")
 var cancelled=fixture();advance(cancelled,1)
 cancelled.damage(cancelled.enemies[0],100000.0,cancelled.towers[0].id,true)
 var reserve=cancelled.spawn_enemy("golem",0);reserve.d=455.0;reserve.pos=Vector2(315,185)
 advance(cancelled,48)
 check(cancelled.towers[0].get("jam_time",0.0)==0.0 and not cancelled.events.any(func(event):return event.kind=="jam"),"Defeating the saboteur during its windup prevents the interference")
 var app=Main.instantiate();root.add_child(app)
 await process_frame
 app.start_scenario("challenge",23,1)
 check(app.phase_label.tooltip_text.contains("Sabotador"),"Preparation explains the patrol's interference and counterplay")
 app.run=fixture();app.board.run=app.run;app.board.reset_visuals();app.paused=true;app.selected=int(app.run.towers[0].id)
 advance(app.run,43);app.refresh_hud()
 check(app.quick_mods.text.contains("INTERFERÊNCIA"),"The selected tower identifies its temporary firing interruption")
 await process_frame;await process_frame
 check(app.board.enemy_nodes.size()==1,"The real board configures the saboteur artwork")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
 print("Tower interference: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
