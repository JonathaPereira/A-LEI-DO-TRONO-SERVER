class_name AtalaiaCatalog
extends RefCounted

const TYPES = ["ballista", "mortar", "flame", "tesla", "ice", "poison"]
const CROWN_PULSE = {"period":7.0,"windup":1.0,"radius":144.0,"jamDuration":0.8}
const WARD_DAMAGE_MULTIPLIER = 0.75
const SLAG_WARD = {"wave":24,"radius":105.0,"escorts":["golem","mushroom"]}
const MATRIARCH_BROOD = {"wave":12,"escorts":["brood","brood"]}
const TOWERS = {
 "ballista": {"name":"Balista", "cost":70, "damage":17.0, "rate":0.60, "range":166.0, "color":"e6b866", "role":"Perfuração · cadência alta", "glyph":"➶"},
 "mortar": {"name":"Morteiro", "cost":110, "damage":44.0, "rate":1.70, "range":194.0, "color":"efa667", "role":"Explosão · área de 64", "glyph":"◉"},
 "flame": {"name":"Lança-chamas", "cost":90, "damage":5.0, "rate":0.22, "range":120.0, "color":"ff8058", "role":"Jato contínuo · queimadura", "glyph":"♨"},
 "tesla": {"name":"Tesla", "cost":120, "damage":18.0, "rate":1.0, "range":150.0, "color":"9e9bff", "role":"Raios · cadeia de 3 alvos", "glyph":"ϟ"},
 "ice": {"name":"Obelisco glacial", "cost":80, "damage":9.0, "rate":1.0, "range":148.0, "color":"83deff", "role":"Controle · 55% de lentidão", "glyph":"❄"},
 "poison": {"name":"Alquimista", "cost":95, "damage":7.0, "rate":1.1, "range":155.0, "color":"a6e66f", "role":"Poças · dano persistente", "glyph":"⚗"},
 "roots":{"name":"Guardião de Raízes","family":"ice","act":0,"cost":112,"damage":8.0,"rate":1.25,"range":130.0,"slow":0.78,"color":"83dbac","role":"Aprisiona por 0,55 s e aplica lentidão. Chefes resistem à metade.","glyph":"❧"},
 "harpoon":{"name":"Arpão do Abismo","family":"ballista","act":1,"cost":132,"damage":41.0,"rate":1.25,"range":188.0,"color":"7fc6b6","role":"Perfura armadura. O disparo único tem recarga longa.","glyph":"↠"},
 "seismic":{"name":"Canhão Sísmico","family":"mortar","act":2,"cost":153,"damage":43.0,"rate":1.95,"range":202.0,"splash":92.0,"color":"d8a57d","role":"Onda de impacto em área larga com baixa cadência.","glyph":"◉"},
 "spectral":{"name":"Farol Espectral","family":"tesla","act":3,"cost":136,"damage":13.0,"rate":1.04,"range":165.0,"slow":0.18,"chains":2,"color":"b4b8ff","role":"Detecta espíritos velados e reduz a armadura atingida por três segundos.","glyph":"✦"},
 "ash_forge":{"name":"Forja de Cinzas","family":"flame","act":3,"cost":168,"damage":15.0,"rate":0.55,"range":112.0,"burn":10.0,"color":"ffb067","role":"Jato térmico forte e queimadura longa. Alcance curto.","glyph":"♨"},
 "solar":{"name":"Obelisco Solar","family":"ballista","act":4,"cost":158,"damage":28.0,"rate":0.85,"range":202.0,"color":"fff08f","role":"Concentra energia em um alvo. +60% de dano contra espíritos.","glyph":"☀"}
}
const ENEMIES = {
 "skeleton":{"hp":50.0,"speed":47.0,"gold":7,"size":52.0,"damage":1,"armor":0.0},
 "wolf":{"hp":38.0,"speed":79.0,"gold":7,"size":42.0,"damage":1,"armor":0.0},
 "spider":{"hp":72.0,"speed":51.0,"gold":9,"size":39.0,"damage":1,"armor":0.06},
 "mushroom":{"hp":118.0,"speed":36.0,"gold":11,"size":52.0,"damage":2,"armor":0.12},
 "golem":{"hp":260.0,"speed":30.0,"gold":19,"size":72.0,"damage":3,"armor":0.23},
 "spirit":{"hp":93.0,"speed":64.0,"gold":11,"size":53.0,"damage":2,"armor":0.08},
 "ward":{"hp":150.0,"speed":39.0,"gold":13,"size":63.0,"damage":2,"armor":0.15,"aura":105.0,"resistBurn":0.5,"art":"golem","tint":"edb98a","chronicleOnly":true},
 "brood":{"hp":74.0,"speed":44.0,"gold":9,"size":52.0,"damage":1,"armor":0.06,"art":"spider","tint":"cdbcfa","chronicleOnly":true},
 "hatchling":{"hp":24.0,"speed":73.0,"gold":0,"size":27.0,"damage":1,"armor":0.0,"art":"spider","tint":"deccff","chronicleOnly":true},
 "sapper":{"hp":92.0,"speed":58.0,"gold":12,"size":48.0,"damage":1,"armor":0.04,"art":"mushroom","tint":"9ecde7","chronicleOnly":true,"jamRange":140.0,"jamWindup":0.65,"jamDuration":1.2,"jamCooldown":8.0},
 "herald":{"hp":110.0,"speed":44.0,"gold":13,"size":58.0,"damage":2,"armor":0.08,"art":"skeleton","tint":"d5a7ee","chronicleOnly":true,"marchRadius":120.0,"marchMultiplier":1.2},
 "boss":{"hp":1400.0,"speed":25.0,"gold":95,"size":112.0,"damage":8,"armor":0.18}
}
const CARDS = [
 {"id":"power","name":"Núcleo sobrecarregado","text":"+25% de dano, incluindo poças e queimaduras.","tag":"PODER","color":"e6b866","glyph":"ϟ"},
 {"id":"rapid","name":"Engrenagens vivas","text":"Ataca 20% mais rápido. O jato também pulsa mais vezes.","tag":"CADÊNCIA","color":"e6b866","glyph":"◷"},
 {"id":"range","name":"Olhar da sentinela","text":"+22% de alcance para cobrir mais caminhos.","tag":"ALCANCE","color":"83deff","glyph":"◎"},
 {"id":"splash","name":"Ressonância","text":"Impactos atingem uma área adicional de 24. Morteiros ampliam a explosão.","tag":"ÁREA","color":"efa667","glyph":"◉"},
 {"id":"hunter","name":"Caçador de colossos","text":"Impactos causam +50% de dano contra chefes e golens.","tag":"ESPECIALISTA","color":"c3a1f5","glyph":"◇"},
 {"id":"shatter","name":"Estilhaço glacial","text":"Impactos causam +35% de dano contra inimigos sob lentidão.","tag":"SINERGIA","color":"83deff","glyph":"❄"},
 {"id":"burn","name":"Cinzas persistentes","text":"Cada acerto aplica 6 de dano por segundo durante 3 segundos.","tag":"QUEIMADURA","color":"ff8058","glyph":"♨"},
 {"id":"pierce","name":"Metal do abismo","text":"Ignora a armadura e aumenta o dano em 10%.","tag":"PERFURAÇÃO","color":"d0becf","glyph":"➶"},
 {"id":"venom","name":"Resíduo alquímico","text":"+4 de veneno por segundo durante 4 segundos. Poças duram +2 segundos.","tag":"VENENO","color":"a6e66f","glyph":"⚗"},
 {"id":"economy","name":"Forja eficiente","text":"Evoluções desta torreta custam 25% menos.","tag":"ECONOMIA","color":"e6b866","glyph":"✧"},
 {"id":"slow","name":"Pacto do inverno","text":"Acertos retardam 35% por 2,5 s. No gelo, a lentidão sobe para 65%.","tag":"CONTROLE","color":"83deff","glyph":"❄"},
 {"id":"treasury","name":"Tributo do cristal","text":"Receba 100 de ouro imediatamente.","tag":"RECURSO","color":"e6b866","glyph":"✧"}
]
const CHRONICLE_CARDS = [
 {"id":"counterweight","name":"Contrapeso de escória","text":"+30% de dano, inclusive queimaduras e poças. O alcance diminui 15%.","tag":"RISCO","color":"eda88a","glyph":"◇"},
 {"id":"crossfire","name":"Vigília em dupla","text":"Intervalo entre ataques 18% menor quando outra torreta está a até 120 de distância.","tag":"POSICIONAMENTO","color":"a6dfd6","glyph":"✦"},
]

