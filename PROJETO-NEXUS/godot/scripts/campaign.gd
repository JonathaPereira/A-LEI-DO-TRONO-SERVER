extends RefCounted
## Campaign progression is local and separate from the baseline combat catalog.
const STORE := "user://campaign-0.7.json"
const SAVE_SCHEMA := 8
const SLOT_COUNT := 3
const Objectives = preload("res://scripts/mission_objectives.gd")
const Waves = preload("res://scripts/mission_waves.gd")
const Field = preload("res://scripts/mission_field.gd")
const Equipment = preload("res://scripts/equipment.gd")
const GemForge = preload("res://scripts/gem_forge.gd")
const Progression = preload("res://scripts/progression.gd")
const AbilityTraining = preload("res://scripts/ability_training.gd")
const STARTING_COPIES := GemForge.STARTING_COPIES
var tactics: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/campaign-tactics.json"))
var combat_rules: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/combat-rules.json"))
var _run_serial := 0
var _run_prefix := Crypto.new().generate_random_bytes(12).hex_encode()
var _active_run: Dictionary = {}
## Frozen migration contract. Never derive old rewards from a reordered catalog.
const LEGACY_REWARDS := {
	"gate":"ember", "court":"sap", "eclipse":"pulse",
	"tidal-gate":"ember", "tidal-archive":"sap", "tidal-heart":"pulse",
	"forge-road":"ember", "forge-relay":"sap", "forge-heart":"pulse",
}
const LEGACY_ORDER := ["gate", "court", "eclipse", "tidal-gate", "tidal-archive", "tidal-heart", "forge-road", "forge-relay", "forge-heart"]
const GEMS := [
	{"id": "ember", "name": "Brasa lapidada", "effect": "+4% ATQ", "detail": "Cada cópia soma 4% do ataque base na campanha; três somam 12%. Não altera recargas, críticos ou duração dos efeitos.", "color": "ff5369", "stat": "attack", "bonus": 0.04},
	{"id": "sap", "name": "Seiva cristalizada", "effect": "+5% VIDA", "detail": "Cada cópia soma 5% da vida base na campanha; três somam 15%. O limite de escudo continua sendo 25% da vida máxima.", "color": "47dda1", "stat": "maxHp", "bonus": 0.05},
	{"id": "pulse", "name": "Pulso de éter", "effect": "+8 EN inicial", "detail": "Cada cópia soma 8 de energia no início da missão. Com peças básicas: 48, 56 ou 64. Não aumenta a energia gerada durante o combate.", "color": "4cbaff", "stat": "energy", "bonus": 8},
]
const CHAPTERS := [
	{"id": "beacon", "finalMission": "eclipse", "name": "O Farol Partido", "eyebrow": "CAPÍTULO I", "theme": "sanctum", "color": "79ceef", "summary": "A cidade perdeu seu pulso. Atravesse os portões, liberte o pátio e rompa a âncora que aprisiona Vesper.", "lesson": "Aprenda a escolher alvos, lidar com estados e quebrar escudos."},
	{"id": "tides", "finalMission": "tidal-heart", "name": "Marés da Memória", "eyebrow": "CAPÍTULO II", "theme": "tides", "color": "70dfd7", "summary": "As coordenadas do Farol levam a um observatório submerso. Recupere os nomes que a maré levou antes que a cidade esqueça seus próprios guardiões.", "lesson": "Combine dano, purificação e proteção para atravessar a maré."},
	{"id": "forge", "finalMission": "forge-heart", "name": "A Última Fornalha", "eyebrow": "CAPÍTULO III", "theme": "forge", "color": "f7ae79", "summary": "O sinal roubado alimenta uma forja além do Trono. Interrompa a extração, desarme suas sentinelas e devolva ao Farol as cinco ressonâncias.", "lesson": "Administre energia, recargas e supremos no confronto final."},
]
const MISSIONS := [
	{"id": "gate", "seed": 730, "chapter": "beacon", "requires": [], "name": "01 · Os portões quebrados", "location": "ARREDORES DO FAROL", "story": "O Farol silenciou. Sentinelas de pedra abandonaram seus postos e as raízes ganharam vida. Seu trio precisa abrir caminho até o pátio.", "enemies": ["minion-sentinel", "minion-root", "minion-acolyte"], "scale": 1.0, "reward": "ember", "tip": "Elimine o Acólito para impedir exposição da defesa. Ataques básicos podem escolher qualquer alvo.", "ending": "Os sentinelas caem. Nos cacos há um fragmento de gema e o mesmo selo que Vesper carrega em sua lâmina."},
	{"id": "court", "seed": 767, "chapter": "beacon", "requires": ["gate"], "name": "02 · Ecos no pátio", "location": "PÁTIO DAS RAÍZES", "story": "O selo do pátio ganha força a cada rodada. O Acólito conduz o ritual enquanto seus guardas bloqueiam a passagem. Neutralize o conjurador antes que o selo se feche.", "enemies": ["minion-root", "minion-sentinel", "minion-acolyte"], "scale": 1.24, "reward": "sap", "tip": "Concentre dano no Acólito até o fim da rodada 4. Não é necessário derrotar os guardas; ataques em área podem abrir caminho sem perder o alvo.", "ending": "A passagem se abre. Uma voz pede que vocês destruam a âncora do eclipse, mesmo que seu guardião lute para impedi-los.", "objective": {"type": "target", "target": "1-minion-acolyte", "targetName": "o Acólito do Véu", "rounds": 4}},
	{"id": "eclipse", "seed": 804, "chapter": "beacon", "requires": ["court"], "name": "03 · O guardião do eclipse", "location": "NÚCLEO DO FAROL · CHEFE", "story": "Preso ao núcleo, Vesper é forçado a defender a âncora. Vença o guardião e seus dois servos para quebrar o vínculo. O Vesper do seu elenco continua disponível: este é um confronto de história.", "enemies": ["boss-vesper", "minion-sentinel", "minion-acolyte"], "scale": 1.05, "reward": "pulse", "tip": "Vesper provoca e contra-ataca. Ataques em área ignoram a restrição de Provocação; o escudo dele expira e não acumula.", "ending": "O eclipse se desfaz. Livre da âncora, Vesper guarda um caco do Farol: a energia que o aprisionava veio de além do Trono. Fim do capítulo I — as coordenadas apontam para o Observatório das Marés."},
	{"id": "tidal-gate", "seed": 841, "chapter": "tides", "requires": ["eclipse"], "name": "04 · A escadaria das marés", "location": "OBSERVATÓRIO · CAIS EXTERIOR", "story": "A água recua por alguns instantes. Sentinelas de sal guardam a escadaria e chamam reforços enquanto o coro repete nomes esquecidos. Atravesse duas ondas para abrir a passagem ao observatório.", "enemies": ["minion-tide", "minion-acolyte", "minion-root"], "scale": 1.08, "reward": "ember", "tip": "São duas ondas com os mesmos tipos de vigias. Vida, energia e efeitos do trio continuam entre elas; não há restauração nem recompensa intermediária. Cada reforço abre uma nova rodada, respeitando expiração dos escudos e Fratura.", "ending": "Sob a escadaria, Saira ouve um nome conhecido. O coro não pertence à água: são as memórias desviadas do Farol.", "waves": [{"name":"Vigias da escadaria","healthScale":0.65,"attackScale":0.9},{"name":"Reforços da maré","healthScale":0.75,"attackScale":1.0}]},
	{"id": "tidal-archive", "seed": 878, "chapter": "tides", "requires": ["tidal-gate"], "name": "05 · O arquivo submerso", "location": "OBSERVATÓRIO · SALA DOS NOMES", "story": "Os registros presos nos cristais de sal precisam de três rodadas para atravessar o canal de memória. Mantenha os três portadores vivos enquanto a transferência ocorre, ou elimine a ameaça antes.", "enemies": ["minion-tide", "minion-siren", "minion-acolyte"], "scale": 1.08, "reward": "sap", "tip": "Proteja os três integrantes por três rodadas completas. Escudos, defesa e purificação ajudam a resistir; a queda de qualquer aliado interrompe a transferência.", "ending": "Os registros voltam a ter voz. Cada nome aponta para a mesma transferência: a energia foi enviada à Última Fornalha.", "objective": {"type": "survive", "rounds": 3, "protectAll": true}},
	{"id": "tidal-heart", "seed": 915, "chapter": "tides", "requires": ["tidal-archive"], "name": "06 · A guardiã da memória", "location": "OBSERVATÓRIO · CÂMARA LUNAR · CHEFE", "story": "A guardiã confunde o trio com os saqueadores do núcleo. Uma corrente de éter atravessa a câmara: básicos recuperam mais energia, mas técnicas custam mais para todos. Rompa o selo para que ela reconheça seus aliados.", "enemies": ["boss-tide", "minion-tide", "minion-siren"], "scale": 1.0, "reward": "pulse", "tip": "Corrente do éter: básicos recuperam +4 EN; técnicas custam +5 EN para as duas equipes. Supremos mantêm seu custo. As cartas mostram os valores finais, combinados com seu treinamento.", "ending": "A guardiã devolve os nomes à cidade e abre o caminho da forja. Fim do capítulo II — o Farol recupera sua memória, mas ainda lhe falta uma voz.", "field": {"id":"aether-current","name":"Corrente do éter","basicEnergyGain":4,"skillCostDelta":5}},
	{"id": "forge-road", "seed": 952, "chapter": "forge", "requires": ["tidal-heart"], "name": "07 · A estrada das cinzas", "location": "ÚLTIMA FORNALHA · PONTE EXTERIOR", "story": "Cinzas cobrem a ponte que liga o Trono à forja. A equipe resgata uma carga de fragmentos do Farol, mas os coletores cercam a passagem. O primeiro integrante do trio assume o transporte. Elimine a escolta inimiga mantendo esse portador vivo.", "enemies": ["minion-cinder", "minion-sentinel", "minion-acolyte"], "scale": 1.12, "reward": "ember", "tip": "Escolha o portador colocando qualquer herói na primeira posição do trio. Cura e escudo ajudam a protegê-lo. Se ele cair, a missão falha; os outros aliados não precisam sobreviver.", "ending": "O portador atravessa a ponte com os fragmentos resgatados. Veyra reconhece na carga a luz da manhã que sua cidade perdeu. A extração ainda continua no interior.", "objective": {"type":"clear","protectSlot":0}},
	{"id": "forge-relay", "seed": 989, "chapter": "forge", "requires": ["forge-road"], "name": "08 · O coração das máquinas", "location": "ÚLTIMA FORNALHA · ANEL DE CONTENÇÃO", "story": "O Guardião do relé prepara a retirada dos fragmentos roubados. Seus auxiliares mantêm a defesa, mas neutralizar o comandante desliga o anel de contenção. Interrompa a retirada até o fim da sexta rodada.", "enemies": ["boss-relay", "minion-tide", "minion-siren"], "scale": 1.17, "reward": "sap", "tip": "O Guardião é o objetivo. Concentre a ofensiva nele, ou remova o curador para impedir sua recuperação. Os auxiliares sobreviventes recuam quando o Guardião cai.", "ending": "Os relés silenciam. Pela primeira vez, o Farol responde sem interferência. Apenas o juramento do Arconte impede que sua energia retorne.", "objective": {"type": "target", "target": "1-boss-relay", "targetName": "o Guardião do relé", "rounds": 6}},
	{"id": "forge-heart", "seed": 1026, "chapter": "forge", "requires": ["forge-relay"], "name": "09 · O último juramento", "location": "ÚLTIMA FORNALHA · NÚCLEO · CHEFE", "story": "O Arconte acredita que aprisionar as ressonâncias é a única forma de impedir outra queda. Mostre que elas podem voltar a coexistir. Vença a guarda e encerre o ciclo de contenção.", "enemies": ["boss-forge", "minion-cinder", "minion-acolyte"], "scale": 1.0, "reward": "pulse", "tip": "O Arconte combina pressão em área e defesa. Preserve a cura, espere a abertura e use seus supremos em conjunto.", "ending": "As cinco ressonâncias retornam ao Farol. Os nomes, as manhãs e as vozes encontram seus lugares. Vesper quebra a última corrente. Fim do capítulo III — a cidade volta a escolher seu próprio futuro."},
]
var completed: Dictionary = {}
var cleared: int:
	get: return completed.size()
