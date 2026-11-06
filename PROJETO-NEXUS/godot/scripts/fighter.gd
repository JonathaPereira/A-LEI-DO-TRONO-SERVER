extends Button
signal targeted(unit_id: String)
const StatusStrip = preload("res://scripts/status_strip.gd")
const Meter = preload("res://scripts/meter.gd")
const Glyph = preload("res://scripts/glyph.gd")
const ATLAS = preload("res://assets/clean-atlas.png")
const CHARACTER_SHADER = preload("res://shaders/character.gdshader")
const SPECIAL = {0: "veyra", 4: "sylva", 8: "axion", 12: "astra", 16: "vesper", 20: "auren"}
const RulesText = preload("res://scripts/rules_text.gd")
static var STATUS_NAMES: Dictionary = RulesText.status_names()
static var texture_cache: Dictionary = {}
static var region_cache: Dictionary = {}
static var pose_regions: Dictionary = {}
static var art_cache: Dictionary = {}
var unit_id := ""
var hero_id := ""
var tint := Color.WHITE
var active := false
var chosen := false
var available := false
var motion_enabled := true
var posing := false
var elapsed := 0.0
var dead := false
var base_tooltip := ""
var display_data: Dictionary = {}
var depth := 1.0
var pose_index := -1
var visual_root: Node2D
var artwork: TextureRect
var resting_art: Texture2D
var material_fx: ShaderMaterial
var formation_slot := -1
var hero_name := ""
var role_name := ""
var position_label: Label
var reaction_until := 0
var title: Label
var health: Control
var energy: Control
var shield: Control
var shield_label: Label
var stats: Label
var status_label: Label
var status_strip: Control
var indicator: Label
var spatial_presentation := false
var spatial_foot := Vector2.ZERO
var spatial_head := Vector2.ZERO
var affinity_label: Label
var relationship: Label
var plate: Panel

static func prepare_poses(id: String) -> void:
	var key := id+"-poses"
	if not texture_cache.has(key) and ResourceLoader.exists("res://assets/poses/%s.png" % id):
		texture_cache[key]=load("res://assets/poses/%s.png" % id)

static func portrait(index: int, full_body: bool = false) -> Texture2D:
	var key := "%d-%s" % [index,full_body]
	if art_cache.has(key): return art_cache[key]
	var texture := AtlasTexture.new()
	texture.filter_clip = true
	if region_cache.is_empty(): region_cache = JSON.parse_string(FileAccess.get_file_as_string("res://data/art-regions.json"))
	if region_cache.get("_refined", {}).has(str(index)):
		var data: Dictionary = region_cache._refined[str(index)]
		if not texture_cache.has(data.file): texture_cache[data.file] = load("res://assets/characters/" + data.file)
		texture.atlas = texture_cache[data.file]
		var bounds: Array = data.body if full_body else data.portrait
		texture.region = Rect2(bounds[0], bounds[1], bounds[2], bounds[3])
	elif SPECIAL.has(index):
		var id: String = SPECIAL[index]
		if not texture_cache.has(id): texture_cache[id] = load("res://assets/characters/%s.png" % id)
		texture.atlas = texture_cache[id]
		var region: Array = region_cache[id]["body" if full_body else "portrait"]
		texture.region = Rect2(region[0], region[1], region[2], region[3])
	else:
		texture.atlas = ATLAS
		var bounds: Array = region_cache._legacy[str(index)]
		var region := Rect2(bounds[0], bounds[1], bounds[2], bounds[3])
		texture.region = region if full_body else Rect2(region.position + Vector2(region.size.x * 0.15, 0), Vector2(region.size.x * 0.7, region.size.y * 0.6))
	art_cache[key]=texture
	return texture

