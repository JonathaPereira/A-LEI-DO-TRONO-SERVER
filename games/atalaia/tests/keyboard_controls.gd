extends SceneTree
const Main=preload("res://scenes/main.tscn")
const Keyboard=preload("res://scripts/keyboard_controls.gd")
const SETTINGS="user://keyboard-controls-test.json"
var checks:=0
var failures:=0
func _initialize():run.call_deferred()
func check(ok: bool,message: String):
 checks+=1
 if not ok:failures+=1;push_error(message)
func button(app,text: String):
 for node in app.modal.find_children("*","Button",true,false):
  if node.text==text:return node
 return null
func key(code: int,ctrl: bool=false):
 var event=InputEventKey.new();event.keycode=code;event.ctrl_pressed=ctrl;event.pressed=true;Input.parse_input_event(event)
 await process_frame
 event=InputEventKey.new();event.keycode=code;event.pressed=false;Input.parse_input_event(event)
 await process_frame
func run():
 DirAccess.remove_absolute(SETTINGS)
 var app=Main.instantiate();root.add_child(app);await process_frame
 app.settings_path=SETTINGS
 app.show_settings()
 var controls=button(app,"Teclado")
 check(controls!=null,"Options exposes keyboard remapping in the real game")
 if controls!=null:
  controls.pressed.emit()
  var wave=button(app,"Próxima onda · Espaço")
  check(wave!=null,"Keyboard settings identifies the existing wave shortcut")
  if wave!=null:
   wave.pressed.emit();await key(KEY_J)
   check(button(app,"Próxima onda · J")!=null,"A captured key updates the wave binding shown in the menu")
   button(app,"Voltar às opções").pressed.emit();app.close_settings();app.start_game();app.choose_build("ballista");app.on_pad(0);root.gui_release_focus()
   check(app.wave_button.text.ends_with("J"),"The real wave button advertises the remapped command: "+app.wave_button.text)
   await key(KEY_J)
   check(app.run.phase=="wave" and app.run.wave==1,"The remapped key launches a real wave")
   app.qa_mode=false;app.save_settings();app.qa_mode=true
   var reopened=Main.instantiate();root.add_child(reopened);await process_frame
   reopened.settings_path=SETTINGS;reopened.qa_mode=false;reopened.load_settings();reopened.qa_mode=true;reopened.show_controls()
   check(button(reopened,"Próxima onda · J")!=null,"The chosen keyboard shortcut survives reopening the game with the existing settings")
   var reset=button(reopened,"Restaurar padrões")
   check(reset!=null,"Keyboard preferences can restore their default commands")
   if reset!=null:
    reset.pressed.emit()
    check(button(reopened,"Próxima onda · Espaço")!=null,"Reset restores the original wave key in the real controls menu")
   reopened.sound.shutdown();reopened.queue_free();await process_frame
   app.show_settings();button(app,"Teclado").pressed.emit()
   button(app,"Próxima onda · J").pressed.emit();await key(KEY_P)
   check(button(app,"Próxima onda · P")!=null and button(app,"Pausar / retomar · J")!=null,"Assigning an occupied key swaps both commands without losing pause")
   check(app.paused and app.run.phase=="wave" and app.run.wave==1,"Capturing a key keeps the actual defense paused")
   button(app,"Evoluir torreta · U").pressed.emit();await key(KEY_ENTER)
   check(button(app,"Evoluir torreta · U")!=null and app.capture_note.text.contains("sem modificadores"),"Menu confirmation is reserved and leaves a rejected remapping unchanged")
   await key(KEY_K,true)
   check(button(app,"Evoluir torreta · U")!=null,"System modifier shortcuts cannot replace a command")
   await key(KEY_ESCAPE)
   check(app.modal_kind=="controls" and button(app,"Evoluir torreta · U")!=null,"Escape cancels capture without closing the controls or changing its key")
   button(app,"Velocidade · F").pressed.emit();await key(KEY_1)
   check(button(app,"Velocidade · 1")!=null and button(app,"Balista · F")!=null,"Construction shortcuts participate in key conflict swapping")
   check(app.arsenal_buttons.ballista.get_node("Shortcut").text.ends_with("F"),"The arsenal advertises its remapped construction key")
   await key(KEY_ESCAPE)
   check(app.modal_kind=="settings" and app.paused,"Escape returns to options while preserving the paused defense")
   app.close_settings();root.gui_release_focus();await key(KEY_J)
   check(app.paused,"The swapped pause command pauses the real defense")
   await key(KEY_J)
   check(not app.paused,"The swapped pause command also resumes the real defense")
   await key(KEY_1)
   check(app.speed==2.0,"The remapped speed command changes actual simulation speed")
   app.start_game();root.gui_release_focus();await key(KEY_F)
   check(app.build_type=="ballista" and app.speed==2.0,"The remapped construction command chooses its original tower instead of changing speed")
   app.on_pad(0);await key(KEY_U)
   check(app.run.towers.size()==1 and app.run.towers[0].level==2,"The upgrade command still evolves a real selected tower")
   var was_muted=app.sound.muted;await key(KEY_M)
   check(app.sound.muted!=was_muted,"The sound command still changes the real audio owner")
   app.show_settings();button(app,"Teclado").pressed.emit();button(app,"Restaurar padrões").pressed.emit();button(app,"Voltar às opções").pressed.emit();app.close_settings()
   app.arsenal_buttons.ballista.grab_focus();await key(KEY_SPACE)
   check(app.run.phase=="wave","The wave shortcut works while a construction button retains keyboard focus")
 var preferences=Keyboard.new()
 var healthy=preferences.to_data()
 for bad in [null,{},healthy.merged({"wave":KEY_ENTER},true),healthy.merged({"wave":KEY_U},true),healthy.merged({"wave":1.5},true),healthy.merged({"wave":"J"},true),healthy.merged({"wave":INF},true),healthy.merged({"unknown":KEY_J},true)]:
  check(not preferences.load_data(bad) and preferences.to_data()==healthy,"Invalid keyboard preferences cannot partially replace the usable mapping")
 app.sound.shutdown();app.queue_free();await process_frame;await create_timer(0.15).timeout
 DirAccess.remove_absolute(SETTINGS)
 print("Keyboard controls: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
