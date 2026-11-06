extends SceneTree
const Run = preload("res://scripts/run.gd")
var checks := 0
var failures := 0

func _initialize() -> void: call_deferred("verify")

func check(ok: bool, text: String) -> void:
 checks += 1
 if not ok:
  failures += 1
  push_error("SAVE FAIL: " + text)

func same(a: Variant, b: Variant) -> bool:
 # JSON numbers load as floats; compare their serialized meaning after normalization.
 return JSON.parse_string(JSON.stringify(a)) == JSON.parse_string(JSON.stringify(b))

func rejects(data: Variant, text: String) -> void:
 var target = Run.new(51)
 target.build("ballista", 1)
 var before: Dictionary = target.to_data().duplicate(true)
 check(not target.load_data(data), text)
 check(target.to_data() == before, "Rejected save leaves current state and RNG untouched: " + text)
 check(target.error_text != "", "Rejected save explains the failure: " + text)

func roundtrip(source, text: String) -> void:
 var restored = Run.new(99)
 var raw: Dictionary = JSON.parse_string(JSON.stringify(source.to_data()))
 var loaded: bool = restored.load_data(raw)
 check(loaded, "Real save roundtrip: " + text + " / " + restored.error_text)
 if loaded: check(same(restored.to_data(), raw), "All persisted data including RNG survives: " + text)

func corruptions(base: Dictionary) -> void:
 for field in Run.SaveSchema.FIELDS:
  var missing = base.duplicate(true); missing.erase(field)
  rejects(missing, "Missing required field: " + field)
 for field in ["towers","enemies","projectiles","pools","doctrines","choices","records"]:
  var wrong = base.duplicate(true); wrong[field] = "broken"
  rejects(wrong, "Wrong collection type: " + field)
 for rng_state in [null, 1, "1e10", "9223372036854775808", "--1", "01"]:
  var invalid = base.duplicate(true); invalid.rng_state = rng_state
  rejects(invalid, "Invalid 64-bit RNG representation")
 var malformed = base.duplicate(true); malformed.towers[0].beam = {"_v2": [1]}
 rejects(malformed, "Malformed vector cannot reach decoder")
 malformed = base.duplicate(true); malformed.towers[0].mods = ["unknown"]
 rejects(malformed, "Unknown tower modifier")
 malformed = base.duplicate(true); malformed.towers[0].mods = ["power", "power"]
 rejects(malformed, "Duplicate tower modifiers")
 malformed = base.duplicate(true); malformed.towers.append(malformed.towers[0].duplicate(true))
 rejects(malformed, "Duplicate live tower identities and pads")
 malformed = base.duplicate(true); malformed.records["1"].id = 2
 rejects(malformed, "Record identity does not match its key")
 malformed = base.duplicate(true); malformed.next_id = 1
 rejects(malformed, "Next ID cannot reuse an existing identity")
 malformed = base.duplicate(true); malformed.version = 2
 rejects(malformed, "Future versions are not partially interpreted")
 malformed = base.duplicate(true); malformed.gold = INF
 rejects(malformed, "Non-finite numbers cannot enter a save")
 malformed = base.duplicate(true); malformed.phase = "victory"
 rejects(malformed, "A victory cannot be granted before the final wave")
 malformed = base.duplicate(true); malformed.phase = "cards"; malformed.choices = [Run.C.card("power")]
 rejects(malformed, "A reward cannot advance a campaign without a completed wave")
 malformed = base.duplicate(true); malformed.stage = 2
 rejects(malformed, "A preparation save cannot skip territories")
 malformed = base.duplicate(true); malformed.core = 0
 rejects(malformed, "A destroyed crystal cannot continue preparing a wave")
 rejects([], "Array root")
 rejects(null, "Null root")

