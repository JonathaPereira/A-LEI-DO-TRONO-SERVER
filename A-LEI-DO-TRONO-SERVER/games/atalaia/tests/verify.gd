extends SceneTree
const Run=preload("res://scripts/run.gd")
const C=preload("res://scripts/catalog.gd")
var failed=0
var checks=0

func check(ok: bool, text: String):
 checks+=1
 if not ok:failed+=1;push_error("FAIL: "+text)
 else:print("PASS: "+text)

func _init():
 call_deferred("verify")

func verify():
 var s=Run.new(19)
 check(s.gold==360 and s.maps.size()==3,"Campanha começa com 3 territórios e 360 de ouro")
 check(s.build("poison",0),"Construção legal")
 check(not s.build("ice",0),"Espaço ocupado rejeitado")
 var t=s.towers[0]
 var owner=int(t.id)
 var cost=s.stats(t).cost
 check(s.upgrade(owner) and s.gold==360-95-cost,"Evolução desconta o preço exato")
 t.mods=["power","rapid"]
 var saved_id=t.id
 check(s.move_tower(owner,2) and s.towers[0].id==saved_id and t.mods.size()==2,"Mover mantém identidade, cartas e nível")
 s.build("ice",1)
 var ice=s.towers[-1]
 check(s.move_tower(owner,1) and ice.pad==2,"Troca de espaços preserva ambas as torretas")
 s.start_wave()
 check(not s.move_tower(owner,3) and not s.build("ballista",3),"Construir e mover bloqueados na onda")
 s.enemies.clear();s.spawn_count=s.spawn_total
 var e=s.spawn_enemy("golem",0)
 e.d=10;e.pos=C.route_point(s.routes[0],e.d);e.speed=0.0
 s.pools=[{"owner":owner,"pos":e.pos,"radius":48.0,"dps":10.0,"residual":0.0,"time":5.0,"duration":5.0},{"owner":owner,"pos":e.pos,"radius":48.0,"dps":10.0,"residual":0.0,"time":5.0,"duration":5.0}]
 for tower in s.towers:tower.cooldown=100.0
 var hp=e.hp
 s.tick(0.1)
 check(is_equal_approx(hp-e.hp,1.0),"Poças do mesmo dono usam o maior DPS, sem duplicar")
 s.pools.append({"owner":int(ice.id),"pos":e.pos,"radius":48.0,"dps":10.0,"residual":0.0,"time":5.0,"duration":5.0})
 hp=e.hp;s.tick(0.1)
 check(is_equal_approx(hp-e.hp,2.0),"Poças de donos diferentes somam dano")
 e.hp=0.5
 var before=s.records[str(owner)].damage
 s.damage(e,9999,owner,true)
 check(is_equal_approx(s.records[str(owner)].damage-before,0.5),"Relatório contabiliza dano efetivo, sem excesso")
 var a=Run.new(20);a.gold=2000;a.build("ice",0)
 var frozen=a.spawn_enemy("wolf",0)
 var st=a.stats(a.towers[0]);a.impact(frozen,a.towers[0],st)
 check(is_equal_approx(frozen.slow,0.55) and frozen.slow_time==2.5,"Gelo aplica 55% de lentidão")
 var boss=a.spawn_enemy("boss",0);a.impact(boss,a.towers[0],st)
 check(is_equal_approx(boss.slow,0.275),"Chefe resiste à metade da lentidão")
 var b=Run.new(21);b.gold=2000;b.build("ballista",0)
 var base=b.stats(b.towers[0]).damage
 b.doctrines.append({"type":"ballista","effect":"power"});b.build("ballista",1)
 check(is_equal_approx(b.stats(b.towers[0]).damage,base*1.18) and is_equal_approx(b.stats(b.towers[1]).damage,base*1.18),"Doutrina afeta torretas atuais e futuras")
 check(b.towers[0].mods.is_empty(),"Doutrinas não ocupam espaços individuais")
 b.phase="cards";b.choices=[C.card("power")]
 check(b.apply_card(0,b.towers[0].id) and b.towers[1].mods.is_empty(),"Carta individual afeta somente a torreta escolhida")
 b.wave=5;b.phase="cards";b.choices=[C.card("treasury")];b.apply_card(0,-1)
 check(b.phase=="doctrine" and b.choices.size()==3,"Chefe oferece etapa adicional de doutrina")
 b.apply_doctrine(0)
 check(b.stage==1 and b.routes.size()==2 and b.phase=="prep","Doutrina libera o território com duas vias")
 b.wave=10;b.phase="cards";b.choices=[C.card("treasury")];b.apply_card(0,-1);b.apply_doctrine(0)
 check(b.stage==2 and b.routes.size()==3,"Terceira fase usa três caminhos reais")
 var route_ok=true
 for stage in range(3):
  b.set_map(stage)
  for p in b.pads:
   var distance=INF
   for route in b.routes:
    var pts=route.points
    for i in range(1,pts.size()):distance=minf(distance,p.distance_to(Geometry2D.get_closest_point_to_segment(p,pts[i-1],pts[i])))
   if distance>105.0 or distance<45.0:route_ok=false
 check(route_ok,"Todos os 48 espaços ficam junto a uma estrada e ao alcance do fogo")
 var save=Run.new(22);save.gold=1000;save.build("poison",0);save.start_wave();save.spawn_enemy("spider",0)
 save.pools.append({"owner":save.towers[0].id,"pos":Vector2(50,60),"radius":48.0,"dps":9.0,"residual":5.0,"time":3.0,"duration":5.0})
 save.tick(0.5)
 var text=JSON.stringify(save.to_data())
 var restored=Run.new();var loaded=restored.load_data(JSON.parse_string(text))
 check(loaded and restored.phase=="wave" and restored.pools[0].pos is Vector2 and restored.enemies[0].pos is Vector2,"Save JSON restaura onda em andamento, posições e poças")
 var start_hp=restored.core
 for i in range(120):restored.tick(1.0/60)
 check(restored.core<=start_hp and restored.elapsed>save.elapsed,"Simulação continua depois da retomada")
 # Cross-owner telemetry survives a sale, including ongoing poison damage.
 restored.phase="prep";var sold=int(restored.towers[0].id);restored.sell(sold)
 var victim=restored.spawn_enemy("golem",0);var logged=restored.records[str(sold)].damage
 restored.damage(victim,5.0,sold,true)
 check(restored.records[str(sold)].sold and restored.records[str(sold)].damage>logged,"Dano persistente mantém dono após a venda")
 var mods=Run.new();mods.gold=2000;mods.build("flame",0)
 mods.towers[0].mods=["power","burn"]
 var burn=mods.stats(mods.towers[0]).burn
 mods.towers[0].mods=["burn","power"]
 check(is_equal_approx(burn,12.5) and is_equal_approx(mods.stats(mods.towers[0]).burn,burn),"Ordem das cartas não altera o multiplicador da queimadura")
 mods.build("tesla",1);mods.towers[1].mods=["splash"]
 var primary=mods.spawn_enemy("golem",0);primary.pos=mods.pads[1]
 var secondary=mods.spawn_enemy("golem",0);secondary.pos=primary.pos+Vector2(10,0)
 var fourth=mods.spawn_enemy("golem",0);fourth.pos=primary.pos+Vector2(15,0)
 var fifth=mods.spawn_enemy("golem",0);fifth.pos=primary.pos+Vector2(20,0)
 var fifth_hp=fifth.hp
 mods.shoot(mods.towers[1],primary,mods.stats(mods.towers[1]))
 check(fifth.hp<fifth_hp,"Ressonância concede dano em área adicional também ao Tesla")
 print("RESULTADO: %d verificações, %d falhas"%[checks,failed])
 quit(1 if failed else 0)
