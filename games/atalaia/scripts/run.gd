class_name AtalaiaRun
extends RefCounted

const C = preload("res://scripts/catalog.gd")
var maps: Array = C.maps()
var stage = 0
var wave = 0
var gold = 360
var core = 30
var phase = "prep"
var towers: Array = []
var enemies: Array = []
var projectiles: Array = []
var pools: Array = []
var doctrines: Array = []
var choices: Array = []
var records: Dictionary = {}
var events: Array = []
var routes: Array = []
var pads: Array = []
var next_id = 1
var spawn_count = 0
var spawn_total = 0
var spawn_timer = 0.0
var elapsed = 0.0
var wave_elapsed = 0.0
var kills = 0
var rng := RandomNumberGenerator.new()

func _init(seed_value: int = 1847):
 rng.seed = seed_value
 set_map(0)

func set_map(index: int):
 stage = clampi(index,0,maps.size()-1)
 routes.clear()
 pads.clear()
 for lane in maps[stage].lanes: routes.append(C.make_route(lane))
 for p in maps[stage].pads: pads.append(Vector2(p[0],p[1]))

func emit(kind: String, data: Dictionary = {}):
 data.kind = kind
 events.append(data)

func tower_by_id(id: int) -> Dictionary:
 for t in towers:
  if int(t.id) == id: return t
 return {}

func occupant(pad: int) -> Dictionary:
 for t in towers:
  if int(t.pad) == pad: return t
 return {}

func stats(t: Dictionary) -> Dictionary:
 var b = C.TOWERS[t.type]
 var level = int(t.level)
 var power_multiplier=1.0
 var s = {"damage":b.damage*(1.0+(level-1)*0.55),"rate":b.rate*pow(0.92,level-1),"range":b.range+(level-1)*12.0,"splash":64.0 if t.type=="mortar" else 0.0,"slow":0.55 if t.type=="ice" else 0.0,"chains":3,"pool":9.0*(1.0+(level-1)*0.55),"duration":5.0,"cost":int(b.cost*(0.8+level*0.6)),"burn":4.0 if t.type=="flame" else 0.0,"venom":0.0,"ignore":false}
 for mod in t.mods:
  match mod:
   "power": power_multiplier*=1.25
   "rapid": s.rate*=0.8
   "range": s.range*=1.22
   "splash": s.splash+=24.0
   "pierce": s.ignore=true; s.damage*=1.1
   "burn": s.burn+=6.0
   "venom": s.venom+=4.0; s.duration+=2.0
   "economy": s.cost=int(s.cost*0.75)
   "slow": s.slow=0.65 if t.type=="ice" else maxf(s.slow,0.35)
 for d in doctrines:
  if d.type != t.type: continue
  match d.effect:
   "power": power_multiplier*=1.18
   "range": s.range*=1.15
   "mastery":
    match t.type:
     "ballista": s.rate*=0.82
     "mortar": s.splash+=20.0
     "flame": s.burn+=4.0
     "tesla": s.chains+=1
     "ice": s.slow=0.65
     "poison": s.pool*=1.25; s.duration+=2.0
 s.damage*=power_multiplier;s.pool*=power_multiplier;s.burn*=power_multiplier
 return s

func build(type: String, pad: int) -> bool:
 if phase != "prep" or not C.TOWERS.has(type) or pad<0 or pad>=pads.size() or not occupant(pad).is_empty(): return false
 if gold<C.TOWERS[type].cost: return false
 gold-=C.TOWERS[type].cost
 var t = {"id":next_id,"type":type,"pad":pad,"level":1,"mods":[],"cooldown":0.0,"aim":0.0,"recoil":0.0,"firing":false,"beam":Vector2.ZERO,"invested":C.TOWERS[type].cost}
 towers.append(t)
 records[str(next_id)]={"id":next_id,"type":type,"damage":0.0,"wave_damage":0.0,"kills":0,"sold":false}
 next_id+=1
 emit("build",{"id":t.id,"pos":pads[pad],"type":type})
 return true

func upgrade(id: int) -> bool:
 var t = tower_by_id(id)
 if t.is_empty() or int(t.level)>=3 or phase in ["cards","doctrine","defeat","victory"]: return false
 var cost = int(stats(t).cost)
 if gold<cost: return false
 gold-=cost
 t.level+=1
 t.invested+=cost
 emit("upgrade",{"id":id,"pos":pads[t.pad],"type":t.type})
 return true

func sell(id: int) -> bool:
 var t = tower_by_id(id)
 if t.is_empty() or phase != "prep": return false
 gold+=int(t.invested*0.7)
 records[str(id)].sold=true
 towers.erase(t)
 emit("sell")
 return true

