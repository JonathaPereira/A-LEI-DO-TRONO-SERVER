extends SceneTree
## Real scene integration: geometry, projected HUD, attack receipts and cancellation.
const MainScene = preload("res://scenes/main.tscn")
const Receipt = preload("res://scripts/damage_receipt.gd")
var checks := 0
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(message)

func settle() -> void:
	await process_frame
	await process_frame
	await process_frame

func click_at(point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	root.push_input(motion, true)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = point
	press.global_position = point
	press.pressed = true
	root.push_input(press, true)
	await process_frame
	var release: InputEventMouseButton = press.duplicate()
	release.pressed = false
	release.button_mask = 0
	root.push_input(release, true)
	await settle()

func wait_hit(app, baseline: int) -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while app.director.impact_count == baseline and Time.get_ticks_msec() < deadline:
		await process_frame
	check(app.director.impact_count == baseline + 1, "An animated action reaches exactly one logical contact")

func wait_done(app) -> void:
	var deadline := Time.get_ticks_msec() + 12000
	while app.busy and Time.get_ticks_msec() < deadline:
		await process_frame
	check(not app.busy, "The 3D action recovers and releases the turn within its deadline")

func reset(app, reduced := true) -> void:
	app.teams = app.catalog.default_teams.duplicate(true)
	app.mode = "local"
	app.reduced_motion = reduced
	app._new_battle()
	await settle()

func geometry(app) -> void:
	var stage = app.backdrop
	check(stage.find_children("*", "Camera3D", true, false).size() == 1, "The main battlefield uses a real 3D camera")
	check(stage.find_children("*", "SubViewport", true, false).size() == 1, "The 3D world renders through its own viewport")
	check(stage.find_children("*", "MeshInstance3D", true, false).size() >= 50, "The arena and combatants contain actual volumetric meshes")
	var points := {}
	for data in app.state.units:
		var foot: Vector2 = stage.ground_position(data.id)
		var head: Vector2 = stage.head_position(data.id)
		var field := Rect2(Vector2.ZERO, app.field.size)
		check(field.has_point(foot) and field.has_point(head) and foot.y - head.y > 30, "%s has visible projected feet and head" % data.id)
		var fighter = app.fighters[data.id]
		var model = stage.models[data.id]
		if model.has_method("prepare_action"):
			check(model.parts.any(func(part): return part is MeshInstance3D and part.skin != null) and model.skeleton.get_bone_count() >= 32, "%s uses an imported skinned mesh and a complete skeleton" % data.id)
			check(model.animation_player.has_animation("Vesper_ReapingArc") and model.animation_player.has_animation("Vesper_Eclipse"), "%s has authored skeletal attack and supreme animation clips" % data.id)
		else:
			check(model is Node3D and model.parts.size() >= 15 and model.parts.all(func(part): return part is MeshInstance3D and part.mesh != null), "%s has an articulated model made of volumetric meshes" % data.id)
			check(is_instance_valid(model.right_arm) and is_instance_valid(model.left_arm) and is_instance_valid(model.right_leg) and is_instance_valid(model.left_leg), "%s has independent arm and leg joints" % data.id)
		check(fighter.spatial_presentation and not fighter.visual_root.visible, "%s uses its 3D body with a separate HUD plate" % data.id)
		check(fighter.foot_position().distance_to(foot) < 1.0 and fighter.hit_position().distance_to(head.lerp(foot, 0.3)) < 1.0, "%s HUD and attack anchors follow the camera projection" % data.id)
		points[data.id] = foot
	for side in range(2):
		var team: Array = app.state.units.filter(func(data): return data.side == side)
		var a: Vector2 = points[team[0].id]
		var b: Vector2 = points[team[1].id]
		var c: Vector2 = points[team[2].id]
		check(absf((b - a).cross(c - a)) > 600, "Side %d has three distinct, non-collinear projected positions" % side)
		var world_a: Vector3 = stage.models[team[0].id].home
		var world_b: Vector3 = stage.models[team[1].id].home
		var world_c: Vector3 = stage.models[team[2].id].home
		check((world_b - world_a).cross(world_c - world_a).length() > 1.0 and absf(world_a.x) < absf(world_b.x) and absf(world_a.x) < absf(world_c.x), "Side %d has a genuine world-space triangle with its vanguard closest to the rivals" % side)

func roster(app) -> void:
	var seen := {}
	for group in range(ceili(app.catalog.heroes.size() / 3.0)):
		var own: Array = []
		var rival: Array = []
		for slot in range(3):
			own.append(app.catalog.heroes[(group * 3 + slot) % app.catalog.heroes.size()].id)
			rival.append(app.catalog.heroes[((group + 1) * 3 + slot) % app.catalog.heroes.size()].id)
		app.teams = [own, rival]
		app._new_battle()
		await settle()
		geometry(app)
		for id in own: seen[id] = true
	check(seen.size() == 24, "Every active hero can be constructed in the playable 3D battlefield")
	# Campaign enemies have visual aliases and boss-specific data; they must also
	# build without requiring active-roster IDs or changing their combat stats.
	var original_cleared: int = app.campaign.cleared
	app.campaign.completed = app.campaign._legacy_completed(3)
	for mission in range(3):
		var battle: Dictionary = app.campaign.battle(app.combat, mission)
		check(not battle.has("error"), "Story mission %d supplies a valid scene fixture" % mission)
		if battle.has("error"): continue
		var before := battle.duplicate(true)
		app.backdrop.encounter_kind = mission
		app.backdrop.configure(battle.units, app.catalog)
		await settle()
		check(battle == before, "Building story arena %d does not mutate campaign combat data" % mission)
		check(app.backdrop.find_children("*", "MeshInstance3D", true, false).size() >= 50, "Story arena %d builds all heroes and enemies as meshes" % mission)
	app.campaign.completed = app.campaign._legacy_completed(original_cleared)

func direct_hit(app) -> void:
	await reset(app, false)
	app.state.random = 1972
	var victim: Dictionary = app.combat.unit(app.state, "1-vesper")
	victim.shield = 300
	victim.shieldTurns = 2
	app._start()
	app._select_action("basic")
	app._select_target(victim.id)
	var before: Dictionary = app.state.duplicate(true)
	var pending: Dictionary = app.state.duplicate(true)
	var result: Dictionary = app.combat.act(pending, "basic", victim.id)
	var baseline: int = app.director.impact_count
	app._execute()
	await process_frame
	check(app.busy and app.state == before, "The attack keeps battle state stable during anticipation")
	await wait_hit(app, baseline)
	var resolved: Dictionary = result.impactUnits.filter(func(data): return data.id == victim.id)[0]
	check(app.fighters[victim.id].health.value == resolved.hp and app.fighters[victim.id].shield.value == resolved.shield, "Contact displays exact engine HP and shield values")
	check(app.state == before and app.busy, "The next turn stays locked while contact and recovery are presented")
	var windows: Array = app.effects.get_children().filter(func(node): return node is Receipt and node.target_name == app.fighters[victim.id].hero_name)
	check(windows.size() == 1, "The affected target receives one floating attack window")
	if not windows.is_empty():
		var event: Dictionary = result.events.filter(func(item): return item.type == "damage" and item.target == victim.id)[0]
		var expected: Dictionary = Receipt.describe_events([event])
		for row in expected.rows:
			if row.kind == "metric" or row.kind == "status":
				check(windows[0].rows.any(func(shown): return shown == row), "The floating window preserves actual %s values" % row.kind)
		check(windows[0].action_name == app.catalog.hero_by_id.veyra.basic.name, "The floating window identifies the executed attack")
	await wait_done(app)
	check(app.state == pending and app.director.impact_count == baseline + 1, "Recovery commits precisely the engine result without a repeated hit")

func projected_targeting(app) -> void:
	await reset(app)
	app._start()
	var rivals: Array = app.state.units.filter(func(data): return data.side == 1)
	for index in range(rivals.size()):
		var unit: Dictionary = rivals[index]
		var previous: String = rivals[(index + 1) % rivals.size()].id
		app._select_target(previous)
		var chest: Vector2 = app.field.get_global_rect().position + app.backdrop.screen_position(unit.id)
		await click_at(chest)
		check(app.target_id == unit.id, "Pointer input selects the actual projected 3D body of %s" % unit.id)
		app._select_target(previous)
		await click_at(app.fighters[unit.id].plate.get_global_rect().get_center())
		check(app.target_id == unit.id, "The separate HUD plate also selects %s" % unit.id)
		app._select_target(previous)
		var plate_rect: Rect2 = app.fighters[unit.id].plate.get_global_rect()
		await click_at(plate_rect.position + Vector2(plate_rect.size.x + 5, plate_rect.size.y * 0.5))
		check(app.target_id == previous, "The gap outside the scaled HUD plate cannot select %s" % unit.id)

func area_and_reduced(app) -> void:
	await reset(app, false)
	app.combat.current(app.state).energy = 100
	app._start()
	app._select_action("ultimate")
	var pending: Dictionary = app.state.duplicate(true)
	var result: Dictionary = app.combat.act(pending, "ultimate", app.target_id)
	var baseline: int = app.director.impact_count
	app._execute()
	await wait_hit(app, baseline)
	var damaged: Array = result.events.filter(func(event): return event.type == "damage" and not event.get("passive", false) and not event.get("reaction", false))
	var windows: Array = app.effects.get_children().filter(func(node): return node is Receipt)
	check(damaged.size() == 3, "The selected supreme produces three real enemy receipts")
	for event in damaged:
		var expected_name: String = app.fighters[event.target].hero_name
		check(windows.any(func(window): return window.target_name == expected_name), "Area contact creates a floating window for %s" % expected_name)
	await wait_done(app)
	check(app.state == pending and app.director.impact_count == baseline + 1, "An area attack commits one turn, regardless of target count")
	await reset(app, true)
	app._start()
	pending = app.state.duplicate(true)
	app.combat.act(pending, "basic", app.target_id)
	baseline = app.director.impact_count
	app._execute()
	await wait_done(app)
	await settle()
	check(app.state == pending and app.director.impact_count == baseline + 1, "Reduced animations preserve the same exact result and one callback")

func support_actions(app) -> void:
	for scenario in [{"actor": "saira", "action": "skill"}, {"actor": "oren", "action": "ultimate"}]:
		app.teams = [[scenario.actor, "maura", "sylva"], ["nima", "riven", "kira"]]
		app.reduced_motion = false
		app._new_battle()
		await settle()
		var actor_id: String = "0-" + scenario.actor
		app.state.order.erase(actor_id)
		app.state.order.push_front(actor_id)
		app.state.cursor = 0
		for unit in app.state.units:
			if unit.side == 0:
				unit.hp = 200
				unit.energy = 100
				if scenario.actor == "saira": unit.statuses = [{"type": "bleed", "turns": 2}, {"type": "burn", "turns": 2}]
		app._start()
		app._select_action(scenario.action)
		var pending: Dictionary = app.state.duplicate(true)
		var result: Dictionary = app.combat.act(pending, scenario.action, app.target_id)
		var baseline: int = app.director.impact_count
		app._execute()
		await wait_hit(app, baseline)
		var model = app.backdrop.models[actor_id]
		check(model.position.distance_to(model.home) < 0.05, "Support animations cast from their formation slot")
		var windows: Array = app.effects.get_children().filter(func(node): return node is Receipt)
		for unit in result.impactUnits.filter(func(data): return data.side == 0):
			var matching: Array = windows.filter(func(window): return window.target_name == app.fighters[unit.id].hero_name)
			check(matching.size() == 1, "Support contact gives %s its own result window" % unit.heroId)
			if matching.is_empty(): continue
			if scenario.actor == "saira":
				check(matching[0].rows.any(func(row): return row.kind == "metric" and row.text == "CURA") and matching[0].rows.any(func(row): return row.text == "Removido: Sangramento"), "Actual healing and removed negative effects appear together")
			else:
				check(matching[0].rows.any(func(row): return row.kind == "status" and row.positive and row.effect == "regen" and row.turns == 2), "Actual support buffs show their positive classification and duration")
				check(app.backdrop.models[unit.id].shield_aura.visible and app.fighters[unit.id].shield.value == unit.shield, "Granted shields appear on the 3D model and the independent shield meter")
		await wait_done(app)
		check(app.state == pending and app.director.impact_count == baseline + 1, "Support presentation commits the exact engine result once")

func affinity_attacks(app) -> void:
	# Execute each affinity through the actual battle controller, so effect
	# construction, contact callbacks and cleanup are exercised together.
	for id in ["veyra", "nima", "kira", "astra", "vesper"]:
		app.teams = [[id, "saira", "sylva"], ["rhazen", "oren", "elun"]]
		app.mode = "local"
		app.reduced_motion = false
		app._new_battle()
		await settle()
		var actor_id: String = "0-" + id
		app.state.order.erase(actor_id)
		app.state.order.push_front(actor_id)
		app.state.cursor = 0
		app._start()
		app._select_target("1-rhazen")
		var pending: Dictionary = app.state.duplicate(true)
		app.combat.act(pending, "basic", "1-rhazen")
		var baseline: int = app.director.impact_count
		app._execute()
		await wait_hit(app, baseline)
		var affinity: String = app.catalog.hero_by_id[id].classId
		var effects: Array = app.backdrop.world.find_children("AffinityImpact_" + affinity, "Node3D", true, false)
		check(effects.size() == 1 and effects[0].get_child_count() >= 5, "%s creates its detailed 3D affinity impact at contact" % affinity)
		await wait_done(app)
		check(app.state == pending and app.director.impact_count == baseline + 1, "%s effects preserve the exact combat result" % affinity)
		check(app.backdrop.effects.is_empty(), "%s releases transient 3D effects after recovery" % affinity)

func cancellation(app) -> void:
	await reset(app, false)
	app._start()
	var baseline: int = app.director.impact_count
	app._execute()
	await process_frame
	app._new_battle()
	await create_timer(1.2).timeout
	check(app.director.impact_count == baseline and app.state.turns == 0 and not app.busy, "Restart before contact cancels the previous attack and its callback")
	check(app.effects.get_child_count() == 0, "Restart removes all floating windows and previous effects")
	app._start()
	app._execute()
	await wait_hit(app, baseline)
	app._new_battle()
	await create_timer(1.5).timeout
	check(app.director.impact_count == baseline + 1 and app.state.turns == 0 and not app.busy, "Restart after contact prevents stale recovery from committing the old battle")
	geometry(app)

func _run() -> void:
	root.size = Vector2i(1600, 900)
	var app = MainScene.instantiate()
	root.add_child(app)
	await settle()
	app._set_presentation(true)
	await settle()
	if not is_instance_valid(app.backdrop) or app.state.is_empty():
		push_error("Main scene did not initialize its battlefield")
		quit(1)
		return
	app._enter_free()
	await reset(app)
	await roster(app)
	await projected_targeting(app)
	await direct_hit(app)
	await area_and_reduced(app)
	await support_actions(app)
	await affinity_attacks(app)
	await cancellation(app)
	app.queue_free()
	await settle()
	print("3D stage validation: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
