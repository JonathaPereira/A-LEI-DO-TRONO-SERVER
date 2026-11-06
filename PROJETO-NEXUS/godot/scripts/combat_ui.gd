extends RefCounted
const Fighter = preload("res://scripts/fighter.gd")
const Card = preload("res://scripts/skill_card.gd")
const Meter = preload("res://scripts/meter.gd")
const Backdrop = preload("res://scripts/arena_backdrop.gd")
const Lessons = preload("res://scripts/lessons.gd")
const Sound = preload("res://scripts/sound.gd")
const RulesText = preload("res://scripts/rules_text.gd")

static func build(app) -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right"]: margin.add_theme_constant_override("margin_" + side, 18)
	for side in ["top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 9)
	app.add_child(margin)
	app.combat_view = margin
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 6)
	margin.add_child(layout)
	var header := HBoxContainer.new()
	header.custom_minimum_size.y = 42
	layout.add_child(header)
	var brand := VBoxContainer.new()
	brand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	brand.add_theme_constant_override("separation", 0)
	header.add_child(brand)
	var title = app._label("NEXUS", 28, app.GOLD)
	title.add_theme_font_override("font", preload("res://assets/space-grotesk.ttf"))
	brand.add_child(title)
	brand.add_child(app._label("ECOS DO CREPÚSCULO  /  TÁTICO 2D", 10, app.MUTED))
	header.add_child(app._button("Menu", app._open_menu))
	app.roster_button = app._button("Equipes", app._open_roster)
	header.add_child(app.roster_button)
	app.auto_button = CheckButton.new()
	app.auto_button.name = "AutoPlay"
	app.auto_button.text = "Automático · A"
	app.auto_button.tooltip_text = "Sua equipe escolhe alvos e habilidades, cura feridos e renova a proteção conforme necessário. Desligue para assumir após a ação atual. Não controla o adversário no duelo local."
	app.auto_button.toggled.connect(app._set_auto_play)
	header.add_child(app.auto_button)
	# Secondary tools stay available without occupying the battle HUD.
	var tools_popup := PopupPanel.new()
	app.add_child(tools_popup)
	var tools := VBoxContainer.new()
	tools.custom_minimum_size.x = 240
	tools_popup.add_child(tools)
	var tools_button: Button = app._button("Opções  ···", func(): tools_popup.popup_centered())
	header.add_child(tools_button)
	for item in [["Afinidades", app._show_classes], ["Ajuda", app._show_help], ["Galeria 2D", app._open_showcase], ["Aprender", app._show_lessons], ["Balanço", app._show_lab]]:
		var callback: Callable = item[1]
		tools.add_child(app._button(item[0], func():
			tools_popup.hide()
			callback.call()))
	app.log_dialog = AcceptDialog.new()
	app.log_dialog.title = "Registro da batalha"
	app.add_child(app.log_dialog)
	app.log_view = RichTextLabel.new()
	app.log_view.custom_minimum_size = Vector2(650, 420)
	app.log_view.scroll_following = true
	app.log_view.add_theme_font_size_override("normal_font_size", 15)
	app.log_dialog.add_child(app.log_view)
	app.log_button = app._button("Registro", func(): app.log_dialog.popup_centered())
	header.add_child(app.log_button)
	app.sound_button = app._button("Efeitos: ligados" if app.audio_enabled else "Efeitos: desligados", app._toggle_sound)
	app.sound_button.tooltip_text="Ativa os efeitos sonoros. As vozes têm controles próprios em Áudio e vídeo."
	header.add_child(app.sound_button)
	header.add_child(app._button("Voz e vídeo",app._show_presentation_settings))
	app.screen_button = app._button("⛶ Tela", app._show_display)
	tools.add_child(app.screen_button)
	app.sound = Sound.new()
	app.add_child(app.sound)
	app.sound.enabled = app.audio_enabled
	app.sound.set_mix_level(app.audio_level)
	tools.add_child(app._label("Volume dos efeitos",12,app.MUTED))
	var volume := HSlider.new()
	volume.min_value = 0
	volume.max_value = 100
	volume.step = 5
	volume.value = app.audio_level*100
	volume.tooltip_text = "Volume dos efeitos sonoros"
	volume.value_changed.connect(func(value):
		app.audio_level = value/100
		app.sound.set_mix_level(app.audio_level)
		app._save_preferences())
	tools.add_child(volume)
	var brief := PanelContainer.new()
	layout.add_child(brief)
	var brief_row := HBoxContainer.new()
	brief_row.add_theme_constant_override("separation", 18)
	brief.add_child(brief_row)
	var turn_text := VBoxContainer.new()
	turn_text.custom_minimum_size.x = 260
	turn_text.add_theme_constant_override("separation", 2)
	brief_row.add_child(turn_text)
	app.phase_label = app._label("", 18, Color("d8f6ff"))
	turn_text.add_child(app.phase_label)
	app.initiative = app._label("PRÓXIMOS TURNOS →", 11, app.MUTED)
	turn_text.add_child(app.initiative)
	app.timeline = HBoxContainer.new()
	app.timeline.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	app.timeline.add_theme_constant_override("separation", 6)
	brief_row.add_child(app.timeline)
	app.mode_picker = OptionButton.new()
	app.mode_picker.add_item("Treino contra IA")
	app.mode_picker.add_item("Duelo local")
	app.mode_picker.select(0 if app.mode == "training" else 1)
	app.mode_picker.item_selected.connect(func(index):
		app.mode = "training" if index == 0 else "local"
		app._save_preferences()
		app._new_battle())
	brief_row.add_child(app.mode_picker)
	app.difficulty_picker = OptionButton.new()
	for level in ["Iniciante", "Normal", "Desafiador"]: app.difficulty_picker.add_item(level)
	app.difficulty_picker.select(["easy", "normal", "hard"].find(app.difficulty))
	app.difficulty_picker.item_selected.connect(func(index):
		app.difficulty = ["easy", "normal", "hard"][index]
		app._save_preferences()
		app._new_battle())
	brief_row.add_child(app.difficulty_picker)
	app.mission_label = app._label("", 12, app.GOLD)
	app.mission_label.custom_minimum_size.x = 235
	app.mission_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	app.mission_label.visible = false
	brief_row.add_child(app.mission_label)
	var caption_row := HBoxContainer.new()
	caption_row.add_theme_constant_override("separation",12)
	layout.add_child(caption_row)
	app.objective_label = app._label("", 13, Color("97e7de"))
	app.objective_label.name = "MissionObjective"
	app.objective_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	app.objective_label.size_flags_stretch_ratio = 2
	app.objective_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	app.objective_label.visible = false
	caption_row.add_child(app.objective_label)
	# A stable caption lane preserves access to the menu, timeline and action buttons.
	app.battle_voice_caption=app._label("",14,Color("d5f4ff"))
	app.battle_voice_caption.custom_minimum_size.y=20
	app.battle_voice_caption.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	app.battle_voice_caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	app.battle_voice_caption.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	app.battle_voice_caption.mouse_filter=Control.MOUSE_FILTER_IGNORE
	caption_row.add_child(app.battle_voice_caption)
	var arena := PanelContainer.new()
	arena.size_flags_vertical = Control.SIZE_EXPAND_FILL
	arena.add_theme_stylebox_override("panel", app._style(Color("0a1422"), Color("293b50")))
	layout.add_child(arena)
	var arena_column := VBoxContainer.new()
	arena_column.add_theme_constant_override("separation", 2)
	arena.add_child(arena_column)
	var arena_header := HBoxContainer.new()
	arena_column.add_child(arena_header)
	var left = app._label("SUA EQUIPE", 11, Color("93c7e9"))
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena_header.add_child(left)
	app.left_team_label=left
	app.round_label = app._label("", 11, app.GOLD)
	arena_header.add_child(app.round_label)
	var right = app._label("EQUIPE RIVAL", 11, Color("dfa1b0"))
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	arena_header.add_child(right)
	app.right_team_label=right
	app.field = Control.new()
	app.field.clip_contents = true
	app.field.custom_minimum_size = Vector2(0, 410)
	app.field.size_flags_vertical = Control.SIZE_EXPAND_FILL
	arena_column.add_child(app.field)
	app.backdrop = Backdrop.new()
	app.field.add_child(app.backdrop)
	app.effects = Control.new()
	app.effects.mouse_filter = Control.MOUSE_FILTER_IGNORE
	app.effects.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	app.effects.z_index = 60
	app.field.add_child(app.effects)
	app.feedback_panel = PanelContainer.new()
	app.feedback_panel.custom_minimum_size.y = 44
	app.feedback_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	app.feedback_panel.z_index = 80
	var feedback_style = app._style(Color("091321ec"), Color("314459"))
	feedback_style.content_margin_top = 4
	feedback_style.content_margin_bottom = 4
	app.feedback_panel.add_theme_stylebox_override("panel", feedback_style)
	arena_column.add_child(app.feedback_panel)
	arena_column.move_child(app.feedback_panel, 1)
	app.feedback = RichTextLabel.new()
	app.feedback.bbcode_enabled = true
	app.feedback.scroll_active = false
	app.feedback.custom_minimum_size.y = 32
	app.feedback.add_theme_font_size_override("normal_font_size", 13)
	app.feedback.mouse_filter = Control.MOUSE_FILTER_PASS
	app.feedback_panel.add_child(app.feedback)
	app.field.resized.connect(app._position_fighters)
	var commands := PanelContainer.new()
	commands.add_theme_stylebox_override("panel", app._style(Color("0c1727"), Color("31435b")))
	layout.add_child(commands)
	var commands_row := HBoxContainer.new()
	commands_row.add_theme_constant_override("separation", 18)
	commands.add_child(commands_row)
	var identity := VBoxContainer.new()
	identity.custom_minimum_size.x = 204
	identity.add_theme_constant_override("separation", 4)
	commands_row.add_child(identity)
	var portrait_row := HBoxContainer.new()
	identity.add_child(portrait_row)
	app.active_portrait = TextureRect.new()
	app.active_portrait.custom_minimum_size = Vector2(56, 62)
	app.active_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	app.active_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait_row.add_child(app.active_portrait)
	var identity_text := VBoxContainer.new()
	identity_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity_text.add_theme_constant_override("separation", 2)
	portrait_row.add_child(identity_text)
	app.active_label = app._label("", 21, Color("d8f6ff"))
	app.active_label.add_theme_font_override("font", preload("res://assets/space-grotesk.ttf"))
	identity_text.add_child(app.active_label)
	app.active_class = app._label("", 12, app.MUTED)
	identity_text.add_child(app.active_class)
	app.active_numbers = app._label("", 13, Color("c4dfd0"))
	app.active_numbers.visible = false
	identity.add_child(app.active_numbers)
	app.active_health = Meter.new()
	app.active_health.custom_minimum_size.y = 18
	identity.add_child(app.active_health)
	app.active_shield_label = app._label("", 12, Color("83d8ff"))
	app.active_shield_label.visible = false
	identity.add_child(app.active_shield_label)
	app.active_shield = Meter.new()
	app.active_shield.fill = Color("62d0ff")
	app.active_shield.custom_minimum_size.y = 16
	identity.add_child(app.active_shield)
	app.active_energy_label = app._label("", 13, Color("b7a6ef"))
	app.active_energy_label.visible = false
	identity.add_child(app.active_energy_label)
	app.active_energy = Meter.new()
	app.active_energy.custom_minimum_size.y = 16
	app.active_energy.fill = Color("9586dc")
	identity.add_child(app.active_energy)
	identity.move_child(app.active_energy, app.active_shield.get_index())
	app.step_label = app._label("", 11, app.MUTED)
	app.step_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	app.step_label.custom_minimum_size.x = 200
	identity.add_child(app.step_label)
	var command_column := VBoxContainer.new()
	command_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	command_column.add_theme_constant_override("separation", 7)
	commands_row.add_child(command_column)
	var actions := HBoxContainer.new()
	command_column.add_child(actions)
	for id in app.ACTIONS:
		var card := Card.new()
		card.name = id
		card.pressed.connect(app._select_action.bind(id))
		actions.add_child(card)
		app.action_buttons[id] = card
	app.description = app._label("", 13, Color("c1cfe3"))
	app.description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	app.description.custom_minimum_size.y = 32
	app.description.max_lines_visible = 2
	command_column.add_child(app.description)
	var targets := HBoxContainer.new()
	command_column.add_child(targets)
	targets.add_child(app._label("ALVO", 11, app.GOLD))
	app.target_buttons = HBoxContainer.new()
	app.target_buttons.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	app.target_buttons.add_theme_constant_override("separation", 6)
	targets.add_child(app.target_buttons)
	app.execute_button = app._button("Confirmar ação", app._execute)
	app.execute_button.custom_minimum_size = Vector2(195, 34)
	app.execute_button.add_theme_stylebox_override("normal", app._style(Color("5bdbed"), Color("b9f7ff")))
	app.execute_button.add_theme_color_override("font_color", Color("051622"))
	targets.add_child(app.execute_button)
	var footer := HBoxContainer.new()
	layout.add_child(footer)
	var note = app._label("1–4  Habilidades    ← →  Alvo    Enter  Confirmar    A  Automático    Esc  Menu", 12, app.MUTED)
	note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(note)
	app.controls_note=note
	var reduce := CheckButton.new()
	reduce.text = "Reduzir animações"
	reduce.button_pressed = app.reduced_motion
	reduce.toggled.connect(app._set_reduced)
	footer.add_child(reduce)
	app.restart_button=app._button("Reiniciar", app._ask_restart)
	footer.add_child(app.restart_button)
	app.start_button = app._button("INICIAR COMBATE", app._start)
	app.start_button.custom_minimum_size.x = 186
	app.start_button.add_theme_stylebox_override("normal", app._style(Color("5bdbed"), Color("b9f7ff")))
	app.start_button.add_theme_color_override("font_color", Color("051622"))
	footer.add_child(app.start_button)
	app.restart_dialog = ConfirmationDialog.new()
	app.restart_dialog.title = "Reiniciar batalha?"
	app.restart_dialog.dialog_text = "A batalha atual será encerrada. Você poderá alterar as equipes."
	app.restart_dialog.ok_button_text = "Reiniciar"
	app.restart_dialog.cancel_button_text = "Continuar jogando"
	app.restart_dialog.confirmed.connect(app._new_battle)
	app.add_child(app.restart_dialog)
	app.result_dialog = AcceptDialog.new()
	app.result_dialog.title = "Resultado da batalha"
	app.result_dialog.ok_button_text = "Jogar novamente"
	app.result_dialog.get_label().autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	app.result_dialog.get_label().custom_minimum_size.x = 640
	app.result_dialog.confirmed.connect(app._result_confirmed)
	app.add_child(app.result_dialog)
	app._build_roster()

