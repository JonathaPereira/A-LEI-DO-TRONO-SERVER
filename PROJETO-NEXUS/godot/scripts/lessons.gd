extends RefCounted
const TITLES = ["1 · Turnos, energia e defesa", "2 · Afinidades e combos", "3 · Escudos e dano contínuo"]
const TEAMS = [
	[["veyra", "sylva", "axion"], ["vesper", "oren", "kira"]],
	[["veyra", "cindra", "saira"], ["oren", "nima", "sylva"]],
	[["riven", "oren", "sylva"], ["vesper", "maura", "astra"]]
]
const GOALS = [["basic", "skill", "guard"], ["advantage", "combo"], ["shieldHit", "dot", "recovery"]]
const LABELS = {"basic": "Ataque", "skill": "Técnica", "guard": "Defesa", "advantage": "Vantagem", "combo": "Combo", "shieldHit": "Hit em escudo", "dot": "Dano contínuo", "recovery": "Cura/proteção"}

static func prepare(state: Dictionary, index: int) -> void:
	if index == 1:
		# The visible starting burn lets the first action teach the combo.
		state.units[3].statuses = [{"type": "burn", "turns": 2}]
	if index == 2:
		for unit in state.units: unit.shield = 150
		state.units[3].statuses = [{"type": "burn", "turns": 2}]

static func observe(progress: Dictionary, result: Dictionary, side: int) -> void:
	if side == 0:
		progress[result.actionId] = true
		for event in result.events:
			if event.get("advantage", 1) > 1: progress.advantage = true
			if event.has("combo"): progress.combo = true
			if event.get("absorbed", 0) > 0: progress.shieldHit = true
			if event.type in ["heal", "shield", "guard"]: progress.recovery = true
	for event in result.get("turnEvents", []):
		if event.type in ["burn", "bleed"]: progress.dot = true

static func complete(index: int, progress: Dictionary) -> bool:
	return GOALS[index].all(func(goal): return progress.get(goal, false))

static func hint(index: int, progress: Dictionary) -> String:
	var items: Array = []
	for goal in GOALS[index]: items.append(("✓ " if progress.get(goal, false) else "○ ") + LABELS[goal])
	var tip: String = ["Ataque dá 24 EN; defesa dá 25. Técnica custa 30.", "Oren começa queimando neste treino. A técnica de Veyra consome a queimadura: +40%. Cindra reaplica.", "Escudo absorve golpes. Queima e sangra atravessam; Sylva cura."][index]
	if complete(index, progress): tip = "Objetivos concluídos! Termine a batalha ou escolha outro treino em Aprender."
	return TITLES[index] + "\n" + " · ".join(items) + "\n" + tip