var missions: Array = []
var team: Array = []
var equipped: Dictionary = {}
var gear: Dictionary = {}
var repeat_wins: Dictionary = {}
var gem_crafts: Dictionary = {}
var gem_fusions: Dictionary = {}
var mastery: Dictionary = {}
var ability_choices: Dictionary = {}
var error_text := ""
var catalog
var store_path := STORE
var _backup_suffix := ""
var _write_blocked := false

func _init(source = null, path: String = STORE, definitions: Array = MISSIONS) -> void:
	assert(tactics.get("schemaVersion") == 1, "Parâmetros táticos de campanha ausentes ou incompatíveis.")
	catalog = source
	store_path = path
	missions = definitions.duplicate(true)
	if catalog != null:
		team = catalog.default_teams[0].duplicate()
		load_progress()

func active_hero(id: String) -> bool:
	return catalog != null and catalog.heroes.any(func(hero): return hero.id == id)

func gem(id: String) -> Dictionary:
	return GemForge.lookup(id,GEMS)

func gems_at_level(level: int) -> Array:
	if level < 1 or level > 3: return []
	return GEMS.map(func(item):return gem(GemForge.key(item.id,level)))

func copies(id: String) -> int:
	return int(GemForge.stock(completed,gem_crafts,gem_fusions).get(id,0))

