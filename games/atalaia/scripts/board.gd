extends Node2D
signal pad_clicked(index: int)
const TOWER_SCENE=preload("res://scenes/tower.tscn")
const ENEMY_SCENE=preload("res://scenes/enemy.tscn")
var run: AtalaiaRun
var selected=-1
var hover=-1
var build_type=""
var interactive=true
var time=0.0
var actors: Node2D
var effects: Node2D
var tower_nodes: Dictionary={}
var enemy_nodes: Dictionary={}
var bursts: Array=[]
var bolts: Array=[]
var rings: Array=[]
var ground_material: ShaderMaterial
var background: Sprite2D
var shown_stage=-1
var core_flash=0.0
var smoke: Array=[]
var smoke_clock=0.0

func _ready():
 background=Sprite2D.new()
 background.centered=false
 add_child(background)
 background.z_index=-2
 ground_material=ShaderMaterial.new()
 ground_material.shader=preload("res://assets/atmosphere.gdshader")
 background.material=ground_material
 actors=Node2D.new(); actors.y_sort_enabled=true; add_child(actors)
 var haze=Node2D.new();haze.set_script(preload("res://scripts/smoke.gd"));haze.board=self;add_child(haze)
 effects=Node2D.new(); effects.set_script(preload("res://scripts/effects.gd")); effects.board=self; add_child(effects)
 var additive=CanvasItemMaterial.new(); additive.blend_mode=CanvasItemMaterial.BLEND_MODE_ADD
 effects.material=additive

func _unhandled_input(event):
 if not interactive or not is_instance_valid(run): return
 if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
  var point=get_local_mouse_position()
  if Rect2(0,0,1000,620).has_point(point):
   var best=-1
   var distance=42.0
   for i in range(run.pads.size()):
    var d=point.distance_to(run.pads[i]-Vector2(0,25) if not run.occupant(i).is_empty() else run.pads[i])
    if d<distance: distance=d; best=i
   if best>=0: pad_clicked.emit(best); get_viewport().set_input_as_handled()

func reset_visuals():
 for node in tower_nodes.values(): node.queue_free()
 for node in enemy_nodes.values(): node.queue_free()
 tower_nodes.clear(); enemy_nodes.clear(); bursts.clear(); bolts.clear(); rings.clear();smoke.clear()
 shown_stage=-1

func _process(dt):
 if not is_instance_valid(run): return
 time+=dt
 smoke_clock+=dt
 for p in smoke:p.age+=dt;p.pos+=p.vel*dt
 smoke=smoke.filter(func(p):return p.age<p.life)
 if smoke_clock>0.065:
  smoke_clock=0
  for p in run.projectiles:
   if p.t.type=="mortar" and smoke.size()<80:smoke.append({"pos":p.pos,"vel":Vector2(randf_range(-7,7),-12),"age":0.0,"life":0.65,"size":7.0})
 core_flash=maxf(0.0,core_flash-dt)
 if shown_stage!=int(run.stage):
  shown_stage=int(run.stage)
  var asset=run.maps[run.stage].asset.get_file()
  background.texture=AtalaiaArt.texture(asset)
  background.scale=Vector2(1000,620)/background.texture.get_size()
  ground_material.set_shader_parameter("wet",0.0 if run.stage==2 else 1.0)
 var active: Array=[]
 for t in run.towers:
  var id=int(t.id); active.append(id)
  if not tower_nodes.has(id):
   var node=TOWER_SCENE.instantiate(); actors.add_child(node); node.configure(t); tower_nodes[id]=node
  tower_nodes[id].data=t
  tower_nodes[id].position=run.pads[int(t.pad)]
  tower_nodes[id].selected=id==selected
 for id in tower_nodes.keys():
  if id not in active: tower_nodes[id].queue_free(); tower_nodes.erase(id)
 active.clear()
 for e in run.enemies:
  var id=int(e.id); active.append(id)
  if not enemy_nodes.has(id):
   var node=ENEMY_SCENE.instantiate(); actors.add_child(node); node.configure(e,run.stage); enemy_nodes[id]=node
 for id in enemy_nodes.keys():
  if id not in active:
   if is_instance_valid(enemy_nodes[id]): enemy_nodes[id].die()
   enemy_nodes.erase(id)
 for b in bursts: b.age+=dt; b.pos+=b.vel*dt; b.vel.y+=b.gravity*dt
 bursts=bursts.filter(func(b): return b.age<b.life)
 for b in bolts: b.age+=dt
 bolts=bolts.filter(func(b): return b.age<0.24)
 for r in rings: r.age+=dt
 rings=rings.filter(func(r): return r.age<r.life)
 hover=-1
 if interactive:
  var point=get_local_mouse_position()
  for i in range(run.pads.size()):
   if point.distance_to(run.pads[i])<36: hover=i
 queue_redraw()