static func refresh(app) -> void:
	app.log_button.text="Registro PvP" if app.pvp_active else "Registro"
	app.log_dialog.title="Registro desta partida PvP" if app.pvp_active else "Registro da batalha"
	var own_side: int=int(app.pvp_client.own_player().get("side",-1)) if app.pvp_active else 0
	app.left_team_label.text=("EQUIPE 1 · SUA EQUIPE" if own_side==0 else "EQUIPE 1 · ADVERSÁRIO") if app.pvp_active else "SUA EQUIPE"
	app.right_team_label.text=("EQUIPE 2 · SUA EQUIPE" if own_side==1 else "EQUIPE 2 · ADVERSÁRIO") if app.pvp_active else "EQUIPE RIVAL"
	var actor: Dictionary = app.combat.current(app.state)
	if actor.is_empty(): return
	var hero: Dictionary = app.catalog.hero_by_id[actor.heroId]
	var action: Dictionary = app.combat.get_action(actor, app.selected_action)
	var targets: Array = app.combat.legal_targets(app.state, actor, action)
	var ids: Array = targets.map(func(u): return u.id)
	if not app.target_id in ids: app.target_id = ids[0] if not ids.is_empty() else ""
	app.roster_button.disabled = app.pvp_active or app.campaign_mission >= 0 or app.tutorial_index >= 0 or (app.started and app.state.phase == "playing")
	app.roster_button.tooltip_text = "Altere seu trio no menu História, entre missões." if app.campaign_mission >= 0 else "Reinicie para alterar as equipes." if app.roster_button.disabled else "Escolha três personagens por equipe."
	app.mode_picker.visible = app.campaign_mission < 0 and not app.pvp_active
	app.difficulty_picker.visible = app.campaign_mission < 0 and not app.pvp_active
	app.mission_label.visible = app.campaign_mission >= 0 or app.pvp_active
	app.objective_label.visible = app.campaign_mission >= 0
	app.field.custom_minimum_size.y = 395 if app.campaign_mission >= 0 else 410
	if app.campaign_mission >= 0:
		app.objective_label.text = "OBJETIVO  /  " + app.Campaign.Objectives.describe(app.state)
		app.objective_label.tooltip_text = app.Campaign.Objectives.brief(app.campaign.missions[app.campaign_mission])
	if app.campaign_mission >= 0:
		app.mission_label.text = "HISTÓRIA · EQUIPE NV %d\n%s" % [app.state.get("teamLevel",1),app.campaign.missions[app.campaign_mission].name]
		app.mission_label.tooltip_text = app.campaign.missions[app.campaign_mission].tip
	app.start_button.text = "INICIAR MISSÃO" if app.campaign_mission >= 0 else "INICIAR COMBATE"
	app.mode_picker.disabled = app.tutorial_index >= 0 or (app.started and app.state.phase == "playing")
	app.difficulty_picker.disabled = (app.started and app.state.phase == "playing") or app.mode == "local" or app.tutorial_index >= 0
	app.start_button.visible = not app.started
	app.phase_label.text = "Prepare sua equipe" if not app.started else ("Batalha encerrada" if app.state.phase == "finished" else "%s · %s" % [hero.name, "sua vez" if app._human_turn() else "vez do rival"])
	app.auto_button.set_pressed_no_signal(app.auto_play)
	app.auto_button.disabled = app.tutorial_index >= 0 or app.pvp_active
	app.auto_button.visible=not app.pvp_active
	app.restart_button.text=("Desistir" if app.state.phase=="playing" else "Preparação PvP") if app.pvp_active else "Reiniciar"
	app.controls_note.text="1–4  Habilidades    ← →  Alvo    Enter  Confirmar    Esc  Sair" if app.pvp_active else "1–4  Habilidades    ← →  Alvo    Enter  Confirmar    A  Automático    Esc  Menu"
	if app.started and app.auto_play and actor.side == 0 and app.state.phase == "playing": app.phase_label.text = "%s · automático" % hero.name
	var fracture: Dictionary = app.combat.rules.fracture
	app.round_label.text = "RODADA %02d  ·  FRATURA EM %d RODADAS" % [app.state.round, int(fracture.startRound) - app.state.round]
	app.round_label.tooltip_text = "Fratura a partir da rodada %d: dano antes da ação, atravessa escudos. Cura recebida diminui %s adicionais por rodada, até zero." % [int(fracture.startRound), RulesText.percent(fracture.healingReductionPerRound)]
	if app.state.round >= fracture.startRound:
		app.round_label.text = "FRATURA · DANO %s PV · CURA −%s" % [RulesText.percent(minf(fracture.maxHpRatioCap, fracture.initialMaxHpRatio + (app.state.round - fracture.startRound) * fracture.perRoundMaxHpRatio)), RulesText.percent(minf(1.0, (app.state.round - fracture.startRound + 1) * fracture.healingReductionPerRound))]
	app.active_label.text = hero.name
	app.active_class.text = "%s\n%s" % [app.catalog.class_by_id[hero.classId].name, hero.role]
	app.active_class.add_theme_color_override("font_color", app.catalog.affinity_color(hero.classId))
	app.active_portrait.texture = Fighter.portrait(int(hero.index))
	update_actor_stats(app, actor)
	app.step_label.text = "Alvo livre · salvo Provocação.\nÁrea atinge todos." if app._can_act() else ("Consulte as habilidades.\nInicie o combate." if not app.started else "Aguarde a ação terminar." if app.busy else "Aguarde o próximo turno.")
	for index in range(app.ACTIONS.size()):
		var id: String = app.ACTIONS[index]
		var card = app.action_buttons[id]
		var presented_action: Dictionary = app.combat.get_action(actor, id).duplicate()
		if id in ["basic", "guard"]: presented_action.energyGain = presented_action.get("energyGain",app.combat.rules.energy.basicGain) if id == "basic" else app.combat.rules.energy.guardGain
		card.configure(presented_action, id, index + 1, app.catalog.affinity_color(hero.classId), int(actor.energy), int(actor.cooldowns.get(id, 0)), app._can_inspect(), int(hero.index))
		if app.combat.legal_targets(app.state, actor, presented_action).is_empty():
			card.disabled = true
			card.available = false
			card.reason = "Nenhum aliado disponível para interceptar."
			card.tooltip_text += "\n" + card.reason
		if id == "skill":
			card.glyph.symbol = hero.classId
			card.glyph.queue_redraw()
		card.set_pressed_no_signal(app.selected_action == id)
	app.description.text = action.description
	app.description.tooltip_text = action.description
	var selected = app.action_buttons[app.selected_action]
	if not selected.reason.is_empty(): app.description.text += "  " + selected.reason
	app._clear(app.target_buttons)
	for target in targets:
		var target_hero: Dictionary = app.catalog.hero_by_id[target.heroId]
		var label: String = target_hero.name
		if target.side != actor.side:
			var multiplier: float = app.combat.advantage(hero.classId, target_hero.classId)
			label += " +" + RulesText.percent(multiplier - 1) if multiplier > 1 else (" −" + RulesText.percent(1 - multiplier) if multiplier < 1 else "")
		var button = app._button(label, app._select_target.bind(target.id))
		button.toggle_mode = true
		button.set_pressed_no_signal(target.id == app.target_id)
		button.disabled = not app._can_act()
		button.add_theme_font_size_override("font_size", 13)
		app.target_buttons.add_child(button)
	var all_targets: bool = action.kind in ["aoe", "healAll", "shieldAll", "supportAll"]
	app.execute_button.text = "Confirmar em todos" if all_targets else "Usar em %s" % app._unit_name(app.target_id)
	if not app.started: app.execute_button.text = "Inicie a missão" if app.campaign_mission >= 0 else "Inicie o combate"
	elif not selected.available: app.execute_button.text = "Em recarga" if actor.cooldowns.get(app.selected_action, 0) > 0 else "Energia insuficiente"
	if targets.is_empty(): app.execute_button.text = "Sem alvos válidos"
	if app.auto_play and app.started and actor.side == 0: app.execute_button.text = "Equipe no automático"
	if action.kind == "damage" and targets.size() < app.state.units.filter(func(u): return u.hp > 0 and u.side != actor.side).size(): app.step_label.text = "PROVOCAÇÃO\nAtaque o provocador."
	elif action.kind == "aoe": app.step_label.text = "ÁREA\nTodos os rivais vivos."
	app.execute_button.disabled = not app._can_act() or not app.combat.can_use(actor, app.selected_action) or app.target_id.is_empty()
	for data in app.state.units:
		var fighter = app.fighters[data.id]
		fighter.motion_enabled = not app.reduced_motion
		fighter.refresh(data, app.started and data.id == actor.id and app.state.phase == "playing", data.id == app.target_id, data.id in ids and app._can_act())
		var multiplier: float = app.combat.advantage(hero.classId, app.catalog.hero_by_id[data.heroId].classId)
		fighter.set_relationship(multiplier, data.side != actor.side and action.kind in ["damage", "aoe"] and app.state.phase == "playing")
		fighter.disabled = not app._can_act() or not data.id in ids
	app.backdrop.motion_enabled = not app.reduced_motion
	app.backdrop.sync_units(app.state.units)
	app.backdrop.select_unit(actor.id if app.started else "", app.target_id if app._can_act() else "")
	if app.preview_requested and app._can_inspect(): _preview(app, action)
	if app.tutorial_index >= 0:
		var goals: Array = Lessons.GOALS[app.tutorial_index]
		var pending: Array = goals.filter(func(g): return not app.tutorial_progress.get(g, false))
		app.step_label.text = "Treino %d · %d/%d objetivos\n%s" % [app.tutorial_index + 1, goals.size() - pending.size(), goals.size(), "Próximo: " + Lessons.LABELS[pending[0]] if not pending.is_empty() else "Concluído! Veja Aprender."]
		app.step_label.tooltip_text = Lessons.hint(app.tutorial_index, app.tutorial_progress)
	if app.pvp_active:
		app.mission_label.text="PvP · SALA "+str(app.pvp_client.room.get("code",""))+" · VOCÊ: EQUIPE "+str(own_side+1)
		app.mission_label.tooltip_text="Você controla apenas sua equipe. O servidor valida os resultados."
		if app.pvp_client.pending_action:app.phase_label.text="Enviando ação ao servidor…"
		elif not app.pvp_client.available() and app.state.phase=="playing":app.phase_label.text="Conexão interrompida · aguardando reconexão"
	_timeline(app)