func slots(hero: String) -> Array:
	var result: Array = ["", "", ""]
	var saved: Variant = equipped.get(hero, [])
	if saved is Array:
		for index in range(mini(saved.size(), SLOT_COUNT)):
			if saved[index] is String and not gem(saved[index]).is_empty(): result[index] = saved[index]
	return result

func available(id: String, excluding_hero: String = "", excluding_slot: int = -1) -> int:
	if gem(id).is_empty(): return 0
	var used := 0
	for hero in equipped:
		var items := slots(hero)
		for index in range(SLOT_COUNT):
			if hero == excluding_hero and index == excluding_slot: continue
			if items[index] == id: used += 1
	return maxi(0, copies(id) - used)

func bonuses(hero: String) -> Dictionary:
	var result := {"attack": 0.0, "health": 0.0, "energy": 0}
	for type in slots(hero):
		var item := gem(type)
		if item.is_empty(): continue
		var key: String = "health" if item.stat == "maxHp" else item.stat
		result[key] += item.bonus
	return result

func summary(hero: String) -> String:
	var labels: PackedStringArray = []
	var items := slots(hero)
	for index in range(SLOT_COUNT):
		var item := gem(items[index])
		labels.append("%d · %s" % [index + 1, "Vazio" if item.is_empty() else item.name + " (" + item.effect + ")"])
	return " | ".join(labels)

func can_play(index: int) -> bool:
	if _write_blocked or index < 0 or index >= missions.size(): return false
	if is_complete(index): return true
	return missions[index].get("requires", []).all(func(id): return completed.has(id))

func is_complete(index: int) -> bool:
	return index >= 0 and index < missions.size() and completed.has(missions[index].id)

func next_mission() -> int:
	for index in range(missions.size()):
		if not is_complete(index) and can_play(index): return index
	return chapter_final(CHAPTERS.size() - 1)

func mission_index(id: String) -> int:
	for index in range(missions.size()):
		if missions[index].id == id: return index
	return -1

func chapter_final(index: int) -> int:
	return mission_index(CHAPTERS[index].finalMission)

func mission_reward(index: int) -> Dictionary:
	var mission: Dictionary = missions[index]
	return gem(completed.get(mission.id, mission.reward))

func chapter_missions(index: int) -> Array:
	var result: Array = []
	for mission in range(missions.size()):
		if missions[mission].chapter == CHAPTERS[index].id: result.append(mission)
	return result

func chapter_cleared(index: int) -> int:
	return chapter_missions(index).filter(is_complete).size()

func chapter_available(index: int) -> bool:
	return chapter_missions(index).any(can_play)

func next_chapter() -> int:
	for index in range(CHAPTERS.size()):
		if missions[next_mission()].chapter == CHAPTERS[index].id: return index
	return 0

func _legacy_completed(count: int) -> Dictionary:
	var result := {}
	for index in range(count): result[LEGACY_ORDER[index]] = LEGACY_REWARDS[LEGACY_ORDER[index]]
	return result

func _valid_ledger(value: Variant) -> bool:
	if not value is Dictionary or value.size() > missions.size(): return false
	for id in value:
		if not id is String or not missions.any(func(m): return m.id == id): return false
		if not value[id] is String or not GEMS.any(func(item):return item.id == value[id]): return false
	return true

func _read_document(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string(path)) != OK or not parser.data is Dictionary: return {}
	return parser.data

func _known_schema(schema: Variant) -> bool:
	return (schema is int or schema is float) and is_finite(float(schema)) and schema >= 1 and schema <= SAVE_SCHEMA and schema == floor(float(schema))

## Recovery must not promote a damaged backup into earned progress or inventory.
func _valid_recovery(data: Dictionary) -> bool:
	if not _known_schema(data.get("schemaVersion")): return false
	var ledger: Dictionary
	if data.schemaVersion >= 4:
		if not _valid_ledger(data.get("completed")): return false
		ledger = data.completed
	else:
		var count: Variant = data.get("cleared")
		var limit: int = 3 if data.schemaVersion < 3 else LEGACY_ORDER.size()
		if not (count is int or count is float) or not is_finite(float(count)): return false
		if count < 0 or count > limit or count != floor(float(count)): return false
		ledger = _legacy_completed(int(count))
	var active_ids: Array = catalog.heroes.map(func(h):return h.id)
	if data.schemaVersion >= 5 and Equipment.validate(data.get("gear"),data.get("repeatWins"),ledger,active_ids) != "": return false
	var ids: Variant = data.get("team")
	if not catalog.valid_team(ids) or not ids.all(func(id): return active_hero(id)): return false
	var equipment: Variant = data.get("equipped")
	if not equipment is Dictionary: return false
	var sockets: Dictionary = equipment.duplicate(true)
	for hero in equipment:
		if data.schemaVersion == 1 and equipment[hero] is String: sockets[hero] = [equipment[hero],"",""]
	var budget: int = Equipment.earned(ledger,data.get("repeatWins",{}) if data.schemaVersion >= 5 else {}) - Equipment.spent(data.gear if data.schemaVersion >= 5 else {})
	if GemForge.validate(data.get("gemCrafts") if data.schemaVersion >= 6 else {},data.get("gemFusions") if data.schemaVersion >= 6 else {},sockets,ledger,budget,active_ids) != "": return false
	if data.schemaVersion >= 7 and Progression.validate(data.get("mastery"),ledger,data.repeatWins,active_ids) != "": return false
	return data.schemaVersion < 8 or AbilityTraining.validate(data.get("abilityChoices"),data.mastery,active_ids) == ""