func setup(hero: Dictionary, id: String, color: Color) -> void:
	unit_id = id
	hero_id = hero.get("visualHero", hero.id)
	hero_name = hero.name
	role_name = hero.role
	tint = color
	name = id
	flat = true
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	size = Vector2(186, 350)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for style in ["normal", "pressed", "hover", "disabled", "hover_pressed"]:
		add_theme_stylebox_override(style, StyleBoxEmpty.new())
	var focus := StyleBoxFlat.new()
	focus.bg_color = Color(0, 0, 0, 0)
	focus.border_color = color
	focus.set_border_width_all(1)
	focus.set_corner_radius_all(8)
	add_theme_stylebox_override("focus", focus)
	visual_root = Node2D.new()
	visual_root.position = Vector2(93, 257)
	add_child(visual_root)
	artwork = TextureRect.new()
	resting_art = portrait(int(hero.index), true)
	artwork.texture = resting_art
	artwork.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	artwork.stretch_mode = TextureRect.STRETCH_SCALE
	_rest_pose()
	artwork.flip_h = id.begins_with("1-") != bool(hero.get("facesLeft", false))
	artwork.mouse_filter = Control.MOUSE_FILTER_IGNORE
	material_fx = ShaderMaterial.new()
	material_fx.shader = CHARACTER_SHADER
	artwork.material = material_fx
	visual_root.add_child(artwork)
	indicator = _label("EM AÇÃO", 11, Color("f8dc9d"))
	indicator.size = Vector2(186, 18)
	indicator.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(indicator)
	affinity_label = _label("", 12, color)
	affinity_label.size = Vector2(186, 20)
	affinity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	affinity_label.text = {"igneo": "ÍGNEO", "natural": "NATURAL", "tecnico": "TÉCNICO", "arcano": "ARCANO", "sombrio": "SOMBRIO", "lumi": "LUMI"}[hero.classId]
	add_child(affinity_label)
	relationship = _label("", 12, Color("ffd7a2"))
	relationship.size = Vector2(186, 20)
	relationship.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(relationship)
	plate = Panel.new()
	plate.position = Vector2(-5, 264)
	plate.size = Vector2(232, 148)
	plate.clip_contents = true
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.z_index = 50
	var box := StyleBoxFlat.new()
	box.bg_color = Color("081525f5")
	box.border_color = color.darkened(0.32)
	box.set_border_width_all(1)
	box.set_corner_radius_all(7)
	box.shadow_color = Color(0, 0, 0, 0.30)
	box.shadow_size = 4
	box.shadow_offset = Vector2(0, 2)
	plate.add_theme_stylebox_override("panel", box)
	add_child(plate)
	remove_child(indicator)
	plate.add_child(indicator)
	indicator.position = Vector2(190, 2)
	indicator.size = Vector2(14, 18)
	title = _label(hero.name, 14, Color("f3f8ff"))
	if ResourceLoader.exists("res://assets/space-grotesk.ttf"):
		title.add_theme_font_override("font", load("res://assets/space-grotesk.ttf"))
	title.position = Vector2(8, 1)
	title.size = Vector2(182, 20)
	plate.add_child(title)
	title.position.x = 42
	title.size.x = 144
	var thumbnail := TextureRect.new()
	thumbnail.texture = portrait(int(hero.index))
	thumbnail.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	thumbnail.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	thumbnail.position = Vector2(7,3)
	thumbnail.size = Vector2(29,30)
	thumbnail.mouse_filter = MOUSE_FILTER_IGNORE
	plate.add_child(thumbnail)
	var glyph = Glyph.new()
	glyph.symbol = hero.classId
	glyph.tint = color
	glyph.position = Vector2(209, 3)
	glyph.size = Vector2(17, 17)
	plate.add_child(glyph)
	# Affinity/relationship share one fixed line, keeping all three meters legible.
	remove_child(affinity_label)
	plate.add_child(affinity_label)
	affinity_label.position = Vector2(42, 21)
	affinity_label.size = Vector2(182, 14)
	affinity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	affinity_label.add_theme_font_size_override("font_size", 11)
	affinity_label.text += " · " + hero.role
	remove_child(relationship)
	plate.add_child(relationship)
	relationship.position = Vector2(42, 21)
	relationship.size = Vector2(182, 14)
	relationship.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	relationship.add_theme_font_size_override("font_size", 11)
	health = Meter.new()
	health.fill = Color("59d9aa")
	health.position = Vector2(8, 38)
	health.size = Vector2(216, 16)
	plate.add_child(health)
	energy = Meter.new()
	energy.fill = Color("9b8af0")
	energy.position = Vector2(8, 57)
	energy.size = Vector2(216, 13)
	plate.add_child(energy)
	shield = Meter.new()
	shield.fill = Color("429fcc")
	shield.position = Vector2(8, 73)
	shield.size = Vector2(216, 13)
	plate.add_child(shield)
	stats = _label("", 11, Color("cedaee"))
	stats.visible = false
	plate.add_child(stats)
	shield_label = _label("", 11, Color("83d8ff"))
	shield_label.visible = false
	plate.add_child(shield_label)
	status_label = _label("", 10, Color("ffc394"))
	status_label.position = Vector2(8, 88)
	status_label.size = Vector2(216, 14)
	status_label.max_lines_visible = 1
	plate.add_child(status_label)
	status_label.hide()
	status_strip = StatusStrip.new()
	status_strip.position = Vector2(8,92)
	status_strip.size = Vector2(216,53)
	plate.add_child(status_strip)
	position_label = _label("", 11, Color("c5d8e9"))
	position_label.position = Vector2(-5, 259)
	position_label.size = Vector2(196, 18)
	position_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(position_label)
	pressed.connect(func(): targeted.emit(unit_id))
	base_tooltip = "%s · %s\nPV %d · ATQ %d · DEF %d · VEL %d" % [hero.name, hero.role, hero.hp, hero.attack, hero.defense, hero.speed]
	tooltip_text = base_tooltip
	set_depth(1.0)

