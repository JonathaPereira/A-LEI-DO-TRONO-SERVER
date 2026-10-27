extends SceneTree
const Run=preload("res://scripts/run.gd")
const C=preload("res://scripts/catalog.gd")
var s: AtalaiaRun
var fail=false

func _init():call_deferred("play")
func coverage(pad: int, type: String) -> float:
 var radius=C.TOWERS[type].range
 var score=0.0
 for route in s.routes:
  var samples=100
  for j in range(samples):
   var p=C.route_point(route,route.length*j/float(samples))
   if s.pads[pad].distance_to(p)<radius:
    # Length-weighted across lanes. Short routes need more defense.
    score+=route.length/samples/s.routes.size()*pow(1800.0/route.length,1.4)
 return score

func build_defense():
 if "--fixed-policy" in OS.get_cmdline_user_args() and s.towers.size()>=4:return
 # Legal deterministic policy, no free gold/health/instant damage.
 var sequence=["ballista","flame","ice","poison","mortar","tesla","ballista","flame","mortar","poison","tesla","ice","ballista","mortar","flame","poison"]
 while s.towers.size()<16:
  if "--fixed-policy" in OS.get_cmdline_user_args() and s.towers.size()>=4:break
  var type=sequence[s.towers.size()]
  if s.gold<C.TOWERS[type].cost:break
  var best=-1;var best_score=-1.0
  for pad in range(s.pads.size()):
   if not s.occupant(pad).is_empty():continue
   var score=coverage(pad,type)
   # Spread damage among the initial, middle and final sections.
   for t in s.towers:
    if s.pads[t.pad].distance_to(s.pads[pad])<130:score*=0.6
   if score>best_score:best=pad;best_score=score
  if best<0 or not s.build(type,best):break
 for tier in range(2):
  for t in s.towers:
   if int(t.level)==tier+1:s.upgrade(t.id)

func reward():
 for i in range(s.choices.size()):
  var c=s.choices[i]
  if c.id=="treasury" and s.towers.size()<14:s.apply_card(i,-1);return
  var candidates=s.towers.duplicate()
  candidates.sort_custom(func(a,b):return s.records[str(a.id)].damage>s.records[str(b.id)].damage)
  for t in candidates:
   if t.mods.size()<3 and c.id not in t.mods:s.apply_card(i,t.id);return
 s.skip_card()

func play():
 s=Run.new(78)
 var previous_stage=0
 var safety=0
 while s.phase!="victory" and s.phase!="defeat" and safety<200000:
  safety+=1
  match s.phase:
   "prep":
    build_defense();s.start_wave()
   "wave":s.tick(1.0/30.0)
   "cards":
    print("ONDA %02d · núcleo %02d · ouro %d · %d torretas · %.1f s"%[s.wave,s.core,s.gold,s.towers.size(),s.wave_elapsed]);reward()
   "doctrine":
    s.apply_doctrine(0)
    # Place the stronger units on useful sites at the new map, via legal free swaps.
    if s.stage!=previous_stage:
     previous_stage=s.stage
     var sorted=s.towers.duplicate();sorted.sort_custom(func(a,b):return s.records[str(a.id)].damage>s.records[str(b.id)].damage)
     var occupied: Array=[]
     for t in sorted:
      var best=-1;var score=-1.0
      for pad in range(s.pads.size()):
       if pad in occupied:continue
       var value=coverage(pad,t.type)
       if value>score:score=value;best=pad
      if best>=0: s.move_tower(t.id,best);occupied.append(best)
  s.events.clear()
 print("CAMPANHA: %s · onda %d · integridade %d · %d abates"%[s.phase,s.wave,s.core,s.kills])
 var result={"phase":s.phase,"wave":s.wave,"core":s.core,"kills":s.kills,"towers":s.towers.size(),"seed":78}
 var out=FileAccess.open("user://campaign-verification.json",FileAccess.WRITE)
 out.store_string(JSON.stringify(result));out.close()
 var expected="defeat" if "--fixed-policy" in OS.get_cmdline_user_args() else "victory"
 quit(0 if s.phase==expected else 1)
