extends RefCounted
## Each of the 24 heroes has three independently illustrated ability icons.
const SHEETS = {
	"basic": preload("res://assets/abilities/basic.png"),
	"skill": preload("res://assets/abilities/skill.png"),
	"ultimate": preload("res://assets/abilities/ultimate.png"),
}
const GUARD = preload("res://assets/abilities/guard.png")
static var cache: Dictionary = {}

static func icon(index: int, action_id: String) -> Texture2D:
	# Minions share the matching weapon illustrations; hero sheets remain intact.
	index = {24: 8, 25: 6, 26: 17}.get(index, index)
	if action_id == "guard": return GUARD
	if not SHEETS.has(action_id): return null
	var key := "%d-%s" % [index,action_id]
	if cache.has(key): return cache[key]
	var sheet: Texture2D = SHEETS[action_id]
	var cell := sheet.get_size() / Vector2(4, 6)
	var texture := AtlasTexture.new()
	texture.atlas = sheet
	texture.region = Rect2(Vector2(index % 4, index / 4) * cell + Vector2(3, 3), cell - Vector2(6, 6))
	texture.filter_clip = true
	cache[key] = texture
	return texture
