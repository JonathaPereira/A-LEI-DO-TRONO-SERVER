extends AcceptDialog
## Two bounded, independent local datasets: played matches and deterministic AI samples.
const Combat = preload("res://scripts/combat.gd")
const SimulationLog = preload("res://scripts/simulation_log.gd")
const STORE := "user://balance-0.16.json"
var catalog
var source: OptionButton
var summary: Label
var table: Tree
var simulate: Button
var export_json: Button
var export_csv: Button
var export_note: Label
var export_dialog: FileDialog
var running := false
var rows: Array = []

static func read_records() -> Array:
	if not FileAccess.file_exists(STORE): return []
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(STORE))
	if not data is Dictionary or data.get("schema") != 1 or not data.get("matches") is Array: return []
	return data.matches.filter(func(m):
		return m is Dictionary and m.get("source") in ["played", "ai"] and m.get("rounds") is float and m.get("actions") is float and m.get("fracture") is bool and m.get("mode") is String and m.get("difficulty") is String and m.get("units") is Array and m.units.all(func(u):
			return u is Dictionary and u.get("heroId") is String and u.get("stats") is Dictionary and u.get("won") is bool and ["damage", "healing", "shieldDamage", "protected", "energyGiven", "combos"].all(func(k): return u.stats.get(k) is float)))

static func persist(records: Array) -> void:
	var file := FileAccess.open(STORE, FileAccess.WRITE)
	if file: file.store_string(JSON.stringify({"schema": 1, "matches": records.slice(maxi(0, records.size() - 500))}))

static func receipt(state: Dictionary, origin: String, mode: String, difficulty: String) -> Dictionary:
	return {"source": origin, "mode": mode, "difficulty": difficulty, "rounds": state.round, "actions": state.turns,
		"fracture": state.log.any(func(e): return e.type == "fracture"),
		"units": state.units.map(func(u): return {"heroId": u.heroId, "won": u.side == state.winner, "stats": u.stats.duplicate(true)})}

static func record(state: Dictionary, mode: String, difficulty: String) -> void:
	var data := read_records()
	data.append(receipt(state, "played", mode, difficulty))
	persist(data)

func _ready() -> void:
	title = "Laboratório de balanceamento · Alpha 0.15"
	ok_button_text = "Voltar"
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(1060, 530)
	add_child(column)
	var note := Label.new()
	note.text = "Amostras locais. Partidas jogadas incluem seu oponente IA; simulações são IA × IA, sem dados de jogadores.\nResultados dependem das equipes, dificuldade e decisões. Não representam equilíbrio competitivo."
	note.add_theme_font_size_override("font_size", 13)
	column.add_child(note)
	var toolbar := HBoxContainer.new()
	column.add_child(toolbar)
	source = OptionButton.new()
	for text in ["Partidas jogadas", "IA × IA · formações variadas", "IA × IA · testes de sustentação"]: source.add_item(text)
	source.item_selected.connect(func(_i): refresh())
	toolbar.add_child(source)
	simulate = Button.new()
	simulate.text = "Simular 216 partidas"
	simulate.pressed.connect(_simulate)
	toolbar.add_child(simulate)
	export_json = Button.new()
	export_json.text = "Exportar logs JSON"
	export_json.pressed.connect(_open_export.bind("json"))
	toolbar.add_child(export_json)
	export_csv = Button.new()
	export_csv.text = "Exportar tabela CSV"
	export_csv.pressed.connect(_open_export.bind("csv"))
	toolbar.add_child(export_csv)
	export_note = Label.new()
	export_note.add_theme_font_size_override("font_size", 12)
	export_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	export_note.custom_minimum_size = Vector2(1040, 32)
	column.add_child(export_note)
	summary = Label.new()
	summary.custom_minimum_size = Vector2(1040, 42)
	summary.clip_text = true
	column.add_child(summary)
	table = Tree.new()
	table.hide_root = true
	table.columns = 10
	table.column_titles_visible = true
	table.size_flags_vertical = Control.SIZE_EXPAND_FILL
	table.custom_minimum_size.y = 360
	var titles := ["Herói / função", "Classe", "N", "Vitórias", "Dano dir.", "Dano esc.", "Cura dir.", "Absorvido*", "Energia", "Combos"]
	for i in range(titles.size()):
		table.set_column_title(i, titles[i])
		table.set_column_custom_minimum_width(i, 160 if i == 0 else 130 if i == 3 else 80)
	column.add_child(table)
	var foot := Label.new()
	foot.text = "Dano e cura do kit, incluindo marcas; outros efeitos periódicos ficam fora dos totais. Valores por aparição, exceto N e vitória. *Escudo efetivamente consumido + dano desviado pelo protetor.\nAmostras separadas: 60 variadas + 96 testes de suporte/tanque + 60 com os cinco retornos. Pares espelhados, sementes fixas. Até 500 partidas locais."
	foot.add_theme_font_size_override("font_size", 12)
	column.add_child(foot)
	refresh()

