extends SceneTree
const Run = preload("res://scripts/run.gd")
const Catalog = preload("res://scripts/catalog.gd")
const Main = preload("res://scenes/main.tscn")
const SaveStore = preload("res://scripts/save_store.gd")
const Strategy = preload("res://scripts/strategy_progress.gd")
var failures := 0
var checks := 0

func _initialize() -> void: _run.call_deferred()

func check(ok: bool, message: String) -> void:
 checks+=1
 if not ok:
  failures+=1
  push_error(message)

func _resolved_wave(run) -> void:
 # Exercise rewards and transitions at the resolved combat boundary.
 run.spawn_count=run.spawn_total
 run.tick(1.0/60.0)

func _save_roundtrip(run) -> bool:
 var reopened=Run.new()
 return reopened.load_data(JSON.parse_string(JSON.stringify(run.to_data()))) and reopened.mode==run.mode and reopened.wave==run.wave and reopened.stage==run.stage and reopened.phase==run.phase

func _campaign() -> void:
 var run=Run.new(78,"chronicle")
 check(run.max_waves()==30 and run.maps.size()==5,"Chronicle has five acts with six waves each")
 var names := {}
 var route_counts: Array=[]
 for number in range(1,31):
  if number%6==1:route_counts.append(run.routes.size())
  var recipe: Dictionary=run.phase_preview()
  names[recipe.name]=true
  check(run.start_wave() and run.wave==number and run.spawn_total==recipe.count,"The selected phase sets wave and spawn count")
  run.tick(0.31)
  check(run.enemies.size()==1 and int(run.enemies[0].lane)==int(recipe.lanes[0]) and run.enemies[0].type in recipe.deck,"A real tick uses the phase's enemy deck and lanes")
  check(_save_roundtrip(run),"An active wave reopens in its original act")
  if number==19:
   for count in range(1,run.spawn_total):
    run.tick(float(recipe.interval)+0.01)
   check(run.enemies.any(func(enemy):return enemy.get("veiled",false)),"The first foundry wave actually spawns veiled spirits")
  run.enemies.clear()
  var before: int=run.gold
  _resolved_wave(run)
  check(run.gold==before+45+number*3+int(recipe.reward),"Finishing with full integrity grants the authored bonus")
  check(_save_roundtrip(run),"Pending rewards or victory reopen with the same phase")
  if number<30:
   check(run.skip_card(),"The reward can be resolved")
   if number%6==0:
    check(run.phase=="doctrine" and run.apply_doctrine(0) and run.stage==number/6,"A doctrine advances to the next act")
    check(_save_roundtrip(run),"The next act opens after reopening")
 check(names.size()==30 and route_counts==[1,2,3,3,4],"All thirty phases are named and use five map layouts")
 check(run.phase=="victory" and not run.start_wave(),"The Chronicle ends on wave thirty")