func burst(pos: Vector2, color: Color, count: int, speed: float = 70.0, gravity: float = 45.0):
 for i in range(count):
  if bursts.size()>450: break
  var angle=randf()*TAU
  var velocity=Vector2(cos(angle),sin(angle))*randf_range(speed*0.25,speed)
  bursts.append({"pos":pos,"vel":velocity,"color":color,"age":0.0,"life":randf_range(0.25,0.85),"size":randf_range(1.2,3.5),"gravity":gravity})

func event(e: Dictionary):
 match e.kind:
  "lightning": bolts.append({"points":e.points,"age":0.0,"seed":randi()})
  "impact":
   var col=Color(AtalaiaCatalog.TOWERS[e.type].color)
   burst(e.pos,col,26 if e.type=="mortar" else 9,115.0 if e.type=="mortar" else 50.0)
   rings.append({"pos":e.pos,"color":col,"age":0.0,"life":0.6,"size":maxf(20,e.radius)})
   if e.type=="mortar":
    for i in range(8):smoke.append({"pos":e.pos,"vel":Vector2(randf_range(-30,30),randf_range(-36,2)),"age":0.0,"life":randf_range(0.65,1.3),"size":randf_range(10,19)})
  "build","move","upgrade":
   var col=Color(AtalaiaCatalog.TOWERS[e.type].color)
   burst(e.pos-Vector2(0,25),col,22,55.0,-50.0)
   rings.append({"pos":e.pos,"color":col,"age":0.0,"life":0.75,"size":55.0})
  "death": burst(e.pos-Vector2(0,14),Color("b7c5b9"),7,30.0)
  "leak": core_flash=0.5; burst(e.pos-Vector2(0,55),Color("ff725f"),18,95.0)

func _draw():
 if not is_instance_valid(run): return
 # Pools are on the ground, behind every actor. Same-owner damage does not stack.
 for p in run.pools:
  var opacity=minf(1.0,p.time/0.8)
  var center: Vector2=p.pos
  var radius: float=p.radius
  draw_set_transform(center,0,Vector2(1,0.45))
  draw_circle(Vector2.ZERO,radius,Color(0.13,0.34,0.05,0.50*opacity))
  draw_circle(Vector2.ZERO,radius*0.83,Color(0.33,0.62,0.06,0.42*opacity))
  draw_arc(Vector2.ZERO,radius*0.8,0,TAU,48,Color(0.57,0.9,0.2,0.6*opacity),1.5,true)
  for j in range(11):
   var f=fposmod(time*0.35+j*0.618,1.0)
   var pos=Vector2(cos(j*8.0),sin(j*8.0))*radius*0.66
   draw_arc(pos,2.0+f*5.0,0,TAU,12,Color(0.65,1.0,0.28,(1.0-f)*0.55*opacity),1.3,true)
  draw_set_transform(Vector2.ZERO)
 for i in range(run.pads.size()):
  if not run.occupant(i).is_empty(): continue
  var pos: Vector2=run.pads[i]
  var active=i==hover
  draw_set_transform(pos,0,Vector2(1,0.48))
  draw_circle(Vector2.ZERO,26,Color(0.03,0.08,0.07,0.42))
  draw_arc(Vector2.ZERO,26,0,TAU,40,Color("deb771") if active else Color(0.7,0.65,0.43,0.35),1.5,true)
  if active: draw_circle(Vector2.ZERO,23,Color(0.9,0.7,0.3,0.12))
  draw_set_transform(Vector2.ZERO)
  draw_line(pos-Vector2(5,0),pos+Vector2(5,0),Color(0.8,0.75,0.53,0.6),1.0,true)
  draw_line(pos-Vector2(0,4),pos+Vector2(0,4),Color(0.8,0.75,0.53,0.6),1.0,true)
 var selected_t=run.tower_by_id(selected)
 if not selected_t.is_empty():
  var pos: Vector2=run.pads[selected_t.pad]
  var radius=run.stats(selected_t).range
  draw_circle(pos,radius,Color(0.35,0.7,0.85,0.035))
  draw_arc(pos,radius,0,TAU,96,Color(0.65,0.9,1.0,0.22),1.0,true)
 elif hover>=0 and build_type!="":
  var radius=AtalaiaCatalog.TOWERS[build_type].range
  draw_arc(run.pads[hover],radius,0,TAU,96,Color(0.86,0.8,0.5,0.35),1.0,true)

