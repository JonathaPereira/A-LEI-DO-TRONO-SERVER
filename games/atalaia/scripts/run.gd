class_name AtalaiaRun
extends RefCounted

const C = preload("res://scripts/catalog.gd")
const SaveSchema = preload("res://scripts/save_schema.gd")
const Strategy = preload("res://scripts/strategy_progress.gd")
const Chronicle = preload("res://scripts/chronicle.gd")
var error_text := ""
var mode := "classic"
var scenario := ""
var scenario_start := 1
var scenario_goal := 1
var maps: Array = []
var stage = 0
var wave = 0
var gold = 360
var core = 30
var phase = "prep"
var towers: Array = []
var enemies: Array = []
var _split_queue: Array = []
var projectiles: Array = []
var pools: Array = []
var doctrines: Array = []
var strategy: Dictionary = {}
var choices: Array = []
var last_card_reroll := 0
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

func _init(seed_value: int = 1847, campaign_mode: String = "classic"):
 mode=campaign_mode
 maps=Chronicle.maps() if mode==Chronicle.MODE else C.maps()
 rng.seed = seed_value
 set_map(0)

func waves_per_act() -> int:
 return Chronicle.PHASES_PER_ACT if mode==Chronicle.MODE else 5

func max_waves() -> int:
 return maps.size()*waves_per_act()

func phase_preview() -> Dictionary:
 return Chronicle.phase(wave+1 if phase=="prep" else wave) if mode==Chronicle.MODE else {}

func environment() -> Dictionary:
 var recipe: Dictionary=phase_preview().get("environment",{})
 if recipe.is_empty():return {}
 var clock:=fposmod(wave_elapsed,float(recipe.period)) if phase=="wave" else 0.0
 var starts:=float(recipe.starts)
 var ends:=starts+float(recipe.duration)
 var active:=phase=="wave" and clock>=starts and clock<ends
 var warning:=phase=="wave" and clock>=starts-float(recipe.warning) and clock<starts
 return {"id":recipe.id,"name":recipe.name,"description":recipe.description,"state":"active" if active else "warning" if warning else "scheduled","seconds":ends-clock if active else starts-clock if clock<starts else float(recipe.period)-clock+starts,"rangeMultiplier":float(recipe.rangeMultiplier) if active else 1.0}

func slag_ward() -> Dictionary:
 var number: int=wave+1 if phase=="prep" else wave
 return C.SLAG_WARD.duplicate() if mode==Chronicle.MODE and scenario!="survival" and number==int(C.SLAG_WARD.wave) else {}

func protection_radius(enemy: Dictionary) -> float:
 if enemy.dead:return 0.0
 if enemy.type=="ward":return float(C.ENEMIES.ward.aura)
 if enemy.type=="boss" and enemy.get("enraged",false) and not slag_ward().is_empty():return float(C.SLAG_WARD.radius)
 return 0.0

func _call_slag_escorts(boss: Dictionary) -> void:
 var recipe:=slag_ward()
 if recipe.is_empty():return
 for index in range(recipe.escorts.size()):
  var escort:=spawn_enemy(recipe.escorts[index],int(boss.lane))
  escort.d=maxf(0.0,boss.d-30.0*(index+1))
  escort.pos=C.route_point(routes[int(boss.lane)],escort.d)
  escort.angle=boss.angle

func crown_pulse(enemy: Dictionary = {}) -> Dictionary:
 var number: int=wave+1 if phase=="prep" else wave
 if mode!=Chronicle.MODE or scenario=="survival" or number!=max_waves():return {}
 if not enemy.is_empty() and (enemy.type!="boss" or enemy.dead or not enemy.get("enraged",false)):return {}
 var preview: Dictionary=C.CROWN_PULSE.duplicate()
 preview["warning"]=false;preview["remaining"]=float(preview.period)
 if phase=="wave" and enemy.has("pulse_started_at"):
  var clock:=fposmod(maxf(0.0,wave_elapsed-float(enemy.pulse_started_at)),float(preview.period))
  preview.warning=clock>=float(preview.period)-float(preview.windup)-0.0000001
  preview.remaining=float(preview.period)-clock
 return preview

