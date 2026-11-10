extends SceneTree
const Main=preload("res://scenes/main.tscn")
const Strategy=preload("res://scripts/strategy_progress.gd")
const Run=preload("res://scripts/run.gd")
const PATH="user://achievements-test.json"
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,why: String):
 checks+=1
 if not ok:failures+=1;push_error(why)
func button(app,text: String):
 for node in app.modal.find_children("*","Button",true,false):
  if node.text==text:return node
 return null
func snapshot(wave: int,mode: String="classic") -> Dictionary:
 var defense=Run.new(42,mode)
 defense.set_map(int((wave-1)/(6.0 if mode=="chronicle" else 5.0)));defense.wave=wave-1;defense.start_wave();defense.spawn_count=defense.spawn_total;defense.tick(1.0/60.0)
 return defense.to_data()
func run():
 for suffix in ["",".tmp",".bak",".bak.tmp",".invalid.bak"]:DirAccess.remove_absolute(PATH+suffix)
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.strategy_progress=Strategy.new(PATH);app.show_menu()
 var open=button(app,"Conquistas")
 check(open!=null,"The real title exposes local achievements")
 if open!=null:
  open.pressed.emit()
  var labels=app.modal.find_children("*","Label",true,false)
  check(labels.any(func(label):return label.text=="Conquistas locais · 0/8"),"A fresh profile starts with no earned achievement")
  check(not FileAccess.file_exists(PATH),"Viewing achievements cannot create a strategic profile")
  button(app,"Voltar ao título").pressed.emit()
  check(app.modal_kind=="menu","Achievements returns to the actual title")
  var profile=app.strategy_progress
  profile.observe(snapshot(5));profile.choose("engineering")
  var earned=profile.achievements().filter(func(entry):return entry.unlocked).size()
  profile.choose("")
  check(profile.achievements().filter(func(entry):return entry.unlocked).size()>=earned,"Choosing to play without a specialization cannot revoke earned achievements")
  check(profile.achievements().filter(func(entry):return entry.unlocked).size()==1,"The first completed guardian grants only the first milestone")
  profile.observe(snapshot(10))
  check(profile.achievements().filter(func(entry):return entry.unlocked).size()==2,"The second strategic milestone does not invent Chronicle or Survival victories")
  for wave in [6,12,18,30]:
   profile.observe(snapshot(wave,"chronicle"))
  check(profile.achievements().filter(func(entry):return entry.unlocked).size()==6,"Actual Chronicle milestones award their achievements independently of Survival")
  profile.record_survival(10)
  check(profile.achievements().filter(func(entry):return entry.unlocked).size()==7,"The first Survival record grants its own achievement")
  profile.record_survival(30)
  var before=FileAccess.get_file_as_string(PATH)
  app.strategy_progress=Strategy.new(PATH);app.show_achievements()
  check(app.modal.find_children("*","Label",true,false).any(func(label):return label.text=="Conquistas locais · 8/8"),"The real screen shows all earned milestones after reopening")
  check(FileAccess.get_file_as_string(PATH)==before,"Reading completed achievements never rewrites the strategic profile")
  var legacy_path=PATH+"-legacy"
  var file=FileAccess.open(legacy_path,FileAccess.WRITE);file.store_string('{"version":1,"bestWave":15,"selected":"engineering"}');file.close()
  var legacy=Strategy.new(legacy_path)
  check(legacy.achievements().filter(func(entry):return entry.unlocked).size()==2,"An old classic profile cannot imply victories in modes it never recorded")
  DirAccess.remove_absolute(legacy_path)
  var returned=profile.achievements();returned[0].unlocked=false
  check(profile.achievements()[0].unlocked,"The presentation cannot revoke a milestone by editing its returned snapshot")
  file=FileAccess.open(legacy_path,FileAccess.WRITE);file.store_string("{unreadable profile");file.close()
  app.strategy_progress=Strategy.new(legacy_path);app.show_achievements()
  check(app.modal.find_children("*","Label",true,false).any(func(label):return label.text.contains("Registro estratégico") and label.text.contains("preservado")),"Unreadable profiles retain their recovery warning on the achievements screen")
  check(FileAccess.get_file_as_string(legacy_path)=="{unreadable profile","Inspecting unavailable achievements preserves the unreadable source")
  DirAccess.remove_absolute(legacy_path)
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
 for suffix in ["",".tmp",".bak",".bak.tmp",".invalid.bak"]:DirAccess.remove_absolute(PATH+suffix)
 print("Local achievements: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