func move_tower(id: int, pad: int) -> bool:
 var t = tower_by_id(id)
 if t.is_empty() or phase != "prep" or pad<0 or pad>=pads.size() or int(t.pad)==pad: return false
 var other = occupant(pad)
 if not other.is_empty(): other.pad=t.pad
 t.pad=pad
 emit("move",{"pos":pads[pad],"type":t.type})
 return true

func start_wave() -> bool:
 if phase!="prep": return false
 wave+=1
 phase="wave"
 wave_elapsed=0.0
 spawn_count=0
 spawn_total=12+wave*2
 spawn_timer=0.3
 for r in records.values(): r.wave_damage=0.0
 emit("wave",{"wave":wave})
 return true

func spawn_enemy(type: String = "", lane_index: int = -1) -> Dictionary:
 if type=="":
  var deck = ["skeleton","skeleton","wolf","spider"]
  if wave>=3: deck.append("mushroom")
  if wave>=4: deck.append("golem")
  if stage>=1: deck.append("spirit")
  type="boss" if wave%5==0 and spawn_count==spawn_total-1 else deck[(spawn_count+wave)%deck.size()]
 var lane = posmod(spawn_count,routes.size()) if lane_index<0 else lane_index
 if type=="boss":
  for i in range(routes.size()):
   if routes[i].length>routes[lane].length: lane=i
 var b = C.ENEMIES[type]
 var factor = pow(1.18,wave-1)
 if stage>0: factor*=(0.90 if stage==1 else 1.04)*clampf(routes[lane].length/1750.0,0.45,1.0)
 if type=="boss": factor*=0.72 if stage>0 else 1.0
 var e = {"id":next_id,"type":type,"lane":lane,"d":0.0,"hp":b.hp*factor,"max_hp":b.hp*factor,"speed":b.speed*(1.0+stage*0.06),"armor":b.armor,"gold":b.gold,"damage":b.damage,"pos":C.route_point(routes[lane],0.0),"angle":0.0,"slow":0.0,"slow_time":0.0,"dots":[],"flash":0.0,"dead":false}
 next_id+=1
 enemies.append(e)
 if type=="boss": emit("boss",{"pos":e.pos})
 return e

func damage(e: Dictionary, amount: float, owner: int, ignore_armor: bool = false):
 if e.dead or amount<=0: return
 var effective = amount*(1.0 if ignore_armor else 1.0-e.armor)
 var dealt = minf(e.hp,effective)
 e.hp-=dealt
 e.flash=0.11
 var key = str(owner)
 if records.has(key):
  records[key].damage+=dealt
  records[key].wave_damage+=dealt
 if e.hp<=0:
  e.dead=true
  gold+=e.gold
  kills+=1
  if records.has(key): records[key].kills+=1
  emit("death",{"pos":e.pos,"type":e.type,"owner":owner})

func add_dot(e: Dictionary, owner: int, tag: String, dps: float, duration: float):
 if dps<=0 or e.dead: return
 for d in e.dots:
  if int(d.owner)==owner and d.tag==tag:
   d.dps=maxf(d.dps,dps); d.time=maxf(d.time,duration)
   return
 e.dots.append({"owner":owner,"tag":tag,"dps":dps,"time":duration})

func impact(e: Dictionary, t: Dictionary, s: Dictionary, multiplier: float = 1.0):
 if e.dead: return
 var value = s.damage*multiplier
 if "hunter" in t.mods and e.type in ["boss","golem"]: value*=1.5
 if "shatter" in t.mods and e.slow_time>0.0: value*=1.35
 damage(e,value,int(t.id),s.ignore)
 if s.slow>0:
  e.slow=maxf(e.slow,s.slow*(0.5 if e.type=="boss" else 1.0))
  e.slow_time=maxf(e.slow_time,2.5)
 add_dot(e,int(t.id),"burn",s.burn,3.0)
 add_dot(e,int(t.id),"venom",s.venom,4.0)

func select_target(t: Dictionary, s: Dictionary) -> Dictionary:
 var best: Dictionary = {}
 var remaining = INF
 var pos: Vector2 = pads[int(t.pad)]
 for e in enemies:
  if e.dead or pos.distance_to(e.pos)>s.range: continue
  var eta = (routes[int(e.lane)].length-e.d)/e.speed
  if eta<remaining: remaining=eta; best=e
 return best