func _crown_pulse_tick(enemy: Dictionary, previous_clock: float) -> void:
 var recipe:=crown_pulse(enemy)
 if recipe.is_empty():return
 if not enemy.has("pulse_started_at"):
  enemy["pulse_started_at"]=wave_elapsed
  return
 var before:=maxf(0.0,previous_clock-float(enemy.pulse_started_at))+0.0000001
 var age:=maxf(0.0,wave_elapsed-float(enemy.pulse_started_at))+0.0000001
 if floori(before/float(recipe.period))<floori(age/float(recipe.period)):
  # A caller that skips the warning must still grant its full response window.
  if fposmod(before,float(recipe.period))<float(recipe.period)-float(recipe.windup):
   _warn_crown_pulse(enemy,recipe)
   return
  for tower in towers:
   if enemy.pos.distance_to(pads[int(tower.pad)])<=float(recipe.radius):tower["jam_time"]=maxf(tower.get("jam_time",0.0),float(recipe.jamDuration))
  emit("crown_pulse",{"pos":enemy.pos,"radius":recipe.radius})
  return
 if floori((before+float(recipe.windup))/float(recipe.period))<floori((age+float(recipe.windup))/float(recipe.period)):
  _warn_crown_pulse(enemy,recipe)

func _warn_crown_pulse(enemy: Dictionary, recipe: Dictionary) -> void:
 enemy.pulse_started_at=maxf(0.0,wave_elapsed-(float(recipe.period)-float(recipe.windup)))
 emit("crown_warning",{"pos":enemy.pos,"radius":recipe.radius,"seconds":recipe.windup})

func prepare_scenario(kind: String, target_wave: int = 1, integrity: int = 1) -> bool:
 if mode!=Chronicle.MODE or wave!=0 or not scenario.is_empty() or next_id!=1:return false
 if kind not in ["replay","survival","challenge"] or target_wave<1 or target_wave>max_waves() or integrity<1 or integrity>30:return false
 if kind=="survival" and target_wave!=1:return false
 scenario=kind
 scenario_start=target_wave
 scenario_goal=integrity
 wave=target_wave-1
 gold+=wave*126
 set_map(int(wave/float(waves_per_act())))
 return true

func prepare_strategy(choice: Dictionary) -> bool:
 if wave!=0 or phase!="prep" or next_id!=1 or not strategy.is_empty() or choice.is_empty() or not Strategy.valid_specialization(choice):return false
 strategy={"branch":choice.branch,"rank":int(choice.rank)}
 if strategy.branch=="engineering":gold+=Strategy.BRANCHES.engineering.gold[strategy.rank-1]
 return true

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

func pad_range_bonus(pad: int) -> float:
 for value in maps[stage].get("elevatedPads",[]):
  if int(value)==pad:return 18.0
 return 0.0

func stats(t: Dictionary) -> Dictionary:
 var b = C.TOWERS[t.type]
 var level = int(t.level)
 var family_id: String=C.family(t.type)
 var power_multiplier=1.0
 var s = {"damage":b.damage*(1.0+(level-1)*0.55),"rate":b.rate*pow(0.92,level-1),"range":b.range+(level-1)*12.0,"splash":b.get("splash",64.0 if family_id=="mortar" else 0.0),"slow":b.get("slow",0.55 if family_id=="ice" else 0.0),"chains":b.get("chains",3),"pool":9.0*(1.0+(level-1)*0.55),"duration":5.0,"cost":int(b.cost*(0.8+level*0.6)),"burn":b.get("burn",4.0 if family_id=="flame" else 0.0),"venom":0.0,"ignore":t.type=="harpoon"}
 s.range+=pad_range_bonus(int(t.get("pad",-1)))
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
   "slow": s.slow=maxf(s.slow,0.65 if family_id=="ice" else 0.35)
   "counterweight": power_multiplier*=1.30; s.range*=0.85
   "crossfire":
    var position: Vector2=pads[t.pad]
    if towers.any(func(other):return other.id!=t.id and position.distance_to(pads[other.pad])<=120.0):
     s.rate*=0.82
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
 var conditions:=environment()
 if not conditions.is_empty() and t.type!="spectral":s.range*=conditions.rangeMultiplier
 return s

