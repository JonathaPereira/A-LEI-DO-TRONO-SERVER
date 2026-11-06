extends SceneTree
var app: Node
var frames=0
var prefix=""

func _initialize():call_deferred("begin")
func begin():
 prefix=OS.get_environment("ATALAIA_CAPTURE_PREFIX")
 if prefix=="":prefix=ProjectSettings.globalize_path("user://captures/atalaia")
 DirAccess.make_dir_recursive_absolute(prefix.get_base_dir())
 app=load("res://scenes/main.tscn").instantiate();root.add_child(app)
 app.qa_mode=true
 app.start_showcase()
func _process(_dt):
 if not is_instance_valid(app):return false
 frames+=1
 if frames in [30,320,580]:capture("combat-%03d"%frames)
 if frames==650:
  app.run.phase="cards";app.run.choices=[AtalaiaCatalog.card("power"),AtalaiaCatalog.card("venom"),AtalaiaCatalog.card("splash")];app.show_cards()
 if frames==710:app.choose_card(1)
 if frames==750:capture("cards")
 if frames==800:
  app.sound.shutdown();await create_timer(0.15).timeout;app.queue_free();await process_frame;quit()
 return false
func capture(label: String):
 await process_frame
 await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(prefix+"-"+label+".png")
 print("CAPTURE "+label)