func load_progress() -> void:
	completed.clear()
	equipped.clear()
	gear.clear()
	repeat_wins.clear()
	gem_crafts.clear()
	gem_fusions.clear()
	mastery.clear()
	ability_choices.clear()
	_active_run.clear()
	error_text = ""
	_backup_suffix = ""
	_write_blocked = false
	if catalog != null: team = catalog.default_teams[0].duplicate()
	var has_primary := FileAccess.file_exists(store_path)
	var data := _read_document(store_path)
	var schema: Variant = data.get("schemaVersion")
	var recovered := false
	# Unknown numeric versions may belong to a newer game. Do not silently downgrade.
	if not _known_schema(schema) and not (schema is int or schema is float):
		var backup := _read_document(store_path + ".bak")
		if _valid_recovery(backup):
			data = backup
			recovered = true
	if not has_primary and not recovered:
		if FileAccess.file_exists(store_path + ".bak"): error_text = "A cópia do progresso não pôde ser recuperada. O arquivo foi preservado."
		return
	if not _known_schema(data.get("schemaVersion")):
		_write_blocked = schema is int or schema is float
		_backup_suffix = ".invalid.bak"
		error_text = "Este progresso pertence a uma versão incompatível. Use uma versão compatível; o arquivo não será substituído." if _write_blocked else "O progresso salvo não pôde ser lido. O arquivo foi preservado; uma cópia será guardada antes de uma nova gravação."
		return
	var legacy: bool = data.schemaVersion == 1
	if legacy: _backup_suffix = ".v1.bak"
	elif data.schemaVersion == 2: _backup_suffix = ".v2.bak"
	elif data.schemaVersion == 3: _backup_suffix = ".v3.bak"
	elif data.schemaVersion == 4: _backup_suffix = ".v4.bak"
	elif data.schemaVersion == 5: _backup_suffix = ".v5.bak"
	elif data.schemaVersion == 6: _backup_suffix = ".v6.bak"
	elif data.schemaVersion == 7: _backup_suffix = ".v7.bak"
	var repaired := false
	if data.schemaVersion >= 4:
		if not _valid_ledger(data.get("completed")):
			_write_blocked = true
			error_text = "Este progresso contém missões ou recompensas desconhecidas ou inválidas. Abra-o em uma versão compatível; o arquivo não será substituído."
			return
		completed = data.completed.duplicate()
	else:
		var count: Variant = data.get("cleared", 0)
		if (count is int or count is float) and is_finite(float(count)):
			var amount := int(clampf(float(count), 0, 3 if data.schemaVersion < 3 else LEGACY_ORDER.size()))
			completed = _legacy_completed(amount)
			repaired = float(count) != float(amount)
		else: repaired = true
	if not _valid_ledger(completed):
		_write_blocked = true
		error_text = "Este progresso depende de missões ausentes nesta versão. Use uma versão compatível; o arquivo não será substituído."
		completed.clear()
		return
	if data.schemaVersion >= 5:
		var inventory_error := Equipment.validate(data.get("gear"),data.get("repeatWins"),completed,catalog.heroes.map(func(h):return h.id))
		if inventory_error != "":
			_write_blocked = true
			error_text = inventory_error + " O arquivo foi preservado; use uma versão compatível."
			return
		gear = data.gear.duplicate(true)
		for pieces in gear.values():
			for item in pieces: item.tier = int(item.tier)
		repeat_wins = data.repeatWins.duplicate(true)
	if data.schemaVersion >= 6:
		var forge_error := GemForge.validate(data.get("gemCrafts"),data.get("gemFusions"),data.get("equipped"),completed,Equipment.earned(completed,repeat_wins)-Equipment.spent(gear),catalog.heroes.map(func(h):return h.id))
		if forge_error != "":
			_write_blocked = true
			error_text = forge_error + " O arquivo foi preservado; use uma versão compatível."
			return
		gem_crafts = data.gemCrafts.duplicate()
		gem_fusions = data.gemFusions.duplicate()
		for id in gem_crafts: gem_crafts[id] = int(gem_crafts[id])
		for id in gem_fusions: gem_fusions[id] = int(gem_fusions[id])
	if data.schemaVersion >= 7:
		var mastery_error := Progression.validate(data.get("mastery"),completed,repeat_wins,catalog.heroes.map(func(h):return h.id))
		if mastery_error != "":
			_write_blocked = true
			error_text = mastery_error + " O arquivo foi preservado; use uma versão compatível."
			return
		mastery = data.mastery.duplicate()
		for hero in mastery: mastery[hero] = int(mastery[hero])
	if data.schemaVersion >= 8:
		var training_error := AbilityTraining.validate(data.get("abilityChoices"),mastery,catalog.heroes.map(func(h):return h.id))
		if training_error != "":
			_write_blocked = true
			error_text = training_error + " O arquivo foi preservado; use uma versão compatível."
			return
		ability_choices = data.abilityChoices.duplicate(true)
	var saved_team: Variant = data.get("team", [])
	if catalog.valid_team(saved_team) and saved_team.all(func(id): return active_hero(id)): team = saved_team.duplicate()
	else: repaired = true
	var saved_gems: Variant = data.get("equipped", {})
	if saved_gems is Dictionary:
		equipped.clear()
		for id in saved_gems:
			if not id is String or not active_hero(id):
				repaired = true
				continue
			var saved: Variant = saved_gems[id]
			if legacy and saved is String: saved = [saved, "", ""]
			if not saved is Array:
				repaired = true
				continue
			if saved.size() != SLOT_COUNT: repaired = true
			var items: Array = ["", "", ""]
			for index in range(mini(saved.size(), SLOT_COUNT)):
				var type: Variant = saved[index]
				if type is String and type == "": continue
				if not type is String or gem(type).is_empty() or available(type) <= 0:
					repaired = true
					continue
				items[index] = type
				# Register every accepted slot immediately so repeated gems consume real copies.
				equipped[id] = items.duplicate()
	else: repaired = true
	if repaired:
		if not legacy: _backup_suffix = ".invalid.bak"
		error_text = "Alguns dados do progresso eram inválidos e foram corrigidos. O original será guardado em uma cópia antes de salvar."
	if recovered:
		_backup_suffix = ".invalid.bak" if has_primary else ""
		error_text = "Progresso recuperado da última cópia válida. A gravação mais recente pode ter sido perdida; confira missões e engastes. O arquivo original foi preservado."

