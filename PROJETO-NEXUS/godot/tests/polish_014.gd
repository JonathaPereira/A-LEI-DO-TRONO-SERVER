extends SceneTree
const Main = preload("res://scenes/main.tscn")
const Client = preload("res://scripts/pvp_client.gd")
const Quality = preload("res://scripts/presentation_quality.gd")
const Signature = preload("res://scripts/hero_signature.gd")
const Art = preload("res://scripts/ability_art.gd")
const Gem = preload("res://scripts/gem_icon.gd")
var checks := 0
var failures := 0

func _initialize() -> void: run.call_deferred()
func check(value: bool, message: String) -> void:
	checks+=1
	if not value:
		failures+=1
		push_error(message)
func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func run() -> void:
	var old := ConfigFile.new()
	old.set_value("server","url",Client.RETIRED_ENDPOINT)
	old.set_value("session","code","ABC123")
	old.set_value("session","token","old-session")
	old.save(Client.STORE)
	var app=Main.instantiate()
	root.add_child(app)
	await settle()
	check(app.pvp_client.endpoint==Client.DEFAULT_ENDPOINT and app.pvp_client.session.is_empty(),"The retired host is migrated and its unrelated session is cleared")
	var saved := ConfigFile.new()
	saved.load(Client.STORE)
	check(saved.get_value("server","url","")==Client.DEFAULT_ENDPOINT,"The corrected endpoint survives the next launch")
	saved.set_value("server","url","ws://127.0.0.1:9123/pvp")
	saved.save(Client.STORE)
	var custom := Client.new()
	root.add_child(custom)
	check(custom.endpoint=="ws://127.0.0.1:9123/pvp","Custom/local test endpoints remain supported")
	custom.queue_free()
	app._open_pvp()
	await settle()
	var lobby=app.pvp_lobby
	check(lobby.hero_buttons.size()==24,"All active heroes remain selectable")
	for hero in app.catalog.heroes:
		var roles: Array=lobby.hero_buttons[hero.id].find_children("HeroRole","Label",true,false)
		check(roles.size()==1 and roles[0].text==hero.role,"The visible roster role belongs to "+hero.name)
		check(Signature.MOTION.has(hero.animation),"The attack signature and anticipation belong to "+hero.name)
		check(app.voice.dialogue.heroes.has(hero.id),"The pt-BR cast includes "+hero.name)
		for event in ["select","skill","ultimate","victory"]:
			var clip=load("res://assets/voices/%s-%s.ogg" % [hero.id,event])
			check(clip is AudioStreamOggVorbis and clip.get_length()>.5 and clip.get_length()<4,"A real bounded prerecorded clip exists: %s/%s" % [hero.id,event])
	var artwork: Array=lobby.details.find_children("Ability_*","TextureRect",true,false)
	check(artwork.size()==3 and artwork.all(func(image):return image.texture!=null),"Each PvP ability has an illustrated banner")
	for picker in lobby.gem_pickers:
		check(picker.item_count==4,"Empty plus three unlimited gems remain available")
		for index in range(3):
			check(picker.get_item_icon(index+1)==Gem.texture_for(lobby.profile.rules.gems[index].id),"The chosen gem and popup share the correct red/blue/green image")
	check(Gem.texture_for("ember")!=Gem.texture_for("pulse") and Gem.texture_for("pulse")!=Gem.texture_for("sap"),"Gem textures are distinct")
	var state_before: Dictionary=app.state.duplicate(true)
	app.voice.set_enabled(true)
	app.voice.subtitles=true
	check(app.voice.speak("vesper","skill",true),"Vesper can speak a real combat line")
	check(app.voice.player.playing and app.voice_caption.visible and app.voice_caption_text.text.contains("Vesper"),"Audio and named subtitles start together")
	check(not app.voice.speak("vesper","skill"),"Repeated clicks cannot spam the same line")
	check(is_equal_approx(AudioServer.get_bus_volume_db(AudioServer.get_bus_index("NexusSFX")),-5),"Effects duck while dialogue is active")
	app.voice.stop_line()
	check(not app.voice.player.playing and not app.voice_caption.visible,"Cancellation stops the line and clears its subtitle")
	check(is_zero_approx(AudioServer.get_bus_volume_db(AudioServer.get_bus_index("NexusSFX"))),"Cancellation restores the SFX mix")
	app.voice.set_enabled(false)
	check(app.voice.speak("saira","skill",true) and not app.voice.player.playing and app.voice_caption.visible,"Muted voices can keep accessible subtitles without playing audio")
	app.voice.stop_line()
	app.voice_enabled=false
	app.voice_level=.35
	app.voice_subtitles=true
	Quality.configure("balanced")
	app._save_preferences()
	app.voice_enabled=true
	app.voice_level=1
	Quality.configure("high")
	app._load_preferences()
	check(not app.voice_enabled and is_equal_approx(app.voice_level,.35) and app.voice_subtitles and Quality.mode=="balanced","Voice, subtitles, volume and rendering settings persist separately")
	for mode in ["light","balanced","high","auto"]:
		Quality.configure(mode)
		check(app.state==state_before,"Rendering and dialogue never mutate combat: "+mode)
	check(Quality.noise_texture()==Quality.noise_texture(),"Noise uses one shared precomputed texture")
	app.voice.set_enabled(true)
	app.voice.speak("astra","ultimate",true)
	app._new_battle()
	check(not app.voice.player.playing and app.voice.current_hero=="","Restart cancels queued speech without leaking audio")
	app.pvp_lobby._back()
	app._enter_free()
	await settle()
	app.voice.speak("vesper","ultimate",true)
	check(not app.voice_caption.visible and app.battle_voice_caption.text.contains("Vesper"),"Battle subtitles have a dedicated lane instead of covering the menu")
	check(app.battle_voice_caption.get_global_rect().end.y<=app.field.get_global_rect().position.y,"The subtitle lane stays above the arena and its controls")
	app.queue_free()
	await settle()
	await create_timer(.15).timeout
	print("PvP, voice cast and rendering budgets: %d checks, %d failures." % [checks,failures])
	quit(1 if failures else 0)
