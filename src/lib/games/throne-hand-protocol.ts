import type { ThroneHandContext } from '../../types/throne-hand';
import { readThroneChoiceContext } from './throne-choice-protocol.ts';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';

export function readThroneHandContext(value: unknown, seat: number): ThroneHandContext {
  const context = readThroneChoiceContext(value, seat);
  if (!record(value)) throw new Error('Mão de A Lei do Trono inválida.');
  const invalid = () => new Error('Mão de A Lei do Trono inválida.');
  const own = (value.players as Record<string, unknown>[]).find((p) => p.id === seat)!;
  // The server briefly authorizes the reserved card before playing it automatically.
  const automaticReserve =
    record(value.decree) &&
    value.decree.id === 'reserva' &&
    context.trick === 10 &&
    !!context.reserve;
  const cards = [
    ...context.hand,
    ...(automaticReserve && context.reserve ? [context.reserve] : []),
  ];
  function position(v: unknown): number | null {
    if (v == null) return null;
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 3) throw invalid();
    return v as number;
  }
  function flag(v: unknown): boolean {
    if (typeof v !== 'boolean') throw invalid();
    return v;
  }
  function ids(v: unknown): string[] {
    if (!Array.isArray(v) || v.length > 10) throw invalid();
    if (new Set(v).size !== v.length) throw invalid();
    return v.map((id) => {
      if (typeof id !== 'string' || !cards.some((c) => c.id === id)) throw invalid();
      return id;
    });
  }
  const turn = position(value.turn),
    leader = position(value.leader);
  const legal = ids(value.legalCardIds),
    hiddenLegal = ids(value.influenceLegalCardIds);
  const canUseInfluence = flag(value.canUseInfluence),
    canUseManeuver = flag(value.canUseManeuver),
    influenceBlocked = flag(value.influenceBlocked);
  const influence = own.influence;
  if (!Number.isInteger(influence) || (influence as number) < 0 || (influence as number) > 2)
    throw invalid();
  if (!Array.isArray(value.plays) || value.plays.length > 4) throw invalid();
  const awaiting = context.phase === 'await-play' && turn === seat;
  if (
    (!awaiting && (legal.length || hiddenLegal.length || canUseInfluence || canUseManeuver)) ||
    hiddenLegal.some(
      (id) =>
        !legal.includes(id) || cards.find((c) => c.id === id)!.publicReason === 'Corte Aberta',
    ) ||
    (canUseInfluence && (influenceBlocked || (influence as number) < 1 || !hiddenLegal.length)) ||
    (canUseManeuver && (!canUseInfluence || influence !== 2))
  )
    throw invalid();
  const decreeName = record(value.decree) ? value.decree.name : null;
  if (decreeName != null && (typeof decreeName !== 'string' || decreeName.length > 100))
    throw invalid();
  return freezeGame({
    you: seat,
    round: context.round,
    trick: context.trick,
    phase: context.phase,
    turn,
    opening: awaiting && !value.plays.length && leader === seat,
    automaticReserve,
    hand: context.hand,
    reserve: context.reserve,
    influence: influence as number,
    legal,
    hiddenLegal,
    canUseInfluence,
    canUseManeuver,
    influenceBlocked,
    decreeName: (decreeName as string | null) || 'Decreto',
  });
}
