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
func fixture(wave: int=12,enraged: bool=true):
 var battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",wave);battle.start_wave();battle.spawn_count=battle.spawn_total
 var boss=battle.spawn_enemy("boss",0);place(battle,boss,200)
 if enraged:battle.damage(boss,boss.max_hp*.51,-1,true)
 battle.events.clear()
 return battle

func run():
 var battle=Run.new(381,"chronicle")
 check(battle.prepare_scenario("replay",12) and battle.start_wave(),"The Root Matriarch Chronicle encounter starts normally")
 var first=fixture(12,false);var boss=first.enemies[0]
 check(first.enemies.size()==1 and not boss.get("enraged",false),"The living Matriarch starts alone before crossing her half-health threshold")
 battle=fixture(12,true);boss=battle.enemies[0]
 check(battle.enemies.size()==3 and battle.enemies.slice(1).map(func(enemy):return enemy.type)==["brood","brood"],"Crossing the Matriarch phase calls exactly two brood weavers")
 check(battle.enemies.slice(1).all(func(enemy):return enemy.lane==boss.lane and enemy.d<=boss.d and enemy.pos.distance_to(boss.pos)<=65.0),"Both brood escorts enter the real route behind their source")
 battle.damage(boss,1,-1,true)
 check(battle.enemies.size()==3,"Subsequent damage cannot summon the brood again")
 for wave in [6,18,24,30]:
  var other=fixture(wave,false)
  other.damage(other.enemies[0],other.enemies[0].max_hp*.51,-1,true)
  check(not other.enemies.any(func(enemy):return enemy.type=="brood"),"Other bosses keep their own phase patterns without inheriting the matriarch brood")
 var saved=JSON.parse_string(JSON.stringify(battle.to_data()));var reopened=Run.new()
 check(reopened.load_data(saved) and reopened.enemies.size()==3,"A phase-two matriarch save preserves the escorts rather than re-summoning them")
 saved.enemies=saved.enemies.slice(0,1);reopened=Run.new();var restored=reopened.load_data(saved)
 if restored:reopened.damage(reopened.enemies[0],1,-1,true)
 check(restored and reopened.enemies.size()==1,"An old already-enraged save gets no surprise reinforcements on load or its next hit")
 var lethal=fixture(12,false);lethal.damage(lethal.enemies[0],100000,-1,true)
 check(lethal.enemies.size()==1 and lethal.enemies[0].dead,"A lethal phase-crossing hit cannot summon the brood after the source dies")
 var dot_run=fixture(12,false);boss=dot_run.enemies[0];boss.hp=boss.max_hp*.5+1;dot_run.add_dot(boss,-1,"burn",20,1);dot_run.tick(.1)
 check(dot_run.enemies.size()==3 and dot_run.enemies.slice(1).all(func(enemy):return is_equal_approx(enemy.d,maxf(0.0,200-30*(dot_run.enemies.find(enemy))))),"A DoT-triggered phase summons brood once without advancing the newborns in the same step")
 battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",12);battle.build("mortar",0);battle.start_wave();battle.spawn_count=battle.spawn_total
 var tower=battle.towers[0];tower.cooldown=100;boss=battle.spawn_enemy("boss",0);place(battle,boss,200);boss.speed=.001;boss.hp=boss.max_hp*.5+1
 battle.shoot(tower,boss,battle.stats(tower))
 var impacts=0
 while not boss.get("enraged",false) and impacts<1000:battle.tick(.02);impacts+=1
 check(boss.get("enraged",false) and battle.enemies.size()==3 and battle.enemies.slice(1).all(func(enemy):return is_equal_approx(enemy.hp,enemy.max_hp)),"The mortar impact that triggers the phase cannot retroactively damage its newly called brood")
 for family in ["flame","tesla"]:
  battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",12);battle.build(family,0);battle.start_wave();battle.spawn_count=battle.spawn_total
  tower=battle.towers[0];tower.cooldown=100
  if family=="tesla":tower.mods.append("splash")
  boss=battle.spawn_enemy("boss",0);place(battle,boss,10);boss.hp=boss.max_hp*.5+1
  var direction=(boss.pos-C.route_point(battle.routes[0],0)).normalized();battle.pads[0]=boss.pos-direction*100
  battle.shoot(tower,boss,battle.stats(tower))
  check(boss.get("enraged",false) and battle.enemies.size()==3 and battle.enemies.slice(1).all(func(enemy):return is_equal_approx(enemy.hp,enemy.max_hp)),"The %s attack keeps its original victim set when matriarch creates escorts"%family)
 var survival=Run.new(381,"chronicle");survival.prepare_scenario("survival",1);survival.wave=11;survival.start_wave();survival.spawn_count=survival.spawn_total
 boss=survival.spawn_enemy("boss",0);place(survival,boss,200);survival.damage(boss,boss.max_hp*.51,-1,true)
 check(survival.enemies.size()==1,"Survival mode wave 12 does not grant the chronicle brood summon")
 var classic=Run.new();classic.wave=11;classic.start_wave();classic.spawn_count=classic.spawn_total
 boss=classic.spawn_enemy("boss",0);place(classic,boss,200);classic.damage(boss,boss.max_hp*.51,-1,true)
 check(classic.enemies.size()==1,"The classic campaign cannot acquire the matriarch summon")
 var split_test=fixture(12,true)
 check(split_test.enemies.size()==3,"Fixture starts with matriarch and two broods")
 var brood_target=split_test.enemies[1]
 split_test.damage(brood_target,100000,-1,true)
 split_test.tick(1.0/60.0)
 check(split_test.enemies.any(func(enemy):return enemy.type=="hatchling"),"Defeating a brood weaver splits it into hatchlings for swarm pressure")
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.start_scenario("challenge",12,1)
 check(app.phase_label.tooltip_text.contains("Matriarca das raízes") and app.phase_label.tooltip_text.contains("duas tecelãs") and app.phase_label.tooltip_text.contains("filhotes") and app.phase_label.tooltip_text.contains("área"),"Preparation explains the phase, escorts, split and area counterplay")
 app.run=fixture(12,false);app.board.run=app.run;app.board.reset_visuals();app.paused=true;await process_frame;await process_frame
 app.run.damage(app.run.enemies[0],app.run.enemies[0].max_hp*.51,-1,true);app.drain_events();await process_frame
 check(app.toast_label.text.contains("Matriarca") and app.toast_label.text.contains("ninhada") and app.toast_label.text.contains("interromp"),"The real phase transition announces matriarch brood and tower interruption")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
 print("Root Matriarch: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
