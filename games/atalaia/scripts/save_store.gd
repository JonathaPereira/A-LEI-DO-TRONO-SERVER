extends "res://scripts/validated_file.gd"
## A campaign adapter validates gameplay snapshots through their run owner.
const Run = preload("res://scripts/run.gd")
const DEFAULT_PATH = "user://atalaia_campaign_v1.json"
var mode: String

func _init(save_path: String = DEFAULT_PATH, campaign_mode: String = "classic"):
 super(save_path)
 mode=campaign_mode

func _valid(data: Variant) -> bool:
 if not data is Dictionary or data.get("mode","classic")!=mode:return false
 return Run.new().load_data(data)
