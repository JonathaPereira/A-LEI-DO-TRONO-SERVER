extends AcceptDialog
const Quality = preload("res://scripts/presentation_quality.gd")
var app

func _ready() -> void:
	title="Áudio e vídeo"
	min_size=Vector2i(440,410)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size=Vector2(410,300)
	scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus=true
	add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation",12)
	scroll.add_child(column)
	column.add_child(app._label("DUBLAGEM EM PORTUGUÊS",15,app.ACCENT))
	var enabled := CheckButton.new()
	enabled.text="Vozes dos heróis"
	enabled.button_pressed=app.voice_enabled
	enabled.toggled.connect(func(value):
		app.voice_enabled=value
		app.voice.set_enabled(value)
		app._save_preferences())
	column.add_child(enabled)
	var captions := CheckButton.new()
	captions.text="Legendas das falas"
	captions.button_pressed=app.voice_subtitles
	captions.toggled.connect(func(value):
		app.voice_subtitles=value
		app.voice.subtitles=value
		if not value:
			app.voice_caption.hide()
			app.battle_voice_caption.text=""
		app._save_preferences())
	column.add_child(captions)
	column.add_child(app._label("Volume das vozes",13,app.MUTED))
	var volume := HSlider.new()
	volume.accessibility_name="Volume das vozes dos heróis"
	volume.min_value=0
	volume.max_value=100
	volume.step=5
	volume.value=app.voice_level*100
	volume.value_changed.connect(func(value):
		app.voice_level=value/100.0
		app.voice.set_level(app.voice_level)
		app._save_preferences())
	column.add_child(volume)
	column.add_child(app._button("Ouvir Vesper",func():app.voice.speak("vesper","select",true)))
	column.add_child(app._label("Vozes sintéticas originais para este protótipo.",12,app.MUTED))
	column.add_child(HSeparator.new())
	column.add_child(app._label("EFEITOS E DESEMPENHO",15,app.ACCENT))
	var effects := CheckButton.new()
	effects.name="EffectsEnabled"
	effects.text="Efeitos sonoros"
	effects.button_pressed=app.audio_enabled
	effects.toggled.connect(func(value):
		app.audio_enabled=value
		app.sound.enabled=value
		app.sound_button.text="Efeitos: ligados" if value else "Efeitos: desligados"
		app._save_preferences())
	column.add_child(effects)
	column.add_child(app._label("Volume dos efeitos",13,app.MUTED))
	var effects_volume := HSlider.new()
	effects_volume.name="EffectsVolume"
	effects_volume.accessibility_name="Volume dos efeitos sonoros"
	effects_volume.min_value=0
	effects_volume.max_value=100
	effects_volume.step=5
	effects_volume.value=app.audio_level*100
	effects_volume.value_changed.connect(func(value):
		app.audio_level=value/100.0
		app.sound.set_mix_level(app.audio_level)
		app._save_preferences())
	column.add_child(effects_volume)
	var test_effect: Button=app._button("Ouvir golpe",func():app.sound.play_layer("heavy"))
	test_effect.name="TestEffect"
	column.add_child(test_effect)
	var graphics := OptionButton.new()
	graphics.accessibility_name="Qualidade dos efeitos gráficos"
	for value in ["Automático · recomendado","Alta","Equilibrada","Leve"]: graphics.add_item(value)
	var modes := ["auto","high","balanced","light"]
	graphics.select(modes.find(Quality.mode))
	graphics.item_selected.connect(func(index):
		Quality.configure(modes[index])
		app._save_preferences())
	column.add_child(graphics)
	var reduced := CheckButton.new()
	reduced.text="Reduzir movimentos e flashes"
	reduced.button_pressed=app.reduced_motion
	reduced.toggled.connect(app._set_reduced)
	column.add_child(reduced)
	var explanation: Label=app._label("Automático ajusta os efeitos quando necessário. As animações, as regras e o ritmo dos turnos são preservados.",12,app.MUTED)
	explanation.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	explanation.custom_minimum_size.x=400
	column.add_child(explanation)
