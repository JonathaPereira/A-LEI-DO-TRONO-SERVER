extends SceneTree
## Reproducible balance sample, not a claim about competitive win rates.
const Campaign = preload("res://scripts/campaign.gd")
const Combat = preload("res://scripts/combat.gd")
const TEAMS = [
	["axion","veyra","astra"],
	["rhazen","sylva","riven"],
	["oren","kira","saira"],
	["nima","riven","kira"],
]
const OFFSETS = [0,37,113]

func _initialize() -> void:
	var engine := Combat.new()
	var build := "basic"
	var gem_level := 0
	var mastery_points := 0
	var trained := false
	var include_lumi := false
	var teams: Array = TEAMS.duplicate(true)
	for arg in OS.get_cmdline_user_args():
		if arg == "--lumi": include_lumi = true
		if arg in ["assault","channel"]: build = arg
		if arg in ["--gems=1","--gems=2","--gems=3"]: gem_level = int(arg.right(1))
		if arg == "--mastery=3": mastery_points = int(Campaign.Progression.settings.masteryThresholds[-1])
		if arg == "--training":
			trained = true
			mastery_points = int(Campaign.Progression.settings.masteryThresholds[-1])
	if include_lumi: teams.append_array([["auren","solen","elyra"],["auren","zaya","veyra"],["solen","saira","axion"]])
	var rows: Array = []
	var errors := 0
	for team in teams:
		for offset in OFFSETS:
			var story := Campaign.new(engine.catalog,"user://matrix-unused-progress.json")
			story.team = team.duplicate()
			story.completed = Campaign.LEGACY_REWARDS.duplicate()
			for hero in team:
				if mastery_points > 0: story.mastery[hero] = mastery_points
				if trained: story.ability_choices[hero] = {"basic":"rhythm","skill":"burst","ultimate":"economy"}
			if build != "basic":
				for hero in team:
					story.gear[hero] = [{"variant":"standard" if build == "assault" else "channel","tier":3},{"variant":"standard" if build == "assault" else "bastion","tier":3},{"variant":"standard" if build == "assault" else "anchor","tier":3}]
			if gem_level > 0:
				if gem_level > 1:
					story.repeat_wins = {"gate":2 if gem_level == 2 else 12}
					for type in Campaign.GemForge.BASE_IDS:
						story.gem_crafts[type] = 1 if gem_level == 2 else 8
						story.gem_fusions[type] = 3 if gem_level == 2 else 9
						if gem_level == 3: story.gem_fusions[type+":2"] = 3
				for hero in team: story.equipped[hero] = Campaign.GemForge.BASE_IDS.map(func(type):return Campaign.GemForge.key(type,gem_level))
				var inventory_error := Campaign.GemForge.validate(story.gem_crafts,story.gem_fusions,story.equipped,story.completed,Campaign.Equipment.earned(story.completed,story.repeat_wins)-Campaign.Equipment.spent(story.gear),engine.catalog.heroes.map(func(h):return h.id))
				if inventory_error != "":
					push_error(inventory_error)
					quit(1)
					return
			for index in range(story.missions.size()):
				var mission: Dictionary = story.missions[index]
				if not mission.has("objective") and not mission.has("waves") and not mission.has("field"): continue
				mission.seed += offset
				var state: Dictionary = story.battle(engine,index)
				while state.phase == "playing" and state.turns < 400:
					var choice: Dictionary = story.choose_ai(engine,state)
					var result: Dictionary = story.act(engine,state,choice.actionId,choice.targetId)
					if result.has("error"):
						errors += 1
						break
				if state.phase != "finished": errors += 1
				rows.append({"mission":mission.id,"conditions":{"objective":mission.get("objective",{"type":"clear"}),"waves":mission.get("waves",[]),"field":mission.get("field",{}),"bossPhase":mission.get("bossPhase",{})},"seed":mission.seed,"team":team,"winner":state.winner,"result":state.get("missionResult",{}),"turns":state.turns,"units":state.units.map(func(u): return {"id":u.id,"hp":u.hp,"maxHp":u.maxHp,"damage":u.stats.damage,"healing":u.stats.healing,"shieldGranted":u.stats.shieldGranted})})
	var report := {"scope":"campaign objectives only; automatic policy", "rulesVersion":engine.rules.rulesVersion,"includesLumi":include_lumi, "build":build,"gemLevel":gem_level,"masteryPoints":mastery_points,"trained":trained,"abilityTraining":Campaign.AbilityTraining.settings,"progression":Campaign.Progression.settings,"gemForge":Campaign.GemForge.settings,"equipment":Campaign.Equipment.settings,"tactics":Campaign.new(engine.catalog,"user://matrix-unused-progress.json").tactics,"scenarios":rows,"errors":errors}
	var output := "user://objective-matrix-%s%s%s%s.json" % [build,"-gems-%d" % gem_level if gem_level > 0 else "","-mastery-3" if mastery_points > 0 else "","-trained" if trained else ""]
	if include_lumi: output = output.trim_suffix(".json")+"-lumi.json"
	var file := FileAccess.open(output,FileAccess.WRITE)
	if file == null:
		push_error("Matrix output could not be opened")
		quit(1)
		return
	file.store_string(JSON.stringify(report,"\t"))
	file.close()
	print("Objective matrix (%s): %d scenarios, %d victories, %d errors. %s" % [build,rows.size(),rows.filter(func(row):return row.winner == 0).size(),errors,ProjectSettings.globalize_path(output)])
	quit(1 if errors else 0)
