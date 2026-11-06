extends Node
## Original, prerecorded synthetic pt-BR cast. No browser speech service or model at runtime.
signal caption_changed(hero_id: String, text: String)
signal line_finished
const BUS := "NexusVoice"
const SFX_BUS := "NexusSFX"
var dialogue: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/voice-lines.json"))
var player: AudioStreamPlayer
var cache: Dictionary = {}
var enabled := true
var subtitles := true
var level := .75
var last_key := ""
var last_at := -10000
var current_hero := ""
var current_event := ""
var caption_timer: Timer

func _ready() -> void:
	if AudioServer.get_bus_index(BUS)<0:
		AudioServer.add_bus()
		AudioServer.set_bus_name(AudioServer.bus_count-1,BUS)
		AudioServer.set_bus_send(AudioServer.bus_count-1,"Master")
	player=AudioStreamPlayer.new()
	player.playback_type=AudioServer.PLAYBACK_TYPE_STREAM
	player.bus=BUS
	add_child(player)
	player.finished.connect(stop_line)
	caption_timer=Timer.new()
	caption_timer.one_shot=true
	caption_timer.timeout.connect(stop_line)
	add_child(caption_timer)
	set_level(level)

func prepare(hero_id: String) -> void:
	if not dialogue.heroes.has(hero_id): return
	for event in dialogue.heroes[hero_id].lines:
		var key: String = hero_id+"-"+str(event)
		if not cache.has(key): cache[key]=load("res://assets/voices/%s.ogg" % key)

func set_level(value: float) -> void:
	level=clampf(value,0,1)
	if is_instance_valid(player): player.volume_db=linear_to_db(maxf(.0001,level))
	if level==0: stop_line()

func set_enabled(value: bool) -> void:
	enabled=value
	if not enabled: stop_line()

func speak(hero_id: String, event: String, force := false) -> bool:
	if ((not enabled or level<=0) and not subtitles) or not dialogue.heroes.has(hero_id): return false
	var lines: Dictionary=dialogue.heroes[hero_id].lines
	if not lines.has(event): return false
	var now := Time.get_ticks_msec()
	var key: String = hero_id+"-"+str(event)
	if not force and (key==last_key and now-last_at<3500 or event=="select" and now-last_at<850): return false
	# An important line may replace a selection; selections never interrupt a combat call.
	if not force and player.playing and event=="select" and current_event!="select": return false
	stop_line()
	prepare(hero_id)
	player.stream=cache[key]
	if enabled and level>0: player.play()
	else: caption_timer.start(player.stream.get_length())
	last_key=key
	last_at=now
	current_hero=hero_id
	current_event=event
	var sfx := AudioServer.get_bus_index(SFX_BUS)
	if sfx>=0 and player.playing: AudioServer.set_bus_volume_db(sfx,-5.0)
	if subtitles: caption_changed.emit(hero_id,str(lines[event]))
	return true

func stop_line() -> void:
	if is_instance_valid(player): player.stop()
	if is_instance_valid(caption_timer): caption_timer.stop()
	var sfx := AudioServer.get_bus_index(SFX_BUS)
	if sfx>=0: AudioServer.set_bus_volume_db(sfx,0.0)
	current_hero=""
	current_event=""
	line_finished.emit()

func _exit_tree() -> void: stop_line()