static func update_actor_stats(app, actor: Dictionary) -> void:
	app.active_numbers.text = "VIDA   %d / %d" % [actor.hp, actor.maxHp]
	app.active_health.max_value = actor.maxHp
	app.active_health.value = actor.hp
	app.active_shield.max_value = round(actor.maxHp * float(app.combat.rules.shield.maxHpRatio))
	app.active_shield.value = actor.shield
	app.active_shield_label.text = "ESCUDO   %d / %d" % [actor.shield, int(app.active_shield.max_value)]
	app.active_energy.max_value = app.combat.rules.energy.maximum
	app.active_energy_label.text = "ENERGIA   %d / %d" % [actor.energy, int(app.combat.rules.energy.maximum)]
	app.active_energy.value = actor.energy
	app.active_health.caption = app.active_numbers.text
	app.active_energy.caption = app.active_energy_label.text
	app.active_shield.caption = app.active_shield_label.text + ((" · %dT" % actor.get("shieldTurns", 0) if actor.get("shieldTurns", 0) > 0 else " · AGORA") if actor.shield > 0 else "")

static func event_detail(event: Dictionary) -> String:
	var detail := ""
	match event.type:
		"damage":
			if event.get("reaction", false): detail += "CONTRA-ATAQUE · "
			if event.get("intercepted", false): detail += "PROTETOR · "
			if event.has("combo"): detail += "COMBO · "
			if event.get("critical", false): detail += "[color=#ffd17a]CRÍTICO![/color]  "
			detail += "[color=#ffc0af]−%d VIDA[/color]" % event.amount
			if event.get("absorbed", 0) > 0:
				detail += "  ·  [color=#83d8ff]−%d ESCUDO · resta %d[/color]" % [event.absorbed, event.shieldAfter]
				if event.shieldAfter == 0: detail += "  ·  [color=#83d8ff]ESCUDO QUEBRADO[/color]"
			if event.get("advantage", 1.0) != 1.0: detail += "  ·  " + RulesText.relationship(float(event.advantage))
		"heal": detail = "[color=#a1e6b3]+%d VIDA%s[/color]" % [event.amount, (" · REGENERAÇÃO" if event.has("remaining") else " · SEMENTE" if event.get("source", "") == "seed" else " · DRENO DE VIDA") if event.get("passive", false) else ""]
		"shield", "guard": detail = "[color=#83d8ff]%s · total %d · %dR[/color]" % ["+%d ESCUDO" % event.amount if event.amount > 0 else "LIMITE DE ESCUDO", event.get("shieldAfter", event.amount), event.get("shieldTurns", int(RulesText.rules.shield.durationRounds))]
		"shieldExpired": detail = "CAMADA EXPIROU · −%d · resta %d" % [event.amount,event.get("shieldAfter",0)]
		"energy": detail = "+%d ENERGIA · total %d" % [event.amount, event.energyAfter]
		"converted": detail = "%d ESCUDO CONVERTIDO EM DANO" % event.shieldSpent
		"support": detail = "SUPORTE"
		"status": detail = "ESTADO APLICADO"
		"burn", "bleed", "darkmark", "fracture":
			detail = "[color=#ffb49b]%s · −%d VIDA[/color]  ·  atravessa escudos" % [{"darkmark": "MARCA OBSCURA", "burn": "QUEIMADURA", "bleed": "SANGRAMENTO", "fracture": "FRATURA"}[event.type], event.amount]
			if event.has("remaining"): detail += "  ·  %d ativação(ões) restante(s)" % event.remaining
	if event.get("healingPenalty", 0) > 0: detail += "  ·  [color=#ffc18a]CURA −%d%%[/color]" % event.healingPenalty
	if event.has("extraEffect"): detail += "  ·  %s %dT" % [Fighter.STATUS_NAMES.get(event.extraEffect, event.extraEffect), int(RulesText.rules.status.durationTurns)]
	if event.has("effect"):
		if event.effect == "cleanse": detail += "  ·  PURIFICADO (%d efeito(s))" % event.cleansed.size()
		else: detail += "  ·  [color=#eac4ee]%s %dT[/color]" % [Fighter.STATUS_NAMES.get(event.effect, event.effect).to_upper(), event.effectTurns]
	return detail

