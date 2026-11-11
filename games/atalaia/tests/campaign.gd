extends SceneTree
const Run=preload("res://scripts/run.gd")
const C=preload("res://scripts/catalog.gd")
var s: AtalaiaRun
var fail=false
var card_policy="adaptive"
var card_counts={}
var renewals=0
var skipped_cards=0

func _init():call_deferred("play")
func coverage(pad: int, type: String) -> float:
 var radius=C.TOWERS[type].range+s.pad_range_bonus(pad)
 var score=0.0
 var active=s.phase_preview().get("lanes",range(s.routes.size()))
 for index in active:
  var route=s.routes[int(index)]
  var samples=100
  for j in range(samples):
   var p=C.route_point(route,route.length*j/float(samples))
   if s.pads[pad].distance_to(p)<radius:
    # Length-weighted across lanes. Short routes need more defense.
    score+=route.length/samples/active.size()*pow(1800.0/route.length,1.4)
 return score

func build_defense():
 if "--fixed-policy" in OS.get_cmdline_user_args() and s.towers.size()>=4:return
 # Legal deterministic policy, no free gold/health/instant damage.
 var sequence=["ballista","flame","ice","poison","mortar","tesla","ballista","flame","mortar","poison","tesla","ice","ballista","mortar","flame","poison"]
 if s.mode=="chronicle":sequence.append_array(["ice","mortar","ballista","tesla","mortar","poison"])
 while s.towers.size()<mini(sequence.size(),s.pads.size()):
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

func take_card(index: int,owner: int):
 var id: String=s.choices[index].id
 if s.apply_card(index,owner):card_counts[id]=card_counts.get(id,0)+1

func reward():
 if card_policy=="renew" and s.reroll_cards():renewals+=1
 if card_policy=="resources":
  for index in range(s.choices.size()):
   if s.choices[index].id=="treasury":take_card(index,-1);return
  if s.skip_card():skipped_cards+=1
  return
 for i in range(s.choices.size()):
  var c=s.choices[i]
  if c.id=="treasury" and s.towers.size()<14:take_card(i,-1);return
  var candidates=s.towers.duplicate()
  candidates.sort_custom(func(a,b):return s.records[str(a.id)].damage>s.records[str(b.id)].damage)
  for t in candidates:
   if t.mods.size()<3 and c.id not in t.mods:take_card(i,t.id);return
 if s.skip_card():skipped_cards+=1

func relocate_defense():
 var sorted=s.towers.duplicate()
 sorted.sort_custom(func(a,b):return s.records[str(a.id)].damage>s.records[str(b.id)].damage)
 var occupied: Array=[]
 for t in sorted:
  var best=-1
  var score=-1.0
  for pad in range(s.pads.size()):
   if pad in occupied:continue
   var value=coverage(pad,t.type)
   if value>score:score=value;best=pad
  if best>=0:
   s.move_tower(t.id,best)
   occupied.append(best)

func play():
 var args:=OS.get_cmdline_user_args()
 var seed_value:=78
 var branch:=""
 for arg in args:
  if arg.begins_with("--seed="):seed_value=int(arg.trim_prefix("--seed="))
  if arg.begins_with("--strategy="):branch=arg.trim_prefix("--strategy=")
  if arg.begins_with("--card-policy="):card_policy=arg.trim_prefix("--card-policy=")
 if card_policy not in ["adaptive","resources","renew"]:
  push_error("Unknown card policy.");quit(1);return
 s=Run.new(seed_value,"chronicle" if "--chronicle" in args else "classic")
 if branch!="" and not s.prepare_strategy({"branch":branch,"rank":2}):
  push_error("The simulation strategy is invalid.")
  quit(1)
  return
 var previous_stage=0
 var safety=0
 while s.phase!="victory" and s.phase!="defeat" and safety<200000:
  safety+=1
  match s.phase:
   "prep":
    if s.mode=="chronicle" and "--fixed-policy" not in OS.get_cmdline_user_args():relocate_defense()
    build_defense();s.start_wave()
   "wave":s.tick(1.0/30.0)
   "cards":
    print("ONDA %02d · núcleo %02d · ouro %d · %d torretas · %.1f s"%[s.wave,s.core,s.gold,s.towers.size(),s.wave_elapsed]);reward()
   "doctrine":
    s.apply_doctrine(0)
    # Place the stronger units on useful sites at the new map, via legal free swaps.
    if s.stage!=previous_stage:
     previous_stage=s.stage
     relocate_defense()
  s.events.clear()
 print("CAMPANHA: %s · onda %d · integridade %d · %d abates"%[s.phase,s.wave,s.core,s.kills])
 var result={"phase":s.phase,"wave":s.wave,"core":s.core,"kills":s.kills,"towers":s.towers.size(),"seed":seed_value,"strategy":branch,"elapsed":s.elapsed,"gold":s.gold,"cardPolicy":card_policy,"cards":card_counts,"renewals":renewals,"skippedCards":skipped_cards}
 var out=FileAccess.open("user://campaign-verification.json",FileAccess.WRITE)
 out.store_string(JSON.stringify(result));out.close()
 var expected="defeat" if "--fixed-policy" in OS.get_cmdline_user_args() else "victory"
 quit(0 if s.phase==expected else 1)
