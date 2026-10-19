import type { ThroneLaw, ThroneSuit } from '../../types/throne-choices';
import type { ThroneMatchState } from '../../types/throne-match';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import {
  readThroneCard,
  throneDecrees,
  throneLaws,
  thronePhases,
  throneSuits,
} from './throne-choice-protocol.ts';

const invalid = () => new Error('Mesa de A Lei do Trono inválida.');
function object(value: unknown) {
  if (!record(value)) throw invalid();
  return value;
}
function integer(value: unknown, max: number, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw invalid();
  return value as number;
}
function flag(value: unknown) {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}
function name(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw invalid();
  return value;
}
function member<T extends string>(value: unknown, list: readonly T[]): T {
  if (typeof value !== 'string' || !list.includes(value as T)) throw invalid();
  return value as T;
}
function position(value: unknown) {
  return value == null ? null : integer(value, 3);
}
function suit(value: unknown): ThroneSuit | null {
  return value == null ? null : member(value, throneSuits);
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw invalid();
  return value;
}
function unique(values: readonly unknown[]) {
  if (new Set(values).size !== values.length) throw invalid();
}

export function readThroneMatch(value: unknown, seat: number): ThroneMatchState {
  const raw = object(value),
    you = integer(raw.youSeat, 3);
  if (seat !== you) throw invalid();
  const players = array(raw.players, 4)
    .map((value) => {
      const p = object(value),
        id = integer(p.id, 3);
      if (p.seat !== id) throw invalid();
      const handCount = integer(p.handCount, 10);
      const publicCards = array(p.publicCards, handCount).map((v) => {
        const card = readThroneCard(v);
        if (!card.public) throw invalid();
        return card;
      });
      unique(publicCards.map((c) => c.id));
      return {
        id,
        name: name(p.name),
        ai: flag(p.ai),
        handCount,
        reservePresent: flag(p.reservePresent),
        publicCards,
        totalCrowns: integer(p.totalCrowns, 30),
        totalShadows: integer(p.totalShadows, 30),
        roundCrowns: integer(p.roundCrowns, 10),
        roundShadows: integer(p.roundShadows, 10),
        influence: integer(p.influence, 2),
        prestige: integer(p.prestige, 120),
        pairs: integer(p.pairs, 30),
      };
    })
    .sort((a, b) => a.id - b.id);
  if (players.length !== 4) throw invalid();
  unique(players.map((p) => p.id));
  unique(players.flatMap((p) => p.publicCards.map((c) => c.id)));
  const plays = array(raw.plays, 4).map((value, index) => {
    const p = object(value),
      playerId = integer(p.playerId, 3),
      hidden = flag(p.hidden);
    if (
      p.order !== index ||
      (!hidden && p.card == null) ||
      (hidden && playerId !== you && p.card != null)
    )
      throw invalid();
    const modifier = integer(p.modifier, 3, -3);
    if (![-3, 0, 3].includes(modifier)) throw invalid();
    const influenceAction = member(p.influenceAction, ['none', 'sigilo', 'plus', 'minus'] as const);
    if (modifier !== (influenceAction === 'plus' ? 3 : influenceAction === 'minus' ? -3 : 0))
      throw invalid();
    return {
      playerId,
      hidden,
      order: index,
      modifier,
      influenceAction,
      card: p.card == null ? null : readThroneCard(p.card),
    };
  });
  unique(plays.map((p) => p.playerId));
  unique(plays.flatMap((p) => (p.card ? [p.card.id] : [])));
  const usage = object(raw.lawUsage),
    lawUsage = Object.fromEntries(throneLaws.map((law) => [law, integer(usage[law], 2)])) as Record<
      ThroneLaw,
      number
    >;
  return freezeGame({
    online: true,
    localPlayerId: you,
    players,
    plays,
    round: integer(raw.round, 3, 1),
    trick: integer(raw.trick, 10, 1),
    phase: member(raw.phase, thronePhases),
    currentLaw: member(raw.currentLaw, throneLaws),
    lawUsage,
    trump: suit(raw.trump),
    declaredLeadSuit: suit(raw.declaredLeadSuit),
    decree: raw.decree == null ? null : member(object(raw.decree).id, throneDecrees),
    lastCrown: position(raw.lastCrown),
    lastShadow: position(raw.lastShadow),
    previousWinningSuit: suit(raw.previousWinningSuit),
    leader: position(raw.leader),
    turn: position(raw.turn),
    turnDeadline:
      raw.turnDeadline == null ? null : integer(raw.turnDeadline, Number.MAX_SAFE_INTEGER, 1),
  });
}