static func show_report(app, events: Array, title: String) -> void:
	var lines: Array = []
	for event in events:
		var detail := event_detail(event)
		if detail.is_empty(): continue
		lines.append("%s: %s" % [app._unit_name(event.target), detail])
	# Individual receipts remain on hover and in Registro. Area attacks show
	# totals so the fixed-height banner stays readable in the smallest window.
	app.feedback.tooltip_text = title + "\n" + "\n".join(lines.map(func(line): return _plain(line)))
	if lines.size() > 1:
		var health_loss := 0
		var absorbed := 0
		var healing := 0
		var granted := 0
		var criticals := 0
		var energy := 0
		var combos := 0
		var counters := 0
		var reduced_heals := 0
		var recipients: Array = []
		var remaining: Array = []
		var statuses: Array = []
		var presenting: Dictionary = app.combat.get_action(app.combat.current(app.state),app.selected_action)
		for event in events:
			if not event.has("amount"): continue
			var primary: bool = not event.get("reaction",false) and not event.get("intercepted",false) and not event.get("passive",false) and (presenting.kind != "aoe" or event.type == "damage")
			if primary and not event.target in recipients: recipients.append(event.target)
			if event.type == "damage":
				health_loss += int(event.amount)
				absorbed += int(event.absorbed)
			elif event.type == "heal":
				healing += int(event.amount)
				if event.get("healingPenalty", 0) > 0: reduced_heals += 1
			elif event.type in ["shield", "guard"]: granted += int(event.amount)
			elif event.type == "energy": energy += int(event.amount)
			if event.has("combo"): combos += 1
			if event.get("reaction", false): counters += 1
			if event.get("critical", false): criticals += 1
			if event.has("shieldAfter") and (event.type in ["shield", "guard"] or event.get("absorbed", 0) > 0): remaining.append("%s %d" % [app._unit_name(event.target), event.shieldAfter])
			if event.has("effect"):
				var status: String = Fighter.STATUS_NAMES.get(event.effect, "Purificado")
				if not status in statuses: statuses.append(status)
		var totals: Array = []
		if health_loss > 0 or absorbed > 0: totals.append("[color=#ffc0af]−%d VIDA[/color] / [color=#83d8ff]−%d ESCUDO[/color]" % [health_loss, absorbed])
		if healing > 0: totals.append("[color=#a1e6b3]+%d CURA[/color]" % healing)
		if reduced_heals > 0: totals.append("[color=#ffc18a]%d CURA(S) REDUZIDA(S)[/color]" % reduced_heals)
		if granted > 0: totals.append("[color=#83d8ff]+%d ESCUDO[/color]" % granted)
		if energy > 0: totals.append("+%d ENERGIA" % energy)
		if combos > 0: totals.append("%d COMBO(S)" % combos)
		if counters > 0: totals.append("%d CONTRA-ATAQUE(S)" % counters)
		if not remaining.is_empty(): totals.append("Escudos: " + ", ".join(remaining))
		if not statuses.is_empty(): totals.append(", ".join(statuses))
		app.feedback.text = "[center][color=#67e8f9]%s · %d alvo(s)%s[/color]\n%s[/center]" % [title, recipients.size(), " · %d CRÍTICO(S)" % criticals if criticals > 0 else "", "  ·  ".join(totals)]
	else:
		app.feedback.text = "[center][color=#67e8f9]%s[/color]\n%s[/center]" % [title, "".join(lines)]

