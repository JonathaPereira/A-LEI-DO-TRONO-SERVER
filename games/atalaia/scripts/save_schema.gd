extends RefCounted
## Validate the serialized envelope before decoding vectors or touching a live run.
const C = preload("res://scripts/catalog.gd")
const Strategy = preload("res://scripts/strategy_progress.gd")
const FIELDS = ["stage","wave","gold","core","phase","towers","enemies","projectiles","pools","doctrines","choices","records","next_id","spawn_count","spawn_total","spawn_timer","elapsed","wave_elapsed","kills"]
const TOWER_FIELDS = ["id","type","pad","level","mods","cooldown","aim","recoil","firing","beam","invested"]
const ENEMY_FIELDS = ["id","type","lane","d","hp","max_hp","speed","armor","gold","damage","pos","angle","slow","slow_time","dots","flash","dead"]
const STAT_FIELDS = ["damage","rate","range","splash","slow","chains","pool","duration","cost","burn","venom","ignore"]
const LIMIT = 1.0e12

static func number(value: Variant, low: float = 0.0, high: float = LIMIT) -> bool:
 return (value is int or value is float) and is_finite(float(value)) and value >= low and value <= high

static func integer(value: Variant, low: int = 0, high: int = 1000000000) -> bool:
 return number(value, low, high) and value == floor(float(value))

static func shape(value: Variant, required: Array, optional: Array = []) -> bool:
 if not value is Dictionary: return false
 for key in required:
  if not value.has(key): return false
 for key in value:
  if not key is String or (key not in required and key not in optional): return false
 return true

static func vector(value: Variant) -> bool:
 return shape(value, ["_v2"]) and value._v2 is Array and value._v2.size() == 2 and number(value._v2[0], -LIMIT) and number(value._v2[1], -LIMIT)

static func array(value: Variant, maximum: int = 10000) -> bool:
 return value is Array and value.size() <= maximum

static func doctrine(value: Variant) -> bool:
 return shape(value, ["type","effect"]) and value.type in C.TYPES and value.effect in ["power","range","mastery"]

static func card(value: Variant, chronicle: bool) -> bool:
 if not shape(value, ["id","name","text","tag","color","glyph"]): return false
 if not value.id is String or C.card(value.id,chronicle).is_empty(): return false
 for key in value:
  if not value[key] is String: return false
 return true

static func tower(value: Variant, pad_count: int, chronicle: bool) -> bool:
 if not shape(value, TOWER_FIELDS,["jam_time"]): return false
 if value.has("jam_time") and (not chronicle or not number(value.jam_time,0.0,float(C.ENEMIES.sapper.jamDuration))):return false
 if not integer(value.id, 1) or not C.TOWERS.has(value.type) or not integer(value.pad, 0, pad_count - 1): return false
 if not integer(value.level, 1, 3) or not integer(value.invested): return false
 if not value.firing is bool or not vector(value.beam): return false
 if not number(value.cooldown, -LIMIT) or not number(value.aim, -LIMIT) or not number(value.recoil): return false
 if not array(value.mods, 3): return false
 var seen := {}
 for mod in value.mods:
  if not mod is String or C.card(mod,chronicle).is_empty() or mod == "treasury" or seen.has(mod): return false
  seen[mod] = true
 return true

static func owner(value: Variant, records: Dictionary) -> bool:
 return integer(value, 1) and records.has(str(int(value)))

static func stats(value: Variant) -> bool:
 if not shape(value, STAT_FIELDS) or not value.ignore is bool: return false
 for key in STAT_FIELDS:
  if key == "ignore": continue
  if not number(value[key]): return false
 return value.rate > 0 and value.slow < 1 and integer(value.chains, 1, 100) and integer(value.cost)

