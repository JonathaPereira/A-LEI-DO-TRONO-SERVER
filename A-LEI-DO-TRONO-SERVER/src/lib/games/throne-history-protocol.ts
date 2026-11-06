import type { ThroneLogEntry, ThroneResult, ThroneScore } from '../../types/throne-history';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';

const invalid = () => new Error('Crônica ou resultado de A Lei do Trono inválido.');
function integer(value: unknown, max: number, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw invalid();
  return value as number;
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
}
export function readThroneLog(value: unknown, id: number): ThroneLogEntry {
  if (!record(value)) throw invalid();
  return freezeGame({
    id,
    ts: integer(value.ts, Number.MAX_SAFE_INTEGER),
    round: integer(value.round, 3),
    trick: integer(value.trick, 10),
    message: text(value.message, 8000),
  });
}
function compare(a: ThroneScore, b: ThroneScore) {
  return (
    b.prestige - a.prestige || b.pairs - a.pairs || b.crowns - a.crowns || b.shadows - a.shadows
  );
}
export function readThroneResult(
  value: unknown,
  mode: 'online' | 'local',
  fallback: readonly ThroneLogEntry[] = [],
): ThroneResult {
  if (
    !record(value) ||
    !['round', 'final'].includes(String(value.kind)) ||
    !Array.isArray(value.scores) ||
    value.scores.length !== 4
  )
    throw invalid();
  const kind = value.kind as 'round' | 'final',
    round = integer(value.round, 3, 1);
  if (kind === 'final' && round !== 3) throw invalid();
  let scores = value.scores.map((raw) => {
    if (!record(raw)) throw invalid();
    const crowns = integer(raw.crowns, round * 10),
      shadows = integer(raw.shadows, round * 10),
      pairs = integer(raw.pairs, 30),
      prestige = integer(raw.prestige, 120);
    if (pairs !== Math.min(crowns, shadows) || prestige !== crowns + shadows + 2 * pairs)
      throw invalid();
    let roundScore: ThroneScore['roundScore'];
    if (mode === 'local' && kind === 'round') {
      const r = raw.roundScore;
      if (!record(r)) throw invalid();
      roundScore = {
        crowns: integer(r.crowns, 10),
        shadows: integer(r.shadows, 10),
        pairs: integer(r.pairs, 10),
        gained: integer(r.gained, 40),
      };
      if (
        roundScore.pairs !== Math.min(roundScore.crowns, roundScore.shadows) ||
        roundScore.crowns > crowns ||
        roundScore.shadows > shadows
      )
        throw invalid();
    }
    return {
      seat: integer(raw.seat, 3),
      name: text(raw.name, 100),
      crowns,
      shadows,
      pairs,
      prestige,
      ...(roundScore ? { roundScore } : {}),
    };
  });
  if (
    new Set(scores.map((p) => p.seat)).size !== 4 ||
    scores.reduce((n, p) => n + p.crowns, 0) !== round * 10 ||
    scores.reduce((n, p) => n + p.shadows, 0) !== round * 10
  )
    throw invalid();
  if (
    mode === 'local' &&
    kind === 'round' &&
    (scores.reduce((n, p) => n + p.roundScore!.crowns, 0) !== 10 ||
      scores.reduce((n, p) => n + p.roundScore!.shadows, 0) !== 10)
  )
    throw invalid();
  let winners: number[] = [];
  if (kind === 'final') {
    scores = [...scores].sort(compare);
    winners = scores.filter((p) => compare(p, scores[0]) === 0).map((p) => p.seat);
    if (
      mode === 'online' &&
      (!Array.isArray(value.winners) ||
        value.winners.length !== winners.length ||
        new Set(value.winners).size !== winners.length ||
        winners.some((id) => !(value.winners as unknown[]).includes(id)))
    )
      throw invalid();
  }
  const rawEntries = value.finalLog;
  if (rawEntries != null && (!Array.isArray(rawEntries) || rawEntries.length > 600))
    throw invalid();
  const entries =
    rawEntries == null
      ? [...fallback]
      : (rawEntries as unknown[]).map((e, i) => readThroneLog(e, i));
  return freezeGame({ kind, mode, round, scores, winners, entries });
}
