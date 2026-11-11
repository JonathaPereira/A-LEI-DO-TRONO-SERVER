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
func fixture(wave: int=18,enraged: bool=true):
 var battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",wave);battle.start_wave();battle.spawn_count=battle.spawn_total
 var boss=battle.spawn_enemy("boss",0);place(battle,boss,200)
 if enraged:battle.damage(boss,boss.max_hp*.51,-1,true)
 battle.events.clear()
 return battle

func run():
 var battle=Run.new(381,"chronicle")
 check(battle.prepare_scenario("replay",18) and battle.start_wave(),"The Citadel Sentinel Chronicle encounter starts normally")
 var first=fixture(18,false);var boss=first.enemies[0]
 check(first.enemies.size()==1 and not boss.get("enraged",false),"The living Sentinel starts alone before crossing her half-health threshold")
 var hp_before: float=boss.hp
 first.damage(boss,100,-1,false)
 check(is_equal_approx(hp_before-boss.hp,82.0),"Before second phase the boss receives damage using baseline 18% armor")
 battle=fixture(18,true);boss=battle.enemies[0]
 check(battle.enemies.size()==2 and battle.enemies[1].type=="golem","Crossing the Sentinel phase calls exactly one golem escort")
 check(battle.enemies[1].lane==boss.lane and battle.enemies[1].d<=boss.d and battle.enemies[1].pos.distance_to(boss.pos)<=35.0,"The golem escort enters the real route behind the Sentinel")
 hp_before=boss.hp
 battle.damage(boss,100,-1,false)
 check(is_equal_approx(hp_before-boss.hp,67.0),"Phase two Sentinel reinforced runic armor reduces unpierced impact by 33%")
 hp_before=boss.hp
 battle.damage(boss,100,-1,true)
 check(is_equal_approx(hp_before-boss.hp,100.0),"Armor-piercing impact bypasses the reinforced runic armor completely")
 battle.damage(boss,1,-1,true)
 check(battle.enemies.size()==2,"Subsequent damage cannot summon the golem again")
 for wave in [6,12,30]:
  var other=fixture(wave,false);var ob=other.enemies[0]
  other.damage(ob,ob.max_hp*.51,-1,true)
  check(not other.enemies.any(func(enemy):return enemy.type=="golem"),"Other bosses (6, 12, 30) do not inherit the sentinel golem escort")
  var before_other: float=ob.hp
  other.damage(ob,100,-1,false)
  check(is_equal_approx(before_other-ob.hp,82.0),"Other bosses keep their baseline 18% armor in phase two")
 var slag=fixture(24,false);var sb=slag.enemies[0]
 slag.damage(sb,sb.max_hp*.51,-1,true)
 var before_slag: float=sb.hp
 slag.damage(sb,100,-1,false)
 check(is_equal_approx(before_slag-sb.hp,82.0),"The slag guardian does not inherit sentinel bonus armor")
 var saved=JSON.parse_string(JSON.stringify(battle.to_data()));var reopened=Run.new()
 check(reopened.load_data(saved) and reopened.enemies.size()==2,"A phase-two sentinel save preserves the escort rather than re-summoning it")
 var re_boss=reopened.enemies[0];hp_before=re_boss.hp
 reopened.damage(re_boss,100,-1,false)
 check(is_equal_approx(hp_before-re_boss.hp,67.0),"Reopened phase two sentinel recomputes the 33% runic armor")
 saved.enemies=saved.enemies.slice(0,1);reopened=Run.new();var restored=reopened.load_data(saved)
 if restored:reopened.damage(reopened.enemies[0],1,-1,true)
 check(restored and reopened.enemies.size()==1,"An old already-enraged save gets no surprise reinforcements on load or its next hit")
 var lethal=fixture(18,false);lethal.damage(lethal.enemies[0],100000,-1,true)
 check(lethal.enemies.size()==1 and lethal.enemies[0].dead,"A lethal phase-crossing hit cannot summon the golem after the source dies")
 var dot_run=fixture(18,false);boss=dot_run.enemies[0];boss.hp=boss.max_hp*.5+1;dot_run.add_dot(boss,-1,"burn",20,1);dot_run.tick(.1)
 check(dot_run.enemies.size()==2 and is_equal_approx(dot_run.enemies[1].d,maxf(0.0,200-30)),"A DoT-triggered phase summons golem once without advancing the newborn in the same step")
 battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",18);battle.build("mortar",0);battle.start_wave();battle.spawn_count=battle.spawn_total
 var tower=battle.towers[0];tower.cooldown=100;boss=battle.spawn_enemy("boss",0);place(battle,boss,200);boss.speed=.001;boss.hp=boss.max_hp*.5+1
 battle.shoot(tower,boss,battle.stats(tower))
 var impacts=0
 while not boss.get("enraged",false) and impacts<1000:battle.tick(.02);impacts+=1
 check(boss.get("enraged",false) and battle.enemies.size()==2 and is_equal_approx(battle.enemies[1].hp,battle.enemies[1].max_hp),"The mortar impact that triggers the phase cannot retroactively damage its newly called golem")
 for family in ["flame","tesla"]:
  battle=Run.new(381,"chronicle");battle.prepare_scenario("replay",18);battle.build(family,0);battle.start_wave();battle.spawn_count=battle.spawn_total
  tower=battle.towers[0];tower.cooldown=100
  if family=="tesla":tower.mods.append("splash")
  boss=battle.spawn_enemy("boss",0);place(battle,boss,10);boss.hp=boss.max_hp*.5+1
  var direction=(boss.pos-C.route_point(battle.routes[0],0)).normalized();battle.pads[0]=boss.pos-direction*100
  battle.shoot(tower,boss,battle.stats(tower))
  check(boss.get("enraged",false) and battle.enemies.size()==2 and is_equal_approx(battle.enemies[1].hp,battle.enemies[1].max_hp),"The %s attack keeps its original victim set when sentinel creates escort"%family)
 var survival=Run.new(381,"chronicle");survival.prepare_scenario("survival",1);survival.wave=17;survival.start_wave();survival.spawn_count=survival.spawn_total
 boss=survival.spawn_enemy("boss",0);place(survival,boss,200);survival.damage(boss,boss.max_hp*.51,-1,true)
 check(survival.enemies.size()==1,"Survival mode wave 18 does not grant the chronicle golem summon")
 var classic=Run.new();classic.wave=17;classic.start_wave();classic.spawn_count=classic.spawn_total
 boss=classic.spawn_enemy("boss",0);place(classic,boss,200);classic.damage(boss,boss.max_hp*.51,-1,true)
 check(classic.enemies.size()==1,"The classic campaign cannot acquire the sentinel golem summon")
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.start_scenario("challenge",18,1)
 check(app.phase_label.tooltip_text.contains("Sentinela da cidadela") and app.phase_label.tooltip_text.contains("golem") and app.phase_label.tooltip_text.contains("33%") and app.phase_label.tooltip_text.to_lower().contains("perfuração"),"Preparation explains the phase, golem escort, runic armor and piercing counterplay")
 app.run=fixture(18,false);app.board.run=app.run;app.board.reset_visuals();app.paused=true;await process_frame;await process_frame
 app.run.damage(app.run.enemies[0],app.run.enemies[0].max_hp*.51,-1,true);app.drain_events();await process_frame
 check(app.toast_label.text.contains("Sentinela") and app.toast_label.text.contains("armadura") and app.toast_label.text.contains("interromp"),"The real phase transition announces sentinel golem, reinforced armor and tower interruption")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
 print("Citadel Sentinel: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
