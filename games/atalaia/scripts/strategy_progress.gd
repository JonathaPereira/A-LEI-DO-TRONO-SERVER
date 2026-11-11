extends RefCounted
## The profile owns unlocked nodes. A campaign snapshots a single specialization.
const FileStore=preload("res://scripts/validated_file.gd")
const PATH = "user://atalaia_strategy_v1.json"
const THRESHOLDS = [5,10]
const BRANCHES = {
 "engineering":{"name":"Engenharia","nodes":["Fundo de obras · +35 ouro inicial","Arsenal antecipado · +65 ouro inicial"],"gold":[35,65]},
 "protection":{"name":"Proteção","nodes":["Manutenção · +1 integridade a cada 3 ondas","Reparo reforçado · +2 integridade a cada 3 ondas"],"repair":[1,2]},
 "knowledge":{"name":"Conhecimento","nodes":["Leitura do cristal · Tributo na onda 3","Arquivo de cartas · Tributo nas ondas 3 e 8"],"treasury":[[3],[3,8]]}
}
var path: String
var best_wave := 0
var chronicle_best := 0
var survival_best := 0
var selected := ""
var error_text := ""
var _blocked := false
var _file
var _recovery_notice := ""

func _init(profile_path: String = PATH):
 path=profile_path
 if path.is_empty():return
 _file=FileStore.new(path,_valid_profile)
 var data: Dictionary=_file.load_save()
 if data.is_empty():
  _blocked=FileAccess.file_exists(path) or FileAccess.file_exists(path+".bak")
  if _blocked:error_text="Registro estratégico: "+(_file.error_text if _file.error_text.contains("compatível") else "O arquivo não pôde ser lido e foi preservado.")
  return
 if _file.error_text!="":
  _recovery_notice="Registro estratégico: "+_file.error_text
  error_text=_recovery_notice
 best_wave=int(data.bestWave)
 selected=data.selected
 chronicle_best=int(data.get("chronicleBest",0))
 survival_best=int(data.get("survivalBest",0))

static func _integer(value: Variant, low: int, high: int) -> bool:
 return (value is int or value is float) and is_finite(float(value)) and value>=low and value<=high and value==floor(float(value))

static func _valid_profile(data: Variant) -> bool:
 if not data is Dictionary or data.keys().any(func(key):return key not in ["version","bestWave","selected","chronicleBest","survivalBest"]):return false
 if not _integer(data.get("version"),1,1) or not _integer(data.get("bestWave"),0,30):return false
 if not _integer(data.get("chronicleBest",0),0,int(data.bestWave)) or not _integer(data.get("survivalBest",0),0,1000000000):return false
 var branch: Variant=data.get("selected")
 return branch is String and (branch=="" or BRANCHES.has(branch) and int(data.bestWave)>=THRESHOLDS[0])

static func valid_specialization(value: Variant) -> bool:
 return value is Dictionary and (value.is_empty() or value.size()==2 and BRANCHES.has(value.get("branch")) and _integer(value.get("rank"),1,2))

func rank() -> int:
 return int(best_wave>=THRESHOLDS[0])+int(best_wave>=THRESHOLDS[1])

func specialization() -> Dictionary:
 return {} if selected=="" else {"branch":selected,"rank":rank()}

func achievements() -> Array:
 var entries=[]
 for milestone in [
  ["first_node","Primeiro guardião","Conclua cinco ondas em uma campanha.",best_wave,5],
  ["archive","Arquivo do cristal","Conclua dez ondas em uma campanha.",best_wave,10],
  ["first_act","O primeiro cerco","Conclua o ato I da Crônica.",chronicle_best,6],
  ["frontiers","Além das fronteiras","Conclua o ato II da Crônica.",chronicle_best,12],
  ["rupture","Resistir à ruptura","Conclua o ato III da Crônica.",chronicle_best,18],
  ["chronicle","O último bastião","Conclua as 30 fases da Crônica.",chronicle_best,30],
  ["watch","Vigília prolongada","Conclua dez ondas na Sobrevivência.",survival_best,10],
  ["endless","Sem último cerco","Conclua 30 ondas na Sobrevivência.",survival_best,30]
 ]:
  entries.append({"id":milestone[0],"name":milestone[1],"hint":milestone[2],"current":mini(milestone[3],milestone[4]),"goal":milestone[4],"unlocked":milestone[3]>=milestone[4]})
 return entries

func observe(snapshot: Dictionary) -> bool:
 if snapshot.is_empty():return true
 var phase: Variant=snapshot.get("phase")
 if phase not in ["prep","wave","cards","doctrine","defeat","victory"] or not _integer(snapshot.get("wave"),0,30):return false
 var wave: int=int(snapshot.wave)
 var cleared: int=wave-1 if phase in ["wave","defeat"] else wave
 var story_best:=maxi(chronicle_best,cleared) if snapshot.get("mode")=="chronicle" else chronicle_best
 if cleared<=best_wave and story_best==chronicle_best:return true
 return _persist(maxi(best_wave,cleared),selected,story_best,survival_best)

func record_survival(cleared: int) -> bool:
 if cleared<=survival_best:return true
 return _persist(best_wave,selected,chronicle_best,cleared)

func choose(branch: String) -> bool:
 if branch!="" and (not BRANCHES.has(branch) or rank()==0):return false
 return _persist(best_wave,branch,chronicle_best,survival_best)

func _persist(wave: int, branch: String, chronicle: int, survival: int) -> bool:
 if _blocked:return false
 if not path.is_empty():
  var data={"version":1,"bestWave":wave,"selected":branch,"chronicleBest":chronicle,"survivalBest":survival}
  if not _file.save(data):
   error_text="Registro estratégico: "+_file.error_text
   return false
 best_wave=wave
 chronicle_best=chronicle
 survival_best=survival
 selected=branch
 error_text=_recovery_notice
 return true
