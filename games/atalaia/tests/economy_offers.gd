extends SceneTree
const Run=preload("res://scripts/run.gd")
const Catalog=preload("res://scripts/catalog.gd")
var checks:=0
var failures:=0
var distribution:={}
var offers:=0
var renewals:=0
func _initialize():run.call_deferred()
func check(ok: bool,why: String):
 checks+=1
 if not ok:failures+=1;push_error(why)
func resolve_wave(run):
 run.start_wave()
 # Isolate the reward/economy boundary; this is not a combat victory.
 run.spawn_count=run.spawn_total
 run.tick(0.0)
func unique(values: Array) -> bool:
 var seen:={}
 for value in values:seen[value]=true
 return seen.size()==values.size()
func inspect_offer(session):
 var ids=session.choices.map(func(card):return card.id)
 check(ids.size()==3 and unique(ids),"Every offer contains three distinct cards")
 check(session.choices.all(func(card):return card==Catalog.card(card.id)),"Each offered card has its canonical cost-free modifier or treasury identity")
 for id in ids:distribution[id]=distribution.get(id,0)+1
 offers+=1
func choose_reward(session,policy: String):
 var before: int=session.gold
 if policy!="equipment":
  for index in range(session.choices.size()):
   if session.choices[index].id=="treasury":
    check(session.apply_card(index,-1) and session.gold==before+100,"Treasury grants exactly one hundred gold")
    return
 if policy!="resources":
  for index in range(session.choices.size()):
   var id: String=session.choices[index].id
   if id=="treasury":continue
   for tower in session.towers:
    if tower.mods.size()<3 and id not in tower.mods:
     var count: int=tower.mods.size()
     check(session.apply_card(index,tower.id) and session.gold==before and tower.mods.size()==count+1 and id in tower.mods,"A selected equipment card adds one modifier and spends no gold")
     return
 check(session.skip_card() and session.gold==before+35,"Skipping grants exactly thirty-five gold")
func matrix():
 for seed_value in [78,1847,90210]:
  for branch in ["","engineering","protection","knowledge"]:
   for policy in ["resources","equipment","renew"]:
    var session=Run.new(seed_value,"chronicle")
    if not branch.is_empty():session.prepare_strategy({"branch":branch,"rank":2})
    var initial: int=session.gold
    check(session.build("ballista",0) and session.gold==initial-70,"Each policy buys its first ballista for seventy gold")
    check(session.upgrade(1) and session.gold==initial-168,"The first ballista upgrade costs ninety-eight gold")
    check(session.upgrade(1) and session.gold==initial-308,"The second ballista upgrade costs one hundred forty gold")
    var spent: int=session.gold
    check(not session.upgrade(1) and session.gold==spent,"The level cap cannot consume more gold")
    for wave in range(1,31):
     var before: int=session.gold
     resolve_wave(session)
     check(session.gold==before+45+wave*3+int(session.phase_preview().reward),"Resolved waves retain their base and full-integrity authored rewards")
     if wave==30:
      check(session.phase=="victory","The economy fixture reaches the final reward boundary")
      continue
     inspect_offer(session)
     if branch=="knowledge" and wave in [3,8]:check(session.choices.any(func(card):return card.id=="treasury"),"Knowledge guarantees treasury in the initial offer at both promised milestones")
     if policy=="renew":
      var old_ids=session.choices.map(func(card):return card.id)
      before=session.gold
      check(session.reroll_cards() and session.gold==before-30,"Renewal charges exactly thirty gold")
      check(not session.choices.any(func(card):return card.id in old_ids),"Renewal replaces all three cards under every strategy")
      renewals+=1
      inspect_offer(session)
     var snapshot=JSON.stringify(session.to_data())
     var reopened=Run.new()
     check(reopened.load_data(JSON.parse_string(snapshot)) and reopened.gold==session.gold and reopened.choices==session.choices,"Every pending offer reopens with the same gold and choices")
     session=reopened
     if policy=="renew":
      snapshot=JSON.stringify(session.to_data())
      check(not session.reroll_cards() and JSON.stringify(session.to_data())==snapshot,"Reopening cannot buy another renewal or advance its RNG")
     choose_reward(session,policy)
     check(session.gold>=0 and session.towers.all(func(tower):return tower.mods.size()<=3 and unique(tower.mods)),"All policies retain nonnegative gold and unique bounded modifiers")
     if session.phase=="doctrine":
      before=session.gold
      check(session.apply_doctrine(0) and session.gold==before+90,"Advancing an act grants its ninety gold once")
    before_sell(session)
 check(distribution.size()==14,"The seeded offer matrix reaches every classic and Chronicle card")
 print("Economy matrix: 36 sessions, %d offers, %d renewals; distribution=%s"%[offers,renewals,JSON.stringify(distribution)])
func before_sell(session):
 # The same tower investment survives all reward choices and act transitions.
 var before: int=session.gold
 check(session.towers[0].invested==308 and not session.sell(1) and session.gold==before,"Final victory conserves invested gold and prevents selling after completion")
func run():
 var session=Run.new(78,"chronicle")
 session.prepare_strategy({"branch":"knowledge","rank":2})
 for wave in range(1,4):
  resolve_wave(session)
  if wave<3:session.skip_card()
 var initial: Array=session.choices.map(func(card):return card.id)
 check(initial.has("treasury"),"Knowledge offers its promised treasury on wave three")
 var gold: int=session.gold
 check(session.reroll_cards() and session.gold==gold-30,"Replacing the knowledge offer costs exactly thirty gold")
 check(not session.choices.any(func(card):return card.id in initial),"Replacing an offer must replace all three cards, including a rejected guaranteed treasury")
 matrix()
 print("Economy offers: %d checks, %d failures."%[checks,failures]);quit(1 if failures else 0)