func available_tower(type: String) -> bool:
 if type in C.TYPES:return true
 return mode==Chronicle.MODE and type in C.regional_types(stage)

func build(type: String, pad: int) -> bool:
 if phase != "prep" or not available_tower(type) or pad<0 or pad>=pads.size() or not occupant(pad).is_empty(): return false
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
 if phase!="prep" or (scenario!="survival" and wave>=max_waves()): return false
 wave+=1
 phase="wave"
 wave_elapsed=0.0
 spawn_count=0
 spawn_total=int(Chronicle.phase(wave).count) if mode==Chronicle.MODE else 12+wave*2
 if scenario=="survival":spawn_total+=mini(15,int((wave-1)/30.0)*3)
 spawn_timer=0.3
 for tower in towers:tower.erase("jam_time")
 for r in records.values(): r.wave_damage=0.0
 emit("wave",{"wave":wave})
 return true

func spawn_enemy(type: String = "", lane_index: int = -1) -> Dictionary:
 if mode==Chronicle.MODE:
  var recipe=Chronicle.phase(wave)
  if lane_index<0:lane_index=int(recipe.lanes[spawn_count%recipe.lanes.size()])
  if type=="":
   type="boss" if wave%waves_per_act()==0 and spawn_count==spawn_total-1 else recipe.deck[spawn_count%recipe.deck.size()]
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
 var factor = pow(1.092,mini(wave,45)-1)*Chronicle.phase(wave).threat if mode==Chronicle.MODE else pow(1.18,wave-1)
 if stage>0: factor*=(0.90 if stage==1 else 1.04)*clampf(routes[lane].length/1750.0,0.45,1.0)
 if type=="boss": factor*=0.72 if stage>0 else 1.0
 var e = {"id":next_id,"type":type,"lane":lane,"d":0.0,"hp":b.hp*factor,"max_hp":b.hp*factor,"speed":b.speed*(1.0+stage*0.06),"armor":b.armor,"gold":b.gold,"damage":b.damage,"pos":C.route_point(routes[lane],0.0),"angle":0.0,"slow":0.0,"slow_time":0.0,"dots":[],"flash":0.0,"dead":false}
 if mode==Chronicle.MODE and stage>=3 and type=="spirit" and int(spawn_count/float(Chronicle.phase(wave).deck.size()))%3==0:
  e["veiled"]=true
  e["revealed"]=0.0
 if mode==Chronicle.MODE and type=="sapper":
  e["jam_cooldown"]=0.0;e["jam_windup"]=0.0;e["jam_target"]=-1
 next_id+=1
 enemies.append(e)
 if type=="boss": emit("boss",{"pos":e.pos})
 return e

func damage(e: Dictionary, amount: float, owner: int, ignore_armor: bool = false):
 if e.dead or amount<=0: return
 var armor: float=e.armor*(0.65 if e.get("revealed",0.0)>0.0 else 1.0)
 var effective = amount*(1.0 if ignore_armor else 1.0-armor)
 if not ignore_armor and e.type!="ward" and enemies.any(func(guard):
  var radius:=protection_radius(guard)
  return guard.id!=e.id and radius>0.0 and e.pos.distance_to(guard.pos)<=radius):
  effective*=C.WARD_DAMAGE_MULTIPLIER
 var dealt = minf(e.hp,effective)
 e.hp-=dealt
 e.flash=0.11
 if mode==Chronicle.MODE and e.type=="boss" and e.hp>0 and e.hp<=e.max_hp*0.5 and not e.get("enraged",false):
  e["enraged"]=true
  _call_slag_escorts(e)
  if not crown_pulse().is_empty():e["pulse_started_at"]=wave_elapsed
  e.speed*=1.13
  for tower in towers:
   if pads[int(tower.pad)].distance_to(e.pos)<144.0:tower.cooldown=maxf(tower.cooldown,1.1)
  emit("boss_phase",{"pos":e.pos})
 var key = str(owner)
 if records.has(key):
  records[key].damage+=dealt
  records[key].wave_damage+=dealt
 if e.hp<=0:
  e.dead=true
  if e.type=="brood":_split_queue.append({"lane":e.lane,"distance":e.d})
  gold+=e.gold
  kills+=1
  if records.has(key): records[key].kills+=1
  emit("death",{"pos":e.pos,"type":e.type,"owner":owner})

