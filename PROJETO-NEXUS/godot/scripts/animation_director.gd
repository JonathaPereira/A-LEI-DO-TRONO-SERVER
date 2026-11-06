extends RefCounted
const Impact = preload("res://scripts/impact_modern.gd")
const Fighter = preload("res://scripts/fighter.gd")
const Ultimate = preload("res://scripts/ultimate_2d.gd")
const AbilityArt = preload("res://scripts/ability_art.gd")
const Receipt = preload("res://scripts/damage_receipt.gd")
const ReceiptLink = preload("res://scripts/receipt_link.gd")
const Bloom = preload("res://scripts/impact_bloom.gd")
const AreaWave = preload("res://scripts/area_wave.gd")
const Echo = preload("res://scripts/attack_echo.gd")
const Signature = preload("res://scripts/hero_signature.gd")
const Quality = preload("res://scripts/presentation_quality.gd")
const PROFILES = {"igneo": "flame_dash", "natural": "verdant_bloom", "tecnico": "ion_cannon", "arcano": "astral_rift", "sombrio": "shadow_step", "lumi": "dawn_lance"}
var generation := 0
var tweens: Array[Tween] = []
var last_profile := ""
var impact_count := 0
var last_numbers: Array[String] = []
var transients: Array[Node] = []
var posed_fighters: Array = []
var receipt_bounds: Array[Rect2] = []
var last_timing: Dictionary = {}
var spatial_body_bounds: Array[Rect2] = []
var flat_receipts := true

func cancel(preserve_receipts := false) -> void:
	generation += 1
	for tween in tweens: tween.kill()
	tweens.clear()
	for fighter in posed_fighters:
		if is_instance_valid(fighter) and not fighter.is_queued_for_deletion(): fighter.reset_pose()
	posed_fighters.clear()
	var retained: Array[Node] = []
	for node in transients:
		if not is_instance_valid(node): continue
		if preserve_receipts and (node is Receipt or node is ReceiptLink) and not node.is_queued_for_deletion():
			retained.append(node)
		else: node.queue_free()
	transients = retained
	receipt_bounds.clear()
	spatial_body_bounds.clear()

func _tween(owner: Node) -> Tween:
	var tween := owner.create_tween()
	tweens.append(tween)
	return tween

func _effect(effects: Control, origin: Vector2, destination: Vector2, hero: Dictionary, kind: String, phase: String, ultimate: bool, duration: float, tier := "basic") -> void:
	var effect = Impact.new()
	effect.origin = origin
	effect.destination = destination
	effect.tint = Color(hero.get("color", "ffffff"))
	effect.affinity = hero.classId
	effect.signature = hero.get("animation", "")
	effect.kind = kind
	effect.phase = phase
	effect.ultimate = ultimate
	effect.duration = duration
	effect.tier = tier
	effect.z_index = -18 # Energy passes behind the fixed vitality cards.
	effects.add_child(effect)
	transients.append(effect)

func play_spatial(owner: Node, stage: Control, effects: Control, fighters: Dictionary, hero: Dictionary, action: Dictionary, result: Dictionary, reduced: bool, on_impact: Callable) -> bool:
	cancel(true)
	flat_receipts = false
	last_numbers.clear()
	last_profile = hero.animation
	var version := generation
	var actor = fighters[result.actor]
	actor.posing = true
	posed_fighters.append(actor)
	var cue := Label.new()
	cue.text = "%s  /  %s" % [hero.name.to_upper(), action.name.to_upper()]
	cue.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cue.add_theme_font_size_override("font_size", 17)
	cue.add_theme_color_override("font_color", Color("f3d5a2") if result.actionId == "ultimate" else Color("c8f5ff"))
	cue.add_theme_color_override("font_outline_color", Color("050c16"))
	cue.add_theme_constant_override("outline_size", 6)
	cue.position = Vector2(maxf(0, effects.size.x * 0.5 - 260), 12)
	cue.size = Vector2(520, 28)
	cue.mouse_filter = Control.MOUSE_FILTER_IGNORE
	effects.add_child(cue)
	transients.append(cue)
	var targets: Array = []
	for event in result.events:
		if event.type in ["damage", "heal", "shield", "guard", "support", "status"] and not event.get("passive", false) and not event.get("reaction", false) and not event.get("intercepted", false) and not event.target in targets:
			targets.append(event.target)
	if targets.is_empty(): targets.append(result.actor)
	var presentation := action.duplicate(true)
	presentation.tier = result.actionId
	presentation.animation = hero.animation
	presentation.classId = hero.classId
	# The stage calls this once, at physical contact. Pending combat state is only
	# committed by main after recovery, exactly as in the original presentation.
	var impact := func():
		if version != generation: return
		if is_instance_valid(cue): cue.hide()
		on_impact.call()
		impact_count += 1
		var groups: Dictionary = {}
		for event in result.events:
			if not fighters.has(event.get("target", "")): continue
			if not groups.has(event.target): groups[event.target] = []
			groups[event.target].append(event)
		for id in groups:
			var target = fighters[id]
			spatial_body_bounds.clear()
			for body_id in fighters:
				spatial_body_bounds.append(stage.projected_body_rect(body_id))
			_number(owner, effects, target.hit_position() + Vector2(-105, -30), {"events": groups[id], "actionName": action.name}, target, fighters)
	var completed: bool = await stage.play_attack(result.actor, targets, presentation, reduced, impact)
	last_timing = stage.last_timing.duplicate()
	if version != generation or not completed: return false
	if is_instance_valid(cue): cue.queue_free()
	actor.reset_pose()
	return true