static func aggregates(records: Array, heroes: Array) -> Array:
	var result: Array = []
	for hero in heroes:
		var samples: Array = []
		for row in records:
			for member in row.units:
				if member.heroId == hero.id: samples.append(member)
		var n := samples.size()
		var wins := 0
		var totals := {"damage": 0.0, "shieldDamage": 0.0, "healing": 0.0, "protected": 0.0, "energyGiven": 0.0, "combos": 0.0}
		for member in samples:
			if member.won: wins += 1
			for key in totals: totals[key] += member.stats.get(key, 0)
			totals.protected += member.stats.get("shieldAbsorbed", 0)
		for key in totals: totals[key] /= maxf(1, n)
		result.append({"heroId": hero.id, "name": hero.name, "classId": hero.classId, "role": hero.role,
			"appearances": n, "wins": wins, "winRatePct": wins * 100.0 / n if n else null, "averages": totals})
	return result

func _matches_filter(group: String) -> bool:
	return group == "simulation" if source.selected == 1 else group != "simulation"

func refresh() -> void:
	if not is_instance_valid(table): return
	rows = read_records().filter(func(m): return m.source == "played" if source.selected == 0 else (m.source == "ai" and _matches_filter(m.mode)))
	table.clear()
	var root := table.create_item()
	var rounds := 0.0
	var fractures := 0
	for row in rows:
		rounds += row.rounds
		if row.fracture: fractures += 1
	summary.text = "%d partidas · média %.1f rodadas · Fratura: %d (%.1f%%)\nVitórias por aparição na equipe. Considere N e adversários: os testes de sustentação são dirigidos." % [rows.size(), rounds / maxf(1, rows.size()), fractures, fractures * 100.0 / maxf(1, rows.size())]
	for row in aggregates(rows, catalog.heroes):
		var item := table.create_item(root)
		item.set_text(0, row.name + " · " + row.role)
		item.set_text(1, catalog.class_by_id[row.classId].name)
		item.set_text(2, str(row.appearances))
		item.set_text(3, "%d/%d (%.1f%%)" % [row.wins, row.appearances, row.winRatePct] if row.appearances else "—")
		if row.appearances > 0 and row.appearances < 30: item.set_custom_color(3, Color("e3c085"))
		var totals: Dictionary = row.averages
		var values: Array = [totals.damage, totals.shieldDamage, totals.healing, totals.protected, totals.energyGiven, totals.combos]
		for i in range(values.size()): item.set_text(i + 4, "%.1f" % values[i] if row.appearances else "—")
		var hero: Dictionary = catalog.hero_by_id[row.heroId]
		for i in range(10): item.set_tooltip_text(i, "%d vitórias em %d aparições. A taxa inclui a equipe e o adversário; não mede duelos individuais.\n%s\nSinergia: %s" % [row.wins, row.appearances, hero.identity, hero.synergy])
	var has_logs := FileAccess.file_exists(SimulationLog.STORE)
	export_json.disabled = running or source.selected == 0 or not has_logs
	export_csv.disabled = running or rows.is_empty()
	export_json.tooltip_text = "Escolha um dos filtros IA × IA para exportar as ações simuladas." if source.selected == 0 else "Exporta o filtro atual: resumo do histórico e ações completas do último lote simulado."
	export_note.text = "Simule para gerar logs completos. Históricos anteriores possuem apenas estatísticas." if not has_logs else "JSON: ações do último lote no filtro escolhido + resumo do histórico. CSV: tabela visível. Logs persistem ao fechar o jogo."
	if source.selected == 0: export_note.text = "Partidas jogadas têm resumo em CSV. Para logs completos, selecione um dos filtros IA × IA e simule."

