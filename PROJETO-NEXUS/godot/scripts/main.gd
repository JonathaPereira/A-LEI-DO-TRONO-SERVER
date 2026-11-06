extends Control
const Combat = preload("res://scripts/combat.gd")
const Fighter = preload("res://scripts/fighter.gd")
const CombatUI = preload("res://scripts/combat_ui.gd")
const Director = preload("res://scripts/animation_director.gd")
const Showcase = preload("res://scripts/showcase.gd")
const Campaign = preload("res://scripts/campaign.gd")
const PvpClient = preload("res://scripts/pvp_client.gd")
const PvpLobby = preload("res://scripts/pvp_lobby.gd")
const Hub = preload("res://scripts/hub.gd")
const UITheme = preload("res://scripts/ui_theme.gd")
const RulesText = preload("res://scripts/rules_text.gd")
const Voice = preload("res://scripts/hero_voice.gd")
const Quality = preload("res://scripts/presentation_quality.gd")
const PresentationSettings = preload("res://scripts/presentation_settings.gd")
const ACCENT := UITheme.ACCENT
const GOLD := ACCENT # Legacy view API; the visual accent is now cyan.
const MUTED := UITheme.MUTED
const ACTIONS := ["basic", "skill", "ultimate", "guard"]
var combat = Combat.new()
var catalog = combat.catalog
var state: Dictionary = {}
var teams: Array = []
var mode := "training"
var difficulty := "normal"
var selected_action := "basic"
var target_id := ""
var started := false
var busy := false
var ai_pending := false
var auto_play := false
var ai_request := 0
var auto_button: CheckButton
var spatial_combat := false # Archived 3D study; normal play uses the illustrated stage.
var battle_version := 0
var result_shown := false
var reduced_motion := false
var field: Control
var effects: Control
var fighters: Dictionary = {}
var left_team_label: Label
var right_team_label: Label
var pvp_clock := 0.0
var log_button: Button
var phase_label: Label
var round_label: Label
var initiative: Label
var active_label: Label
var description: Label
var log_view: RichTextLabel
var action_buttons: Dictionary = {}
var target_buttons: HBoxContainer
var execute_button: Button
var start_button: Button
var roster_button: Button
var mode_picker: OptionButton
var difficulty_picker: OptionButton
var audio_enabled := true
var audio_level := .8
var sound_button: Button
var sound
var voice
var voice_enabled := true
var voice_subtitles := true
var voice_level := .75
var voice_caption: PanelContainer
var voice_caption_text: Label
var battle_voice_caption: Label
var presentation_settings: AcceptDialog
var presentation_quality
var restart_button: Button
var controls_note: Label
var restart_dialog: ConfirmationDialog
var result_dialog: AcceptDialog
var roster_dialog: AcceptDialog
var hero_grid: GridContainer
var roster_filter: OptionButton
var roster_side: OptionButton
var roster_count: Label
var hero_detail: Label
var roster_work: Array = []
var director = Director.new()
var showcase
var timeline: HBoxContainer
var backdrop: Control
var log_dialog: AcceptDialog
var active_portrait: TextureRect
var active_class: Label
var active_numbers: Label
var active_health: Control
var active_energy: Control
var active_energy_label: Label
var step_label: Label
var active_shield: Control
var active_shield_label: Label
var feedback: RichTextLabel
var screen_button: Button
var display_mode := "windowed"
var display_resolution := Vector2i(1280, 720)
var windowed_resolution := Vector2i(1280, 720)
var inspected_hero := ""
var roster_front_picker: OptionButton
var feedback_panel: PanelContainer
var preview_requested := true
var tutorial_index := -1
var tutorial_progress: Dictionary = {}
var free_settings: Dictionary = {}
var lab
var campaign
var hub: Control
var combat_view: Control
var pvp_client
var pvp_lobby
var pvp_active := false
var pvp_queue: Array = []
var pvp_draining := false
var pvp_drain_id := 0
var pvp_seq := -1
var campaign_mission := -1
var roster_campaign := false
var mission_label: Label
var objective_label: Label
var menu_dialog: ConfirmationDialog
var vesper_atelier: Control
const Lessons = preload("res://scripts/lessons.gd")
const Lab = preload("res://scripts/lab.gd")

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	teams = catalog.default_teams.duplicate(true)
	_load_preferences()
	_build_theme()
	_build_interface()
	_build_presentation()
	campaign = Campaign.new(catalog)
	Campaign.register_enemies(catalog)
	_new_battle()
	hub = Hub.new()
	hub.app = self
	add_child(hub)
	hub.open()
	pvp_client=PvpClient.new()
	add_child(pvp_client)
	pvp_client.received.connect(_pvp_packet)
	pvp_client.connection_changed.connect(func():
		if pvp_active and not busy: _refresh())
	if OS.has_feature("web") and JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('pvp') === '1'",true):_open_pvp.call_deferred()
	pvp_client.failed.connect(func(message):
		if pvp_active:
			phase_label.text=message
			if not busy: _refresh())
	if DisplayServer.get_name() != "headless": _apply_display.call_deferred()

func _style(color: Color, border: Color = Color("37353f")) -> StyleBoxFlat:
	return UITheme.panel(color, border)

func _build_theme() -> void:
	theme = UITheme.build()

func _label(text_value: String, font_size := 15, color := Color("eff4ff")) -> Label:
	var label := Label.new()
	label.text = text_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label