func shoot(t: Dictionary, target: Dictionary, s: Dictionary):
 var pos: Vector2 = C.muzzle(t,pads[int(t.pad)])
 t.recoil=1.0
 t.firing=true
 t.beam=target.pos-Vector2(0,18)
 if t.type=="flame":
  var v: Vector2 = target.pos-pads[t.pad]
  for e in enemies:
   if e.dead: continue
   var relative: Vector2 = e.pos-pads[t.pad]
   if relative.length()<=s.range+14.0 and absf(relative.angle_to(v))<0.29+s.splash/120.0: impact(e,t,s)
  emit("flame",{"pos":pos})
 elif t.type=="tesla":
  var chain: Array = [target]
  for i in range(int(s.chains)-1):
   var nearest: Dictionary = {}
   var dist = 135.0
   for e in enemies:
    if e.dead or e in chain: continue
    var d = e.pos.distance_to(chain[-1].pos)
    if d<dist: dist=d; nearest=e
   if nearest.is_empty(): break
   chain.append(nearest)
  var points = [pos]
  for e in chain:
   points.append(e.pos-Vector2(0,18))
   impact(e,t,s,pow(0.86,chain.find(e)))
   if s.splash>0:
    for nearby in enemies:
     if not nearby.dead and nearby not in chain and nearby.pos.distance_to(e.pos)<=s.splash:impact(nearby,t,s,0.5)
  emit("lightning",{"points":points,"pos":pos,"type":t.type})
 else:
  var flight = pos.distance_to(target.pos)/(315.0 if t.type=="mortar" else 600.0)
  var destination = C.route_point(routes[int(target.lane)],target.d+target.speed*(1.0-target.slow)*flight*0.9) if t.type in ["mortar","poison"] else target.pos
  projectiles.append({"pos":pos,"start":pos,"end":destination-Vector2(0,12),"target":target.id,"t":t.duplicate(true),"stats":s,"age":0.0,"flight":maxf(0.15,flight)})
  emit("shot",{"pos":pos,"type":t.type})

func tick(dt: float):
 if phase!="wave": return
 elapsed+=dt
 wave_elapsed+=dt
 spawn_timer-=dt
 if spawn_count<spawn_total and spawn_timer<=0:
  spawn_enemy()
  spawn_count+=1
  spawn_timer=maxf(0.32,0.95-wave*0.032)
 for e in enemies:
  if e.dead: continue
  e.flash=maxf(0.0,e.flash-dt)
  e.slow_time=maxf(0.0,e.slow_time-dt)
  if e.slow_time<=0: e.slow=0.0
  for d in e.dots:
   var step = minf(dt,d.time)
   damage(e,d.dps*step,int(d.owner),true)
   d.time-=dt
  e.dots=e.dots.filter(func(d): return d.time>0)
  var owners: Dictionary = {}
  for p in pools:
   if p.pos.distance_to(e.pos)<=p.radius:
    var key = str(p.owner)
    owners[key]=maxf(owners.get(key,0.0),p.dps)
    add_dot(e,int(p.owner),"venom",p.residual,2.0)
  for owner in owners: damage(e,owners[owner]*dt,int(owner),true)
  if e.dead: continue
  e.d+=e.speed*(1.0-e.slow)*dt
  var point = C.route_point(routes[int(e.lane)],e.d)
  e.angle=(point-e.pos).angle()
  e.pos=point
  if e.d>=routes[int(e.lane)].length:
   core=maxi(0,core-int(e.damage))
   e.dead=true
   emit("leak",{"pos":point,"damage":e.damage})
 for p in pools: p.time-=dt
 pools=pools.filter(func(p): return p.time>0)
 for t in towers:
  t.recoil=maxf(0.0,t.recoil-dt*5.0)
  t.cooldown-=dt
  t.firing=false
  var s = stats(t)
  var target = select_target(t,s)
  if not target.is_empty():
   var height=76.0 if t.type=="tesla" else (80.0 if t.type=="ice" else 56.0)
   var desired = ((target.pos-Vector2(0,18)-(pads[int(t.pad)]-Vector2(0,height)))/Vector2(1,0.68)).angle()
   t.aim=rotate_toward(t.aim,desired,dt*13.0)
   t.firing=t.type=="flame"
   t.beam=target.pos-Vector2(0,18)
   if t.cooldown<=0:
    shoot(t,target,s)
    t.cooldown=s.rate
 for p in projectiles:
  p.age+=dt
  var target: Dictionary = {}
  for e in enemies:
   if int(e.id)==int(p.target) and not e.dead: target=e; break
  if not target.is_empty() and p.t.type not in ["mortar","poison"]: p.end=target.pos-Vector2(0,18)
  var f = clampf(p.age/p.flight,0.0,1.0)
  p.pos=p.start.lerp(p.end,f)
  if p.t.type=="mortar": p.pos.y-=sin(f*PI)*110.0
  if f<1.0: continue
  var type = p.t.type
  if type=="poison":
   pools.append({"owner":p.t.id,"pos":p.end+Vector2(0,12),"radius":48.0+p.stats.splash*0.5,"dps":p.stats.pool,"residual":5.0,"time":p.stats.duration,"duration":p.stats.duration})
  if type=="mortar" or p.stats.splash>0:
   for e in enemies:
    if not e.dead and e.pos.distance_to(p.end+Vector2(0,12))<=p.stats.splash: impact(e,p.t,p.stats)
  elif not target.is_empty(): impact(target,p.t,p.stats)
  emit("impact",{"pos":p.end,"type":type,"radius":p.stats.splash})
 projectiles=projectiles.filter(func(p): return p.age<p.flight)
 enemies=enemies.filter(func(e): return not e.dead)
 if core<=0:
  phase="defeat"
  emit("defeat")
 elif spawn_count>=spawn_total and enemies.is_empty() and projectiles.is_empty(): finish_wave()

