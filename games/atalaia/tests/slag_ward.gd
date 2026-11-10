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
func place(battle,enemy,distance: float):
 enemy.lane=0;enemy.d=distance;enemy.pos=C.route_point(battle.routes[0],distance)
func fixture(wave: int=24,enraged: bool=true):
 var battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",wave);battle.start_wave();battle.spawn_count=battle.spawn_total
 var boss=battle.spawn_enemy("boss",0);place(battle,boss,200)
 var ally=battle.spawn_enemy("skeleton",0);place(battle,ally,240)
 if enraged:battle.damage(boss,boss.max_hp*.51,-1,true)
 battle.events.clear()
 return battle
func hit_loss(battle,enemy,ignore: bool=false)->float:
 var before: float=enemy.hp;battle.damage(enemy,10,-1,ignore);return before-enemy.hp
func run():
 var battle=fixture();var boss=battle.enemies[0];var ally=battle.enemies[1]
 check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)*.75),"The Slag Guardian's actual second phase protects a nearby ally from25% of an unpierced impact")
 var first=fixture(24,false);ally=first.enemies[1]
 check(is_equal_approx(hit_loss(first,ally),10*(1-ally.armor)),"The same living Guardian cannot protect escorts before its phase threshold")
 battle=fixture();boss=battle.enemies[0];ally=battle.enemies[1]
 var hp: float=boss.hp;battle.damage(boss,10,-1,false)
 check(is_equal_approx(hp-boss.hp,10*(1-boss.armor)),"The boss's escort aura cannot protect its own source")
 var ward=battle.spawn_enemy("ward",0);place(battle,ward,210)
 check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)*.75),"The Guardian and a nearby slag watcher never stack their protection")
 check(is_equal_approx(hit_loss(battle,ward),10*(1-ward.armor)),"Existing watchers keep their original immunity to allied protection")
 check(is_equal_approx(hit_loss(battle,ally,true),10),"Armor-piercing damage bypasses the escort aura as it already bypasses watchers")
 battle=fixture();boss=battle.enemies[0];ally=battle.enemies[1];ally.pos=boss.pos+Vector2(105,0)
 check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)*.75),"An ally on the visible105-unit boundary is protected")
 ally.pos=boss.pos+Vector2(105.01,0)
 check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)),"An ally just outside the true circle receives normal damage")
 battle=fixture();boss=battle.enemies[0];ally=battle.enemies[1];battle.damage(boss,100000,-1,true)
 check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)),"Defeating the only source removes protection before the next allied impact")
 for wave in [6,12,18,30]:
  battle=fixture(wave);ally=battle.enemies[1]
  check(is_equal_approx(hit_loss(battle,ally),10*(1-ally.armor)),"The phase%d boss keeps its own pattern instead of inheriting the slag aura"%wave)
 battle=fixture();var saved=JSON.parse_string(JSON.stringify(battle.to_data()));var reopened=Run.new()
 check(reopened.load_data(saved),"An existing version-one phase-two checkpoint reopens without any new field")
 check(is_equal_approx(hit_loss(reopened,reopened.enemies[1]),10*(1-reopened.enemies[1].armor)*.75),"Restored phase identity recomputes protection without a serialized buff")
 battle=fixture();ally=battle.enemies[1];var before: float=ally.hp
 battle.add_dot(ally,-1,"burn",10,1);battle.tick(.1)
 check(is_equal_approx(before-ally.hp,1.0),"Ongoing burning bypasses protection through the real simulation step")
 battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",24);battle.build("ballista",0);battle.start_wave();battle.spawn_count=battle.spawn_total
 boss=battle.spawn_enemy("boss",0);place(battle,boss,200);battle.damage(boss,boss.max_hp*.51,-1,true)
 ally=battle.spawn_enemy("golem",0);place(battle,ally,240);before=ally.hp
 var tower=battle.towers[0];tower.mods.append("pierce");var stats=battle.stats(tower);battle.impact(ally,tower,stats)
 check(is_equal_approx(before-ally.hp,stats.damage),"A real Metal do abismo impact bypasses the Guardian and the escort's armor")
 var survival=fixture();survival.scenario="survival";ally=survival.enemies[1]
 check(is_equal_approx(hit_loss(survival,ally),10*(1-ally.armor)),"The reused wave24 recipe cannot grant the campaign aura in Survival")
 var classic=Run.new();classic.wave=4;classic.start_wave();classic.spawn_count=classic.spawn_total
 boss=classic.spawn_enemy("boss",0);place(classic,boss,200);boss["enraged"]=true
 ally=classic.spawn_enemy("skeleton",0);place(classic,ally,240)
 check(is_equal_approx(hit_loss(classic,ally),10*(1-ally.armor)),"The classic campaign cannot acquire the Chronicle aura even with a phase flag")
 battle=fixture();reopened=Run.new();reopened.load_data(JSON.parse_string(JSON.stringify(battle.to_data())))
 var healthy=reopened.to_data();var forged=JSON.parse_string(JSON.stringify(healthy));forged.enemies[1]["protection"]=.75
 check(not reopened.load_data(forged) and reopened.to_data()==healthy,"A forged personal protection field cannot replace a healthy checkpoint")
 battle=fixture();boss=battle.enemies[0]
 check(battle.enemies.size()==4 and battle.enemies.slice(2).map(func(enemy):return enemy.type)==["golem","mushroom"],"Crossing the Guardian's phase calls exactly the two authored escort roles")
 check(battle.enemies.slice(2).all(func(enemy):return enemy.lane==boss.lane and enemy.pos.distance_to(boss.pos)<=105 and enemy.d<=boss.d),"Both escorts enter the real route behind their source and inside its protection")
 battle.damage(boss,1,-1,true)
 check(battle.enemies.size()==4,"Subsequent damage cannot summon the escort again")
 saved=JSON.parse_string(JSON.stringify(battle.to_data()));reopened=Run.new()
 check(reopened.load_data(saved) and reopened.enemies.size()==4,"A phase-two save preserves the two actual escorts rather than re-summoning them")
 saved.enemies=saved.enemies.slice(0,2);reopened=Run.new();var restored=reopened.load_data(saved)
 if restored:reopened.damage(reopened.enemies[0],1,-1,true)
 check(restored and reopened.enemies.size()==2,"An old already-enraged save gets no surprise reinforcements on load or its next hit")
 battle=fixture(24,false);battle.damage(battle.enemies[0],100000,-1,true)
 check(battle.enemies.size()==2,"A lethal phase-crossing hit cannot summon escorts after the source dies")
 battle=fixture(24,false);boss=battle.enemies[0];boss.hp=boss.max_hp*.5+1;battle.add_dot(boss,-1,"burn",20,1);battle.tick(.1)
 check(battle.enemies.size()==4 and battle.enemies.slice(2).all(func(enemy):return is_equal_approx(enemy.d,maxf(0.0,200-30*(battle.enemies.find(enemy)-1)))) ,"A DoT-triggered phase summons escorts once without advancing the newborns in the same enemy iteration")
 battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",24);battle.build("mortar",0);battle.start_wave();battle.spawn_count=battle.spawn_total
 tower=battle.towers[0];tower.cooldown=100;boss=battle.spawn_enemy("boss",0);place(battle,boss,200);boss.speed=.001;boss.hp=boss.max_hp*.5+1
 battle.shoot(tower,boss,battle.stats(tower))
 var impacts=0
 while not boss.get("enraged",false) and impacts<1000:battle.tick(.02);impacts+=1
 check(boss.get("enraged",false) and battle.enemies.size()==3 and battle.enemies.slice(1).all(func(enemy):return is_equal_approx(enemy.hp,enemy.max_hp)),"The mortar impact that triggers the phase cannot retroactively damage its newly called escorts")
 for family in ["flame","tesla"]:
  battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",24);battle.build(family,0);battle.start_wave();battle.spawn_count=battle.spawn_total
  tower=battle.towers[0];tower.cooldown=100
  if family=="tesla":tower.mods.append("splash")
  boss=battle.spawn_enemy("boss",0);place(battle,boss,10);boss.hp=boss.max_hp*.5+1
  var direction=(boss.pos-C.route_point(battle.routes[0],0)).normalized();battle.pads[0]=boss.pos-direction*100
  battle.shoot(tower,boss,battle.stats(tower))
  check(boss.get("enraged",false) and battle.enemies.size()==3 and battle.enemies.slice(1).all(func(enemy):return is_equal_approx(enemy.hp,enemy.max_hp)),"The %s attack keeps its original victim set when a phase creates new escorts"%family)
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.start_scenario("challenge",24,1)
 check(app.phase_label.tooltip_text.contains("Guardião da escória") and app.phase_label.tooltip_text.contains("105") and app.phase_label.tooltip_text.contains("25%") and app.phase_label.tooltip_text.contains("50%") and app.phase_label.tooltip_text.contains("perfuração"),"The actual preparation explains the phase, radius, reduction and piercing counterplay")
 app.run=fixture(24,false);app.board.run=app.run;app.board.reset_visuals();app.paused=true;await process_frame;await process_frame
 app.run.damage(app.run.enemies[0],app.run.enemies[0].max_hp*.51,-1,true);app.drain_events();await process_frame
 check(app.toast_label.text.contains("aura") and app.toast_label.text.contains("interromp"),"The real phase transition announces both escort protection and the existing tower interruption")
 var source_node=app.board.enemy_nodes[int(app.run.enemies[0].id)]
 check(source_node.get("protection_radius")==105.0,"The actual board gives the phase-two source its true protection circle")
 app.board.reduced_effects=true;await process_frame
 check(source_node.get("protection_radius")==105.0,"Reduced effects preserve the tactical protection circle")
 app.run.damage(app.run.enemies[0],100000,-1,true);app.run.tick(.01);app.board._process(0)
 check(source_node.get("protection_radius")==0.0,"A dying source drops its tactical circle immediately while its death animation fades")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(.15).timeout
 print("Slag ward: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