func add_dot(e: Dictionary, owner: int, tag: String, dps: float, duration: float):
 if dps<=0 or e.dead: return
 if tag=="burn":dps*=C.ENEMIES[e.type].get("resistBurn",1.0)
 for d in e.dots:
  if int(d.owner)==owner and d.tag==tag:
   d.dps=maxf(d.dps,dps); d.time=maxf(d.time,duration)
   return
 e.dots.append({"owner":owner,"tag":tag,"dps":dps,"time":duration})

func impact(e: Dictionary, t: Dictionary, s: Dictionary, multiplier: float = 1.0):
 if e.dead: return
 var value = s.damage*multiplier
 if t.type=="solar" and e.type=="spirit":value*=1.6
 if t.type=="spectral" and e.type=="spirit":e["revealed"]=3.0
 if t.type=="roots":e["root_time"]=0.275 if e.type=="boss" else 0.55
 if "hunter" in t.mods and e.type in ["boss","golem"]: value*=1.5
 if "shatter" in t.mods and e.slow_time>0.0: value*=1.35
 damage(e,value,int(t.id),s.ignore)
 if s.slow>0:
  e.slow=maxf(e.slow,s.slow*(0.5 if e.type=="boss" else 1.0))
  e.slow_time=maxf(e.slow_time,2.5)
 add_dot(e,int(t.id),"burn",s.burn,4.0 if t.type=="ash_forge" else 3.0)
 add_dot(e,int(t.id),"venom",s.venom,4.0)

func select_target(t: Dictionary, s: Dictionary) -> Dictionary:
 var best: Dictionary = {}
 var remaining = INF
 var pos: Vector2 = pads[int(t.pad)]
 for e in enemies:
  if e.dead or pos.distance_to(e.pos)>s.range: continue
  if e.get("veiled",false) and e.get("revealed",0.0)<=0.0 and t.type!="spectral" and e.d<routes[int(e.lane)].length*0.72:continue
  var eta = (routes[int(e.lane)].length-e.d)/e.speed
  if eta<remaining: remaining=eta; best=e
 return best

func shoot(t: Dictionary, target: Dictionary, s: Dictionary):
 var family_id: String=C.family(t.type)
 var pos: Vector2 = C.muzzle(t,pads[int(t.pad)])
 t.recoil=1.0
 t.firing=true
 t.beam=target.pos-Vector2(0,18)
 if family_id=="flame":
  var v: Vector2 = target.pos-pads[t.pad]
  for e in enemies.duplicate():
   if e.dead: continue
   var relative: Vector2 = e.pos-pads[t.pad]
   if relative.length()<=s.range+14.0 and absf(relative.angle_to(v))<0.29+s.splash/120.0: impact(e,t,s)
  emit("flame",{"pos":pos})
 elif family_id=="tesla":
  var recipients:=enemies.duplicate()
  var chain: Array = [target]
  for i in range(int(s.chains)-1):
   var nearest: Dictionary = {}
   var dist = 135.0
   for e in recipients:
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
    for nearby in recipients:
     if not nearby.dead and nearby not in chain and nearby.pos.distance_to(e.pos)<=s.splash:impact(nearby,t,s,0.5)
  emit("lightning",{"points":points,"pos":pos,"type":t.type})
 else:
  var flight = pos.distance_to(target.pos)/(315.0 if family_id=="mortar" else 600.0)
  var destination = C.route_point(routes[int(target.lane)],target.d+target.speed*(1.0-target.slow)*flight*0.9) if family_id in ["mortar","poison"] else target.pos
  projectiles.append({"pos":pos,"start":pos,"end":destination-Vector2(0,12),"target":target.id,"t":t.duplicate(true),"stats":s,"age":0.0,"flight":maxf(0.15,flight)})
  emit("shot",{"pos":pos,"type":t.type})

