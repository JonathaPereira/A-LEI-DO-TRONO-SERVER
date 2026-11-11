extends SceneTree
const Strategy=preload("res://scripts/strategy_progress.gd")
const Run=preload("res://scripts/run.gd")
const Main=preload("res://scenes/main.tscn")
const PATH="user://strategy-recovery-test.json"
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,message: String):
 checks+=1
 if not ok:failures+=1;push_error(message)
func write(path: String,raw: String):
 var file=FileAccess.open(path,FileAccess.WRITE);file.store_string(raw);file.close()
func snapshot(wave: int) -> Dictionary:
 var run=Run.new(42);run.set_map(int((wave-1)/5.0));run.wave=wave-1;run.start_wave();run.spawn_count=run.spawn_total;run.tick(1.0/60.0)
 return run.to_data()
func menu_notice(profile):
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.strategy_progress=profile;app.save_error="";app.show_menu()
 var labels=app.modal.find_children("*","Label",true,false)
 check(labels.any(func(label):return label.text.contains("Registro estratégico") and label.text.contains("recuper")),"The real title identifies recovery of the strategic profile")
 app.saved=snapshot(5);app.save_error="Progresso recuperado da cópia anterior. A última gravação pode ter sido perdida.";app.show_menu()
 var combined=app.modal.find_children("*","Label",true,false).filter(func(label):return label.text.contains("Registro estratégico") and label.text.contains("Campanha:"))
 check(combined.size()==1,"The title identifies both campaign and strategic profile warnings when recovery happens together")
 if combined.size()==1:
  var buttons=app.modal.find_children("*","Button",true,false).filter(func(button):return button.text.begins_with("CONTINUAR"))
  check(buttons.size()==1 and not combined[0].get_global_rect().intersects(buttons[0].get_global_rect()),"Combined recovery notices leave the campaign continuation button unobstructed")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
func run():
 for suffix in ["",".tmp",".bak",".bak.tmp",".invalid.bak",".invalid.bak.1"]:DirAccess.remove_absolute(PATH+suffix)
 var profile=Strategy.new(PATH)
 check(profile.observe(snapshot(5)) and profile.choose("engineering"),"An earned strategic milestone and specialization can be saved")
 check(FileAccess.file_exists(PATH+".bak"),"A later profile write preserves the previous healthy profile")
 check(profile.observe(snapshot(10)) and profile.best_wave==10,"The primary profile advances while keeping its previous milestone")
 var broken="{unreadable strategic profile"
 write(PATH,broken)
 var recovered=Strategy.new(PATH)
 check(recovered.best_wave==5 and recovered.selected=="engineering" and recovered.error_text.contains("recuper"),"An unreadable profile recovers the preceding valid milestone with a notice")
 check(FileAccess.get_file_as_string(PATH)==broken,"Opening a recovered profile preserves the original unreadable bytes")
 check(recovered.choose("protection") and FileAccess.get_file_as_string(PATH+".invalid.bak")==broken,"The next edit archives the exact original before saving the recovered profile")
 if recovered.best_wave==5:
  var healthy=FileAccess.get_file_as_string(PATH)
  DirAccess.remove_absolute(PATH+".bak");DirAccess.make_dir_absolute(PATH+".bak")
  check(not recovered.choose("knowledge") and recovered.selected=="protection" and FileAccess.get_file_as_string(PATH)==healthy,"A blocked backup cannot replace the only healthy profile or change its selection")
  DirAccess.remove_absolute(PATH+".bak")
  check(recovered.choose("knowledge"),"A profile write succeeds after the backup obstruction is removed")
  DirAccess.remove_absolute(PATH)
  var missing=Strategy.new(PATH)
  check(missing.best_wave==5 and missing.selected=="protection" and missing.error_text.contains("recuper"),"A missing primary profile recovers from its valid backup")
  check(missing.choose("engineering"),"The recovered backup can become the new primary")
  var before_notice=FileAccess.get_file_as_string(PATH)
  await menu_notice(missing)
  check(FileAccess.get_file_as_string(PATH)==before_notice,"Viewing the profile recovery notice does not rewrite its source")
  var future=JSON.parse_string(FileAccess.get_file_as_string(PATH));future.version=2
  var future_raw=JSON.stringify(future);write(PATH,future_raw)
  check(not recovered.record_survival(2) and recovered.survival_best==0 and FileAccess.get_file_as_string(PATH)==future_raw,"A live older profile owner cannot overwrite a newer file introduced after loading")
  write(PATH,future_raw)
  var incompatible=Strategy.new(PATH)
  check(not incompatible.record_survival(1) and FileAccess.get_file_as_string(PATH)==future_raw and incompatible.error_text.contains("compat"),"A future profile is preserved instead of downgraded to the older backup")
 print("Strategic profile recovery: %d checks, %d failures."%[checks,failures])
 quit(1 if failures else 0)