func _button(text_value: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text_value
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(callback)
	return button

func _clear(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _build_interface() -> void:
	CombatUI.build(self)

func _build_presentation() -> void:
	presentation_quality=Quality.new()
	presentation_quality.app=self
	add_child(presentation_quality)
	Quality.noise_texture()
	voice=Voice.new()
	add_child(voice)
	voice.enabled=voice_enabled
	voice.subtitles=voice_subtitles
	voice.set_level(voice_level)
	var layer := CanvasLayer.new()
	layer.layer=12
	add_child(layer)
	voice_caption=PanelContainer.new()
	voice_caption.name="HeroVoiceSubtitle"
	voice_caption.set_anchors_and_offsets_preset(PRESET_CENTER_TOP)
	voice_caption.position=Vector2(-240,9)
	voice_caption.custom_minimum_size=Vector2(480,44)
	voice_caption.mouse_filter=MOUSE_FILTER_IGNORE
	voice_caption.add_theme_stylebox_override("panel",_style(Color("07121def"),Color("4a8aab")))
	layer.add_child(voice_caption)
	voice_caption_text=_label("",14)
	voice_caption_text.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	voice_caption_text.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	voice_caption_text.mouse_filter=MOUSE_FILTER_IGNORE
	voice_caption.add_child(voice_caption_text)
	voice_caption.hide()
	voice.caption_changed.connect(func(id,text):
		var line := "%s: %s" % [catalog.hero_by_id[id].name,text]
		if combat_view.is_visible_in_tree():
			voice_caption.hide()
			battle_voice_caption.text=line
		else:
			voice_caption_text.text=line
			voice_caption.show())
	voice.line_finished.connect(func():
		if is_instance_valid(voice_caption): voice_caption.hide()
		if is_instance_valid(battle_voice_caption): battle_voice_caption.text="")
	presentation_settings=PresentationSettings.new()
	presentation_settings.app=self
	add_child(presentation_settings)

func _show_presentation_settings() -> void:
	presentation_settings.popup_centered(Vector2i(470,mini(540,int(get_viewport_rect().size.y)-60)))

func _open_vesper() -> void:
	if pvp_active:return
	if is_instance_valid(vesper_atelier): return
	hub.hide()
	combat_view.hide()
	vesper_atelier = load("res://scenes/vesper/atelier.tscn").instantiate()
	add_child(vesper_atelier)
	vesper_atelier.return_requested.connect(func():
		vesper_atelier.queue_free()
		vesper_atelier = null
		hub.open("menu"))

func _enter_free() -> void:
	if pvp_active:return
	campaign_mission = -1
	hub.hide()
	combat_view.show()
	_new_battle()

func _begin_mission(index: int) -> void:
	if not hub.visible or not campaign.can_play(index): return
	campaign_mission = index
	hub.hide()
	combat_view.show()
	_new_battle()

func _open_menu() -> void:
	if pvp_active:
		if not is_instance_valid(menu_dialog):
			menu_dialog=ConfirmationDialog.new()
			add_child(menu_dialog)
			menu_dialog.confirmed.connect(func():
				if pvp_active:
					pvp_client.leave()
					_end_pvp()
					_open_pvp()
				else: _leave_battle())
		menu_dialog.title="Sair da partida PvP?"
		menu_dialog.dialog_text="Sair durante o combate conta como desistência. Sua campanha e a formação PvP serão preservadas."
		menu_dialog.ok_button_text="Sair do PvP"
		menu_dialog.cancel_button_text="Continuar partida"
		menu_dialog.popup_centered()
		return
	if started and state.phase == "playing":
		if not is_instance_valid(menu_dialog):
			menu_dialog = ConfirmationDialog.new()
			menu_dialog.title = "Voltar ao menu?"
			menu_dialog.dialog_text = "A batalha em andamento será encerrada.\nMissões concluídas, equipe e gemas salvas serão preservadas."
			menu_dialog.ok_button_text = "Voltar ao menu"
			menu_dialog.cancel_button_text = "Continuar batalha"
			menu_dialog.confirmed.connect(func():
				if pvp_active:
					pvp_client.leave()
					_end_pvp()
					_open_pvp()
				else: _leave_battle("menu"))
			add_child(menu_dialog)
		menu_dialog.title="Voltar ao menu?"
		menu_dialog.dialog_text="A batalha em andamento será encerrada.\nMissões concluídas, equipe e gemas salvas serão preservadas."
		menu_dialog.ok_button_text="Voltar ao menu"
		menu_dialog.cancel_button_text="Continuar batalha"
		menu_dialog.popup_centered()
	else: _leave_battle("menu")

func _leave_battle(page: String = "menu") -> void:
	if pvp_active:
		pvp_client.leave()
		_end_pvp()
	battle_version += 1
	ai_request += 1
	director.cancel()
	backdrop.cancel()
	sound.stop_all()
	if is_instance_valid(voice): voice.stop_line()
	started = false
	busy = false
	ai_pending = false
	if tutorial_index >= 0: _end_lesson()
	campaign_mission = -1
	result_dialog.hide()
	hub.open(page)

func _result_confirmed() -> void:
	if pvp_active:
		pvp_client.send({"type":"rematch"})
		_end_pvp()
		_open_pvp()
		return
	if campaign_mission >= 0 and state.winner == 0:
		hub.selected_chapter = campaign.next_chapter()
		_leave_battle("story")
	else: _new_battle()

func _new_battle() -> void:
	if pvp_active:return
	battle_version += 1
	ai_request += 1
	director.cancel()
	backdrop.cancel()
	if is_instance_valid(sound): sound.stop_all()
	if is_instance_valid(voice): voice.stop_line()
	started = false
	busy = false
	ai_pending = false
	result_shown = false
	selected_action = "basic"
	preview_requested = true
	target_id = ""
	if is_instance_valid(feedback): feedback.text = "[center][color=#67e8f9]LEITURA DO COMBATE[/color]  ·  Dano à vida e ao escudo aparecem separados.[/center]"
	state = campaign.battle(combat, campaign_mission) if campaign_mission >= 0 else combat.new_battle(teams[0], teams[1], difficulty if mode == "training" else "normal")
	_rebuild_fighters()

func _rebuild_fighters() -> void:
	backdrop.encounter_kind = maxi(0, campaign_mission)
	if tutorial_index >= 0:
		tutorial_progress = {}
		Lessons.prepare(state, tutorial_index)
	backdrop.configure(state.units, catalog)
	for fighter in fighters.values():
		field.remove_child(fighter)
		fighter.queue_free()
	fighters.clear()
	_clear(effects)
	for data in state.units:
		var hero: Dictionary = catalog.hero_by_id[data.heroId]
		voice.prepare(hero.id)
		Fighter.prepare_poses(str(hero.get("visualHero",hero.id)))
		var fighter = Fighter.new()
		fighter.setup(hero, data.id, catalog.affinity_color(hero.classId))
		if spatial_combat: fighter.use_spatial_presentation()
		fighter.targeted.connect(_select_target)
		field.add_child(fighter)
		fighters[data.id] = fighter
	_position_fighters.call_deferred()
	_refresh()

func _position_fighters() -> void:
	if not is_instance_valid(field): return
	if not spatial_combat:
		_position_illustrated()
		return
	for index in range(state.get("units", []).size()):
		var data: Dictionary = state.units[index]
		var fighter = fighters.get(data.id)
		if is_instance_valid(fighter):
			var slot: int = data.slot
			var foot: Vector2 = backdrop.ground_position(data.id)
			var head: Vector2 = backdrop.head_position(data.id)
			fighter.set_spatial_anchor(foot, head)
			fighter.set_formation(slot)
			fighter.position_label.hide()
			fighter.z_index = 10 + slot
			fighter.plate.scale = Vector2.ONE * 0.86
			var panel_size: Vector2 = fighter.plate.size * fighter.plate.scale
			# Stable side columns keep six independent resource meters readable while
			# models advance, cast and return. Body hit areas still follow the camera.
			var row: int = [1, 0, 2][slot]
			var stack_height := panel_size.y * 3 + 16
			var panel_at := Vector2(14 if data.side == 0 else field.size.x - panel_size.x - 14, maxf(8, (field.size.y - stack_height) * 0.5) + row * (panel_size.y + 8))
			fighter.plate.position = panel_at - fighter.position

func _process(_delta: float) -> void:
	if pvp_active and state.get("phase")=="playing":
		pvp_clock+=_delta
		if pvp_clock>=.2:
			pvp_clock=0
			var remaining := maxi(0,int(ceil((pvp_client.turn_until-Time.get_ticks_msec())/1000.0)))
			mission_label.text="PvP · SALA %s\nVOCÊ: EQUIPE %d · %ds" % [pvp_client.room.get("code",""),int(pvp_client.own_player().get("side",0))+1,remaining]
	if spatial_combat and is_instance_valid(combat_view) and combat_view.visible and not fighters.is_empty():
		_position_fighters()

func _human_turn() -> bool:
	if pvp_active: return pvp_client.available() and not pvp_client.pending_action and int(combat.current(state).get("side",-1))==int(pvp_client.own_player().get("side",-2))
	if auto_play and combat.current(state).get("side", 1) == 0: return false
	return (campaign_mission < 0 and mode == "local") or combat.current(state).get("side", 1) == 0

func _position_illustrated() -> void:
	# Keep resources in stable side columns and the painted bodies in the arena.
	for data in state.get("units", []):
		var fighter = fighters.get(data.id)
		if not is_instance_valid(fighter): continue
		var slot: int = data.slot
		var x: float = [0.39, 0.25, 0.25][slot]
		if data.side == 1: x = 1.0 - x
		var foot := Vector2(field.size.x*x, field.size.y*[0.73,0.46,0.96][slot])
		foot.y = maxf(186, foot.y)
		fighter.position = foot - Vector2(93,257)
		fighter.set_depth([0.96,0.79,0.92][slot])
		fighter.set_formation(slot)
		fighter.position_label.hide()
		fighter.z_index = [12,11,13][slot]
		fighter.plate.scale = Vector2.ONE * 0.86
		var dimensions: Vector2 = fighter.plate.size * fighter.plate.scale
		var row: int = [1,0,2][slot]
		fighter.plate.position = Vector2(12 if data.side == 0 else field.size.x-dimensions.x-12, maxf(6,(field.size.y-(dimensions.y*3+16))*.5)+row*(dimensions.y+8)) - fighter.position

func _set_presentation(spatial: bool) -> void:
	# Retained for the 3D study and its tests; it is absent from primary navigation.
	spatial_combat = spatial
	backdrop.cancel()
	field.remove_child(backdrop)
	backdrop.queue_free()
	backdrop = load("res://scripts/battle_stage_3d.gd" if spatial else "res://scripts/arena_backdrop.gd").new()
	field.add_child(backdrop)
	field.move_child(backdrop, 0)
	_new_battle()

func _can_act() -> bool:
	return combat_view.visible and started and not busy and state.phase == "playing" and _human_turn()

func _refresh() -> void:
	CombatUI.refresh(self)
	_update_log()
	if state.phase == "finished" and not result_shown:
		result_shown = true
		if state.winner!=null:
			var survivors: Array=state.units.filter(func(u):return u.side==state.winner and u.hp>0)
			if not survivors.is_empty(): voice.speak(survivors[0].heroId,"victory",true)
		if tutorial_index < 0 and campaign_mission < 0 and not pvp_active: Lab.record(state, mode, difficulty)
		var damage := 0
		var healing := 0
		for data in state.units:
			if data.side == state.winner:
				damage += int(data.stats.damage)
				healing += int(data.stats.healing)
		result_dialog.dialog_text = "Equipe %d venceu!\n\n%d rodadas · %d ações\nDano da equipe vencedora: %d\nCura: %d\n\nJogue novamente ou feche para consultar o resultado." % [int(state.winner if state.winner!=null else -1) + 1, state.round, state.turns, damage, healing]
		if tutorial_index >= 0:
			result_dialog.dialog_text += "\n\n" + Lessons.hint(tutorial_index, tutorial_progress)
		result_dialog.ok_button_text = "Jogar novamente"
		if campaign_mission >= 0:
			var mission: Dictionary = campaign.missions[campaign_mission]
			result_dialog.ok_button_text = "Voltar às missões" if state.winner == 0 else "Tentar novamente"
			result_dialog.dialog_text = ("VITÓRIA · " if state.winner == 0 else "DERROTA · ") + mission.name + "\n\n"
			if state.winner == 0:
				var reward: Dictionary = campaign.claim_victory(state)
				result_dialog.dialog_text += mission.ending + "\n\n"
				if reward.has("error"): result_dialog.dialog_text += reward.error
				else:
					result_dialog.dialog_text += ("Primeira vitória: +1 " + reward.gem + "\n" if reward.get("first", false) else "Nova vitória nesta missão: ") + "+%d fragmentos para a oficina." % reward.materials
					result_dialog.dialog_text += "\n+%d EXP de equipe · Nível %d" % [reward.teamExperience,reward.levelAfter]
					var mastery_awards: PackedStringArray = []
					for hero_id in reward.mastery:
						mastery_awards.append("%s +%d" % [catalog.hero_by_id[hero_id].name,reward.mastery[hero_id]] if reward.mastery[hero_id] > 0 else catalog.hero_by_id[hero_id].name+" (máxima)")
					result_dialog.dialog_text += "\nMaestria: " + ", ".join(mastery_awards)
					if not reward.get("saved", false): result_dialog.dialog_text += "\n\nATENÇÃO: " + campaign.error_text
			else:
				result_dialog.dialog_text += "Seu progresso e suas gemas foram preservados. Ajuste o trio ou os engastes no menu e tente de novo.\n\n" + mission.tip
			result_dialog.dialog_text += "\n\n" + Campaign.Objectives.result_text(state)
			var objective_result: Dictionary = state.get("missionResult",{})
			var boundary: bool = objective_result.get("reason") in ["deadline","survived"]
			result_dialog.dialog_text += "\n\n%d %s · %d ações" % [objective_result.get("completedRounds",state.round),"rodadas completas" if boundary else "rodadas",state.turns]
		if pvp_active:
			var own_side: int=int(pvp_client.own_player().get("side",-1))
			var outcome := "VITÓRIA" if state.winner==own_side else "EMPATE" if state.winner==null else "DERROTA"
			var reason: String=str(pvp_client.room.get("reason","combat"))
			var reason_label: String={"combat":"Combate concluído","surrender":"Desistência","disconnect":"Desconexão","timeout":"Tempo esgotado"}.get(reason,reason)
			result_dialog.dialog_text="%s · PvP\n%s\n\n%d rodadas · %d ações\nRegistro PvP: %s\n\nOs registros do PvP ficam separados da campanha e das simulações." % [outcome,reason_label,state.round,state.turns,str(pvp_client.room.get("matchId",""))]
			result_dialog.ok_button_text="Voltar à preparação PvP"
		result_dialog.popup_centered()

func _start() -> void:
	if not combat_view.visible: return
	started = true
	_refresh()
	_schedule_ai()

func _select_action(id: String) -> void:
	if not _can_inspect() or not id in ACTIONS: return
	selected_action = id
	preview_requested = true
	_refresh()

func _select_target(id: String) -> void:
	if not _can_act(): return
	var legal := combat.legal_targets(state, combat.current(state), combat.get_action(combat.current(state), selected_action))
	if not legal.any(func(u): return u.id == id): return
	target_id = id
	preview_requested = true
	_refresh()

func _execute() -> void:
	if _can_act(): _play_turn(selected_action, target_id)

func _play_turn(action_id: String, target: String) -> void:
	if pvp_active:
		if _can_act():
			pvp_client.act(action_id,target)
			_refresh()
		return
	if busy or not started or state.phase != "playing": return
	# Compute separately: the displayed actor stays stable until the strike lands.
	var pending := state.duplicate(true)
	var result: Dictionary = campaign.act(combat,pending,action_id,target) if campaign_mission >= 0 else combat.act(pending, action_id, target)
	if result.has("error"):
		description.text = result.error
		return
	await _present_turn(action_id,target,pending,result)

func _present_turn(action_id: String, target: String, pending: Dictionary, result: Dictionary) -> void:
	var version := battle_version
	var actor := combat.current(state)
	var hero: Dictionary = catalog.hero_by_id[actor.heroId]
	var action := combat.get_action(actor,action_id)
	busy = true
	voice.prepare(hero.id)
	if action_id in ["skill","ultimate"]: voice.speak(hero.id,action_id)
	selected_action = action_id
	target_id = target
	preview_requested = false
	CombatUI.refresh(self)
	CombatUI.lock_action(self, hero, action)
	var hit := func():
		if version != battle_version: return
		sound.strike(hero, action, result.events, action_id)
		for data in result.impactUnits:
			fighters[data.id].refresh(data, data.id == actor.id, false, false)
		backdrop.sync_units(result.impactUnits)
		CombatUI.update_actor_stats(self, result.impactUnits.filter(func(u): return u.id == actor.id)[0])
		CombatUI.show_report(self, result.events, action.name)
	var completed: bool
	if spatial_combat:
		completed = await director.play_spatial(self, backdrop, effects, fighters, hero, action, result, reduced_motion, hit)
	else:
		completed = await director.play(self, effects, fighters, hero, action, result, reduced_motion, hit)
	if version != battle_version or not completed: return
	if not result.turnEvents.is_empty():
		var ticks_done: bool = await director.play_ticks(self, effects, fighters, result.turnEvents, reduced_motion, func(event):
			if version != battle_version: return
			var fighter = fighters[event.target]
			for member in fighters.values(): member.refresh(member.display_data, member == fighter, false, false)
			fighter.apply_tick(event)
			backdrop.sync_units(fighters.values().map(func(member): return member.display_data))
			var tick_hero: Dictionary = catalog.hero_by_id[combat.unit(pending, event.target).heroId]
			phase_label.text = "%s · efeitos de turno" % tick_hero.name
			active_label.text = tick_hero.name
			active_class.text = "%s\n%s" % [catalog.class_by_id[tick_hero.classId].name, tick_hero.role]
			active_class.add_theme_color_override("font_color", catalog.affinity_color(tick_hero.classId))
			active_portrait.texture = Fighter.portrait(int(tick_hero.index))
			var tick_stats: Dictionary = combat.unit(pending, event.target).duplicate(true)
			tick_stats.hp = event.hpAfter
			tick_stats.shield = event.shieldAfter
			CombatUI.update_actor_stats(self, tick_stats)
			step_label.text = "Resolvendo efeitos antes da próxima ação."
			sound.play_cue(9 if event.type in ["burn", "bleed", "darkmark", "fracture"] else 5)
			CombatUI.show_report(self, [event], "INÍCIO DO TURNO"))
		if version != battle_version or not ticks_done: return
	if tutorial_index >= 0: Lessons.observe(tutorial_progress, result, actor.side)
	state = pending
	busy = false
	selected_action = "basic"
	_refresh()
	_schedule_ai()

func _can_inspect() -> bool:
	return combat_view.visible and not busy and (not started or (state.phase == "playing" and _human_turn()))

func _set_reduced(enabled: bool) -> void:
	reduced_motion = enabled
	_save_preferences()
	backdrop.motion_enabled = not enabled
	for fighter in fighters.values(): fighter.motion_enabled = not enabled
	# A preference change must not repaint pre-impact health over a live strike.
	if not busy: _refresh()

func _schedule_ai() -> void:
	if ai_pending or busy or not started or not combat_view.visible or state.phase != "playing" or not _wants_ai(): return
	ai_pending = true
	var version := battle_version
	var request := ai_request
	await get_tree().create_timer(0.45).timeout
	if version != battle_version or request != ai_request: return
	while _any_dialog():
		await get_tree().create_timer(0.1).timeout
		if version != battle_version or request != ai_request: return
	ai_pending = false
	if not _wants_ai() or not started or state.phase != "playing" or not combat_view.visible: return
	var choice: Dictionary = campaign.choose_ai(combat,state) if campaign_mission >= 0 else combat.choose_ai(state)
	if not choice.is_empty(): _play_turn(choice.actionId, choice.targetId)

func _wants_ai() -> bool:
	if pvp_active:return false
	var side: int = int(combat.current(state).get("side", -1))
	return auto_play if side == 0 else side == 1 and (mode == "training" or campaign_mission >= 0)

func _set_auto_play(enabled: bool) -> void:
	auto_play = enabled and tutorial_index < 0 and not pvp_active
	ai_request += 1
	ai_pending = false
	if not busy: _refresh()
	_schedule_ai()

func _screen_impact(at: Vector2, color: Color, supreme: bool) -> void:
	if not reduced_motion and backdrop.has_method("screen_impact"): backdrop.screen_impact(at, color, supreme)

func _update_log() -> void:
	var lines: Array = []
	for entry in state.log:
		var actor := _unit_name(entry.get("actor", ""))
		var target := _unit_name(entry.get("target", ""))
		var message := ""
		match entry.type:
			"objective": message = entry.text
			"action": message = "%s usou %s." % [actor, entry.name]
			"damage", "heal", "shield", "guard", "burn", "bleed", "darkmark", "fracture", "energy", "status", "support", "converted", "shieldExpired": message = "%s: %s" % [target, CombatUI._plain(CombatUI.event_detail(entry))]
			"defeated": message = "%s foi derrotado." % target
		if not message.is_empty(): lines.append("[R%d] %s" % [entry.round, message])
	log_view.text = "\n\n".join(lines) if not lines.is_empty() else "Escolha três personagens para cada equipe.\n\nVocê pode enfrentar a IA ou jogar com outra pessoa neste dispositivo."

func _unit_name(id: String) -> String:
	var data := combat.unit(state, id)
	return catalog.hero_by_id[data.heroId].name if not data.is_empty() else ""

func _ask_restart() -> void:
	if pvp_active:
		if state.phase=="finished":_result_confirmed()
		else:_open_menu()
		return
	if started and state.phase == "playing": restart_dialog.popup_centered()
	else: _new_battle()

func _toggle_sound() -> void:
	sound.enabled = not sound.enabled
	sound_button.text = "Efeitos: ligados" if sound.enabled else "Efeitos: desligados"
	audio_enabled = sound.enabled
	_save_preferences()
	sound.play_layer("ui",-6)

func _show_classes() -> void:
	var dialog := AcceptDialog.new()
	dialog.title = "Ciclo de afinidades"
	var text := "Cada personagem possui uma afinidade permanente.\n\n"
	for affinity in catalog.classes:
		text += "%s → %s  (+%s de dano)\n%s\n\n" % [affinity.name, catalog.class_by_id[affinity.strongAgainst].name, RulesText.percent(combat.rules.affinity.advantageMultiplier - 1), affinity.description]
	text += "Classe define afinidade; tanque, suporte e dano são funções dos kits. Cada classe tem as três funções. Os 24 heróis estão ativos nas seis afinidades, incluindo Lumi.\n\nAtacar quem supera sua classe causa %s menos dano.\nAs demais relações são neutras." % RulesText.percent(1 - combat.rules.affinity.resistanceMultiplier)
	dialog.dialog_text = text
	add_child(dialog)
	var help_text: String = dialog.dialog_text
	dialog.dialog_text = ""
	var scroll_text := RichTextLabel.new()
	scroll_text.custom_minimum_size = Vector2(820, 440)
	scroll_text.text = help_text
	dialog.add_child(scroll_text)
	dialog.visibility_changed.connect(func():
		if not dialog.visible: dialog.queue_free())
	dialog.popup_centered_clamped(Vector2i(860, 520), 0.95)

func _show_help() -> void:
	var dialog := AcceptDialog.new()
	dialog.title = "Como jogar"
	dialog.dialog_text = RulesText.help_text()
	add_child(dialog)
	var help_text: String = dialog.dialog_text
	dialog.dialog_text = ""
	var scroll_text := RichTextLabel.new()
	scroll_text.custom_minimum_size = Vector2(820, 440)
	scroll_text.text = help_text
	dialog.add_child(scroll_text)
	dialog.visibility_changed.connect(func():
		if not dialog.visible: dialog.queue_free())
	dialog.popup_centered_clamped(Vector2i(860, 520), 0.95)

func _build_roster() -> void:
	roster_dialog = AcceptDialog.new()
	roster_dialog.title = "%d heróis · %d afinidades · trios livres" % [catalog.heroes.size(), catalog.classes.size()]
	roster_dialog.ok_button_text = "Usar equipes"
	roster_dialog.confirmed.connect(_save_roster)
	add_child(roster_dialog)
	var content := VBoxContainer.new()
	content.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	content.custom_minimum_size = Vector2(960, 560)
	roster_dialog.add_child(content)
	var toolbar := HBoxContainer.new()
	content.add_child(toolbar)
	roster_side = OptionButton.new()
	roster_side.add_item("Equipe 1")
	roster_side.add_item("Equipe 2 / IA")
	roster_side.item_selected.connect(func(_index): _refresh_roster())
	toolbar.add_child(roster_side)
	roster_filter = OptionButton.new()
	roster_filter.add_item("Todas as afinidades")
	for affinity in catalog.classes: roster_filter.add_item(affinity.name)
	roster_filter.item_selected.connect(func(_index): _refresh_roster())
	toolbar.add_child(roster_filter)
	roster_count = _label("", 14, GOLD)
	toolbar.add_child(roster_count)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.y = 330
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(scroll)
	hero_grid = GridContainer.new()
	hero_grid.columns = 4
	hero_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(hero_grid)
	hero_detail = _label("Selecione um personagem para consultar suas habilidades.", 13, MUTED)
	hero_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hero_detail.custom_minimum_size = Vector2(940, 135)
	content.add_child(hero_detail)
	var formation_row := HBoxContainer.new()
	content.add_child(formation_row)
	formation_row.add_child(_label("Personagem na FRENTE:", 14, GOLD))
	roster_front_picker = OptionButton.new()
	roster_front_picker.custom_minimum_size.x = 180
	roster_front_picker.item_selected.connect(func(index):
		inspected_hero = roster_work[roster_side.selected][index]
		_move_to_front())
	formation_row.add_child(roster_front_picker)
	formation_row.add_child(_label("Posição visual; qualquer inimigo pode ser alvo.", 13, MUTED))

func _open_roster() -> void:
	if pvp_active or tutorial_index >= 0 or (started and state.phase == "playing"): return
	roster_campaign = is_instance_valid(hub) and hub.visible and hub.page in ["story", "gems"]
	if campaign_mission >= 0: return
	roster_work = [campaign.team.duplicate(), catalog.default_teams[1].duplicate()] if roster_campaign else teams.duplicate(true)
	roster_side.select(0)
	roster_side.disabled = roster_campaign
	roster_dialog.ok_button_text = "Salvar trio da história" if roster_campaign else "Usar equipes"
	roster_filter.select(0)
	_refresh_roster()
	roster_dialog.popup_centered_clamped(Vector2i(1010, 660), 0.95)

func _refresh_roster() -> void:
	_clear(hero_grid)
	var selected: Array = roster_work[roster_side.selected]
	roster_front_picker.clear()
	for id in selected: roster_front_picker.add_item(catalog.hero_by_id[id].name)
	roster_front_picker.disabled = selected.size() < 2
	var team_names: Array = selected.map(func(id): return catalog.hero_by_id[id].name)
	roster_count.text = "%d/3 · Frente: %s · Atrás: %s" % [selected.size(), team_names[0] if not team_names.is_empty() else "—", ", ".join(team_names.slice(1))]
	for hero in catalog.heroes:
		if roster_filter.selected > 0 and hero.classId != catalog.classes[roster_filter.selected - 1].id: continue
		var button := _button("%s%s\n%s · %s" % [(str(selected.find(hero.id) + 1) + "· " + ("FRENTE · " if selected.find(hero.id) == 0 else "ATRÁS · ")) if hero.id in selected else "", hero.name, catalog.class_by_id[hero.classId].name, hero.role], _toggle_hero.bind(hero.id))
		button.name = hero.id
		button.icon = Fighter.portrait(int(hero.index))
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width", 50)
		button.custom_minimum_size = Vector2(225, 76)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.toggle_mode = true
		button.set_pressed_no_signal(hero.id in selected)
		button.tooltip_text = "%s · %s\n%s\nSinergia: %s" % [hero.title, hero.role, hero.identity, hero.synergy]
		hero_grid.add_child(button)
	roster_dialog.get_ok_button().disabled = not catalog.valid_team(roster_work[0]) or not catalog.valid_team(roster_work[1])

func _toggle_hero(id: String) -> void:
	var selected: Array = roster_work[roster_side.selected]
	if id in selected: selected.erase(id)
	elif selected.size() < 3: selected.append(id)
	var hero: Dictionary = catalog.hero_by_id[id]
	inspected_hero = id
	hero_detail.text = "%s · %s\nPV %d · ATQ %d · DEF %d · VEL %d\n%s\nTécnica — %s: %s\nSupremo — %s: %s" % [hero.name, hero.title, hero.hp, hero.attack, hero.defense, hero.speed, hero.identity + " · Sinergia: " + hero.synergy, hero.skill.name, hero.skill.description, hero.ultimate.name, hero.ultimate.description]
	_refresh_roster()

func _save_roster() -> void:
	if not catalog.valid_team(roster_work[0]) or not catalog.valid_team(roster_work[1]): return
	if roster_campaign:
		campaign.set_team(roster_work[0])
		hub.open(hub.page)
		return
	teams = roster_work.duplicate(true)
	_save_preferences()
	_new_battle()

func _load_preferences() -> void:
	var config := ConfigFile.new()
	if config.load("user://preferences.cfg") != OK: return
	for side in range(2):
		var saved: Variant = config.get_value("teams", str(side), [])
		if catalog.valid_team(saved): teams[side] = saved.duplicate()
	var saved_mode: Variant = config.get_value("game", "mode", "training")
	if saved_mode in ["training", "local"]: mode = saved_mode
	var saved_difficulty: Variant = config.get_value("game", "difficulty", "normal")
	if saved_difficulty in ["easy", "normal", "hard"]: difficulty = saved_difficulty
	var saved_display: Variant = config.get_value("display", "mode", "windowed")
	if saved_display in ["windowed", "fullscreen"]: display_mode = saved_display
	var saved_resolution: Variant = config.get_value("display", "resolution", Vector2i(1280, 720))
	if saved_resolution in [Vector2i(1280, 720), Vector2i(1600, 900), Vector2i(1920, 1080)]: display_resolution = saved_resolution
	var saved_motion: Variant = config.get_value("game", "reduced_motion", false)
	if saved_motion is bool: reduced_motion = saved_motion
	var saved_audio: Variant = config.get_value("audio","enabled",true)
	if saved_audio is bool: audio_enabled = saved_audio
	var saved_level: Variant = config.get_value("audio","level",.8)
	if saved_level is float or saved_level is int: audio_level = clampf(float(saved_level),0,1)
	voice_enabled=bool(config.get_value("voice","enabled",true))
	voice_subtitles=bool(config.get_value("voice","subtitles",true))
	voice_level=clampf(float(config.get_value("voice","level",.75)),0,1)
	Quality.configure(str(config.get_value("video","quality","auto")))

func _save_preferences() -> void:
	var config := ConfigFile.new()
	var saved_teams: Array = free_settings.get("teams", teams)
	for side in range(2): config.set_value("teams", str(side), saved_teams[side])
	config.set_value("game", "mode", free_settings.get("mode", mode))
	config.set_value("game", "difficulty", free_settings.get("difficulty", difficulty))
	config.set_value("game", "reduced_motion", reduced_motion)
	config.set_value("audio","enabled",audio_enabled)
	config.set_value("audio","level",audio_level)
	config.set_value("voice","enabled",voice_enabled)
	config.set_value("voice","subtitles",voice_subtitles)
	config.set_value("voice","level",voice_level)
	config.set_value("video","quality",Quality.mode)
	config.set_value("display", "mode", display_mode)
	config.set_value("display", "resolution", display_resolution)
	var error := config.save("user://preferences.cfg")
	if error != OK: push_warning("Não foi possível salvar as preferências: %s" % error_string(error))

func _any_dialog() -> bool:
	return find_children("*","Window",true,false).any(func(child): return child.visible)

func _open_showcase() -> void:
	if not is_instance_valid(showcase):
		showcase = Showcase.new()
		showcase.catalog = catalog
		showcase.audio = sound
		showcase.voice = voice
		showcase.reduced_motion = reduced_motion
		add_child(showcase)
	else:
		showcase.reduced_motion = reduced_motion
		showcase._select_hero(showcase.selected_hero)
	showcase.popup_centered_clamped(Vector2i(1080, 740), 0.95)

func _input(event: InputEvent) -> void:
	if is_instance_valid(vesper_atelier): return
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_F11:
		_toggle_fullscreen()
		get_viewport().set_input_as_handled()
		return
	if _any_dialog(): return
	if event.keycode == KEY_ESCAPE and display_mode == "fullscreen":
		_toggle_fullscreen()
		get_viewport().set_input_as_handled()
		return
	if is_instance_valid(pvp_lobby) and pvp_lobby.visible:
		if event.keycode==KEY_ESCAPE:
			pvp_lobby._back()
			get_viewport().set_input_as_handled()
		return
	if is_instance_valid(hub) and hub.visible:
		if event.keycode == KEY_ESCAPE and hub.page != "menu":
			hub.open("menu")
			get_viewport().set_input_as_handled()
		return
	var focused := get_viewport().gui_get_focus_owner()
	if focused is LineEdit or focused is TextEdit: return
	if event.keycode == KEY_ESCAPE:
		_open_menu()
		get_viewport().set_input_as_handled()
	elif event.keycode == KEY_A:
		_set_auto_play(not auto_play)
		get_viewport().set_input_as_handled()
	elif event.keycode >= KEY_1 and event.keycode <= KEY_4:
		_select_action(ACTIONS[event.keycode - KEY_1])
		get_viewport().set_input_as_handled()
	elif event.keycode in [KEY_LEFT, KEY_RIGHT] and _can_act():
		var targets := combat.legal_targets(state, combat.current(state), combat.get_action(combat.current(state), selected_action))
		var ids: Array = targets.map(func(u): return u.id)
		var index: int = ids.find(target_id)
		_select_target(ids[posmod(index + (-1 if event.keycode == KEY_LEFT else 1), ids.size())])
		get_viewport().set_input_as_handled()
	elif event.keycode in [KEY_ENTER, KEY_KP_ENTER]:
		var battle_focus: bool = focused == null or focused == execute_button or focused in action_buttons.values() or focused in fighters.values() or focused in target_buttons.get_children()
		if battle_focus and _can_act():
			_execute()
			get_viewport().set_input_as_handled()

func _show_lab() -> void:
	if not is_instance_valid(lab):
		lab = Lab.new()
		lab.catalog = catalog
		add_child(lab)
	lab.refresh()
	lab.popup_centered_clamped(Vector2i(1130, 660), 0.95)

func _show_lessons() -> void:
	var dialog := AcceptDialog.new()
	dialog.title = "Aprender · três batalhas guiadas"
	add_child(dialog)
	var column := VBoxContainer.new()
	dialog.add_child(column)
	for i in range(3):
		var tip := _label(Lessons.hint(i, {}), 13, MUTED)
		column.add_child(tip)
		column.add_child(_button(Lessons.TITLES[i], func():
			dialog.hide()
			_begin_lesson(i)))
	if tutorial_index >= 0:
		column.add_child(_button("Voltar ao treino livre", func():
			dialog.hide()
			_end_lesson()))
	dialog.visibility_changed.connect(func():
		if not dialog.visible: dialog.queue_free())
	dialog.popup_centered()

func _begin_lesson(index: int) -> void:
	if pvp_active:return
	if is_instance_valid(hub) and hub.visible: _enter_free()
	if free_settings.is_empty(): free_settings = {"teams": teams.duplicate(true), "mode": mode, "difficulty": difficulty}
	tutorial_index = index
	auto_play = false
	teams = Lessons.TEAMS[index].duplicate(true)
	mode = "training"
	difficulty = "easy"
	mode_picker.select(0)
	difficulty_picker.select(0)
	_new_battle()

func _end_lesson() -> void:
	if free_settings.is_empty(): return
	teams = free_settings.teams
	mode = free_settings.mode
	difficulty = free_settings.difficulty
	free_settings = {}
	tutorial_index = -1
	mode_picker.select(0 if mode == "training" else 1)
	difficulty_picker.select(["easy", "normal", "hard"].find(difficulty))
	_new_battle()

func _move_to_front() -> void:
	var ids: Array = roster_work[roster_side.selected]
	if not inspected_hero in ids: return
	ids.erase(inspected_hero)
	ids.push_front(inspected_hero)
	_refresh_roster()

func _apply_display() -> void:
	if DisplayServer.get_name() == "headless" or OS.has_feature("web"): return
	if display_mode == "fullscreen":
		get_window().mode = Window.MODE_EXCLUSIVE_FULLSCREEN
		get_window().size = Vector2i(1920, 1080)
	else:
		get_window().mode = Window.MODE_WINDOWED
		get_window().size = display_resolution
		var screen := DisplayServer.screen_get_usable_rect()
		get_window().position = screen.position + (screen.size - display_resolution) / 2

func _toggle_fullscreen() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("document.fullscreenElement ? document.exitFullscreen() : document.querySelector('canvas').requestFullscreen()",true)
		return
	if display_mode == "fullscreen":
		display_mode = "windowed"
		display_resolution = windowed_resolution
	else:
		windowed_resolution = display_resolution
		display_mode = "fullscreen"
		display_resolution = Vector2i(1920, 1080)
	_apply_display()
	_save_preferences()

func _show_display() -> void:
	if OS.has_feature("web"):
		_toggle_fullscreen()
		return
	var dialog := AcceptDialog.new()
	dialog.title = "Tela · Full HD"
	dialog.ok_button_text = "Aplicar"
	add_child(dialog)
	var column := VBoxContainer.new()
	column.custom_minimum_size.x = 430
	dialog.add_child(column)
	column.add_child(_label("F11: alterna tela cheia · Esc: volta à janela", 14, MUTED))
	var picker := OptionButton.new()
	for text in ["Janela 1280×720", "Janela 1600×900", "Janela Full HD 1920×1080", "Tela cheia Full HD 1920×1080"]: picker.add_item(text)
	picker.select(3 if display_mode == "fullscreen" else [Vector2i(1280,720), Vector2i(1600,900), Vector2i(1920,1080)].find(display_resolution))
	column.add_child(picker)
	dialog.confirmed.connect(func():
		display_mode = "fullscreen" if picker.selected == 3 else "windowed"
		display_resolution = [Vector2i(1280,720), Vector2i(1600,900), Vector2i(1920,1080), Vector2i(1920,1080)][picker.selected]
		if display_mode == "windowed": windowed_resolution = display_resolution
		_apply_display()
		_save_preferences())
	dialog.visibility_changed.connect(func():
		if not dialog.visible: dialog.queue_free())
	dialog.popup_centered()

# Online presentation uses the authoritative server result, never a local act().
func _open_pvp() -> void:
	if tutorial_index>=0:_end_lesson()
	campaign_mission=-1
	started=false
	hub.hide()
	combat_view.hide()
	if not is_instance_valid(pvp_lobby):
		pvp_lobby=PvpLobby.new()
		pvp_lobby.app=self
		add_child(pvp_lobby)
	pvp_lobby.show()
	pvp_lobby.refresh()

func _end_pvp() -> void:
	pvp_drain_id+=1
	pvp_draining=false
	pvp_active=false
	pvp_queue.clear()
	pvp_seq=-1
	battle_version+=1
	director.cancel()
	backdrop.cancel()
	sound.stop_all()
	if is_instance_valid(voice): voice.stop_line()
	busy=false
	started=false
	result_shown=false
	result_dialog.hide()

func _pvp_packet(packet: Dictionary) -> void:
	if packet.type=="left":
		if pvp_active:
			_end_pvp()
			_open_pvp()
		return
	if packet.type=="error":
		if pvp_active and not busy:_refresh()
		return
	if not packet.type in ["room","turn"]:return
	if packet.get("phase")=="preparing":
		if pvp_active:
			_end_pvp()
			_open_pvp()
		return
	if not packet.get("state") is Dictionary:return
	if packet.type=="turn":
		pvp_queue.append(packet.duplicate(true))
		_drain_pvp()
		return
	if not pvp_active or packet.get("seq",0)!=pvp_seq or (packet.get("phase")=="finished" and state.phase!="finished"):
		# A full snapshot after reconnection supersedes interrupted animation.
		pvp_drain_id+=1
		pvp_draining=false
		pvp_queue.clear()
		battle_version+=1
		director.cancel()
		backdrop.cancel()
		sound.stop_all()
		if is_instance_valid(voice): voice.stop_line()
		pvp_active=true
		auto_play=false
		ai_request+=1
		ai_pending=false
		busy=false
		started=true
		campaign_mission=-1
		result_shown=false
		selected_action="basic"
		pvp_seq=int(packet.seq)
		state=packet.state.duplicate(true)
		if is_instance_valid(pvp_lobby):pvp_lobby.hide()
		hub.hide()
		combat_view.show()
		_rebuild_fighters()
	else:
		if not busy:_refresh()

func _drain_pvp() -> void:
	if pvp_draining:return
	pvp_draining=true
	var drain_id := pvp_drain_id
	while not pvp_queue.is_empty() and pvp_active:
		var packet: Dictionary=pvp_queue.pop_front()
		if int(packet.seq)<=pvp_seq:continue
		if int(packet.seq)!=pvp_seq+1:
			_pvp_packet(packet.merged({"type":"room"},true))
			continue
		var version := battle_version
		await _present_turn(str(packet.actionId),str(packet.targetId),packet.state.duplicate(true),packet.result)
		if version!=battle_version or drain_id!=pvp_drain_id:break
		pvp_seq=int(packet.seq)
	if drain_id==pvp_drain_id:pvp_draining=false
