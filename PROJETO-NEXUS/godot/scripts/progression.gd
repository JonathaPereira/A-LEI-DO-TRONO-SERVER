extends RefCounted
## Shared training follows earned victories. Personal mastery follows actual
## participation, never last hits or the currently selected roster at payout.
static var settings: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/progression.json"))

static func victories(completed: Dictionary, replays: Dictionary) -> int:
	var count := completed.size()
	for repeat in replays.values(): count += int(repeat)
	return count

static func experience(completed: Dictionary, replays: Dictionary) -> int:
	var repeats := victories(completed,replays)-completed.size()
	return completed.size()*int(settings.firstClearExperience)+repeats*int(settings.replayExperience)

static func level(xp: int) -> int:
	var result := 1
	for index in range(1,settings.teamThresholds.size()):
		if xp >= settings.teamThresholds[index]: result = index+1
	return result

static func rank(points: int) -> int:
	var result := 0
	for index in range(1,settings.masteryThresholds.size()):
		if points >= settings.masteryThresholds[index]: result = index
	return result

static func bonuses(team_level: int, role: String, points: int) -> Dictionary:
	var values := {"attack":0.0,"health":0.0,"defense":0.0,"energy":0}
	for stat in settings.growthPerLevel: values[stat] += settings.growthPerLevel[stat]*(team_level-1)
	for stat in settings.masteryBonusesPerRank.get(role,{}): values[stat] += settings.masteryBonusesPerRank[role][stat]*rank(points)
	return values

static func validate(mastery: Variant, completed: Dictionary, replays: Dictionary, active_ids: Array) -> String:
	if not mastery is Dictionary or mastery.size() > active_ids.size(): return "Registros de maestria inválidos."
	var total := 0
	var earned_wins := victories(completed,replays)
	for hero in mastery:
		var points: Variant = mastery[hero]
		if not hero is String or hero not in active_ids: return "Herói desconhecido nos registros de maestria."
		if not (points is int or points is float) or not is_finite(float(points)) or points < 0 or points > settings.masteryThresholds[-1] or points != floor(float(points)) or int(points)%int(settings.masteryPerVictory) != 0: return "Pontuação de maestria inválida."
		if points > earned_wins*int(settings.masteryPerVictory): return "A maestria individual supera as vitórias conquistadas."
		total += int(points)
	if total > earned_wins*3*int(settings.masteryPerVictory): return "A maestria supera as participações conquistadas."
	return ""