func _preserve_source() -> bool:
	if not FileAccess.file_exists(store_path): return true
	if _backup_suffix == "":
		# Stage the previous healthy save separately so a failed backup never destroys it.
		if not _valid_recovery(_read_document(store_path)):
			error_text = "O progresso no disco mudou ou está inválido. Reabra o jogo antes de salvar; o arquivo foi preservado."
			return false
		var previous := _read_document(store_path+".bak")
		if _valid_recovery(previous) and previous.schemaVersion < SAVE_SCHEMA:
			if not _preserve_copy(store_path+".bak",store_path+".v%d.bak" % int(previous.schemaVersion)): return false
		var staged := ProjectSettings.globalize_path(store_path + ".bak.tmp")
		var backup_error := DirAccess.copy_absolute(ProjectSettings.globalize_path(store_path), staged)
		if backup_error == OK:
			backup_error = DirAccess.rename_absolute(staged, ProjectSettings.globalize_path(store_path + ".bak"))
		if backup_error != OK:
			error_text = "Não foi possível preservar a cópia do progresso: " + error_string(backup_error) + ". O arquivo original não foi substituído."
			return false
		return true
	return _preserve_copy(store_path,store_path+_backup_suffix)

func _preserve_copy(source: String, backup_path: String) -> bool:
	var backup := backup_path
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(backup)):
		error_text = "Não foi possível preservar o progresso anterior: há uma pasta no caminho da cópia. O arquivo original não foi substituído."
		return false
	if FileAccess.file_exists(backup):
		if FileAccess.get_file_as_bytes(backup) == FileAccess.get_file_as_bytes(source): return true
		var suffix := 1
		while FileAccess.file_exists(backup + ".%d" % suffix) or DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(backup + ".%d" % suffix)): suffix += 1
		backup += ".%d" % suffix
	var error := DirAccess.copy_absolute(ProjectSettings.globalize_path(source), ProjectSettings.globalize_path(backup))
	if error == OK and FileAccess.get_file_as_bytes(source) != FileAccess.get_file_as_bytes(backup): error = ERR_FILE_CORRUPT
	if error != OK:
		error_text = "Não foi possível preservar o progresso anterior: " + error_string(error) + ". O arquivo original não foi substituído."
		return false
	return true

func save_progress() -> bool:
	if _write_blocked: return false
	var inventory_error := Equipment.validate(gear,repeat_wins,completed,catalog.heroes.map(func(h):return h.id))
	if inventory_error != "":
		error_text = inventory_error
		return false
	var forge_error := GemForge.validate(gem_crafts,gem_fusions,equipped,completed,Equipment.earned(completed,repeat_wins)-Equipment.spent(gear),catalog.heroes.map(func(h):return h.id))
	if forge_error != "":
		error_text = forge_error
		return false
	var mastery_error := Progression.validate(mastery,completed,repeat_wins,catalog.heroes.map(func(h):return h.id))
	if mastery_error != "":
		error_text = mastery_error
		return false
	var training_error := AbilityTraining.validate(ability_choices,mastery,catalog.heroes.map(func(h):return h.id))
	if training_error != "":
		error_text = training_error
		return false
	var temporary := store_path + ".tmp"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		error_text = "Não foi possível salvar o progresso: " + error_string(FileAccess.get_open_error())
		return false
	file.store_string(JSON.stringify({"schemaVersion": SAVE_SCHEMA, "completed": completed, "team": team, "equipped": equipped, "gear":gear,"repeatWins":repeat_wins,"gemCrafts":gem_crafts,"gemFusions":gem_fusions,"mastery":mastery,"abilityChoices":ability_choices}, "\t"))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		error_text = "Não foi possível gravar o progresso: " + error_string(write_error)
		return false
	if not _preserve_source(): return false
	var error := DirAccess.rename_absolute(ProjectSettings.globalize_path(temporary), ProjectSettings.globalize_path(store_path))
	if error != OK:
		error_text = "Não foi possível concluir o salvamento: " + error_string(error)
		return false
	error_text = ""
	_backup_suffix = ""
	return true

func set_team(ids: Array) -> bool:
	if not catalog.valid_team(ids) or not ids.all(func(id): return active_hero(id)): return false
	var before := team.duplicate()
	team = ids.duplicate()
	if save_progress(): return true
	team = before
	return false

func equip(hero: String, type: String, slot: int = 0) -> bool:
	if not active_hero(hero) or slot < 0 or slot >= SLOT_COUNT: return false
	if type != "" and (gem(type).is_empty() or available(type, hero, slot) <= 0): return false
	var before := equipped.duplicate(true)
	var items := slots(hero)
	items[slot] = type
	if items.all(func(id): return id == ""): equipped.erase(hero)
	else: equipped[hero] = items
	if save_progress(): return true
	equipped = before
	return false

## All loadout edits save once and roll back together on a disk failure.
func remove_gems(hero: String) -> bool:
	if not active_hero(hero): return false
	var before := equipped.duplicate(true)
	equipped.erase(hero)
	if save_progress(): return true
	equipped = before
	return false

func transfer_gem(source_hero: String, source_slot: int, target_hero: String, target_slot: int) -> bool:
	if not active_hero(source_hero) or not active_hero(target_hero): return false
	if source_slot < 0 or source_slot >= SLOT_COUNT or target_slot < 0 or target_slot >= SLOT_COUNT: return false
	if source_hero == target_hero and source_slot == target_slot: return false
	var source := slots(source_hero)
	var type: String = source[source_slot]
	if type == "": return false
	var before := equipped.duplicate(true)
	source[source_slot] = ""
	if source.all(func(id): return id == ""): equipped.erase(source_hero)
	else: equipped[source_hero] = source
	var target := slots(target_hero)
	target[target_slot] = type
	equipped[target_hero] = target
	if save_progress(): return true
	equipped = before
	return false

func fill_gems(hero: String) -> bool:
	if not active_hero(hero): return false
	var before := equipped.duplicate(true)
	var items := slots(hero)
	var role: String = catalog.hero_by_id[hero].role
	var priorities: Array = ["sap", "sap", "ember"] if role == "Tanque" else (["pulse", "sap", "pulse"] if role == "Suporte" else ["ember", "pulse", "ember"])
	for index in range(SLOT_COUNT):
		if items[index] != "": continue
		for type in [priorities[index], "sap", "pulse", "ember"]:
			for level in [3,2,1]:
				var id := GemForge.key(type,level)
				if available(id) <= 0: continue
				items[index] = id
				equipped[hero] = items.duplicate()
				break
			if items[index] != "": break
	if save_progress(): return true
	equipped = before
	return false