func _regional_arsenal() -> void:
 var types=["roots","harpoon","seismic","spectral","ash_forge","solar"]
 var run=Run.new(27,"chronicle")
 for type in types:
  var act: int=Catalog.TOWERS[type].act
  var classic=Run.new(27)
  check(not classic.available_tower(type),"Classic cannot purchase regional towers")
  if act>0:
   run.set_map(act-1)
   check(not run.available_tower(type),"The regional tower unlocks in its native act")
  run.set_map(act)
  run.gold=5000
  var id: int=run.next_id
  check(run.build(type,types.find(type)) and run.upgrade(id) and run.upgrade(id) and not run.upgrade(id),"Each regional tower has three levels")
 var roots: Dictionary=run.stats(run.towers[0])
 var harpoon: Dictionary=run.stats(run.towers[1])
 var seismic: Dictionary=run.stats(run.towers[2])
 check(roots.slow>0.7 and harpoon.ignore and seismic.splash>=90,"Control, piercing and area weapons use distinct stats")
 run.wave=24
 run.start_wave()
 var spirit: Dictionary=run.spawn_enemy("spirit",0)
 var solar: Dictionary=run.towers[5]
 var spectral: Dictionary=run.towers[3]
 solar.pad=spectral.pad
 spirit.pos=run.pads[spectral.pad]
 check(spirit.veiled and run.select_target(solar,run.stats(solar)).is_empty(),"An unrevealed spirit cannot be targeted by solar")
 check(run.select_target(spectral,run.stats(spectral))==spirit,"Spectral can target an unrevealed spirit")
 run.impact(spirit,spectral,run.stats(spectral))
 check(spirit.revealed==3.0 and run.select_target(solar,run.stats(solar))==spirit,"Spectral reveals the spirit to other towers")
 var before: float=spirit.hp
 run.impact(spirit,solar,run.stats(solar))
 check(before-spirit.hp>run.stats(solar).damage,"Solar deals extra damage to spirits")
 var forge: Dictionary=run.towers[4]
 var boss: Dictionary=run.spawn_enemy("boss",0)
 boss.pos=run.pads[forge.pad]
 run.impact(boss,forge,run.stats(forge))
 check(boss.dots.size()==1 and boss.dots[0].time==4.0,"Ash forge applies the longer burn")
 var speed: float=boss.speed
 run.damage(boss,boss.max_hp*0.55,forge.id,true)
 check(boss.enraged and boss.speed>speed and forge.cooldown>=1.1,"Half health enrages the boss and interrupts nearby towers")
 run.damage(boss,1,forge.id,true)
 check(run.events.filter(func(event):return event.kind=="boss_phase").size()==1,"The boss transition fires only once")
 solar.pad=5
 var restored=Run.new()
 check(restored.load_data(JSON.parse_string(JSON.stringify(run.to_data()))) and restored.enemies[-1].enraged and restored.enemies[0].revealed==3.0,"An active boss and reveal survive reopening")

func _root_binding() -> void:
 var run=Run.new(78,"chronicle")
 run.build("roots",0)
 run.start_wave()
 run.spawn_count=run.spawn_total
 var wolf: Dictionary=run.spawn_enemy("wolf",0)
 wolf.d=100.0
 run.impact(wolf,run.towers[0],run.stats(run.towers[0]))
 check(is_equal_approx(wolf.get("root_time",0.0),0.55),"Roots briefly bind an ordinary enemy")
 run.towers[0].cooldown=100
 run.tick(0.10)
 check(is_equal_approx(wolf.d,100.0),"A rooted enemy stops progressing along the road")
 check(_save_roundtrip(run),"The remaining bind time survives an active-wave checkpoint")
 run.tick(0.60)
 check(wolf.d>100.0,"The enemy resumes its route after the bind expires")
 var boss: Dictionary=run.spawn_enemy("boss",0)
 run.impact(boss,run.towers[0],run.stats(run.towers[0]))
 check(is_equal_approx(boss.get("root_time",0.0),0.275),"A boss resists half of the bind duration")

func _foundry_guard() -> void:
 var run=Run.new(78,"chronicle")
 run.set_map(3)
 run.wave=18
 run.start_wave()
 run.tick(0.31)
 check(run.enemies.size()==1 and run.enemies[0].type=="ward","The foundry opens with its escort guard")
 if run.enemies.is_empty() or run.enemies[0].type!="ward":return
 var guard: Dictionary=run.enemies[0]
 var ally: Dictionary=run.spawn_enemy("wolf",0)
 var before: float=ally.hp
 run.damage(ally,40,0)
 check(is_equal_approx(before-ally.hp,30),"The guard absorbs one quarter of direct damage to nearby allies")
 before=ally.hp
 run.damage(ally,40,0,true)
 check(is_equal_approx(before-ally.hp,40),"Piercing shots ignore the escort's protection")
 run.add_dot(guard,0,"burn",10,4)
 check(is_equal_approx(guard.dots[0].dps,5),"The foundry guard resists thermal damage")
 guard.dots.clear()
 var restored=Run.new()
 check(restored.load_data(run.to_data()) and restored.enemies[0].type=="ward","An active escort guard survives save and resume")

