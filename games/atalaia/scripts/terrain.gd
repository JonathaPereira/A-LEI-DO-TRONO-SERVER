extends Node2D

var run: AtalaiaRun

# Keep the approved painted road artwork along the exact simulation routes.
# Transparent shoulders blend it into the new terrain without moving enemies
# or pads. The mesh is rebuilt only when changing regions.
func _draw():
 if not is_instance_valid(run): return
 var source=AtalaiaArt.texture(run.maps[run.stage].asset.get_file())
 for route in run.routes:
  var points: PackedVector2Array=route.points
  for i in range(1,points.size()):
   var a: Vector2=points[i-1]
   var b: Vector2=points[i]
   var normal_a=(b-a).normalized().orthogonal()
   var normal_b=normal_a
   var distances=[-44.0,-29.0,29.0,44.0]
   var opacity=[0.0,1.0,1.0,0.0]
   for band in range(3):
    var polygon=PackedVector2Array([a+normal_a*distances[band],b+normal_b*distances[band],b+normal_b*distances[band+1],a+normal_a*distances[band+1]])
    var uv=PackedVector2Array()
    for p in polygon:uv.append(p/Vector2(1000,620))
    var colors=PackedColorArray([Color(1,1,1,opacity[band]),Color(1,1,1,opacity[band]),Color(1,1,1,opacity[band+1]),Color(1,1,1,opacity[band+1])])
    draw_polygon(polygon,colors,uv,source)
  for point in points:
   var polygon=PackedVector2Array()
   var uv=PackedVector2Array()
   for j in range(24):
    var p: Vector2=point+Vector2(29,0).rotated(j*TAU/24.0)
    polygon.append(p);uv.append(p/Vector2(1000,620))
   draw_polygon(polygon,PackedColorArray([Color.WHITE]),uv,source)