func complete(index: int) -> Dictionary:
	if not can_play(index): return {"error": "Missão bloqueada."}
	if is_complete(index): return {"first": false, "saved": save_progress()}
	completed[missions[index].id] = missions[index].reward
	# Keep earned progress in memory on write failure; the result explicitly reports it.
	return {"first": true, "saved": save_progress(), "gem": gem(missions[index].reward).name}

func materials() -> int:
	return Equipment.earned(completed,repeat_wins) - Equipment.spent(gear) - GemForge.spent(gem_crafts)

func team_experience() -> int:
	return Progression.experience(completed,repeat_wins)

func team_level() -> int:
	return Progression.level(team_experience())

func mastery_experience(hero: String) -> int:
	return int(mastery.get(hero,0)) if active_hero(hero) else 0

func mastery_rank(hero: String) -> int:
	return Progression.rank(mastery_experience(hero))

func set_ability(hero: String, action: String, choice: String) -> bool:
	if _write_blocked or not active_hero(hero) or action not in AbilityTraining.ACTIONS: return false
	if choice != "" and (choice != AbilityTraining.settings[action].id or not AbilityTraining.unlocked(action,mastery_experience(hero))): return false
	if ability_choices.get(hero,{}).get(action,"") == choice: return true
	var before := ability_choices.duplicate(true)
	var actions: Dictionary = ability_choices.get(hero,{}).duplicate()
	if choice == "": actions.erase(action)
	else: actions[action] = choice
	if actions.is_empty(): ability_choices.erase(hero)
	else: ability_choices[hero] = actions
	if save_progress(): return true
	ability_choices = before
	return false

func trained_action(hero: String, action: String) -> Dictionary:
	if not active_hero(hero): return {}
	return AbilityTraining.build(catalog.hero_by_id[hero],action,ability_choices.get(hero,{}).get(action,""),int(combat_rules.energy.basicGain))

func craft_gem(type: String) -> bool:
	if type not in GemForge.BASE_IDS or not completed.has(GemForge.settings.craftUnlock) or materials() < GemForge.settings.craftMaterials: return false
	var before := gem_crafts.duplicate()
	gem_crafts[type] = int(gem_crafts.get(type,0))+1
	if save_progress(): return true
	gem_crafts = before
	return false

func fuse_gem(type: String) -> bool:
	var item := gem(type)
	if item.is_empty() or item.level >= 3 or not completed.has(GemForge.settings.levelUnlocks[item.level]) or available(type) < GemForge.settings.fusionCopies: return false
	var before := gem_fusions.duplicate()
	gem_fusions[type] = int(gem_fusions.get(type,0))+1
	if save_progress(): return true
	gem_fusions = before
	return false

func piece(hero: String, slot: int) -> Dictionary:
	if not active_hero(hero) or slot < 0 or slot >= 3: return {}
	return Equipment.row(gear,hero)[slot]

func _set_piece(hero: String, slot: int, item: Dictionary) -> void:
	var pieces: Array = Equipment.row(gear,hero)
	pieces[slot] = item.duplicate(true)
	if pieces == Equipment.defaults(): gear.erase(hero)
	else: gear[hero] = pieces

func upgrade_piece(hero: String, slot: int) -> bool:
	var item := piece(hero,slot)
	if item.is_empty() or item.tier >= 3 or item.tier >= Equipment.unlocked_tier(completed): return false
	if materials() < Equipment.settings.upgradeCosts[int(item.tier)]: return false
	var before := gear.duplicate(true)
	item.tier += 1
	_set_piece(hero,slot,item)
	if save_progress(): return true
	gear = before
	return false

func change_piece(hero: String, slot: int, variant: String) -> bool:
	var item := piece(hero,slot)
	if item.is_empty() or not Equipment.settings.slots[slot].variants.has(variant) or not Equipment.variant_unlocked(completed,variant): return false
	if item.variant == variant: return true
	var before := gear.duplicate(true)
	var gems_before := equipped.duplicate(true)
	item.variant = variant
	_set_piece(hero,slot,item)
	var gems := slots(hero)
	gems[slot] = ""
	if gems.all(func(id):return id == ""): equipped.erase(hero)
	else: equipped[hero] = gems
	if save_progress(): return true
	gear = before
	equipped = gems_before
	return false

func transfer_piece(source: String, target: String, slot: int) -> bool:
	if source == target: return false
	var incoming := piece(source,slot)
	var outgoing := piece(target,slot)
	if incoming.is_empty() or outgoing.is_empty(): return false
	var before := gear.duplicate(true)
	var gems_before := equipped.duplicate(true)
	_set_piece(source,slot,outgoing)
	_set_piece(target,slot,incoming)
	for hero in [source,target]:
		var gems := slots(hero)
		gems[slot] = ""
		if gems.all(func(id):return id == ""): equipped.erase(hero)
		else: equipped[hero] = gems
	if save_progress(): return true
	gear = before
	equipped = gems_before
	return false

func loadout_stats(hero: String, override_slot: int = -1, proposed: Dictionary = {}, remove_socket: int = -1, socket_value: String = "") -> Dictionary:
	if not active_hero(hero): return {}
	var pieces: Array = Equipment.row(gear,hero)
	if override_slot >= 0: pieces[override_slot] = proposed
	var bonus: Dictionary = Equipment.bonuses(pieces)
	var growth := Progression.bonuses(team_level(),catalog.hero_by_id[hero].role,mastery_experience(hero))
	for stat in growth: bonus[stat] += growth[stat]
	for index in range(3):
		var item := gem(socket_value if index == remove_socket else slots(hero)[index])
		if not item.is_empty(): bonus["health" if item.stat == "maxHp" else item.stat] += item.bonus
	var base: Dictionary = catalog.hero_by_id[hero]
	return {"maxHp":int(floor(base.hp*(1+bonus.health)+0.5)),"attack":int(floor(base.attack*(1+bonus.attack)+0.5)),"defense":int(floor(base.defense*(1+bonus.defense)+0.5)),"energy":clampi(int(combat_rules.energy.initial)+int(bonus.energy),0,int(combat_rules.energy.maximum))}

