extends RefCounted
const C = preload("res://scripts/catalog.gd")
const MODE = "chronicle"
const PHASES_PER_ACT = 6
static var acts: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/chronicle-phases.json"))

static func maps() -> Array:
 return C.maps()+JSON.parse_string(FileAccess.get_file_as_string("res://data/chronicle-maps.json"))

static func phase(wave: int) -> Dictionary:
 var index=posmod(maxi(0,wave-1),acts.size()*PHASES_PER_ACT)
 return acts[int(index/float(PHASES_PER_ACT))].phases[index%PHASES_PER_ACT]
