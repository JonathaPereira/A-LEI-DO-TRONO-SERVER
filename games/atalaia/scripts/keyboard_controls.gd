extends RefCounted
## Keyboard commands and their displayed keys share this preference owner.
const DEFAULTS={"wave":KEY_SPACE,"upgrade":KEY_U,"pause":KEY_P,"speed":KEY_F,"mute":KEY_M,"build_ballista":KEY_1,"build_mortar":KEY_2,"build_flame":KEY_3,"build_tesla":KEY_4,"build_ice":KEY_5,"build_poison":KEY_6}
const TITLES={"wave":"Próxima onda","upgrade":"Evoluir torreta","pause":"Pausar / retomar","speed":"Velocidade","mute":"Silenciar áudio","build_ballista":"Balista","build_mortar":"Morteiro","build_flame":"Lança-chamas","build_tesla":"Tesla","build_ice":"Obelisco glacial","build_poison":"Alquimista"}
var bindings=DEFAULTS.duplicate()

func reset():
 bindings=DEFAULTS.duplicate()

func to_data() -> Dictionary:
 return bindings.duplicate()

func load_data(data: Variant) -> bool:
 if not data is Dictionary or data.size()!=DEFAULTS.size():return false
 var used=[]
 for action in DEFAULTS:
  var code: Variant=data.get(action)
  if not (code is int or code is float) or not is_finite(float(code)) or code!=floor(float(code)) or not valid_key(int(code)) or code in used:return false
  used.append(code)
 bindings={}
 for action in DEFAULTS:bindings[action]=int(data[action])
 return true

static func valid_key(code: int) -> bool:
 return code==KEY_SPACE or code>=KEY_A and code<=KEY_Z or code>=KEY_0 and code<=KEY_9

func key_name(action: String) -> String:
 return "Espaço" if bindings[action]==KEY_SPACE else OS.get_keycode_string(bindings[action])

func bind(action: String,code: int) -> bool:
 if not DEFAULTS.has(action) or not valid_key(code):return false
 var previous: int=bindings[action]
 var conflict=bindings.find_key(code)
 if conflict!=null:bindings[conflict]=previous
 bindings[action]=code
 return true

func action_for(event: InputEventKey) -> String:
 if not event.pressed or event.echo or event.ctrl_pressed or event.alt_pressed or event.meta_pressed or event.shift_pressed:return ""
 var action=bindings.find_key(event.keycode)
 return action if action!=null else ""