func _brood() -> void:
 var run=Run.new(78,"chronicle")
 run.set_map(3)
 run.wave=21
 run.start_wave()
 run.tick(0.31)
 check(run.enemies.size()==1 and run.enemies[0].type=="brood","The foundry's three-way siege sends a splitting creature")
 if run.enemies.is_empty() or run.enemies[0].type!="brood":return
 var parent: Dictionary=run.enemies[0]
 var position: float=parent.d
 run.damage(parent,parent.max_hp*2,0,true)
 run.damage(parent,parent.max_hp*2,0,true)
 _resolved_wave(run)
 check(run.enemies.size()==2 and run.phase=="wave","A parent spawns exactly two offspring before wave completion")
 check(run.enemies.all(func(enemy):return enemy.type=="hatchling" and enemy.lane==parent.lane and enemy.d<=position and enemy.gold==0),"The offspring continue along the same lane and cannot be farmed for gold")
 var reopened=Run.new()
 check(reopened.load_data(run.to_data()) and reopened.enemies.size()==2,"The offspring survive an active-wave checkpoint")

func _regional_cards() -> void:
 var run=Run.new(78,"chronicle")
 run.build("ballista",2)
 var tower: Dictionary=run.towers[0]
 var base: Dictionary=run.stats(tower)
 run.start_wave()
 _resolved_wave(run)
 var focus: Dictionary=Catalog.card("counterweight")
 check(not focus.is_empty(),"Chronicle offers a damage-versus-range card")
 if focus.is_empty():return
 run.choices=[focus]
 check(run.apply_card(0,tower.id),"The card can be assigned to a real tower")
 var stats: Dictionary=run.stats(tower)
 check(is_equal_approx(stats.damage,base.damage*1.30) and is_equal_approx(stats.range,base.range*0.85),"The card applies both its benefit and its cost")
 check(_save_roundtrip(run),"An applied Chronicle card survives reopening")
 run.start_wave()
 _resolved_wave(run)
 run.choices=[Catalog.card("crossfire")]
 check(run.apply_card(0,tower.id) and is_equal_approx(run.stats(tower).rate,base.rate),"The link card is inactive for an isolated tower")
 var nearby: int=range(run.pads.size()).find_custom(func(pad):return pad!=tower.pad and run.pads[pad].distance_to(run.pads[tower.pad])<=120.0)
 check(run.build("ballista",nearby) and is_equal_approx(run.stats(tower).rate,base.rate*0.82),"A neighboring tower activates the link card")
 var snapshot: Dictionary=run.to_data()
 snapshot.erase("mode")
 check(not Run.new().load_data(snapshot),"A Classic save cannot contain Chronicle cards")

func _cards_and_modes() -> void:
 var run=Run.new(78,"chronicle")
 run.start_wave()
 _resolved_wave(run)
 var initial: Array=run.choices.map(func(card):return card.id)
 var gold: int=run.gold
 check(run.reroll_cards() and run.gold==gold-30,"Reroll costs exactly thirty gold")
 check(run.choices.size()==3 and not run.choices.any(func(card):return card.id in initial),"Reroll changes the whole offer")
 var restored=Run.new()
 check(restored.load_data(run.to_data()) and restored.choices==run.choices and not restored.reroll_cards(),"A reopened offer cannot be rerolled twice")
 var classic=Run.new(78)
 classic.start_wave()
 _resolved_wave(classic)
 check(not classic.reroll_cards() and _save_roundtrip(classic),"Classic offers remain compatible and cannot be rerolled")
 var survival=Run.new(78,"chronicle")
 check(survival.prepare_scenario("survival"),"Survival starts without a campaign snapshot")
 for number in range(1,116):
  if number==25:
   check(survival.build("solar",21),"Survival can build on the final map's extra pads")
  survival.start_wave()
  _resolved_wave(survival)
  survival.skip_card()
  if survival.phase=="doctrine":survival.apply_doctrine(0)
  if number==30:
   check(survival.stage==0 and survival.towers.size()==1 and survival.towers[0].pad<survival.pads.size(),"Survival moves towers from extra pads on its return to the first act")
 check(survival.phase=="prep" and survival.wave==115,"Survival progresses after all eighteen unique doctrines are taken")
 for integrity in [26,27]:
  var challenge=Run.new(78,"chronicle")
  check(challenge.prepare_scenario("challenge",15,27) and challenge.stage==2 and challenge.start_wave(),"Challenge starts at the chosen phase")
  challenge.core=integrity
  _resolved_wave(challenge)
  check(challenge.phase==("victory" if integrity==27 else "defeat"),"Challenge grades the stated integrity target")
 var replay=Run.new(78,"chronicle")
 check(replay.prepare_scenario("replay",30) and replay.stage==4 and replay.start_wave(),"Replay uses the selected historical phase")
 _resolved_wave(replay)
 check(replay.phase=="victory" and not replay.start_wave(),"Replay ends after one phase")

