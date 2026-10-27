extends Node
var voices: Array=[]
var samples: Dictionary={}
var music: AudioStreamPlayer
var ambience: AudioStreamPlayer
var flame: AudioStreamPlayer
var cooldowns: Dictionary={}
var muted=false
var closing=false
var mix={"Master":0.85,"Music":0.5,"Effects":0.85,"Ambience":0.35}

func _ready():
 for name in ["Music","Effects","Ambience"]:
  if AudioServer.get_bus_index(name)<0:
   AudioServer.add_bus()
   AudioServer.set_bus_name(AudioServer.bus_count-1,name)
 var compressor=AudioEffectCompressor.new()
 compressor.threshold=-7; compressor.ratio=3.0; compressor.attack_us=6000; compressor.release_ms=150
 AudioServer.add_bus_effect(0,compressor)
 var reverb=AudioEffectReverb.new(); reverb.room_size=0.4; reverb.wet=0.09; reverb.dry=0.92
 AudioServer.add_bus_effect(AudioServer.get_bus_index("Effects"),reverb)
 for name in ["ballista","mortar","launch","tesla","ice","poison","impact","hover","click","reveal","upgrade","card","wave","leak","victory","defeat","music","ambience","flame_loop"]:
  samples[name]=load("res://assets/audio/"+name+".ogg")
 for i in range(24):
  var p=AudioStreamPlayer2D.new(); p.bus="Effects"; p.max_distance=2200; p.attenuation=0.25
  p.panning_strength=0.65
  add_child(p); voices.append(p)
 music=loop_player("music","Music",0)
 ambience=loop_player("ambience","Ambience",-4)
 flame=loop_player("flame_loop","Effects",-80)
 for name in mix: set_volume(name,mix[name])

func _exit_tree():
 shutdown()

func shutdown():
 closing=true
 for player in voices:
  player.stop();player.stream=null
 for player in [music,ambience,flame]:
  if is_instance_valid(player):player.stop();player.stream=null
 samples.clear()

func loop_player(name: String, bus: String, volume: float) -> AudioStreamPlayer:
 var p=AudioStreamPlayer.new(); p.bus=bus; p.stream=samples[name].duplicate(); p.stream.loop=true; p.volume_db=volume
 add_child(p); p.play()
 return p

func set_volume(bus: String, amount: float):
 mix[bus]=amount
 AudioServer.set_bus_volume_db(AudioServer.get_bus_index(bus),linear_to_db(maxf(0.0001,amount)))

func toggle_mute():
 muted=not muted
 AudioServer.set_bus_mute(0,muted)

func play(name: String, pos: Vector2 = Vector2(800,450), volume: float = -8.0):
 if not samples.has(name): return
 var now=Time.get_ticks_msec()
 var min_interval=95 if name in ["ballista","impact"] else 70
 if now-int(cooldowns.get(name,0))<min_interval: return
 cooldowns[name]=now
 for p in voices:
  if not p.playing:
   p.position=pos; p.stream=samples[name]; p.volume_db=volume; p.pitch_scale=randf_range(0.96,1.04); p.play()
   return

func update_flame(active: bool, dt: float):
 if closing:return
 flame.volume_db=move_toward(flame.volume_db,-11.0 if active else -65.0,dt*100.0)

func event(e: Dictionary):
 var pos=e.get("pos",Vector2(650,300))*Vector2(1.16,1.0)+Vector2(16,174)
 match e.kind:
  "shot": play({"mortar":"launch"}.get(e.type,e.type),pos,-8.0)
  "impact": play("mortar" if e.type=="mortar" else "impact",pos,-6 if e.type=="mortar" else -18)
  "lightning": play("tesla",pos,-9)
  "build","move": play("click",pos)
  "upgrade": play("upgrade",pos,-10)
  "leak": play("leak",pos,-8)
  "wave": play("wave",Vector2(800,450),-8)
  "cards","doctrine": play("reveal",Vector2(800,450),-8)
  "card_chosen","doctrine_chosen": play("card",Vector2(800,450),-7)
  "victory","defeat": play(e.kind,Vector2(800,450),-6)
