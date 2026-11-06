extends SceneTree
## Standalone display-contract checks; all combat values remain engine-owned.
const Receipt = preload("res://scripts/damage_receipt.gd")
const Combat = preload("res://scripts/combat.gd")
var checks := 0
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	var events: Array = [{"type": "damage", "amount": 123, "absorbed": 70, "total": 193, "shieldAfter": 0, "critical": true, "advantage": 1.25, "effect": "burn", "effectTurns": 2, "extraEffect": "expose"}]
	var before := events.duplicate(true)
	var description := Receipt.describe_events(events)
	check(events == before, "Receipt formatting does not mutate combat events")
	check(description.critical and description.shieldAfter == 0, "Critical and broken shield come from the attack event")
	check(description.rows.any(func(row): return row.kind == "metric" and row.value == "−123" and row.text == "DANO À VIDA"), "HP loss shows exact amount excluding shield damage")
	check(description.rows.any(func(row): return row.kind == "metric" and row.value == "−70" and row.text == "DANO AO ESCUDO"), "Shield absorption has a distinct damage value")
	check(description.rows.any(func(row): return row.text == "VULNERÁVEL +25%"), "Affinity detail uses the shared multiplier")
	var effects: Array = description.rows.filter(func(row): return row.kind == "status")
	check(effects.size() == 2 and effects.all(func(row): return not row.positive and row.turns == 2), "Both negative attack effects show actual durations")
	var all_effects: Array = Receipt.describe_events([
		{"type": "shield", "amount": 84, "shieldAfter": 200, "shieldTurns": 1, "effect": "fortify", "effectTurns": 1},
		{"type": "status", "effect": "bleed", "effectTurns": 2},
		{"type": "status", "effect": "fortify", "effectTurns": 2},
	]).rows.filter(func(row): return row.kind == "status")
	check(all_effects.size() == 2 and all_effects[0].positive and all_effects[0].turns == 2 and not all_effects[1].positive, "Buffs and debuffs are separate and refreshed effects retain the last duration")
	var cleansed: Array = Receipt.describe_events([{"type": "heal", "amount": 0, "healingPenalty": 100, "effect": "cleanse", "effectTurns": 0, "extraEffect": "regen", "cleansed": ["burn", "bleed"]}]).rows
	check(cleansed.any(func(row): return row.text == "PURIFICADO · 2 efeito(s) removido(s)"), "Purification states the count actually removed")
	check(cleansed.any(func(row): return row.text == "Removido: Queimadura") and cleansed.any(func(row): return row.text == "Removido: Sangramento"), "Purification names each removed negative effect")
	check(cleansed.any(func(row): return row.kind == "status" and row.effect == "regen" and row.turns == int(Receipt.RulesText.rules.status.durationTurns)), "Secondary buff receives its rule duration after a zero-duration cleanse")
	check(cleansed.any(func(row): return row.kind == "metric" and row.value == "+0") and cleansed.any(func(row): return row.text == "CURA −100%"), "Blocked healing stays zero and explains the healing penalty")
	var protected_hit := Receipt.describe_events([{"type": "damage", "amount": 0, "absorbed": 150, "shieldAfter": 40}])
	check(protected_hit.protected and protected_hit.shieldAfter == 40 and protected_hit.rows[0].text == "VIDA PROTEGIDA", "Fully absorbed attacks protect life without hiding shield loss")
	var stable_labels: Array = Receipt.event_lines([{"type": "damage", "amount": 0, "absorbed": 150, "shieldAfter": 40, "critical": true}, {"type": "burn", "amount": 91, "remaining": 1}, {"type": "heal", "amount": 20, "healingPenalty": 68}]).map(func(line): return line[0])
	check(stable_labels.has("CRÍTICO!") and stable_labels.has("VIDA PROTEGIDA") and stable_labels.has("QUEIMADURA") and stable_labels.has("CURA −68%"), "Stable text labels preserve battle instrumentation and gallery checks")
	var conversion := Receipt.describe_events([{"type": "converted", "shieldSpent": 201}])
	check(conversion.rows[0].value == "−201" and conversion.shieldAfter == 0, "Shield conversion reports the exact spent amount")
	var combat := Combat.new()
	var state := combat.new_battle(["saira", "maura", "sylva"], ["nima", "riven", "kira"])
	state.order = ["0-saira", "0-maura", "0-sylva", "1-nima", "1-riven", "1-kira"]
	state.cursor = 0
	var actor: Dictionary = combat.current(state)
	actor.hp = 100
	actor.energy = 100
	actor.statuses = [{"type": "bleed", "turns": 2}]
	var result := combat.act(state, "skill", actor.id, false)
	var heal: Dictionary = result.events.filter(func(event): return event.type == "heal" and event.target == actor.id)[0]
	var real_rows: Array = Receipt.describe_events([heal]).rows
	check(real_rows.any(func(row): return row.kind == "metric" and row.value == "+%d" % int(heal.amount)), "Actual native combat healing appears unchanged")
	check(real_rows.any(func(row): return row.text == "Removido: Sangramento") and real_rows.any(func(row): return row.text == "CURA −%d%%" % int(heal.healingPenalty)), "Native cleanse displays the pre-cleanse healing penalty and removed status")
	for shield in [0, 330]:
		var crowded := combat.new_battle(["vesper", "maura", "sylva"], ["astra", "elun", "oren"])
		crowded.order = ["0-vesper", "0-maura", "0-sylva", "1-astra", "1-elun", "1-oren"]
		crowded.cursor = 0
		var caster: Dictionary = combat.current(crowded)
		caster.hp = 400
		caster.energy = 100
		caster.shield = shield
		caster.shieldTurns = 2
		caster.statuses = [{"type": "bleed", "turns": 2}]
		for enemy in crowded.units.filter(func(unit): return unit.side == 1):
			enemy.statuses = [{"type": "mirror", "turns": 2}, {"type": "seed", "turns": 2}, {"type": "emberguard", "turns": 2}]
		var crowded_result := combat.act(crowded, "ultimate", "1-astra", false)
		var actor_events: Array = crowded_result.events.filter(func(event): return event.target == caster.id)
		var untouched := actor_events.duplicate(true)
		var crowded_receipt := Receipt.new()
		crowded_receipt.configure_events(actor_events, "Vesper", 330, 0, "Eclipse absoluto")
		check(crowded_receipt.size.y <= 410, "An actual multi-target drain, seed, reflection and burn window fits the battlefield (shield %d, height %d)" % [shield, int(crowded_receipt.size.y)])
		check(crowded_receipt.lines == Receipt.event_lines(actor_events) and actor_events == untouched, "Compaction retains every raw combat label and leaves the native receipts unchanged")
		var seed_events: Array = actor_events.filter(func(event): return event.type == "heal" and event.get("source", "") == "seed")
		var seed_rows: Array = crowded_receipt.rows.filter(func(row): return row.kind == "metric" and row.text == "SEMENTE")
		var seed_total := 0
		for event in seed_events: seed_total += int(event.amount)
		check(seed_events.size() == 3 and seed_rows.size() == 1 and seed_rows[0].amount == seed_total and seed_rows[0].hits == 3 and seed_rows[0].components == seed_events.map(func(event): return int(event.amount)), "Repeated seed healing shows the exact summed value, three activations and all component amounts")
		var lost_hp := 0
		var lost_shield := 0
		for event in actor_events.filter(func(item): return item.type == "damage"):
			lost_hp += int(event.amount)
			lost_shield += int(event.get("absorbed", 0))
		var shown_hp := 0
		var shown_shield := 0
		for row in crowded_receipt.rows.filter(func(item): return item.kind == "metric"):
			if row.text in ["DANO À VIDA", "VIDA PROTEGIDA"]: shown_hp += absi(int(row.amount))
			if row.text == "DANO AO ESCUDO": shown_shield += absi(int(row.amount))
		check(shown_hp == lost_hp and shown_shield == lost_shield and crowded_receipt.rows.any(func(row): return row.kind == "status" and row.effect == "burn" and not row.positive and row.turns == 2), "Compact counters preserve separate exact HP/shield totals and the actual negative burn duration")
		crowded_receipt.free()
	var receipt := Receipt.new()
	receipt.configure_events(events, "Oren", 330, 0, "Lança da aurora")
	root.add_child(receipt)
	await process_frame
	check(receipt.size.x == 236 and receipt.size.y >= receipt.content_height and receipt.lifetime >= 2.65 and receipt.action_name == "Lança da aurora", "Floating window reserves its measured content and an adequate reading lifetime")
	receipt.configure([["CRÍTICO!", "ffd17a", 22], ["VIDA PROTEGIDA", "85dcff", 15]], "Oren", 330, 80)
	check(receipt.critical and receipt.protected and receipt.rows.size() == 1 and receipt.action_name.is_empty(), "Existing 2D receipt API and exact critical/protected labels remain compatible")
	receipt.queue_free()
	await process_frame
	print("Floating attack receipt: %d checks, %d failures." % [checks, failures])
	quit(1 if failures > 0 else 0)