func claim_victory(state: Dictionary) -> Dictionary:
	if state.get("phase") != "finished" or state.get("winner") != 0 or state.get("missionResult",{}).get("winner") != 0: return {"error":"A missão ainda não foi vencida."}
	if _active_run.is_empty() or state.get("campaignRun") != _active_run.token or state.get("campaignMissionId") != _active_run.mission or _active_run.get("claimed",false): return {"error":"Resultado antigo, desconhecido ou já processado."}
	var index: int = missions.find_custom(func(m):return m.id == _active_run.mission)
	if index < 0 or not can_play(index): return {"error":"Missão inválida."}
	var required_waves: Array = missions[index].get("waves",[])
	if not required_waves.is_empty() and state.get("campaignWaveIndex",-1) != required_waves.size()-1: return {"error":"Ainda há ondas para concluir."}
	_active_run.claimed = true
	var level_before := team_level()
	var awards := {}
	for hero in _active_run.team:
		var previous := mastery_experience(hero)
		mastery[hero] = mini(int(Progression.settings.masteryThresholds[-1]),previous+int(Progression.settings.masteryPerVictory))
		awards[hero] = mastery[hero]-previous
	if not is_complete(index):
		var reward := complete(index)
		reward.materials = Equipment.first_reward(missions[index].id)
		reward.teamExperience = int(Progression.settings.firstClearExperience)
		reward.mastery = awards
		reward.levelBefore = level_before
		reward.levelAfter = team_level()
		return reward
	var id: String = missions[index].id
	repeat_wins[id] = int(repeat_wins.get(id,0)) + 1
	return {"first":false,"materials":int(Equipment.settings.replayMaterials),"saved":save_progress(),"teamExperience":int(Progression.settings.replayExperience),"mastery":awards,"levelBefore":level_before,"levelAfter":team_level()}

static func _action(id: String, title: String, kind: String, power: float, description: String, effect: String = "") -> Dictionary:
	var value := {"id": id, "name": title, "kind": kind, "power": power, "description": description, "cost": {"basic": 0, "skill": 30, "ultimate": 80}[id], "cooldown": 2 if id == "skill" else 0}
	if effect != "": value.effect = effect
	return value

static func register_enemies(source) -> void:
	var definitions := [
		{"id": "minion-sentinel", "index": 24, "name": "Sentinela", "classId": "tecnico", "title": "Sentinela de cacos", "hp": 830, "attack": 149, "defense": 88, "speed": 62, "weapon": "spear", "animation": "rail", "role": "Minion", "identity": "Autômato de pedra que protege o próprio núcleo.", "synergy": "Sua barreira é pequena: concentre ataques ou elimine seus aliados.", "lore": "Antigo vigia do Farol, movido por um fragmento corrompido.",
		"basic": _action("basic", "Lança de cacos", "damage", 0.85, "85% do ataque em um alvo. Recupera 24 de energia."),
		"skill": _action("skill", "Placas fechadas", "shield", 0.12, "Escudo próprio de 12% por 2 ações. Não acumula."),
		"ultimate": _action("ultimate", "Estilhaçar", "aoe", 1.0, "100% do ataque contra todos os adversários.")},
		{"id": "minion-root", "index": 25, "name": "Rastejante", "classId": "natural", "title": "Rastejante de raiz", "hp": 670, "attack": 171, "defense": 57, "speed": 98, "weapon": "claws", "animation": "daggers", "role": "Minion", "identity": "Predador de raízes que abre feridas.", "synergy": "Sangramento reduz cura: purifique ou elimine o rastejante cedo.", "lore": "A mata despertou para defender um núcleo que nunca lhe pertenceu.",
		"basic": _action("basic", "Mordida de casca", "damage", 0.85, "85% do ataque em um alvo. Recupera 24 de energia."),
		"skill": _action("skill", "Garras farpadas", "damage", 1.1, "110% do ataque e sangramento por 2 turnos; cura recebida −35%.", "bleed"),
		"ultimate": _action("ultimate", "Bote selvagem", "damage", 1.8, "180% do ataque em um alvo.")},
		{"id": "minion-acolyte", "index": 26, "name": "Acólito", "classId": "sombrio", "title": "Acólito do Véu", "hp": 620, "attack": 165, "defense": 52, "speed": 84, "weapon": "staff", "animation": "threads", "role": "Minion", "identity": "Conjurador frágil que expõe as defesas.", "synergy": "Exposição abre espaço para o ataque dos outros minions.", "lore": "Escuta ordens nos ecos do Farol silenciado.",
		"basic": _action("basic", "Faísca do véu", "damage", 0.85, "85% do ataque em um alvo. Recupera 24 de energia."),
		"skill": _action("skill", "Selo rachado", "damage", 1.0, "100% do ataque e defesa −25% por 2 turnos.", "expose"),
		"ultimate": _action("ultimate", "Véu desfeito", "aoe", 0.9, "90% do ataque em área e ataque inimigo −20% por 2 turnos.", "weaken")},
	]
	definitions[0].skill.self = true
	for enemy in definitions:
		enemy.facesLeft = true
		source.hero_by_id[enemy.id] = enemy
	var boss: Dictionary = source.hero_by_id.vesper.duplicate(true)
	boss.merge({"id": "boss-vesper", "visualHero": "vesper", "title": "Guardião preso ao eclipse", "role": "Chefe", "hp": 1800, "attack": 205, "defense": 108, "speed": 78}, true)
	source.hero_by_id[boss.id] = boss
	for variant in [
		{"id":"minion-tide","source":"oren","name":"Vigia de sal","hp":820,"attack":158,"defense":82,"role":"Minion"},
		{"id":"minion-siren","source":"saira","name":"Eco da maré","hp":630,"attack":145,"defense":51,"role":"Minion"},
		{"id":"minion-cinder","source":"cindra","name":"Coletora de brasas","hp":750,"attack":171,"defense":65,"role":"Minion"},
		{"id":"boss-tide","source":"saira","name":"Guardiã das marés","hp":1550,"attack":190,"defense":85,"role":"Chefe"},
		{"id":"boss-forge","source":"rhazen","name":"Arconte da fornalha","hp":1750,"attack":207,"defense":104,"role":"Chefe"},
		{"id":"boss-relay","source":"rhazen","name":"Guardião do relé","hp":1300,"attack":170,"defense":90,"speed":71,"role":"Chefe"},
	]:
		var enemy: Dictionary = source.hero_by_id[variant.source].duplicate(true)
		enemy.merge(variant, true)
		enemy.visualHero = variant.source
		enemy.title = variant.name
		source.hero_by_id[enemy.id] = enemy

