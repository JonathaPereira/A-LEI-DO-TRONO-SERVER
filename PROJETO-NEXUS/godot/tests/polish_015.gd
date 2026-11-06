extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Strip = preload("res://scripts/status_strip.gd")
const Receipt = preload("res://scripts/damage_receipt.gd")
var checks := 0
var failures := 0
func _initialize() -> void: call_deferred("run")
func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)
func run() -> void:
	var app = Main.instantiate()
	root.add_child(app)
	await process_frame
	await process_frame
	check(app.voice.player.playback_type == AudioServer.PLAYBACK_TYPE_STREAM,"Web dialogue uses the Godot mixer, including its bus")
	check(app.sound.voices.all(func(v): return v.playback_type == AudioServer.PLAYBACK_TYPE_STREAM),"Every effect layer uses the same tested mixer path")
	var strip = Strip.new()
	root.add_child(strip)
	strip.configure([{"type":"taunt","turns":2}],false,"Vesper")
	check(strip.entries.size()==2 and strip.positive_count==1 and strip.negative_count==1,"Taunt exposes both protection and its bound red penalty")
	check(strip.entries.any(func(e): return e.type=="tauntRisk" and e.turns==2),"Penalty inherits taunt lifetime")
	strip.configure([],false,"Vesper")
	check(strip.entries.is_empty(),"Penalty disappears exactly with the stance")
	var receipt: Dictionary=Receipt.describe_events([{"type":"shieldExpired","amount":70,"shieldAfter":120}])
	check(receipt.shieldAfter==120,"Partial shield expiration preserves the newer layer in the receipt")
	app._show_presentation_settings()
	await process_frame
	var settings=app.presentation_settings
	var effects: CheckButton=settings.find_child("EffectsEnabled",true,false)
	var volume: HSlider=settings.find_child("EffectsVolume",true,false)
	check(effects!=null and volume!=null and settings.find_child("TestEffect",true,false)!=null,"Effects settings and a real sound preview are available from the menu")
	effects.button_pressed=false
	check(not app.sound.enabled and not app.audio_enabled,"Effects switch controls the actual mixer player")
	effects.button_pressed=true
	volume.value=35
	check(app.audio_enabled and app.sound.enabled and is_equal_approx(app.audio_level,.35) and is_equal_approx(app.sound.level,.35),"Effect volume controls both saved preference and real players")
	strip.queue_free()
	app.queue_free()
	await process_frame
	await create_timer(.15).timeout
	print("Balance and Web mixer: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
