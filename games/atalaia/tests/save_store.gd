extends SceneTree
const PATH = "user://atalaia_campaign_v1.json"
const Store = preload("res://scripts/save_store.gd")
const Run = preload("res://scripts/run.gd")
var checks = 0
var failures = 0

func _initialize(): call_deferred("verify")

func check(ok: bool, label: String):
 checks += 1
 if not ok:
  failures += 1
  push_error("SAVE FAIL: " + label)
 else: print("SAVE PASS: " + label)

func write(path: String, text: String):
 var file = FileAccess.open(path, FileAccess.WRITE)
 file.store_string(text)
 file.close()

func labels(node: Node) -> String:
 var result = node.text if node is Label else ""
 for child in node.get_children(): result += "\n" + labels(child)
 return result

func button(node: Node, text: String) -> Button:
 if node is Button and node.text == text: return node
 for child in node.get_children():
  var found = button(child, text)
  if found != null: return found
 return null

func clean():
 for suffix in ["", ".tmp", ".bak", ".bak.tmp", ".invalid.bak", ".invalid.bak.1"]:
  DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + suffix))

func verify():
 clean()
 write(PATH, "corrupted original {")
 var app = load("res://scenes/main.tscn").instantiate()
 root.add_child(app)
 await process_frame
 check(app.saved.is_empty(), "Corrupt primary cannot offer Continue")
 check(labels(app.modal).contains("não pôde ser lido"), "The title reports an unreadable save instead of silently hiding it")
 check(FileAccess.get_file_as_string(PATH) == "corrupted original {", "Loading alone never overwrites the corrupt original")
 app.start_game()
 check(FileAccess.file_exists(PATH + ".invalid.bak") and FileAccess.get_file_as_string(PATH + ".invalid.bak") == "corrupted original {", "Starting again preserves the exact corrupt source")
 var healthy = FileAccess.get_file_as_string(PATH)
 check(not app.saved.is_empty() and app.saved.gold == app.run.gold, "Only a successful save updates the Continue snapshot")
 app.run.gold += 17
 DirAccess.make_dir_absolute(ProjectSettings.globalize_path(PATH + ".tmp"))
 check(app.save_game() == false, "A blocked temporary path reports save failure")
 check(FileAccess.get_file_as_string(PATH) == healthy and app.saved.get("gold", -1) != app.run.gold, "Failed saving leaves disk and Continue snapshot untouched")
 app.show_settings()
 var back = button(app.modal, "Salvar e voltar ao título")
 check(back != null, "The settings expose save-and-return")
 back.pressed.emit()
 check(not app.in_menu and app.modal_kind == "settings", "Save-and-return stays in the match when the write fails")
 check(app.toast_label.text.contains("salvar"), "A failed write is visible to the player")
 app.notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
 await process_frame
 check(app.is_inside_tree() and not app.in_menu, "Window close remains in the running game when its save fails")
 DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH + ".tmp"))
 check(app.save_game() == true and app.saved.get("gold", -1) == app.run.gold, "Saving can succeed after the filesystem obstruction is removed")
 app.qa_mode = true
 app.sound.shutdown()
 await create_timer(0.15).timeout
 app.queue_free()
 await process_frame
 write(PATH, "different corrupt source")
 var second = load("res://scenes/main.tscn").instantiate()
 root.add_child(second)
 await process_frame
 second.start_game()
 check(FileAccess.get_file_as_string(PATH + ".invalid.bak") == "corrupted original {" and FileAccess.get_file_as_string(PATH + ".invalid.bak.1") == "different corrupt source", "A later corrupt source receives its own backup without replacing the first")
 second.qa_mode = true
 second.sound.shutdown()
 await create_timer(0.15).timeout
 second.queue_free()
 await process_frame
 clean()
 write(PATH, "unreadable original")
 DirAccess.make_dir_absolute(ProjectSettings.globalize_path(PATH + ".invalid.bak"))
 var store = Store.new(PATH)
 var valid = Run.new().to_data()
 check(not store.save(valid) and store.error_text.contains("preservar"), "A blocked preservation path reports an error")
 check(FileAccess.get_file_as_string(PATH) == "unreadable original", "A failed backup cannot replace the only original")
 clean()
 check(store.save(valid), "The file owner writes a valid initial campaign")
 var before = FileAccess.get_file_as_string(PATH)
 var invalid = valid.duplicate(true)
 invalid.version = 999
 check(not store.save(invalid) and FileAccess.get_file_as_string(PATH) == before, "An incompatible new snapshot cannot replace a healthy save")
 check(not store.load_save().is_empty() and store.error_text == "", "The written campaign can be reopened and clears previous errors")
 var previous = FileAccess.get_file_as_string(PATH)
 var next = valid.duplicate(true)
 next.gold += 17
 check(store.save(next) and FileAccess.get_file_as_string(PATH+".bak") == previous, "Healthy replacement retains the exact previous checkpoint")
 check(store.load_save().gold == next.gold and store.error_text == "", "A healthy primary takes precedence over its older backup")
 write(PATH,"interrupted checkpoint {")
 var restored = store.load_save()
 check(not restored.is_empty() and restored.get("gold") == valid.gold and restored.get("rng_state") == valid.rng_state, "An unreadable primary recovers the entire validated checkpoint including RNG")
 check(store.error_text.contains("recuperado") and FileAccess.get_file_as_string(PATH) == "interrupted checkpoint {", "Recovery warns about the lost latest save and leaves the damaged source untouched")
 if not restored.is_empty():
  check(store.save(restored) and FileAccess.get_file_as_string(PATH+".invalid.bak") == "interrupted checkpoint {" and FileAccess.get_file_as_string(PATH+".bak") == previous, "Saving recovered progress preserves both the damaged original and the healthy backup")
 DirAccess.remove_absolute(PATH)
 check(not store.load_save().is_empty() and store.error_text.contains("recuperado"), "A missing primary recovers the previous checkpoint")
 write(PATH,"broken UI checkpoint")
 var recovery_app = load("res://scenes/main.tscn").instantiate()
 root.add_child(recovery_app)
 await process_frame
 check(not recovery_app.saved.is_empty() and labels(recovery_app.modal).contains("recuperado"), "The actual title offers Continue with an explicit recovery notice")
 if not recovery_app.saved.is_empty():
  var resume = button(recovery_app.modal,"CONTINUAR CAMPANHA · ONDA %d"%int(valid.wave))
  check(resume != null,"Recovered campaign exposes the correct wave on its Continue action")
  var warnings = recovery_app.modal.find_children("*","Label",true,false).filter(func(label):return label.text.contains("recuperado"))
  check(warnings.size() == 1 and resume != null and warnings[0].get_global_rect().end.y <= resume.get_global_rect().position.y,"Recovery notice stays above Continue without overlapping its action")
  if resume != null: resume.pressed.emit()
  check(not recovery_app.in_menu and recovery_app.run.gold == valid.gold,"Continue restores the recovered game instead of starting a new campaign")
 recovery_app.qa_mode=true
 recovery_app.sound.shutdown()
 await create_timer(0.15).timeout
 recovery_app.queue_free()
 await process_frame
 write(PATH,'{"version":999}')
 check(store.load_save().is_empty() and store.error_text != "", "Future primary versions cannot silently downgrade to an older backup")
 write(PATH,"invalid primary")
 var bad_backup = valid.duplicate(true)
 bad_backup.gold = -1
 write(PATH+".bak",JSON.stringify(bad_backup))
 check(store.load_save().is_empty() and FileAccess.get_file_as_string(PATH) == "invalid primary", "Invalid gameplay in the backup cannot create a recovered campaign")
 write(PATH,previous)
 DirAccess.remove_absolute(PATH+".bak")
 DirAccess.make_dir_absolute(PATH+".bak")
 check(not store.save(next) and FileAccess.get_file_as_string(PATH) == previous,"Backup destination failure blocks replacement of the only healthy checkpoint")
 clean()
 DirAccess.make_dir_absolute(ProjectSettings.globalize_path(PATH))
 check(not store.save(valid) and store.error_text.contains("salvar") and DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(PATH)), "A failed final rename is reported and leaves its destination untouched")
 clean()
 print("SAVE STORE: %d checks, %d failures" % [checks, failures])
 quit(1 if failures else 0)