static func _plain(value: String) -> String:
	var regex := RegEx.new()
	regex.compile("\\[/?color[^\\]]*\\]")
	return regex.sub(value, "", true)

static func _timeline(app) -> void:
	app._clear(app.timeline)
	var order: Array = app.state.order.slice(app.state.cursor) + app.state.order.slice(0, app.state.cursor)
	var index := 0
	for id in order:
		var data: Dictionary = app.combat.unit(app.state, id)
		if data.hp <= 0: continue
		var hero: Dictionary = app.catalog.hero_by_id[data.heroId]
		var frame := PanelContainer.new()
		frame.custom_minimum_size = Vector2(46, 44)
		var box := StyleBoxFlat.new()
		box.bg_color = Color("101d30")
		box.border_color = app.GOLD if index == 0 else app.catalog.affinity_color(hero.classId).darkened(0.55)
		box.set_border_width_all(2 if index == 0 else 1)
		box.set_corner_radius_all(5)
		frame.add_theme_stylebox_override("panel", box)
		frame.tooltip_text = "%d. %s · velocidade %d" % [index + 1, hero.name, data.speed]
		var portrait := TextureRect.new()
		portrait.texture = Fighter.portrait(int(hero.index))
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		frame.add_child(portrait)
		app.timeline.add_child(frame)
		index += 1