func play(owner: Node, effects: Control, fighters: Dictionary, hero: Dictionary, action: Dictionary, result: Dictionary, reduced: bool, on_impact: Callable) -> bool:
	cancel()
	flat_receipts = true
	last_numbers.clear()
	var version := generation
	last_profile = hero.animation
	var actor = fighters[result.actor]
	if reduced:
		await owner.get_tree().process_frame
		if version != generation: return false
		on_impact.call()
		impact_count += 1
		return true
	var tier: String = str(result.actionId)
	var timing := {"charge": 0.96, "travel": 0.42, "hold": 0.22, "recover": 1.20} if tier == "ultimate" else {"charge": 0.56, "travel": 0.34, "hold": 0.16, "recover": 0.88} if tier == "skill" else {"charge": 0.36, "travel": 0.28, "hold": 0.10, "recover": 0.70}
	last_timing = timing.duplicate()
	var art_hero: Dictionary = hero.duplicate()
	art_hero.color = actor.tint.to_html()
	var signature: String = hero.animation
	var ultimate: bool = tier == "ultimate"
	var support: bool = action.kind.begins_with("heal") or action.kind.begins_with("shield") or action.kind == "guard" or action.kind.begins_with("support")
	var melee: bool = not support and signature in ["sweep", "crater", "roots", "prism", "crescent", "daggers", "eruption", "plates", "rift", "claws", "lance", "rays"]
	actor.posing = true
	posed_fighters.append(actor)
	actor.visual_root.z_index = 30
	actor.set_pose(1)
	var home: Vector2 = actor.visual_root.position
	var direction := -1.0 if actor.artwork.flip_h else 1.0
	var targets: Array = result.events.filter(func(e): return e.type in ["damage", "heal", "shield", "guard", "support"] and fighters.has(e.target) and not e.get("passive", false) and not e.get("reaction", false) and not e.get("intercepted", false))
	var primary = fighters[targets[0].target] if not targets.is_empty() else actor
	var area_wave: Control
	if action.kind == "aoe" and not support:
		area_wave = AreaWave.new()
		area_wave.affinity = hero.classId
		area_wave.signature = signature
		area_wave.tint = actor.tint
		area_wave.z_index = -55
		for event in targets:
			var foot: Vector2 = fighters[event.target].foot_position()
			if not foot in area_wave.destinations: area_wave.destinations.append(foot)
		effects.add_child(area_wave)
		transients.append(area_wave)
	var audio = owner.get("sound") if owner.get("sound") != null else owner.get("audio")
	if is_instance_valid(audio): audio.begin_action(hero,action,tier)
	var origin: Vector2 = actor.hit_position()
	var ultimate_scene: Control
	if ultimate:
		ultimate_scene = Ultimate.new()
		ultimate_scene.z_index = -20
		ultimate_scene.origin = actor.foot_position()
		ultimate_scene.affinity = hero.classId
		ultimate_scene.signature = signature
		ultimate_scene.tint = actor.tint
		ultimate_scene.title = action.name
		ultimate_scene.icon = AbilityArt.icon(int(hero.index), "ultimate")
		ultimate_scene.support = support
		ultimate_scene.action_kind = action.kind
		for event in targets:
			var at: Vector2 = fighters[event.target].foot_position()
			if not at in ultimate_scene.destinations: ultimate_scene.destinations.append(at)
		effects.add_child(ultimate_scene)
		transients.append(ultimate_scene)
	_effect(effects, origin, origin, art_hero, action.kind, "charge", ultimate, timing.charge + 0.06, tier)
	var anticipate := _tween(owner).set_parallel(true)
	var heavy: bool = signature in ["crater", "roots", "hex", "eruption", "plates", "claws"]
	var floating: bool = signature in ["orbit", "runes", "threads", "spiral"]
	anticipate.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var motion: Array = Signature.MOTION.get(signature,[-.055,-3.0])
	anticipate.tween_property(actor.visual_root, "rotation", float(motion[0]) * direction, timing.charge)
	anticipate.tween_method(func(v): actor.material_fx.set_shader_parameter("bend", v), 0.0, -6.0 * direction, timing.charge)
	anticipate.tween_property(actor.visual_root, "position", home + Vector2((-16 if melee else -7) * direction, float(motion[1])), timing.charge)
	anticipate.tween_property(actor.visual_root, "scale", Vector2(1.025 if heavy else 0.985, 0.97 if heavy else 1.02) * actor.depth, timing.charge)
	await owner.get_tree().create_timer(timing.charge).timeout
	if not _valid(version, actor): return false
	if is_instance_valid(ultimate_scene): ultimate_scene.release()
	actor.set_pose(3 if ultimate else 2)
	var contact: Vector2 = primary.foot_position() - (actor.position + home) - Vector2(116 * direction, 0)
	var strike := _tween(owner).set_parallel(true)
	strike.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	if melee:
		if signature in ["crater", "roots", "eruption"]:
			strike.tween_method(func(p):
				actor.visual_root.position = home + contact * p - Vector2(0, sin(p * PI) * (76 if ultimate else 48)), 0.0, 1.0, timing.travel)
			strike.tween_property(actor.visual_root, "rotation", 0.18 * direction, timing.travel)
		else:
			strike.tween_property(actor.visual_root, "position", home + contact, timing.travel)
			strike.tween_property(actor.visual_root, "rotation", (0.18 if signature == "sweep" else 0.11 if signature == "prism" else -0.06) * direction, timing.travel)
			if signature in ["crescent", "daggers", "rift"]: strike.tween_property(actor.visual_root, "modulate:a", 0.42, timing.travel * 0.65)
	elif signature in ["volley", "thorns"]:
		strike.tween_property(actor.visual_root, "rotation", 0.12 * direction, timing.travel * 0.75)
		strike.tween_property(actor.visual_root, "scale", Vector2(0.95, 1.05) * actor.depth, timing.travel)
		strike.tween_property(actor.visual_root, "position", home + Vector2(11 * direction, -4), timing.travel)
	elif signature == "rail":
		strike.tween_property(actor.visual_root, "position", home + Vector2(-27 * direction, 4), timing.travel * 0.45)
		strike.tween_property(actor.visual_root, "rotation", -0.095 * direction, timing.travel * 0.45)
	elif signature in ["orbit", "runes", "drones", "threads", "spiral"]:
		strike.tween_property(actor.visual_root, "position", home - Vector2(0, 31 if signature == "orbit" else 20 if signature == "runes" else 12), timing.travel)
		strike.tween_property(actor.visual_root, "rotation", (-0.045 if signature == "threads" else 0.035) * direction, timing.travel)
	else:
		strike.tween_property(actor.visual_root, "scale", Vector2(1.05, 0.96) * actor.depth, timing.travel)
		strike.tween_property(actor.visual_root, "position", home + Vector2(7 * direction, 4), timing.travel)
	var travelling: Dictionary = {}
	for event in targets:
		if travelling.has(event.target): continue
		travelling[event.target]=true
		_effect(effects, origin, fighters[event.target].hit_position(), art_hero, event.type, "travel", ultimate, timing.travel, tier)
	for segment in range(3):
		await owner.get_tree().create_timer(timing.travel / 3.0).timeout
		if not _valid(version, actor): return false
		if melee and segment < (2 if Quality.level==2 else 1):
			var echo := Echo.new()
			echo.snapshot(actor, actor.tint)
			effects.add_child(echo)
			transients.append(echo)
	# The only logical callback. Contact is a pose hold, never global time scaling.
	on_impact.call()
	impact_count += 1
	if owner.has_method("_screen_impact"): owner._screen_impact(primary.hit_position(),actor.tint,ultimate)
	if is_instance_valid(ultimate_scene): ultimate_scene.impact()
	if is_instance_valid(area_wave): area_wave.impact()
	actor.visual_root.modulate.a = 1.0
	for fighter in fighters.values():
		spatial_body_bounds.append(Rect2(fighter.foot_position()-Vector2(fighter.artwork.size.x*fighter.depth*.5,fighter.artwork.size.y*fighter.depth),fighter.artwork.size*fighter.depth))
	var receivers := {}
	var reactions := {}
	var painted: Dictionary = {}
	for event in result.events:
		if not fighters.has(event.get("target", "")): continue
		if not receivers.has(event.target): receivers[event.target] = []
		receivers[event.target].append(event)
	for event in _visual_events(result.events):
		if not fighters.has(event.get("target", "")): continue
		var target = fighters[event.target]
		if not event.has("amount"): continue
		if not target in posed_fighters: posed_fighters.append(target)
		var impact_kind: String = event.type
		if event.get("absorbed", 0) > 0: impact_kind = "shieldBreak" if event.shieldAfter == 0 else "shieldHit"
		if not painted.has(event.target):
			painted[event.target]=true
			_effect(effects, actor.hit_position(), target.hit_position(), art_hero, impact_kind, "impact", ultimate, 0.94 if ultimate else 0.74, tier)
			var motif := Signature.new()
			motif.signature=signature
			motif.tint=actor.tint
			motif.tier=tier
			motif.position=target.hit_position()
			motif.scale.x=direction
			effects.add_child(motif)
			transients.append(motif)
		target.material_fx.set_shader_parameter("flash_color", Color("a5efc2") if event.type == "heal" else Color("a2dcff") if event.get("absorbed", 0) > 0 else Color.WHITE)
		target.material_fx.set_shader_parameter("flash", 0.88 if event.type == "damage" else 0.55)
		if (event.type == "damage" or (event.type == "heal" and signature == "runes" and not event.get("passive",false))) and not event.get("reaction",false) and not event.get("intercepted",false):
			var bloom := Bloom.new()
			bloom.element = Bloom.element_for(hero)
			bloom.extent = 275 if ultimate else 220 if tier == "skill" else 140
			bloom.critical = event.get("critical",false)
			bloom.position = target.hit_position()
			bloom.z_index = -12
			effects.add_child(bloom)
			transients.append(bloom)
		if event.type == "damage" and target != actor:
			reactions[event.target] = target
			target.reaction_until = Time.get_ticks_msec() + int((timing.hold + 0.60) * 1000)
			_recoil(owner,target,direction,timing.hold,1.35 if ultimate or event.get("critical",false) else 1.0)
	for id in receivers:
		var target = fighters[id]
		_number(owner, effects, target.hit_position() + Vector2(-94, -57), {"events": receivers[id], "actionName": action.name, "compactArea": action.kind in ["aoe","healAll","shieldAll","supportAll"]}, target, fighters)
	await owner.get_tree().create_timer(timing.hold).timeout
	if not _valid(version, actor): return false
	for id in receivers:
		var target = fighters[id]
		var flash := _tween(owner)
		flash.tween_method(func(v):
			if is_instance_valid(target): target.material_fx.set_shader_parameter("flash", v), 0.72, 0.0, 0.28)
	actor.set_pose(3)
	var recover := _tween(owner).set_parallel(true)
	var return_time: float = timing.recover * (0.58 if ultimate else 0.66)
	recover.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	recover.tween_property(actor.visual_root, "position", home, return_time)
	recover.tween_property(actor.visual_root, "rotation", 0.0, return_time)
	recover.tween_property(actor.visual_root, "scale", Vector2.ONE * actor.depth, return_time)
	recover.tween_method(func(v): actor.material_fx.set_shader_parameter("bend", v), -6.0 * direction, 0.0, return_time)
	await owner.get_tree().create_timer(timing.recover).timeout
	if not _valid(version, actor): return false
	actor.reset_pose()
	return true