func _marching_allies() -> Dictionary:
 var affected: Dictionary={}
 if mode!=Chronicle.MODE:return affected
 var sources: Array=enemies.filter(func(enemy):return enemy.type=="herald" and not enemy.dead)
 if sources.is_empty():return affected
 # One membership snapshot per step keeps movement independent of array order.
 for enemy in enemies:
  if enemy.dead or enemy.type in ["herald","boss"]:continue
  if sources.any(func(source):return source.pos.distance_to(enemy.pos)<=C.ENEMIES.herald.marchRadius):affected[enemy.id]=true
 return affected

func _sapper_tick(enemy: Dictionary, dt: float) -> void:
 var recipe: Dictionary=C.ENEMIES.sapper
 if enemy.jam_target>0:
  var target:=tower_by_id(int(enemy.jam_target))
  if target.is_empty() or enemy.pos.distance_to(pads[int(target.pad)])>recipe.jamRange:
   enemy.jam_target=-1;enemy.jam_windup=0.0;enemy.jam_cooldown=1.0
   return
  enemy.jam_windup=maxf(0.0,enemy.jam_windup-dt)
  if enemy.jam_windup<=0.0:
   target["jam_time"]=maxf(target.get("jam_time",0.0),recipe.jamDuration)
   enemy.jam_target=-1;enemy.jam_cooldown=recipe.jamCooldown
   emit("jam",{"pos":pads[int(target.pad)],"enemy":enemy.id,"tower":target.id})
  return
 enemy.jam_cooldown=maxf(0.0,enemy.jam_cooldown-dt)
 if enemy.jam_cooldown>0.0:return
 var closest: Dictionary={}
 var distance: float=recipe.jamRange
 for tower in towers:
  var next_distance: float=enemy.pos.distance_to(pads[int(tower.pad)])
  if next_distance<=distance:closest=tower;distance=next_distance
 if closest.is_empty():return
 enemy.jam_target=int(closest.id);enemy.jam_windup=recipe.jamWindup
 emit("jam_warning",{"pos":pads[int(closest.pad)],"enemy":enemy.id,"tower":closest.id})