static func validate(data: Variant, maps: Array, per_act: int = 5) -> String:
 if not shape(data, ["version"] + FIELDS, ["rng_state","strategy","mode","last_card_reroll"]): return "campos ausentes ou desconhecidos"
 if not integer(data.version, 1, 1): return "versão não suportada"
 if data.get("mode","classic") not in ["classic","chronicle"]:return "modo de campanha inválido"
 var chronicle: bool=data.get("mode")=="chronicle"
 var maximum: int = maps.size()*per_act
 if not Strategy.valid_specialization(data.get("strategy",{})):return "especialização inválida"
 if data.has("rng_state"):
  var state: Variant = data.rng_state
  # Never pass the signed 64-bit RNG state through a floating-point conversion.
  if not state is String or state.length() > 20 or not state.is_valid_int() or str(int(state)) != state: return "estado aleatório inválido"
 if not integer(data.stage, 0, maps.size() - 1) or not integer(data.wave, 0, maximum): return "território ou onda inválidos"
 if data.has("last_card_reroll") and (data.get("mode")!="chronicle" or not integer(data.last_card_reroll,1,int(data.wave))):return "renovação de cartas inválida"
 if not integer(data.gold) or not integer(data.core, 0, 30): return "ouro ou integridade inválidos"
 if not data.phase is String or data.phase not in ["prep","wave","cards","doctrine","victory","defeat"]: return "fase de jogo inválida"
 if data.phase == "victory":
  if data.wave != maximum or data.stage != maps.size()-1 or data.core <= 0: return "vitória incompatível com a campanha"
 elif data.phase == "prep":
  if data.wave >= maximum or data.stage != floor(float(data.wave) / float(per_act)) or data.core <= 0: return "preparação incompatível com o território"
 else:
  if data.wave < 1 or data.stage != floor(float(data.wave - 1) / float(per_act)): return "onda incompatível com o território"
  if (data.phase == "defeat") != (data.core == 0): return "derrota incompatível com a integridade"
  if data.phase in ["cards","doctrine"] and data.wave >= maximum: return "recompensa após o fim da campanha"
  if data.phase == "doctrine" and int(data.wave) % per_act != 0: return "doutrina fora do marco de campanha"
 for key in ["next_id","spawn_count","spawn_total","kills"]:
  if not integer(data[key], 1 if key == "next_id" else 0): return "contador inválido: " + key
 if data.spawn_count > data.spawn_total: return "contagem de surgimentos inválida"
 if not number(data.spawn_timer, -LIMIT) or not number(data.elapsed) or not number(data.wave_elapsed): return "tempo inválido"
 for key in ["towers","enemies","projectiles","pools","doctrines","choices"]:
  if not array(data[key]): return "coleção inválida: " + key
 if not data.records is Dictionary or data.records.size() > 100000: return "relatório inválido"
 var pad_count: int = maps[int(data.stage)].pads.size()
 var lane_count: int = maps[int(data.stage)].lanes.size()
 var ids := {}
 for key in data.records:
  if not key is String or not key.is_valid_int() or str(int(key)) != key: return "identidade do relatório inválida"
  var r: Variant = data.records[key]
  if not shape(r, ["id","type","damage","wave_damage","kills","sold"]): return "registro de dano incompleto"
  if not integer(r.id, 1) or int(r.id) != int(key) or r.id >= data.next_id or not C.TOWERS.has(r.type) or (data.get("mode","classic")=="classic" and r.type not in C.TYPES): return "identidade de torreta inválida"
  if not number(r.damage) or not number(r.wave_damage) or not integer(r.kills) or not r.sold is bool: return "dados de dano inválidos"
  ids[int(r.id)] = "record"
 var occupied := {}
 for t in data.towers:
  if not tower(t, pad_count, chronicle) or not owner(t.id, data.records): return "torreta inválida"
  var record: Dictionary = data.records[str(int(t.id))]
  if record.sold or record.type != t.type or occupied.has(int(t.pad)) or ids.get(int(t.id)) != "record": return "torreta ou espaço duplicado"
  occupied[int(t.pad)] = true
  ids[int(t.id)] = "tower"
 for e in data.enemies:
  if not shape(e, ENEMY_FIELDS, ["veiled","revealed","enraged","root_time","jam_cooldown","jam_windup","jam_target","pulse_started_at"]): return "inimigo incompleto"
  if e.type=="sapper":
   if not chronicle or not number(e.get("jam_cooldown"),0.0,float(C.ENEMIES.sapper.jamCooldown)) or not number(e.get("jam_windup"),0.0,float(C.ENEMIES.sapper.jamWindup)):return "interferência inválida"
   if not integer(e.get("jam_target"),-1) or (e.jam_target!=-1 and ids.get(int(e.jam_target))!="tower") or (e.jam_windup>0.0)!=(e.jam_target>0):return "alvo de interferência inválido"
  elif ["jam_cooldown","jam_windup","jam_target"].any(func(key):return e.has(key)):return "interferência fora do sabotador"
  if e.has("root_time") and (not chronicle or not number(e.root_time,0.0,0.55)):return "aprisionamento inválido"
  if e.has("enraged") and (e.type!="boss" or e.enraged is not bool):return "fase do chefe inválida"
  if e.has("pulse_started_at") and (not chronicle or data.wave!=maximum or e.type!="boss" or not e.get("enraged",false) or not number(e.pulse_started_at,0.0,float(data.wave_elapsed))):return "pulso do chefe inválido"
  if e.has("veiled") and (e.type!="spirit" or e.veiled is not bool):return "véu inválido"
  if e.has("revealed") and (e.type!="spirit" or not number(e.revealed,0,3)):return "revelação inválida"
  if not integer(e.id, 1) or e.id >= data.next_id or ids.has(int(e.id)) or e.type not in C.ENEMIES: return "identidade de inimigo inválida"
  if C.ENEMIES[e.type].get("chronicleOnly",false) and data.get("mode")!="chronicle":return "inimigo regional fora da Crônica"
  if not integer(e.lane, 0, lane_count - 1) or not vector(e.pos) or not e.dead is bool: return "rota ou posição inválida"
  for key in ["d","hp","max_hp","speed","armor","slow","slow_time","flash"]:
   if not number(e[key]): return "atributo de inimigo inválido: " + key
  if e.max_hp <= 0 or e.hp > e.max_hp or e.speed <= 0 or e.armor >= 1 or e.slow >= 1 or not number(e.angle, -LIMIT): return "atributos de combate inválidos"
  if not integer(e.gold) or not integer(e.damage) or not array(e.dots): return "recompensa ou efeito inválido"
  for dot in e.dots:
   if not shape(dot, ["owner","tag","dps","time"]): return "dano persistente incompleto"
   if not owner(dot.owner, data.records) or dot.tag not in ["burn","venom"] or not number(dot.dps) or not number(dot.time): return "dano persistente inválido"
  ids[int(e.id)] = "enemy"
 for p in data.pools:
  if not shape(p, ["owner","pos","radius","dps","residual","time","duration"]): return "poça incompleta"
  if not owner(p.owner, data.records) or not vector(p.pos): return "dono ou posição da poça inválido"
  for key in ["radius","dps","residual","time","duration"]:
   if not number(p[key]): return "poça inválida"
 for p in data.projectiles:
  if not shape(p, ["pos","start","end","target","t","stats","age","flight"]): return "projétil incompleto"
  if not vector(p.pos) or not vector(p.start) or not vector(p.end): return "posição de projétil inválida"
  if not integer(p.target, 1) or p.target >= data.next_id: return "alvo de projétil inválido"
  if not tower(p.t, pad_count, chronicle) or not owner(p.t.id, data.records) or data.records[str(int(p.t.id))].type != p.t.type: return "origem de projétil inválida"
  if not stats(p.stats) or not number(p.age) or not number(p.flight) or p.flight <= 0: return "trajetória ou efeito inválido"
 var doctrines := {}
 for d in data.doctrines:
  if not doctrine(d) or doctrines.has(d.type + ":" + d.effect): return "doutrina inválida ou duplicada"
  doctrines[d.type + ":" + d.effect] = true
 if data.choices.size() > 3: return "escolhas em excesso"
 var choices := {}
 for choice in data.choices:
  if not card(choice,chronicle) and not doctrine(choice): return "escolha inválida"
  if data.phase == "cards" and not card(choice,chronicle): return "carta inválida"
  if data.phase == "doctrine" and not doctrine(choice): return "escolha de doutrina inválida"
  var identity: String = choice.id if choice.has("id") else choice.type + ":" + choice.effect
  if choices.has(identity): return "escolha duplicada"
  choices[identity] = true
 if data.phase in ["cards","doctrine"] and data.choices.is_empty(): return "escolha pendente ausente"
 return ""