func _valid(version: int, actor) -> bool:
	return version == generation and is_instance_valid(actor) and not actor.is_queued_for_deletion()

func _recoil(owner: Node, target, direction: float, hold := .12, strength := 1.0) -> void:
	var recoil := _tween(owner).set_parallel(true)
	var target_home := Vector2(93, 257)
	if target.dead:
		recoil.tween_property(target.visual_root, "rotation", .28*direction,.25)
		recoil.tween_property(target.visual_root, "position", target_home+Vector2(20*direction,14),.25)
		recoil.tween_property(target.visual_root, "modulate:a", .25,.5)
	else:
		recoil.tween_property(target.visual_root,"rotation",-.13*direction*strength,.055)
		recoil.tween_property(target.visual_root,"position",target_home+Vector2(20*direction,-4)*strength,.055)
		recoil.tween_property(target.visual_root,"scale",Vector2(.92,1.06)*target.depth,.055)
		recoil.chain().tween_interval(maxf(.03,hold-.055))
		recoil.chain().set_parallel(true)
		recoil.tween_property(target.visual_root,"rotation",0.0,.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		recoil.tween_property(target.visual_root,"position",target_home,.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		recoil.tween_property(target.visual_root,"scale",Vector2.ONE*target.depth,.28)

func play_ticks(owner: Node, effects: Control, fighters: Dictionary, events: Array, reduced: bool, on_tick: Callable) -> bool:
	var version := generation
	for event in events:
		if not event.has("amount"): continue
		if not reduced:
			await owner.get_tree().create_timer(0.38).timeout
			if version != generation: return false
		on_tick.call(event)
		if not reduced:
			_number(owner, effects, fighters[event.target].hit_position() + Vector2(-94, -40), event, fighters[event.target], fighters)
			await owner.get_tree().create_timer(0.95).timeout
			if version != generation: return false
	return true

func _visual_events(events: Array) -> Array:
	var grouped: Array = []
	for event in events:
		if event.type == "heal" and event.get("passive", false):
			var previous: Array = grouped.filter(func(e): return e.type == "heal" and e.target == event.target and e.get("source", "") == event.get("source", "") and e.get("passive", false))
			if not previous.is_empty():
				previous[0].amount += event.amount
				continue
		grouped.append(event.duplicate(true))
	return grouped

static func number_lines(event: Dictionary) -> Array:
	if event.has("lines"): return event.lines
	var lines: Array = []
	if event.get("reaction", false): lines.append(["CONTRA-ATAQUE", "d6bdff", 12])
	if event.get("intercepted", false): lines.append(["PROTETOR", "85dcff", 12])
	if event.has("combo"): lines.append(["COMBO!", "ffd17a", 15])
	if event.get("critical", false): lines.append(["CRÍTICO!", "ffd17a", 22])
	match event.type:
		"damage":
			lines.append(["−%d VIDA" % event.amount if event.amount > 0 else "VIDA PROTEGIDA", "ffc5b3", 21 if event.amount > 0 else 15])
			if event.get("absorbed", 0) > 0:
				lines.append(["−%d ESCUDO" % event.absorbed, "85dcff", 20])
				lines.append(["QUEBRADO · resta 0" if event.shieldAfter == 0 else "Escudo restante: %d" % event.shieldAfter, "85dcff", 12])
			if event.get("advantage", 1.0) > 1.0: lines.append(["VULNERÁVEL +%d%%" % round((float(event.advantage) - 1) * 100), "ffbe9b", 11])
			elif event.get("advantage", 1.0) < 1.0: lines.append(["RESISTENTE −%d%%" % round((1 - float(event.advantage)) * 100), "9fdcff", 11])
		"heal": lines.append(["+%d VIDA" % event.amount, "a1e6b3", 20])
		"shieldExpired":
			lines.append(["ESCUDO EXPIROU", "9ebad2", 15])
			lines.append(["−%d ESCUDO · resta %d" % [event.amount,event.get("shieldAfter",0)], "85dcff", 15])
		"shield", "guard":
			lines.append(["+%d ESCUDO" % event.amount if event.amount > 0 else "LIMITE DE ESCUDO", "85dcff", 20])
			lines.append(["Escudo total: %d" % event.get("shieldAfter", event.amount), "85dcff", 12])
		"energy": lines.append(["+%d ENERGIA" % event.amount, "c6b4ff", 18])
		"support": lines.append(["SUPORTE", "c6b4ff", 15])
		"burn", "bleed", "darkmark", "fracture":
			lines.append([{ "darkmark": "MARCA OBSCURA", "burn": "QUEIMADURA", "bleed": "SANGRAMENTO", "fracture": "FRATURA" }[event.type], "ffae88", 14])
			lines.append(["−%d VIDA" % event.amount, "ffc5b3", 22])
	if event.get("healingPenalty", 0) > 0: lines.append(["CURA −%d%%" % event.healingPenalty, "ffc18a", 13])
	if event.get("passive", false): lines.append(["REGENERAÇÃO" if event.has("remaining") else ("SEMENTE" if event.get("source", "") == "seed" else "DRENO DE VIDA"), "a1e6b3", 12])
	if event.has("remaining"): lines.append(["%d ativação(ões) restante(s)" % event.remaining, "d6dded", 11])
	if event.has("effect"):
		lines.append(["PURIFICADO" if event.effect == "cleanse" else "%s · %dT" % [Fighter.STATUS_NAMES.get(event.effect, event.effect), event.effectTurns], "eac4ee", 12])
	return lines

func _number(_owner: Node, effects: Control, at: Vector2, event: Dictionary, target = null, fighters: Dictionary = {}) -> void:
	var lines: Array = Receipt.event_lines(event.events) if event.has("events") else Receipt.event_lines([event]) if event.has("type") else number_lines(event)
	if lines.is_empty(): return
	for line in lines: last_numbers.append(str(line[0]))
	var receipt := Receipt.new()
	var capacity := 0
	var remaining := -1
	var name_value := ""
	if is_instance_valid(target):
		name_value = target.hero_name
		capacity = int(target.shield.max_value)
		if lines.any(func(line): return str(line[0]).contains("ESCUDO") or str(line[0]).contains("Escudo")):
			remaining = int(target.display_data.get("shield", 0))
	if event.has("events"):
		receipt.configure_events(event.events, name_value, capacity, remaining, event.get("actionName", ""), event.get("compactArea", false))
	elif event.has("type"):
		receipt.configure_events([event], name_value, capacity, remaining)
	else:
		receipt.configure(lines, name_value, capacity, remaining)
	receipt_bounds.clear()
	for transient in transients:
		if is_instance_valid(transient) and transient is Receipt and not transient.is_queued_for_deletion():
			receipt_bounds.append(Rect2(transient.position, transient.size))
	receipt.position = _receipt_position(effects, at, receipt.size, fighters)
	receipt_bounds.append(Rect2(receipt.position, receipt.size))
	effects.add_child(receipt)
	transients.append(receipt)
	if is_instance_valid(target) and receipt.position.distance_to(at) > 120:
		var link := ReceiptLink.new()
		link.receipt = receipt
		link.fighter = target
		link.target_point = target.hit_position()
		link.tint = receipt.accent
		effects.add_child(link)
		transients.append(link)

func _receipt_position(effects: Control, preferred: Vector2, dimensions: Vector2, fighters: Dictionary) -> Vector2:
	# Evaluate the actual fixed cards at every window size. The receipt may cross a
	# silhouette briefly; life/energy/shield meters always take priority.
	var plate_bounds: Array[Rect2] = []
	for fighter in fighters.values():
		if not is_instance_valid(fighter): continue
		plate_bounds.append(effects.get_global_transform().affine_inverse() * fighter.plate.get_global_rect())
	var top := 62.0 if flat_receipts else 8.0
	var best := Vector2(clampf(preferred.x, 6, maxf(6, effects.size.x - dimensions.x - 6)), clampf(preferred.y, top, maxf(top, effects.size.y - dimensions.y - 6)))
	var best_score := INF
	for y in [preferred.y, preferred.y - dimensions.y - 12, preferred.y + dimensions.y + 12, top, top+(effects.size.y-dimensions.y-top)*.33, top+(effects.size.y-dimensions.y-top)*.66, effects.size.y - dimensions.y - 6]:
		for x in [preferred.x, preferred.x - dimensions.x - 12, preferred.x + dimensions.x + 12, effects.size.x * 0.5 - dimensions.x * 0.5, 224.0, effects.size.x - 224.0 - dimensions.x, effects.size.x*.35, effects.size.x*.65-dimensions.x]:
			var candidate := Vector2(clampf(x, 6, maxf(6, effects.size.x - dimensions.x - 6)), clampf(y, top, maxf(top, effects.size.y - dimensions.y - 6)))
			var bounds := Rect2(candidate, dimensions)
			var score := candidate.distance_to(preferred)
			for plate in plate_bounds:
				if bounds.intersects(plate.grow(4)): score += bounds.intersection(plate.grow(4)).get_area() * 1000
			for previous in receipt_bounds:
				if bounds.intersects(previous.grow(5)): score += bounds.intersection(previous.grow(5)).get_area() * 400
			for body in spatial_body_bounds:
				if bounds.intersects(body.grow(8)): score += bounds.intersection(body.grow(8)).get_area() * 60
			if score < best_score:
				best = candidate
				best_score = score
	return best