func draw_effects(c: Node2D):
 if not is_instance_valid(run): return
 # Atmospheric motes drift at the edges; roads remain clear.
 for i in range(38):
  var p=Vector2(fposmod(i*173.0+sin(time*0.12+i)*26.0,995.0),fposmod(i*97.0-time*(2+i%3),610.0))
  var a=(0.3+sin(time*1.1+i*3.0)*0.2)*0.6
  var color=Color("e5cf83") if run.stage!=2 else Color("edbd87")
  c.draw_circle(p,1.0+i%2*0.3,Color(color,a))
  if i%4==0: c.draw_texture_rect(AtalaiaArt.glow(),Rect2(p-Vector2(8,8),Vector2(16,16)),false,Color(color,a*0.25))
 for t in run.towers:
  var pos: Vector2=AtalaiaCatalog.muzzle(t,run.pads[t.pad])
  if t.type=="flame" and t.firing:
   var end: Vector2=t.beam
   var length=pos.distance_to(end)+15.0
   c.draw_set_transform(pos,(end-pos).angle())
   for layer in range(3):
    var polygon=PackedVector2Array()
    var width=17.0-layer*6.0
    for j in range(19):
     var f=j/18.0
     polygon.append(Vector2(f*length,sin(time*26-f*19)*f*3.0-(2+width*f)*(0.85+sin(f*30-time*34)*0.15)))
    for j in range(18,-1,-1):
     var f=j/18.0
     polygon.append(Vector2(f*length,sin(time*26-f*19)*f*3.0+(2+width*f)*(0.85+sin(f*31-time*37)*0.15)))
    c.draw_colored_polygon(polygon,[Color(1,0.18,0.02,0.38),Color(1,0.55,0.06,0.7),Color(1,0.95,0.65,0.9)][layer])
   for j in range(16):
    var f=fposmod(time*2.7+j/16.0,1.0)
    c.draw_circle(Vector2(f*length,sin(j*7.0+time*4)*f*15),1.0+(1-f)*1.5,Color(1,0.65,0.15,(1-f)*0.8))
   c.draw_set_transform(Vector2.ZERO)
   c.draw_texture_rect(AtalaiaArt.glow(),Rect2(end-Vector2(60,55),Vector2(120,110)),false,Color(1,0.3,0.02,0.3))
 for p in run.projectiles:
  var type=p.t.type
  var color=Color(AtalaiaCatalog.TOWERS[type].color)
  var pos: Vector2=p.pos
  var direction: Vector2=(p.end-p.start).normalized()
  c.draw_line(pos-direction*19,pos,color,2.0 if type=="ballista" else 3.0,true)
  c.draw_circle(pos,2.0 if type=="ballista" else 3.2,color.lightened(0.5))
  c.draw_texture_rect(AtalaiaArt.glow(),Rect2(pos-Vector2(16,16),Vector2(32,32)),false,Color(color,0.8))
  if type=="mortar":
   for j in range(5):
    var q=pos-direction*j*5+Vector2(0,j*1.2)
    c.draw_circle(q,4+j*1.0,Color(0.45,0.34,0.22,0.13*(1-j/6.0)))
 for b in bolts:
  var alpha=1.0-b.age/0.24
  for j in range(1,b.points.size()):
   var from: Vector2=b.points[j-1]
   var to: Vector2=b.points[j]
   var points=PackedVector2Array([from])
   var normal=(to-from).normalized().orthogonal()
   for k in range(1,9): points.append(from.lerp(to,k/9.0)+normal*sin(k*17.0+float(b.seed%137)+int(time*24))*8)
   points.append(to)
   c.draw_polyline(points,Color(0.24,0.37,1.0,alpha*0.35),7,true)
   c.draw_polyline(points,Color(0.55,0.75,1.0,alpha),2.5,true)
   c.draw_polyline(points,Color(0.93,0.98,1.0,alpha),1.0,true)
 for b in bursts:
  var alpha=pow(1-b.age/b.life,1.4)
  c.draw_circle(b.pos,b.size*(1-b.age/b.life*0.5),Color(b.color,alpha))
  c.draw_texture_rect(AtalaiaArt.glow(),Rect2(b.pos-Vector2.ONE*b.size*3,Vector2.ONE*b.size*6),false,Color(b.color,alpha*0.45))
 for r in rings:
  var f=r.age/r.life
  c.draw_set_transform(r.pos,0,Vector2(1,0.6))
  c.draw_arc(Vector2.ZERO,r.size*(0.3+f*0.7),0,TAU,48,Color(r.color,(1-f)*0.65),2.0*(1-f)+0.5,true)
  c.draw_set_transform(Vector2.ZERO)
 # The core uses a separate pedestal and floating, faceted crystal.
 var last: Vector2=run.routes[0].points[-1]
 var center=last+Vector2(-4,20)
 c.draw_texture_rect(AtalaiaArt.glow(),Rect2(center-Vector2(90,170),Vector2(180,230)),false,Color(0.15,0.65,1,0.65+sin(time*2)*0.08))
 # Restore ordinary alpha for opaque artwork inside an additive effect layer.
 # Opaque pedestal/crystal are drawn by the sibling Core node instead.
 for i in range(5):
  var angle=time*0.48+i*TAU/5
  var p=center+Vector2(cos(angle)*40,-70+sin(angle)*13)
  c.draw_set_transform(p,0,Vector2(1,1))
  c.draw_colored_polygon(PackedVector2Array([Vector2(0,-10),Vector2(4,0),Vector2(0,10),Vector2(-4,0)]),Color("96e4ff"))
  c.draw_set_transform(Vector2.ZERO)
 for t in run.towers:
  var count=run.doctrines.filter(func(d): return d.type==t.type).size()
  if count>0:
   var pos: Vector2=run.pads[t.pad]+Vector2(31,-15)
   var color=Color(AtalaiaCatalog.TOWERS[t.type].color)
   c.draw_string(AtalaiaUI.font(),pos,"✦%d"%count,HORIZONTAL_ALIGNMENT_LEFT,-1,12,color)

func draw_core(c: Node2D):
 if not is_instance_valid(run): return
 var center: Vector2=run.routes[0].points[-1]+Vector2(-4,20)
 var atlas=AtalaiaArt.texture("crystal-core-v5.webp")
 var s=atlas.get_size()/Vector2(2,1)
 c.draw_texture_rect_region(atlas,Rect2(center-Vector2(60,51),Vector2(120,90)),Rect2(Vector2.ZERO,s))
 c.draw_texture_rect_region(atlas,Rect2(center-Vector2(61,154+sin(time*1.8)*3),Vector2(122,142)),Rect2(Vector2(s.x,0),s),Color(1,0.65,0.65) if core_flash>0 else Color.WHITE)
 c.draw_string(AtalaiaUI.font(),center+Vector2(-34,51),"NÚCLEO",HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("c3e6ee"))

func draw_smoke(c: Node2D):
 for p in smoke:
  var f=p.age/p.life
  var radius=p.size*(0.7+f*1.6)
  c.draw_texture_rect(AtalaiaArt.glow(),Rect2(p.pos-Vector2.ONE*radius*2,Vector2.ONE*radius*4),false,Color(0.24,0.23,0.21,(1-f)*0.75))