func _label(text_value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.text = text_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color("06101b"))
	label.add_theme_constant_override("outline_size", 3)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func set_depth(value: float) -> void:
	depth = value
	visual_root.scale = Vector2.ONE * depth
	position_label.position.y = 260

func set_relationship(multiplier: float, relevant: bool) -> void:
	relationship.visible = relevant and not dead and multiplier != 1.0
	affinity_label.visible = not relationship.visible
	relationship.text = affinity_label.text.split(" · ")[0] + " · " + RulesText.relationship(multiplier).to_upper()
	relationship.add_theme_color_override("font_color", Color("ff9ba3") if multiplier > 1 else Color("91efbc"))

func foot_position() -> Vector2:
	if spatial_presentation: return spatial_foot
	return position + visual_root.position

func hit_position() -> Vector2:
	if spatial_presentation: return spatial_head.lerp(spatial_foot, 0.3)
	return foot_position() - Vector2(0, 108 * depth)

func use_spatial_presentation() -> void:
	spatial_presentation = true
	visual_root.hide()
	position_label.hide()
	queue_redraw()

func set_spatial_anchor(foot: Vector2, head: Vector2) -> void:
	spatial_foot = foot
	spatial_head = head
	position = foot - Vector2(93, 257)
	depth = clampf((foot.y - head.y) / 200.0, 0.45, 1.3)

func set_pose(frame: int) -> void:
	pose_index = frame
	if frame < 0:
		_rest_pose()
		material_fx.set_shader_parameter("exclusion_count", 0)
		return
	if pose_regions.is_empty() and FileAccess.file_exists("res://data/pose-regions.json"):
		pose_regions = JSON.parse_string(FileAccess.get_file_as_string("res://data/pose-regions.json"))
	if not pose_regions.has(hero_id): return
	var key := hero_id + "-poses"
	if not texture_cache.has(key): texture_cache[key] = load("res://assets/poses/%s.png" % hero_id)
	var texture := AtlasTexture.new()
	texture.atlas = texture_cache[key]
	texture.filter_clip = true
	var data: Dictionary = pose_regions[hero_id].frames[frame]
	var rect: Array = data.rect
	texture.region = Rect2(rect[0], rect[1], rect[2], rect[3])
	artwork.texture = texture
	var factor: float = pose_regions[hero_id].scale
	artwork.size = Vector2(rect[2], rect[3]) * factor
	var foot_x: float = float(rect[2]) - data.foot[0] if artwork.flip_h else float(data.foot[0])
	artwork.position = -Vector2(foot_x, data.foot[1]) * factor
	var excluded: Array[Vector4] = []
	for region in data.exclude: excluded.append(Vector4(region[0], region[1], region[2], region[3]))
	while excluded.size() < 8: excluded.append(Vector4.ZERO)
	material_fx.set_shader_parameter("excluded_regions", PackedVector4Array(excluded.slice(0, 8)))
	material_fx.set_shader_parameter("exclusion_count", mini(8, data.exclude.size()))

func _rest_pose() -> void:
	artwork.texture = resting_art
	var source_size := Vector2(resting_art.get_size())
	var factor := minf(188.0 / source_size.x, 200.0 / source_size.y)
	artwork.size = source_size * factor
	# Anchor the texture's actual lower edge to the feet, including wide silhouettes.
	artwork.position = Vector2(-artwork.size.x * 0.5, -artwork.size.y)