static func maps() -> Array:
 return JSON.parse_string(FileAccess.get_file_as_string("res://data/maps.json"))

static func card(id: String, chronicle: bool = true) -> Dictionary:
 for c in CARDS+CHRONICLE_CARDS if chronicle else CARDS:
  if c.id == id: return c
 return {}

static func family(type: String) -> String:
 return TOWERS.get(type,{}).get("family",type)

static func regional_types(stage: int) -> Array:
 return TOWERS.keys().filter(func(type):return TOWERS[type].get("act",-1)==stage)

static func aim_origin(type: String, ground: Vector2) -> Vector2:
 var family_id=family(type)
 var height=76.0 if family_id=="tesla" else (80.0 if family_id=="ice" else 56.0)
 return ground-Vector2(0,height)

static func muzzle(t: Dictionary, ground: Vector2) -> Vector2:
 var family_id=family(t.type)
 var length=20.0 if family_id in ["tesla","ice"] else 34.0
 return aim_origin(t.type,ground)+Vector2(cos(t.aim)*length,sin(t.aim)*length*0.68)

static func make_route(raw: Array) -> Dictionary:
 var pts := PackedVector2Array()
 pts.append(Vector2(raw[0][0],raw[0][1]))
 for i in range(1,raw.size()-1):
  var a := Vector2(raw[i-1][0],raw[i-1][1])
  var b := Vector2(raw[i][0],raw[i][1])
  var c := Vector2(raw[i+1][0],raw[i+1][1])
  var radius := minf(28.0,minf(a.distance_to(b),b.distance_to(c))*0.3)
  var p := b.move_toward(a,radius)
  var q := b.move_toward(c,radius)
  pts.append(p)
  for j in range(1,9):
   var f := j/8.0
   pts.append(p.lerp(b,f).lerp(b.lerp(q,f),f))
 pts.append(Vector2(raw[-1][0],raw[-1][1]))
 var lengths := PackedFloat32Array([0.0])
 for i in range(1,pts.size()): lengths.append(lengths[-1]+pts[i].distance_to(pts[i-1]))
 return {"points":pts,"lengths":lengths,"length":lengths[-1]}

static func route_point(route: Dictionary, distance: float) -> Vector2:
 var lengths: PackedFloat32Array = route.lengths
 var pts: PackedVector2Array = route.points
 for i in range(1,lengths.size()):
  if distance <= lengths[i]: return pts[i-1].lerp(pts[i],clampf((distance-lengths[i-1])/(lengths[i]-lengths[i-1]),0.0,1.0))
 return pts[-1]
