class_name AtalaiaArt
extends RefCounted

static var cache: Dictionary = {}
static var walks: Dictionary = {}
static var row_heights: Dictionary = {}

static func texture(name: String) -> Texture2D:
 if not cache.has(name): cache[name]=load("res://assets/art/"+name)
 return cache[name]

static func cell(sheet: String, index: int, cols: int, rows: int) -> AtlasTexture:
 var key=sheet+str(index)
 if cache.has(key): return cache[key]
 var source=texture(sheet)
 var a=AtlasTexture.new()
 a.atlas=source
 var size=source.get_size()/Vector2(cols,rows)
 a.region=Rect2(Vector2(index%cols,index/cols)*size+Vector2(2,2),size-Vector2(4,4))
 cache[key]=a
 return a

static func tower(type: String) -> Texture2D:
 var atlas=cell("towers-v2.webp",AtalaiaCatalog.TYPES.find(type)*2,4,3)
 if type!="tesla":return atlas
 # The adjacent firing pose spills into the left transparent margin of this cell.
 # Crop only that margin when addressing the atlas, preserving the tower itself.
 if not cache.has("tesla_clean"):
  var clean=AtlasTexture.new();clean.atlas=atlas.atlas
  clean.region=Rect2(atlas.region.position+Vector2(30,0),atlas.region.size-Vector2(30,0))
  cache.tesla_clean=clean
 return cache.tesla_clean

static func head(type: String) -> Texture2D:
 return cell("tower-heads-v4.webp",AtalaiaCatalog.TYPES.find(type),3,2)

static func tight(sheet: String, index: int, bands: Array = []) -> AtlasTexture:
 var key="tight"+sheet+str(index)
 if cache.has(key): return cache[key]
 var source=texture(sheet)
 var image=source.get_image()
 var col=index%4
 var row=index/4
 var width=int(image.get_width()/4)
 var top=int(bands[row]) if not bands.is_empty() else int(row*image.get_height()/4)
 var bottom=int(bands[row+1]) if not bands.is_empty() else int((row+1)*image.get_height()/4)
 var region=Rect2i(col*width,top,width,bottom-top)
 var visible=image.get_region(region).get_used_rect()
 var a=AtlasTexture.new()
 a.atlas=source
 a.region=Rect2(visible.position+region.position,visible.size)
 cache[key]=a
 return a

static func enemy_frames(type: String, stage: int) -> SpriteFrames:
 var key=type+str(stage)
 if walks.has(key): return walks[key]
 var frames=SpriteFrames.new()
 frames.set_animation_speed("default",8.0)
 var row={"skeleton":0,"wolf":1,"spider":2,"golem":3}.get(type,-1)
 if row>=0:
  for i in range(4): frames.add_frame("default",tight("mob-walk-v6.webp",row*4+i,[0,380,635,895,1254]))
 else:
  var start={"mushroom":0,"spirit":6,"boss":8+mini(stage,2)*2}.get(type,0)
  for i in range(2): frames.add_frame("default",tight("creatures-v2.webp",start+i))
 var max_h=0.0
 for i in range(frames.get_frame_count("default")): max_h=maxf(max_h,frames.get_frame_texture("default",i).get_height())
 row_heights[key]=max_h
 walks[key]=frames
 return frames

static func glow() -> Texture2D:
 if cache.has("glow"): return cache.glow
 var image=Image.create(128,128,false,Image.FORMAT_RGBA8)
 for y in range(128):
  for x in range(128):
   var distance=Vector2(x-63.5,y-63.5).length()/64.0
   image.set_pixel(x,y,Color(1,1,1,pow(maxf(0.0,1.0-distance),3.0)*0.9))
 cache.glow=ImageTexture.create_from_image(image)
 return cache.glow