func _scene() -> void:
 var prefix="user://chronicle-test-"
 for label in ["classic","chronicle","profile"]:
  for suffix in ["",".tmp",".bak",".invalid.bak"]:DirAccess.remove_absolute(prefix+label+suffix)
 var app=Main.instantiate()
 root.add_child(app)
 await process_frame
 app.qa_mode=false
 app.save_store=SaveStore.new(prefix+"classic")
 app.chronicle_store=SaveStore.new(prefix+"chronicle","chronicle")
 app.strategy_progress=Strategy.new(prefix+"profile")
 app.show_settings()
 var toggle=app.modal.find_child("ReducedEffects",true,false)
 check(is_instance_valid(toggle),"Visual quality is available before starting a campaign")
 if is_instance_valid(toggle):
  toggle.button_pressed=true
  var escape:=InputEventKey.new()
  escape.keycode=KEY_ESCAPE;escape.pressed=true
  app._unhandled_key_input(escape)
  check(app.in_menu and app.modal_kind=="menu" and app.board.background.material==null,"The light profile preserves navigation and removes the atmospheric shader")
  app.board.set_reduced_effects(false)
  app.load_settings()
  check(app.board.reduced_effects,"The light profile survives settings reload")
 app.start_game()
 app.save_and_return()
 app.select_campaign("chronicle")
 app.start_game()
 check(app.phase_label.tooltip_text.contains("Entradas ativas"),"The real scene shows the phase's active paths")
 app.run.start_wave()
 _resolved_wave(app.run)
 app.save_and_return()
 var classic: Dictionary=app.save_store.load_save()
 var chronicle: Dictionary=app.chronicle_store.load_save()
 check(classic.get("mode","classic")=="classic" and chronicle.get("mode")=="chronicle","The title's two campaigns write to separate files")
 check(not app.save_store.save(chronicle) and not app.chronicle_store.save(classic),"A checkpoint cannot cross campaign stores")
 app.start_scenario("replay",2,1)
 check(app.in_menu,"Replay of an unfinished phase remains locked")
 app.start_scenario("replay",1,1)
 check(not app.in_menu and app.run.scenario=="replay","The completed Chronicle phase unlocks replay")
 app.save_and_return()
 app.start_scenario("survival",1,1)
 app.run.start_wave()
 _resolved_wave(app.run)
 app.save_and_return()
 check(app.chronicle_store.load_save()==chronicle and app.save_store.load_save()==classic,"Replay and Survival do not touch either checkpoint")
 check(Strategy.new(prefix+"profile").survival_best==1,"The Survival record is saved separately")
 app.start_scenario("challenge",19,20)
 check(app.phase_label.tooltip_text.contains("Terrenos elevados: +18 alcance"),"The foundry preparation explains its elevated emplacements")
 app.run.build("ballista",3);app.selected=int(app.run.towers[0].id);app.refresh_hud()
 check(app.quick_mods.text.contains("Terreno elevado"),"The selected tower identifies its positional range bonus")
 app.run.start_wave()
 app.run.tick(0.31)
 await process_frame
 await process_frame
 check(app.board.enemy_nodes.size()==1,"The real board configures the regional escort's sprite")
 app.save_and_return()
 app.start_scenario("challenge",9,1)
 check(app.phase_label.tooltip_text.contains("Alcance das torretas −20%"),"Preparation explains the temporary fog before starting the wave")
 app.run.start_wave();app.run.wave_elapsed=5.1;app.refresh_hud()
 check(app.wave_progress_label.text.contains("NÉVOA EM 3 s"),"The HUD announces the fog three seconds before its effect")
 app.run.wave_elapsed=8.1;app.refresh_hud()
 check(app.wave_progress_label.text.contains("NÉVOA · alcance −20% · 6 s"),"The active fog has a readable remaining duration in the HUD")
 app.save_and_return()
 app.select_campaign("classic")
 app.continue_game()
 check(app.run.mode=="classic" and app.phase_label.tooltip_text.is_empty(),"Classic has no stale Chronicle phase tooltip")
 app.sound.shutdown()
 await create_timer(0.15).timeout
 app.queue_free()
 await process_frame

