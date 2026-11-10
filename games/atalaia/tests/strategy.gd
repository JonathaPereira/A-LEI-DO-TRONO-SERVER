extends SceneTree
const Run = preload("res://scripts/run.gd")
const Strategy = preload("res://scripts/strategy_progress.gd")
const PROFILE = "user://strategy-test.json"
const Main = preload("res://scenes/main.tscn")
const SaveStore = preload("res://scripts/save_store.gd")
var failures := 0
var checks := 0

func _initialize() -> void: _verify.call_deferred()

func check(ok: bool, message: String) -> void:
 checks+=1
 if not ok:
  failures+=1
  push_error(message)

func _finish(run, wave: int) -> void:
 run.wave=wave-1
 run.start_wave()
 run.spawn_count=run.spawn_total
 run.tick(1.0/60.0)

func _verify() -> void:
 for suffix in ["",".tmp",".bak",".bak.tmp",".invalid.bak"]:DirAccess.remove_absolute(PROFILE+suffix)
 var original = Run.new(42)
 var loaded = Run.new(42)
 var snapshot: Dictionary = original.to_data()
 snapshot["strategy"]={"branch":"engineering","rank":1}
 var restored: bool=loaded.load_data(snapshot)
 check(restored,"A campaign snapshot can restore its strategic specialization. "+loaded.error_text)
 var profile=Strategy.new(PROFILE)
 check(not profile.choose("engineering"),"A fresh profile has no free strategic nodes")
 var boundary=Run.new(4)
 boundary.set_map(0)
 boundary.wave=4
 boundary.start_wave()
 profile.observe(boundary.to_data())
 check(profile.rank()==0 and profile.best_wave==4,"Entering wave five does not award its progression")
 boundary.spawn_count=boundary.spawn_total
 boundary.tick(1.0/60.0)
 check(profile.observe(boundary.to_data()) and profile.rank()==1,"Clearing wave five unlocks the first strategic nodes")
 check(profile.choose("engineering"),"An unlocked specialization can be selected")
 var fresh=Run.new(42)
 check(fresh.prepare_strategy(profile.specialization()) and fresh.gold==395,"Engineering grants 35 starting gold in a new run")
 check(not fresh.prepare_strategy(profile.specialization()) and fresh.gold==395,"Starting gold cannot be applied twice")
 var resumed=Run.new(2)
 check(resumed.load_data(JSON.parse_string(JSON.stringify(fresh.to_data()))) and resumed.gold==395 and resumed.strategy==fresh.strategy,"A roundtrip conserves the selected specialization and gold")
 snapshot=fresh.to_data()
 snapshot["strategy"]={"branch":"protection","rank":3}
 check(not resumed.load_data(snapshot) and resumed.strategy==fresh.strategy,"A forged specialization cannot mutate the resumed run")
 var reopened=Strategy.new(PROFILE)
 check(reopened.best_wave==5 and reopened.specialization()==profile.specialization(),"An unlocked node and selection survive reopening")
 var second=Run.new(21)
 second.set_map(1)
 _finish(second,10)
 check(reopened.observe(second.to_data()) and reopened.rank()==2 and reopened.specialization().rank==2,"Wave ten unlocks the advanced node without changing the active run")
 check(resumed.strategy.rank==1,"An existing campaign never inherits a later profile upgrade")
 var protection=Run.new(11)
 protection.prepare_strategy({"branch":"protection","rank":2})
 protection.core=21
 _finish(protection,3)
 check(protection.core==23,"Advanced Protection repairs two integrity after the third wave")
 protection.skip_card()
 protection.core=29
 protection.set_map(1)
 _finish(protection,6)
 check(protection.core==30,"Protection respects the crystal capacity")
 var knowledge=Run.new(15)
 knowledge.prepare_strategy({"branch":"knowledge","rank":2})
 _finish(knowledge,3)
 check(knowledge.choices.filter(func(card):return card.id=="treasury").size()==1,"Knowledge guarantees a single Tributo in the first designated wave")
 knowledge.skip_card()
 knowledge.set_map(1)
 _finish(knowledge,8)
 check(knowledge.choices.filter(func(card):return card.id=="treasury").size()==1,"Advanced Knowledge guarantees the second Tributo")
 var blocked_profile=PROFILE+"-blocked"
 var temporary=ProjectSettings.globalize_path(blocked_profile+".tmp")
 for suffix in ["",".tmp",".bak",".bak.tmp",".invalid.bak"]:DirAccess.remove_absolute(blocked_profile+suffix)
 DirAccess.make_dir_absolute(temporary)
 var app=Main.instantiate()
 root.add_child(app)
 await process_frame
 app.qa_mode=false
 app.strategy_progress=Strategy.new(blocked_profile)
 app.save_store=SaveStore.new("user://strategy-blocked-run.json")
 app.saved=boundary.to_data()
 app.start_game()
 check(app.in_menu and app.saved.wave==5,"A new campaign cannot replace the sole snapshot for an unpersisted strategic milestone")
 DirAccess.remove_absolute(temporary)
 app.start_game()
 check(not app.in_menu and app.strategy_progress.best_wave==5,"Retrying preserves the previous milestone before replacing the campaign")
 app.save_game()
 var classic=app.save_store.load_save()
 app.start_scenario("survival",1,1)
 _finish(app.run,1)
 DirAccess.make_dir_absolute(temporary)
 check(not app.save_game(),"A failed Survival record write reports failure to its caller")
 app.save_and_return()
 check(not app.in_menu and app.run.scenario=="survival" and app.run.wave==1,"A failed Survival record cannot discard its only completed session")
 var survival_session=app.run
 app.start_scenario("survival",1,1)
 check(app.run==survival_session,"Retry cannot replace a Survival session whose record is still unsaved")
 app.show_menu()
 check(not app.in_menu and app.run==survival_session,"Direct title navigation preserves the unsaved Survival record")
 app.start_game()
 check(app.run==survival_session,"Starting a campaign cannot discard the only unsaved Survival result")
 app._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
 await create_timer(0.18).timeout
 check(not app.in_menu and app.run==survival_session,"Native window close preserves the Survival session while its record cannot be saved")
 DirAccess.remove_absolute(temporary)
 app.save_and_return()
 check(app.in_menu and Strategy.new(blocked_profile).survival_best==1 and app.save_store.load_save()==classic,"Retrying saves the earned Survival record before returning and preserves the campaign")
 app.sound.shutdown()
 app.queue_free()
 await process_frame
 # Player disposal is mixed asynchronously; allow it before ending the process.
 await create_timer(0.15).timeout
 print("Strategic progression: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
