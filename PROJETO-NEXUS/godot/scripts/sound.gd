extends AudioStreamPlayer
## Bounded polyphony: charge, body, element and tail can overlap without cutting one another.
const NAMES := ["slash","heavy","projectile","fire","shadow","heal","shield_gain","shield_hit","critical","dot"]
const BANK_NAMES := ["slash","heavy","projectile","fire","water","nature","arcane","shadow","heal","shield_gain","shield_hit","shield_break","critical","dot","charge","area","ui"]
const BUS := "NexusSFX"
const VOICES := 8
var enabled := true:
	set(next):
		enabled = next
		if not next: stop_all()
var cues: Array[AudioStreamWAV] = []
var bank: Dictionary = {}
var voices: Array[AudioStreamPlayer] = []
var sequence := 0
var variations: Dictionary = {}
var level := .8
var played_events: Array = []
var mix_headroom_db := -10.0 if OS.has_feature("web") else -6.0

func _ready() -> void:
	if AudioServer.get_bus_index(BUS) < 0:
		AudioServer.add_bus()
		var index := AudioServer.bus_count-1
		AudioServer.set_bus_name(index,BUS)
		AudioServer.set_bus_send(index,"Master")
		# The single-thread Web mixer needs headroom without this native DSP effect.
		if not OS.has_feature("web"):
			var limiter := AudioEffectHardLimiter.new()
			limiter.ceiling_db = -1.2
			AudioServer.add_bus_effect(index,limiter)
	for key in BANK_NAMES:
		bank[key] = [load("res://assets/audio/%s-0.wav" % key),load("res://assets/audio/%s-1.wav" % key)]
	for key in NAMES: cues.append(bank[key][0])
	for index in range(VOICES):
		var voice := AudioStreamPlayer.new()
		# Route through Godot's mixer: Web sample playback bypasses bus effects.
		voice.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
		voice.bus = BUS
		add_child(voice)
		voices.append(voice)

func stop_all() -> void:
	stop()
	for voice in voices:
		if is_instance_valid(voice): voice.stop()

func set_mix_level(value: float) -> void:
	level = clampf(value,0,1)
	if level == 0: stop_all()
	else:
		for voice in voices: voice.volume_db = linear_to_db(level)+mix_headroom_db+float(voice.get_meta("layer_gain",0.0))

func play_layer(key: String, gain_db := 0.0, pitch := 1.0) -> void:
	if not enabled or level <= 0 or not bank.has(key) or voices.is_empty(): return
	var voice: AudioStreamPlayer = voices[sequence % VOICES]
	for candidate in voices:
		if not candidate.playing:
			voice = candidate
			break
	var variant: int = int(variations.get(key,0))
	variations[key] = variant+1
	voice.stream = bank[key][variant%2]
	voice.set_meta("layer_gain",gain_db)
	voice.volume_db = linear_to_db(level)+mix_headroom_db+gain_db
	voice.pitch_scale = pitch * [1.0,.975,1.025,1.012][variant%4]
	voice.play()
	sequence += 1
	played_events.append({"key":key,"voice":voices.find(voice),"gainDb":voice.volume_db})
	if played_events.size() > 64: played_events.pop_front()

func play_cue(index: int) -> void:
	play_layer(NAMES[posmod(index,NAMES.size())])

func begin_action(hero: Dictionary, action: Dictionary, tier: String) -> void:
	if tier == "basic":
		play_layer("charge",-13,.95 if hero.role == "Tanque" else 1.12)
	else:
		play_layer("charge",-7 if tier == "ultimate" else -10,.86 if tier == "ultimate" else 1.0)

func strike(hero: Dictionary, action: Dictionary, events: Array, tier: String) -> void:
	var damaging: bool = events.any(func(e): return e.type == "damage" and not e.get("reaction",false))
	if not damaging:
		play_layer("heal" if action.kind.begins_with("heal") else "shield_gain" if action.kind.begins_with("shield") or action.kind == "guard" else "arcane",-3)
		return
	var signature: String = hero.get("animation","")
	var body := "heavy" if hero.weapon in ["hammer","gauntlet"] else "projectile" if hero.weapon in ["gun","bow"] else "slash"
	play_layer(body,-2 if tier == "basic" else 0)
	if tier != "basic" or hero.weapon in ["orb","staff"]:
		var element: String = "water" if signature == "runes" else {"igneo":"fire","natural":"nature","tecnico":"arcane","arcano":"arcane","sombrio":"shadow"}.get(hero.classId,"arcane")
		play_layer(element,-5)
	if action.kind == "aoe": play_layer("area",-8)
	if events.any(func(e): return e.get("absorbed",0) > 0):
		play_layer("shield_break" if events.any(func(e): return e.get("absorbed",0) > 0 and e.get("shieldAfter",1) == 0) else "shield_hit",-6)
	if events.any(func(e): return e.get("critical",false)): play_layer("critical",-6)