func combat_cases() -> void:
 var live = Run.new(193)
 live.gold = 2000
 live.build("poison", 0)
 live.build("mortar", 1)
 live.start_wave()
 var enemy: Dictionary = live.spawn_enemy("golem", 0)
 live.shoot(live.towers[0], enemy, live.stats(live.towers[0]))
 live.upgrade(live.towers[0].id)
 live.add_dot(enemy, live.towers[0].id, "venom", 5, 3)
 live.pools.append({"owner": live.towers[0].id,"pos": enemy.pos,"radius": 48.0,"dps": 9.0,"residual": 5.0,"time": 3.0,"duration": 5.0})
 live.towers[0].cooldown = -2.0
 live.spawn_timer = -0.1
 roundtrip(live, "in-flight projectile keeps pre-upgrade snapshot, pools, DOTs and negative timers")
 var data: Dictionary = live.to_data()
 var loaded = Run.new()
 check(loaded.load_data(JSON.parse_string(JSON.stringify(data))) and loaded.projectiles[0].t.level == 1 and loaded.towers[0].level == 2, "Upgrading a live tower cannot rewrite an in-flight launch snapshot")
 live.tick(0.1); loaded.tick(0.1)
 check(same(live.to_data(), loaded.to_data()), "Resumed combat resolves exactly the same next tick")
 var malformed = data.duplicate(true); malformed.enemies[0].dots[0].owner = 999
 rejects(malformed, "DOT owner must have a historical damage record")
 malformed = data.duplicate(true); malformed.pools[0].owner = 999
 rejects(malformed, "Pool owner must have a historical damage record")
 malformed = data.duplicate(true); malformed.projectiles[0].stats.rate = 0
 rejects(malformed, "Projectile stats must be complete and valid")
 malformed = data.duplicate(true); malformed.enemies[0].lane = 999
 rejects(malformed, "Enemy lane must exist in the selected territory")
 malformed = data.duplicate(true); malformed.enemies[0].pos = {"_v2": [[1], 2]}
 rejects(malformed, "Nested malformed coordinates are rejected without runtime errors")
 live.phase = "prep"
 live.sell(live.towers[0].id)
 roundtrip(live, "sold owner remains valid for an enemy DOT and poison pool")
 live.enemies.clear()
 roundtrip(live, "sold projectile owner remains historical and dead projectile target may be absent")

func phases() -> void:
 var live = Run.new(173)
 live.gold = 2000; live.build("ballista", 0)
 roundtrip(live, "initial preparation")
 live.start_wave(); roundtrip(live, "wave in progress")
 live.enemies.clear(); live.projectiles.clear(); live.spawn_count = live.spawn_total; live.finish_wave()
 roundtrip(live, "cards pending")
 live.apply_card(0, live.towers[0].id)
 roundtrip(live, "preparation after reward retains old choice presentation")
 live.wave = 5; live.phase = "cards"; live.choices = [Run.C.card("treasury")]
 live.apply_card(0, -1); roundtrip(live, "doctrine pending")
 live.apply_doctrine(0); roundtrip(live, "new territory with doctrine choices retained")
 live.stage = 2; live.wave = 15; live.finish_wave(); roundtrip(live, "victory")
 live.core = 0; live.phase = "defeat"; roundtrip(live, "defeat")
 for state in ["9223372036854775807", "-9223372036854775808"]:
  var data: Dictionary = live.to_data(); data.rng_state = state
  var restored = Run.new()
  check(restored.load_data(data) and restored.to_data().rng_state == state, "Signed 64-bit RNG endpoints preserve exact decimal bytes")

func verify() -> void:
 var source = Run.new(71)
 source.build("ballista", 0)
 var base: Dictionary = JSON.parse_string(JSON.stringify(source.to_data()))
 var negative = base.duplicate(true); negative.gold = -1
 rejects(negative, "Negative economy is rejected")
 var phase = base.duplicate(true); phase.phase = "unknown"
 rejects(phase, "Unknown gameplay phase is rejected")
 var pad = base.duplicate(true); pad.towers[0].pad = 999
 rejects(pad, "A tower outside the map is rejected")
 var fraction = base.duplicate(true); fraction.wave = 1.5
 rejects(fraction, "A fractional wave is rejected")
 var extra = base.duplicate(true); extra.events = ["injected"]
 rejects(extra, "Unknown keys cannot overwrite runtime properties")
 corruptions(base)
 combat_cases()
 phases()
 print("Save validation: %d checks, %d failures" % [checks, failures])
 quit(1 if failures else 0)