func export_to(path: String, format_id: String) -> Error:
	if not format_id in ["json", "csv"]: return ERR_INVALID_PARAMETER
	var batch: Dictionary = {}
	if format_id == "json":
		batch = SimulationLog.read_batch()
		if batch.is_empty() or source.selected == 0: return ERR_UNAVAILABLE
	var file := FileAccess.open(path, FileAccess.WRITE)
	if not file: return FileAccess.get_open_error()
	if format_id == "csv":
		file.store_string("\ufeff")
		file.store_csv_line(PackedStringArray(["heroi", "classe", "funcao", "aparicoes", "vitorias", "vitoria_pct", "dano_vida", "dano_escudo", "cura", "protecao_efetiva", "energia", "combos"]), ";")
		for row in aggregates(rows, catalog.heroes):
			var values := PackedStringArray([row.name, catalog.class_by_id[row.classId].name, row.role, str(row.appearances), str(row.wins)])
			for value in [row.winRatePct, row.averages.damage, row.averages.shieldDamage, row.averages.healing, row.averages.protected, row.averages.energyGiven, row.averages.combos]:
				values.append(("%.3f" % value).replace(".", ",") if value != null else "")
			file.store_csv_line(values, ";")
	else:
		var matches: Array = batch.matches.filter(func(m): return _matches_filter(m.group))
		file.store_string(JSON.stringify({"schemaVersion": 1, "gameVersion": SimulationLog.GAME_VERSION, "rulesVersion": SimulationLog.RULES_VERSION,
			"exportedAtUTC": Time.get_datetime_string_from_system(true), "simulatedAtUTC": batch.get("generatedAtUTC", ""),
			"filter": source.get_item_text(source.selected), "detailScope": "Full actions: latest simulation batch only. Historical summaries: current filter.",
			"summaryMatches": rows.size(), "fullLogMatches": matches.size(), "heroSummary": aggregates(rows, catalog.heroes),
			"historicalSummaries": rows, "matches": matches}, "\t"))
	return file.get_error()

func _open_export(format_id: String) -> void:
	export_dialog = FileDialog.new()
	export_dialog.title = "Salvar logs das simulações" if format_id == "json" else "Salvar tabela de balanceamento"
	export_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	export_dialog.access = FileDialog.ACCESS_FILESYSTEM
	export_dialog.filters = PackedStringArray(["*.%s ; %s" % [format_id, "Logs JSON" if format_id == "json" else "Tabela CSV"]])
	export_dialog.use_native_dialog = DisplayServer.get_name() != "headless"
	export_dialog.current_file = "nexus-simulacoes-%s.%s" % [Time.get_datetime_string_from_system().replace(":", "-"), format_id]
	var downloads := OS.get_system_dir(OS.SYSTEM_DIR_DOWNLOADS)
	if DirAccess.dir_exists_absolute(downloads): export_dialog.current_dir = downloads
	add_child(export_dialog)
	export_dialog.file_selected.connect(func(path):
		var error := export_to(path, format_id)
		export_note.text = "Arquivo salvo: " + path if error == OK else "Não foi possível salvar: " + error_string(error)
		export_note.tooltip_text = export_note.text
		export_dialog.queue_free())
	export_dialog.canceled.connect(func(): export_dialog.queue_free())
	export_dialog.popup_centered(Vector2i(900, 580))