func _has_point(point: Vector2) -> bool:
	var plate_point := plate.get_transform().affine_inverse() * point
	var in_plate := Rect2(Vector2.ZERO, plate.size).has_point(plate_point)
	if spatial_presentation:
		var height := maxf(60, spatial_foot.y - spatial_head.y)
		return Rect2(spatial_head - position - Vector2(height * 0.3, 8), Vector2(height * 0.6, height + 8)).has_point(point) or in_plate
	return Rect2(Vector2(93 - 90 * depth, 257 - 200 * depth), Vector2(180 * depth, 200 * depth)).has_point(point) or in_plate

func _process(delta: float) -> void:
	if not is_visible_in_tree(): return
	if spatial_presentation: return
	if not is_instance_valid(visual_root): return
	elapsed += delta
	if not posing and Time.get_ticks_msec() >= reaction_until:
		visual_root.scale = Vector2(1, 1 + sin(elapsed * 1.8 + hero_id.length()) * 0.006) * depth if motion_enabled and not dead else Vector2.ONE * depth
		material_fx.set_shader_parameter("bend", sin(elapsed * 1.4) * 1.8 if motion_enabled and not dead else 0.0)
	queue_redraw()

func reset_pose() -> void:
	posing = false
	set_pose(-1)
	visual_root.position = Vector2(93, 257)
	visual_root.rotation = 0
	visual_root.scale = Vector2.ONE * depth
	visual_root.modulate = Color.WHITE
	visual_root.z_index = 0
	material_fx.set_shader_parameter("flash", 0.0)
	material_fx.set_shader_parameter("bend", 0.0)

func refresh(data: Dictionary, is_active: bool, is_chosen: bool, can_target: bool) -> void:
	display_data = data.duplicate(true)
	active = is_active
	chosen = is_chosen
	available = can_target
	dead = data.hp <= 0
	if dead: relationship.visible = false
	health.max_value = data.maxHp
	health.value = data.hp
	energy.value = data.energy
	energy.max_value = RulesText.rules.energy.maximum
	shield.max_value = round(data.maxHp * float(RulesText.rules.shield.maxHpRatio))
	shield.value = data.shield
	shield_label.text = "ESCUDO  %d" % data.shield
	health.caption = "VIDA  %d / %d" % [data.hp, data.maxHp]
	energy.caption = "ENERGIA  %d / %d" % [data.energy, int(RulesText.rules.energy.maximum)]
	shield.tooltip_text = "Camadas independentes: expiram no início da rodada indicada. Limite total: 25% da vida."
	for layer in data.get("shieldLayers", []): shield.tooltip_text += "\n%d de escudo · expira na rodada %d" % [layer.amount,layer.expiresRound]
	shield.caption = "ESCUDO  %d / %d%s" % [data.shield, int(shield.max_value), (" · %dR" % data.get("shieldTurns", 0)) if data.shield > 0 and data.get("shieldTurns", 0) > 0 else " · AGORA" if data.shield > 0 else ""]
	shield_label.modulate.a = 1.0 if data.shield > 0 else 0.55
	stats.text = "%d/%d PV · %d EN" % [data.hp, data.maxHp, data.energy]
	var states: Array = []
	var compact: Array = []
	if data.guarding:
		states.append("Defesa: −%s de dano até o próximo turno" % RulesText.percent(1 - RulesText.rules.guard.incomingDamageMultiplier))
		compact.append("Defesa")
	for status in data.statuses:
		var duration: int = int(status.turns)
		states.append("%s · %s" % [STATUS_NAMES.get(status.type, status.type), "%d turno(s) restante(s)" % duration if duration > 0 else "expira após esta ação"])
		compact.append("%s %s" % [{"darkmark": "Drena", "sentinel": "Sentinela", "elementalWard": "Égide", "burn": "Queima", "bleed": "Sangra/Cura↓", "regen": "Regen", "weaken": "ATQ↓", "expose": "DEF↓", "empower": "ATQ↑", "fortify": "Fortif.", "cover": "Proteg.", "mirror": "Reflexo", "riposte": "Contra", "taunt": "Provoca", "emberguard": "Brasa", "focus": "Foco", "seed": "Semente"}.get(status.type, status.type), "%dT" % duration if duration > 0 else "•"])
	if compact.size() > 2: compact = compact.slice(0, 1) + ["+%d estados" % (compact.size() - 1)]
	status_label.text = "DERROTADO" if dead else " · ".join(compact)
	status_strip.configure(data.statuses, data.guarding, hero_name, dead)
	status_label.tooltip_text = "\n".join(states)
	tooltip_text = base_tooltip + "\nCamadas independentes; cada aplicação dura %d rodadas globais.\nEscudo: %d / %d máximo" % [int(RulesText.rules.shield.durationRounds), data.shield, int(shield.max_value)] + ("\n\nESTADOS\n" + "\n".join(states) if not states.is_empty() else "")
	if data.has("gem"):
		var gems: Variant = data.gem
		var summary: String = " · ".join(gems) if gems is Array else str(gems)
		tooltip_text += "\n\nENGASTES DE CAMPANHA\n" + summary
	artwork.modulate = Color(0.35, 0.4, 0.5, 0.4) if dead else Color.WHITE
	indicator.text = "◇" if chosen and available else "●"
	indicator.visible = (active or (chosen and available)) and not dead
	indicator.add_theme_color_override("font_color", Color("f6da97") if chosen and available else Color("99f5e5"))
	var box: StyleBoxFlat = plate.get_theme_stylebox("panel")
	box.bg_color = Color("102438fa") if active else Color("081525f5")
	box.border_color = tint.lightened(0.15) if active else (Color("e5c38c") if chosen and available else tint.darkened(0.45))
	box.set_border_width_all(2 if active or (chosen and available) else 1)
	plate.queue_redraw()
	queue_redraw()