func tick(dt: float):
 if phase!="wave": return
 var previous_clock: float=wave_elapsed
 elapsed+=dt
 wave_elapsed+=dt
 spawn_timer-=dt
 if spawn_count<spawn_total and spawn_timer<=0:
  spawn_enemy()
  spawn_count+=1
  spawn_timer=float(Chronicle.phase(wave).interval) if mode==Chronicle.MODE else maxf(0.32,0.95-wave*0.032)
 var marching: Dictionary=_marching_allies()
 for e in enemies.duplicate():
  if e.dead: continue
  e.flash=maxf(0.0,e.flash-dt)
  if e.has("revealed"):e.revealed=maxf(0.0,e.revealed-dt)
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
  var moving_time:=dt
  if e.has("root_time"):
   moving_time=maxf(0.0,dt-e.root_time)
   e.root_time=maxf(0.0,e.root_time-dt)
  e.d+=e.speed*(C.ENEMIES.herald.marchMultiplier if marching.has(e.id) else 1.0)*(1.0-e.slow)*moving_time
  var point = C.route_point(routes[int(e.lane)],e.d)
  e.angle=(point-e.pos).angle()
  e.pos=point
  if e.d>=routes[int(e.lane)].length:
   core=maxi(0,core-int(e.damage))
   e.dead=true
   emit("leak",{"pos":point,"damage":e.damage})
  if mode==Chronicle.MODE and e.type=="sapper" and not e.dead:_sapper_tick(e,dt)
 for p in pools: p.time-=dt
 pools=pools.filter(func(p): return p.time>0)
 for t in towers:
  t.recoil=maxf(0.0,t.recoil-dt*5.0)
  t.cooldown-=dt
  t.firing=false
  if t.get("jam_time",0.0)>0.0:
   t.jam_time=maxf(0.0,t.jam_time-dt)
   if t.jam_time>0.0:continue
  var s = stats(t)
  var target = select_target(t,s)
  if not target.is_empty():
   var family_id: String=C.family(t.type)
   var desired = ((target.pos-Vector2(0,18)-C.aim_origin(t.type,pads[int(t.pad)]))/Vector2(1,0.68)).angle()
   t.aim=rotate_toward(t.aim,desired,dt*13.0)
   t.firing=family_id=="flame"
   t.beam=target.pos-Vector2(0,18)
   if t.cooldown<=0:
    shoot(t,target,s)
    t.cooldown=s.rate
 for p in projectiles:
  p.age+=dt
  var target: Dictionary = {}
  for e in enemies:
   if int(e.id)==int(p.target) and not e.dead: target=e; break
  var type: String=C.family(p.t.type)
  if not target.is_empty() and type not in ["mortar","poison"]: p.end=target.pos-Vector2(0,18)
  var f = clampf(p.age/p.flight,0.0,1.0)
  p.pos=p.start.lerp(p.end,f)
  if type=="mortar": p.pos.y-=sin(f*PI)*110.0
  if f<1.0: continue
  if type=="poison":
   pools.append({"owner":p.t.id,"pos":p.end+Vector2(0,12),"radius":48.0+p.stats.splash*0.5,"dps":p.stats.pool,"residual":5.0,"time":p.stats.duration,"duration":p.stats.duration})
  if type=="mortar" or p.stats.splash>0:
   for e in enemies.duplicate():
    if not e.dead and e.pos.distance_to(p.end+Vector2(0,12))<=p.stats.splash: impact(e,p.t,p.stats)
  elif not target.is_empty(): impact(target,p.t,p.stats)
  emit("impact",{"pos":p.end,"type":p.t.type,"radius":p.stats.splash})
 projectiles=projectiles.filter(func(p): return p.age<p.flight)
 if not crown_pulse().is_empty():
  for enemy in enemies:_crown_pulse_tick(enemy,previous_clock)
 enemies=enemies.filter(func(e): return not e.dead)
 for parent in _split_queue:
  for offset in [0.0,24.0]:
   var child:=spawn_enemy("hatchling",int(parent.lane))
   child.d=maxf(0.0,parent.distance-offset)
   child.pos=C.route_point(routes[child.lane],child.d)
 _split_queue.clear()
 if core<=0:
  phase="defeat"
  emit("defeat")
 elif spawn_count>=spawn_total and enemies.is_empty() and projectiles.is_empty(): finish_wave()

func finish_wave():
 gold+=45+wave*3
 if strategy.get("branch")=="protection" and wave%3==0:
  core=mini(30,core+Strategy.BRANCHES.protection.repair[strategy.rank-1])
 pools.clear()
 for t in towers:
  t.firing=false
  t.erase("jam_time")
 if mode==Chronicle.MODE:
  var recipe=Chronicle.phase(wave)
  if core>=recipe.integrity:
   gold+=int(recipe.reward)
   emit("integrity_bonus",{"gold":recipe.reward})
 if scenario in ["replay","challenge"]:
  phase="victory" if core>=scenario_goal else "defeat"
  emit(phase)
  return
 if wave>=max_waves() and scenario!="survival":
  phase="victory"
  emit("victory")
  return
 phase="cards"
 _draw_cards()
 emit("cards")

func _draw_cards(excluded: Array = []) -> void:
 choices.clear()
 var pool: Array=C.CARDS+C.CHRONICLE_CARDS if mode==Chronicle.MODE else C.CARDS
 var deck=pool.filter(func(card):return not card.id in excluded)
 while choices.size()<3:
  choices.append(deck.pop_at(rng.randi_range(0,deck.size()-1)).duplicate(true))
 if strategy.get("branch")=="knowledge" and wave in Strategy.BRANCHES.knowledge.treasury[strategy.rank-1] and "treasury" not in excluded:
  if not choices.any(func(card):return card.id=="treasury"):choices[-1]=C.card("treasury").duplicate()