func finish_wave():
 gold+=45+wave*3
 pools.clear()
 for t in towers: t.firing=false
 if wave>=15:
  phase="victory"
  emit("victory")
  return
 phase="cards"
 choices.clear()
 var deck = C.CARDS.duplicate(true)
 while choices.size()<3 and not deck.is_empty():
  var i = rng.randi_range(0,deck.size()-1)
  choices.append(deck.pop_at(i))
 emit("cards")

func apply_card(index: int, owner: int) -> bool:
 if phase!="cards" or index<0 or index>=choices.size(): return false
 var c = choices[index]
 if c.id=="treasury": gold+=100
 else:
  var t = tower_by_id(owner)
  if t.is_empty() or t.mods.size()>=3 or c.id in t.mods: return false
  t.mods.append(c.id)
 emit("card_chosen",{"id":c.id,"owner":owner})
 after_reward()
 return true

func skip_card() -> bool:
 if phase!="cards": return false
 gold+=35
 after_reward()
 return true

func after_reward():
 if wave%5==0:
  phase="doctrine"
  choices.clear()
  var available: Array = []
  for type in C.TYPES:
   for effect in ["power","range","mastery"]:
    if not doctrines.any(func(d): return d.type==type and d.effect==effect): available.append({"type":type,"effect":effect})
  while choices.size()<3 and not available.is_empty(): choices.append(available.pop_at(rng.randi_range(0,available.size()-1)))
  emit("doctrine")
 else: phase="prep"; emit("prep")

func apply_doctrine(index: int) -> bool:
 if phase!="doctrine" or index<0 or index>=choices.size(): return false
 doctrines.append(choices[index].duplicate())
 emit("doctrine_chosen")
 set_map(stage+1)
 core=mini(30,core+5)
 gold+=90
 phase="prep"
 emit("map",{"stage":stage})
 return true

func encode(v):
 if v is Vector2: return {"_v2":[v.x,v.y]}
 if v is Array:
  var a: Array=[]
  for x in v: a.append(encode(x))
  return a
 if v is Dictionary:
  var d: Dictionary={}
  for k in v: d[str(k)]=encode(v[k])
  return d
 return v

func decode(v):
 if v is Array:
  var a: Array=[]
  for x in v: a.append(decode(x))
  return a
 if v is Dictionary:
  if v.has("_v2"): return Vector2(v._v2[0],v._v2[1])
  var d: Dictionary={}
  for k in v: d[k]=decode(v[k])
  return d
 return v

func to_data() -> Dictionary:
 var data: Dictionary={"version":1,"rng_state":str(rng.state)}
 for key in ["stage","wave","gold","core","phase","towers","enemies","projectiles","pools","doctrines","choices","records","next_id","spawn_count","spawn_total","spawn_timer","elapsed","wave_elapsed","kills"]: data[key]=encode(get(key))
 return data

func load_data(data: Dictionary) -> bool:
 if int(data.get("version",0))!=1: return false
 for key in ["stage","wave","gold","core","phase","towers","enemies","projectiles","pools","doctrines","choices","records","next_id","spawn_count","spawn_total","spawn_timer","elapsed","wave_elapsed","kills"]:
  if not data.has(key): return false
 if int(data.stage)<0 or int(data.stage)>2 or int(data.wave)<0 or int(data.wave)>15: return false
 for key in data:
  if key not in ["version","rng_state"]: set(key,decode(data[key]))
 for t in towers:
  for key in ["id","pad","level","invested"]: t[key]=int(t[key])
 for e in enemies:
  for key in ["id","lane","gold","damage"]: e[key]=int(e[key])
 next_id=int(next_id); stage=int(stage); wave=int(wave); core=int(core); gold=int(gold)
 spawn_count=int(spawn_count); spawn_total=int(spawn_total); kills=int(kills)
 rng.state=int(data.get("rng_state","1847"))
 set_map(stage)
 return true
