extends SceneTree
## Sample the time a full-speed wolf spends inside the best legal tower placement
## on each lane. Range only: no line-of-fire, competing targets, cards or crowd control.
const Run = preload("res://scripts/run.gd")
const Catalog = preload("res://scripts/catalog.gd")
const SAMPLE_STEP := 4.0

func _initialize() -> void:
 var run=Run.new(78,"chronicle")
 var rows: Array = []
 var unreachable := 0
 for act in range(run.maps.size()):
  run.set_map(act)
  var speed: float=Catalog.ENEMIES.wolf.speed*(1.0+act*0.06)
  for lane in range(run.routes.size()):
   var route: Dictionary=run.routes[lane]
   var sample_count:=ceili(route.length/SAMPLE_STEP)
   var samples:=PackedVector2Array()
   for step in range(sample_count):
    samples.append(Catalog.route_point(route,step*SAMPLE_STEP))
   for type in Catalog.TYPES+Catalog.regional_types(act):
    for level in [1,3]:
     var stats: Dictionary=run.stats({"type":type,"level":level,"mods":[]})
     var best_pad := -1
     var longest := 0
     for pad in range(run.pads.size()):
      var pos: Vector2=run.pads[pad]
      var radius: float=run.stats({"type":type,"level":level,"mods":[],"pad":pad}).range
      var inside:=0
      for point in samples:
       if pos.distance_squared_to(point)<=radius*radius:inside+=1
      if inside>longest:
       longest=inside
       best_pad=pad
     var seconds: float=longest*SAMPLE_STEP/speed
     if best_pad<0:unreachable+=1
     rows.append("%s,%d,%s,%d,%d,%.2f,%.2f" % [run.maps[act].id,lane+1,type,level,best_pad+1,seconds,seconds/stats.rate])
 var file:=FileAccess.open("user://atalaia-coverage.csv",FileAccess.WRITE)
 if file==null:
  push_error("The coverage CSV could not be written.")
  quit(1)
  return
 file.store_string("map,lane,tower,level,pad,seconds_in_range,firing_intervals\n"+"\n".join(rows)+"\n")
 file.close()
 print("Coverage: %d weapon/route/level combinations, %d without a reachable pad." % [rows.size(),unreachable])
 quit(1 if unreachable else 0)