func can_reroll_cards() -> bool:
 return mode==Chronicle.MODE and phase=="cards" and last_card_reroll!=wave and gold>=30

func reroll_cards() -> bool:
 if not can_reroll_cards():return false
 gold-=30
 last_card_reroll=wave
 _draw_cards(choices.map(func(card):return card.id))
 return true

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
 if wave%waves_per_act()==0:
  phase="doctrine"
  choices.clear()
  var available: Array = []
  for type in C.TYPES:
   for effect in ["power","range","mastery"]:
    if not doctrines.any(func(d): return d.type==type and d.effect==effect): available.append({"type":type,"effect":effect})
  if available.is_empty():
   _advance_map()
   return
  while choices.size()<3 and not available.is_empty(): choices.append(available.pop_at(rng.randi_range(0,available.size()-1)))
  emit("doctrine")
 else: phase="prep"; emit("prep")

func apply_doctrine(index: int) -> bool:
 if phase!="doctrine" or index<0 or index>=choices.size(): return false
 doctrines.append(choices[index].duplicate())
 emit("doctrine_chosen")
 _advance_map()
 return true

func _advance_map() -> void:
 set_map((stage+1)%maps.size() if scenario=="survival" else stage+1)
 var refund := 0
 for tower in towers.duplicate():
  if int(tower.pad)<pads.size():continue
  var destination := -1
  for pad in range(pads.size()):
   if occupant(pad).is_empty():
    destination=pad
    break
  if destination>=0:
   tower.pad=destination
  else:
   refund+=int(tower.invested)
   records[str(tower.id)].sold=true
   towers.erase(tower)
 core=mini(30,core+5)
 gold+=90+refund
 phase="prep"
 emit("map",{"stage":stage,"refund":refund})

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
 if not strategy.is_empty():data["strategy"]=strategy.duplicate()
 if mode==Chronicle.MODE:data["mode"]=mode
 if last_card_reroll>0:data["last_card_reroll"]=last_card_reroll
 for key in ["stage","wave","gold","core","phase","towers","enemies","projectiles","pools","doctrines","choices","records","next_id","spawn_count","spawn_total","spawn_timer","elapsed","wave_elapsed","kills"]: data[key]=encode(get(key))
 return data

func load_data(data: Variant) -> bool:
 var requested: Variant = data.get("mode","classic") if data is Dictionary else null
 var candidate_maps: Array = Chronicle.maps() if requested==Chronicle.MODE else C.maps()
 var per_act: int = Chronicle.PHASES_PER_ACT if requested==Chronicle.MODE else 5
 var problem: String = SaveSchema.validate(data,candidate_maps,per_act)
 if problem != "":
  error_text = "O progresso não pôde ser aberto: " + problem + ". O arquivo original foi preservado."
  return false
 # Decode only a fully validated envelope; rejected input cannot partially mutate a run.
 mode=requested
 scenario=""
 scenario_start=1
 scenario_goal=1
 maps=candidate_maps
 for key in SaveSchema.FIELDS: set(key,decode(data[key]))
 last_card_reroll=int(data.get("last_card_reroll",0))
 _split_queue.clear()
 strategy=data.get("strategy",{}).duplicate()
 if not strategy.is_empty():strategy.rank=int(strategy.rank)
 for t in towers:
  for key in ["id","pad","level","invested"]: t[key]=int(t[key])
 for e in enemies:
  for key in ["id","lane","gold","damage"]: e[key]=int(e[key])
 next_id=int(next_id); stage=int(stage); wave=int(wave); core=int(core); gold=int(gold)
 spawn_count=int(spawn_count); spawn_total=int(spawn_total); kills=int(kills)
 rng.state=int(data.get("rng_state","1847"))
 set_map(stage)
 error_text = ""
 return true