func apply_tick(event: Dictionary) -> void:
	var data := display_data.duplicate(true)
	data.hp = event.hpAfter
	data.shield = event.shieldAfter
	if event.get("source", "") != "darkmark": data.guarding = false
	if event.has("remaining"):
		var type: String = "regen" if event.type == "heal" else event.type
		for status in data.statuses:
			if status.type == type: status.turns = event.remaining
		data.statuses = data.statuses.filter(func(s): return s.turns > 0 or not s.type in ["burn", "bleed", "darkmark", "regen"])
	refresh(data, true, false, false)

func _draw() -> void:
	if spatial_presentation: return
	if not is_instance_valid(visual_root): return
	var center := Vector2(93, 258)
	var points := PackedVector2Array()
	for i in range(49): points.append(center + Vector2(cos(TAU * i / 48.0) * 56 * depth, sin(TAU * i / 48.0) * 10 * depth))
	draw_colored_polygon(points, Color(0, 0, 0, 0.20))
	var contact := PackedVector2Array()
	for i in range(49): contact.append(center + Vector2(cos(TAU * i / 48.0) * 30 * depth, sin(TAU * i / 48.0) * 5 * depth))
	draw_colored_polygon(contact, Color(0, 0, 0, 0.55))
	if active or chosen or available:
		var ring := tint.lightened(0.2) if active else Color("f1c98f")
		var pulse: float = 0.88 + sin(elapsed * 2.6) * 0.12 if motion_enabled else 1.0
		ring.a = 0.86 * pulse if active or chosen else 0.24
		# Short arcs describe an active targeting ring while preserving the broad
		# contact shadow that grounds every body on the arena floor.
		for sector in range(4):
			var arc := PackedVector2Array()
			for i in range(13):
				var angle: float = TAU * (float(sector) / 4 + float(i) / 64)
				arc.append(center + Vector2(cos(angle) * 57 * depth, sin(angle) * 11 * depth))
			draw_polyline(arc, ring, 2 if active or chosen else 1, true)
		if active or chosen:
			var soft := ring
			soft.a *= 0.14
			draw_colored_polygon(points, soft)

func set_formation(slot: int) -> void:
	formation_slot = slot
	var caption: String = ["FRENTE", "ATRÁS ↑", "ATRÁS ↓"][slot] if slot >= 0 else ""
	title.text = hero_name + (" · " + caption if slot >= 0 else "")
	title.tooltip_text = title.text
	position_label.text = ("CHEFE · " if role_name == "Chefe" else "") + caption
	position_label.visible = slot >= 0
	position_label.tooltip_text = "Posição visual. Qualquer inimigo pode ser escolhido, salvo Provocação."