func battle(engine, index: int) -> Dictionary:
	if not can_play(index) or not catalog.valid_team(team): return {"error": "Missão ou equipe inválida."}
	register_enemies(engine.catalog)
	var mission: Dictionary = missions[index]
	var state: Dictionary = engine.new_battle(team, mission.enemies, "normal", mission.seed)
	for actor in state.units:
		if actor.side == 1:
			actor.maxHp = engine.rounded(actor.maxHp * mission.scale)
			actor.hp = actor.maxHp
			actor.attack = engine.rounded(actor.attack * mission.scale)
			if actor.heroId.begins_with("boss-"): actor.energy = 64
		else:
			var attributes := loadout_stats(actor.heroId)
			actor.attack = attributes.attack
			actor.defense = attributes.defense
			actor.maxHp = attributes.maxHp
			actor.hp = actor.maxHp
			actor.energy = attributes.energy
			actor.gem = summary(actor.heroId)
			if not ability_choices.get(actor.heroId,{}).is_empty():
				actor.campaignActions = {}
				for action in ability_choices[actor.heroId]: actor.campaignActions[action] = trained_action(actor.heroId,action)
	state.campaignMission = index
	state.teamLevel = team_level()
	var wave_error := Waves.attach(engine,state,mission)
	if wave_error != "": return {"error":wave_error}
	var field_error := Field.attach(engine,state,mission)
	if field_error != "": return {"error":field_error}
	var objective_error := Objectives.attach(state, mission)
	if objective_error != "": return {"error":objective_error}
	_run_serial += 1
	state.campaignRun = _run_prefix + ":" + str(_run_serial)
	_active_run = {"token":state.campaignRun,"mission":mission.id,"team":team.duplicate(),"claimed":false}
	return state

func _checkpoint(state: Dictionary, engine, boundary: bool = false) -> bool:
	var waiting := Waves.pending(state)
	Objectives.resolve(state,boundary,waiting)
	if state.phase != "playing": return false
	return Waves.advance(engine,state) if waiting else false

func act(engine, state: Dictionary, action: String, target: String, critical: Variant = null) -> Dictionary:
	if not state.has("campaignObjective"): return engine.act(state,action,target,critical)
	var result: Dictionary = engine.act(state, action, target, critical, _checkpoint.bind(engine), _checkpoint.bind(engine,true))
	if not result.has("error"): _checkpoint(state,engine)
	return result

func _carrier_choice(engine, state: Dictionary, actor: Dictionary) -> Dictionary:
	var goal: Dictionary = state.get("campaignObjective",{})
	if actor.side != 0 or not goal.has("protectSlot"): return {}
	var carrier: Dictionary = engine.unit(state,goal.protectedId)
	if carrier.hp <= 0 or float(carrier.hp)/carrier.maxHp >= tactics.endangeredHealthRatio: return {}
	var best: Dictionary = {}
	var best_value := 0.0
	for action_id in ["skill","ultimate","basic","guard"]:
		if not engine.can_use(actor,action_id): continue
		var action: Dictionary = engine.get_action(actor,action_id)
		if not engine.friendly(action) and not action.has("secondary") and not (action_id == "guard" and actor.id == carrier.id): continue
		for target in engine.legal_targets(state,actor,action):
			var prediction: Dictionary = engine.preview(state,action_id,target.id).normal
			var after: Dictionary = prediction.impactUnits.filter(func(u): return u.id == carrier.id)[0]
			var removed: int = carrier.statuses.filter(func(status): return not status.type in engine.POSITIVE).size()-after.statuses.filter(func(status): return not status.type in engine.POSITIVE).size()
			var value: float = maxf(0,after.hp-carrier.hp)+maxf(0,after.shield-carrier.shield)*float(tactics.carrierShieldWeight)+maxi(0,removed)*float(tactics.carrierCleanseValue)
			if value > best_value:
				best_value = value
				best = {"actionId":action_id,"targetId":target.id}
	return best

func choose_ai(engine, state: Dictionary) -> Dictionary:
	if state.get("phase") != "playing": return {}
	var actor: Dictionary = engine.current(state)
	if actor.is_empty(): return {}
	var protection: Dictionary = _carrier_choice(engine,state,actor)
	if not protection.is_empty(): return protection
	var choice: Dictionary = engine.choose_ai(state)
	var goal: Dictionary = state.get("campaignObjective",{})
	if choice.is_empty() or actor.side != 0 or goal.get("type") != "target": return choice
	if engine.friendly(engine.get_action(actor,choice.actionId)) and state.units.any(func(u): return u.side == 0 and u.hp > 0 and float(u.hp)/u.maxHp < tactics.endangeredHealthRatio): return choice
	# A basic attack can unlock a decisive ultimate on the next personal turn.
	# Reserve only while that turn can still happen before the objective deadline.
	var reserve_value := 0.0
	var ultimate: Dictionary = engine.get_action(actor,"ultimate")
	var basic_gain: int = engine.get_action(actor,"basic").get("energyGain",engine.rules.energy.basicGain)
	if state.round < goal.rounds and actor.energy < ultimate.cost and actor.energy + basic_gain >= ultimate.cost:
		var future: Dictionary = state.duplicate(true)
		engine.unit(future,actor.id).energy = ultimate.cost
		if engine.can_use(engine.current(future),"ultimate") and not engine.friendly(ultimate):
			for target in engine.legal_targets(future,engine.current(future),ultimate):
				var forecast: Dictionary = engine.preview(future,"ultimate",target.id).normal
				var value := 0.0
				for event in forecast.get("events",[]):
					if event.type == "damage" and event.target == goal.target: value += event.amount + event.absorbed * tactics.absorbedDamageWeight
				reserve_value = maxf(reserve_value,value * tactics.ultimateReserveWeight)
	var best := -INF
	for id in ["basic","skill","ultimate"]:
		if not engine.can_use(actor,id): continue
		var action: Dictionary = engine.get_action(actor,id)
		if engine.friendly(action): continue
		for target in engine.legal_targets(state,actor,action):
			var prediction: Dictionary = engine.preview(state,id,target.id).normal
			var score: float = -action.cost * tactics.energyCostWeight
			if id == "basic": score += reserve_value
			for event in prediction.get("events",[]):
				if event.type != "damage": continue
				score += (event.amount + event.absorbed * tactics.absorbedDamageWeight) * (tactics.targetDamageWeight if event.target == goal.target else tactics.collateralDamageWeight)
				if event.target == goal.target and event.hpAfter == 0: score += tactics.immediateVictoryBonus
			if score > best:
				best = score
				choice = {"actionId":id,"targetId":target.id}
	return choice