func _sample_teams(pair: int) -> Array:
	var teams: Array = [[], []]
	var roles := ["Tanque", "Suporte", "Dano"]
	var affinities: int = catalog.classes.size()
	for side in range(2):
		for role in range(3):
			var group: int = pair / affinities
			var base: int = pair % affinities
			var offsets: Array = [side * 2, group + side, group * 2 + side * 3]
			var class_index: int = (base + side) % affinities if pair < affinities else (base + offsets[role]) % affinities
			var affinity: String = catalog.classes[class_index].id
			teams[side].append(catalog.heroes.filter(func(h): return h.classId == affinity and h.role == roles[role])[0].id)
	return teams

func _samples() -> Array:
	var samples: Array = []
	for pair in range(catalog.classes.size() * 6):
		var teams := _sample_teams(pair)
		for swap in range(2): samples.append({"teams": [teams[swap], teams[1 - swap]], "seed": 73 + pair * 113, "group": "simulation"})
	var healers := ["saira", "maura", "sylva"]
	for index in range(2):
		var team: Array = ["vesper", "kira", "oren"] if index == 0 else healers
		for pair in range(15):
			var foe: Array = _sample_teams(pair)[0]
			for swap in range(2): samples.append({"teams": [team, foe] if swap == 0 else [foe, team], "seed": (137 + pair * 139) if index == 0 else (229 + pair * 173), "group": "stress-shields" if index == 0 else "stress-healers"})
	for role in ["Suporte", "Tanque", "Dano"]:
		var ids: Array = catalog.heroes.filter(func(h): return h.role == role).map(func(h): return h.id)
		for pair in range(catalog.classes.size()):
			var foe: Array = [0, 1, 3].map(func(i): return ids[(pair + i) % ids.size()])
			var team: Array = ["vesper", "oren", "elun"] if role == "Tanque" else healers
			for swap in range(2): samples.append({"teams": [team, foe] if swap == 0 else [foe, team], "seed": 331 + pair * 181, "group": "stress-" + role})
	for seed_value in range(1, 7): samples.append({"teams": [healers, healers], "seed": seed_value * 197, "group": "stress-healing-only", "defensive": true})
	# Each returning hero is exercised in six mixed trios, with identical seeds on both sides.
	var returned := ["torv", "brin", "bast", "ivo", "noct", "auren", "elyra", "solen", "zaya"]
	var partners := [["sylva", "axion"], ["kira", "vesper"], ["astra", "oren"], ["maura", "rhazen"], ["vektor", "nima"], ["saira", "riven"]]
	for index in range(returned.size()):
		for pair in range(partners.size()):
			var team: Array = [returned[index], partners[pair][0], partners[pair][1]]
			var foe: Array = _sample_teams(index * 6 + pair)[0]
			for swap in range(2): samples.append({"teams": [team, foe] if swap == 0 else [foe, team], "seed": 911 + index * 199 + pair * 131, "group": "return-" + returned[index]})
	return samples

func _simulate() -> void:
	if running: return
	running = true
	simulate.disabled = true
	var engine = Combat.new()
	var data: Array = []
	var samples := _samples()
	export_json.disabled = true
	export_csv.disabled = true
	var batch := {"schemaVersion": 1, "gameVersion": SimulationLog.GAME_VERSION, "rulesVersion": SimulationLog.RULES_VERSION,
		"generatedAtUTC": Time.get_datetime_string_from_system(true), "matches": []}
	for index in range(samples.size()):
		var sample: Dictionary = samples[index]
		var result := SimulationLog.simulate(engine, sample)
		var state: Dictionary = result.state
		batch.matches.append(result.trace)
		if state.phase == "finished":
			var record := receipt(state, "ai", sample.group, "normal")
			record.merge({"teams": sample.teams.duplicate(true), "seed": sample.seed, "winner": state.winner})
			data.append(record)
		simulate.text = "Simulando %d / %d" % [index + 1, samples.size()]
		await get_tree().process_frame
	var log_error := SimulationLog.save_batch(batch)
	# A live battle may finish while the simulation yields frames. Preserve it.
	persist(read_records() + data)
	source.select(1)
	simulate.text = "Simular 216 partidas"
	simulate.disabled = false
	running = false
	refresh()
	if log_error != OK: export_note.text = "Estatísticas geradas; falha ao salvar logs: " + error_string(log_error)