func _marsh_fog() -> void:
 var run=Run.new(912,"chronicle")
 check(run.prepare_scenario("replay",9) and run.build("ballista",0) and run.start_wave(),"The marsh fog encounter is playable with a legal tower")
 for frame in range(51):run.tick(0.1)
 check(run.environment().state=="warning" and is_equal_approx(run.stats(run.towers[0]).range,166.0),"The warning leaves weapon reach unchanged")
 for frame in range(30):run.tick(0.1)
 check(run.phase=="wave" and is_equal_approx(run.stats(run.towers[0]).range,132.8),"At eight seconds the marsh fog reduces the ballista's range by twenty percent")
 var reopened=Run.new()
 check(reopened.load_data(JSON.parse_string(JSON.stringify(run.to_data()))) and reopened.environment().state=="active" and is_equal_approx(reopened.environment().seconds,run.environment().seconds) and is_equal_approx(reopened.stats(reopened.towers[0]).range,132.8),"Reopening preserves the active fog and its remaining duration")
 check(is_equal_approx(run.stats({"type":"spectral","level":1,"mods":[],"pad":0}).range,165.0),"The spectral beacon preserves its detection range in fog")
 var target: Dictionary=run.enemies[0]
 target.pos=run.pads[0]+Vector2(150,0)
 run.enemies=[target]
 check(run.select_target(run.towers[0],run.stats(run.towers[0])).is_empty(),"Fog actually prevents a shot at an enemy outside the reduced reach")
 for frame in range(60):run.tick(0.1)
 target.pos=run.pads[0]+Vector2(150,0);target.dead=false
 run.enemies=[target]
 check(is_equal_approx(run.stats(run.towers[0]).range,166.0) and not run.select_target(run.towers[0],run.stats(run.towers[0])).is_empty(),"After six seconds the original reach and target acquisition return")
 var classic=Run.new()
 classic.wave=9;classic.phase="wave";classic.wave_elapsed=8.1
 check(classic.environment().is_empty() and is_equal_approx(classic.stats({"type":"ballista","level":1,"mods":[],"pad":0}).range,166.0),"The classic campaign has no environmental range modifier")

func _elevated_positions() -> void:
 var run=Run.new(744,"chronicle")
 check(run.prepare_scenario("replay",19) and run.build("ballista",3),"The foundry has a legal elevated emplacement")
 check(is_equal_approx(run.stats(run.towers[0]).range,184.0),"The elevated foundry pad adds eighteen range to a level-one ballista")
 var tower: Dictionary=run.towers[0]
 tower.mods=["range"]
 check(is_equal_approx(run.stats(tower).range,224.48),"The range card applies to the complete elevated reach")
 check(run.move_tower(tower.id,0) and is_equal_approx(run.stats(tower).range,202.52),"Moving to ordinary ground removes the positional bonus")
 check(run.move_tower(tower.id,3) and run.upgrade(tower.id) and run.upgrade(tower.id) and is_equal_approx(run.stats(tower).range,253.76),"Upgrading and returning to high ground preserve the authored composition")
 var reopened=Run.new()
 check(reopened.load_data(JSON.parse_string(JSON.stringify(run.to_data()))) and is_equal_approx(reopened.stats(reopened.towers[0]).range,253.76),"Reopening derives the same elevation from its map and tower pad")
 var bastion=Run.new(744,"chronicle")
 check(bastion.prepare_scenario("replay",25) and bastion.pad_range_bonus(3)==18.0 and bastion.pad_range_bonus(19)==18.0 and bastion.pad_range_bonus(0)==0.0,"The bastion has two designated elevated sites")
 var classic=Run.new()
 check(classic.build("ballista",3) and is_equal_approx(classic.stats(classic.towers[0]).range,166.0),"The classic campaign keeps its ordinary ground range")

func _run() -> void:
 _campaign()
 _regional_arsenal()
 _root_binding()
 _foundry_guard()
 _brood()
 _regional_cards()
 _cards_and_modes()
 _marsh_fog()
 _elevated_positions()
 await _scene()
 print("Chronicle: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