static func lock_action(app, hero: Dictionary, action: Dictionary) -> void:
	app.phase_label.text = "%s · %s" % [hero.name, action.name]
	app.step_label.text = "Golpe em execução…"
	app.execute_button.disabled = true
	app.execute_button.text = "Em execução…"
	for card in app.action_buttons.values(): card.disabled = true
	for button in app.target_buttons.get_children(): button.disabled = true
	for fighter in app.fighters.values(): fighter.disabled = true

static func _preview(app, action: Dictionary) -> void:
	var result: Dictionary = app.combat.preview(app.state, app.selected_action, app.target_id)
	if result.normal.has("error"):
		app.feedback.text = "[center]PRÉVIA INDISPONÍVEL · " + result.normal.error + "[/center]"
		return
	var totals: Array = []
	var details: Array = []
	var has_damage: bool = result.normal.events.any(func(e): return e.type == "damage")
	for name in (["normal", "critical"] if has_damage else ["normal"]):
		var hp := 0
		var shield := 0
		var healing := 0
		var granted := 0
		var energy := 0
		var statuses: Array = []
		for event in result[name].events:
			if event.type == "damage":
				hp += int(event.amount)
				shield += int(event.absorbed)
			elif event.type == "heal": healing += int(event.amount)
			elif event.type in ["shield", "guard"]: granted += int(event.amount)
			elif event.type == "energy": energy += int(event.amount)
			if name == "normal":
				details.append("%s: %s" % [app._unit_name(event.target), _plain(event_detail(event))])
				if event.has("effect") and not event.effect in statuses: statuses.append(event.effect)
		var label := "%s: −%d PV / −%d esc." % ["Normal" if name == "normal" else "Crítico", hp, shield] if has_damage else ""
		if healing > 0: label += " · +%d cura" % healing
		if granted > 0: label += " · +%d escudo" % granted
		if energy > 0: label += " · +%d energia" % energy
		if not has_damage and not statuses.is_empty(): label += " · " + ", ".join(statuses.map(func(k): return Fighter.STATUS_NAMES.get(k, "Purificação")))
		totals.append(label.trim_prefix(" · "))
	app.feedback.text = "[center][color=#67e8f9]PRÉVIA · %s · custo %d EN[/color]\n%s[/center]" % [action.name, action.get("cost", 0), "  |  ".join(totals)]
	var actor: Dictionary = app.combat.current(app.state)
	var hero: Dictionary = app.catalog.hero_by_id[actor.heroId]
	var chance: float = minf(1.0,float(app.combat.rules.critical.chance)+(float(app.combat.rules.classPassives.igneoCriticalChance) if hero.classId=="igneo" else 0.0)+float(action.get("criticalChance",0)))
	app.feedback.tooltip_text = "\n".join(details) + "\n" + action.description + ("\nCrítico: chance de %s." % RulesText.percent(chance) if has_damage else "") + " Valores excluem efeitos do próximo turno; incluem reações ao golpe."
