import type { ThroneHandContext, ThroneHandOrigin } from '../../types/throne-hand';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import { readThroneCard, thronePhases } from './throne-choice-protocol.ts';

const invalid = () => new Error('Mão local de A Lei do Trono inválida.');
export function readThroneLocalHand(value: unknown, demo: boolean): ThroneHandContext {
  if (!record(value) || typeof demo !== 'boolean' || value.you !== 0) throw invalid();
  const integer = (v: unknown, min: number, max: number) => {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw invalid();
    return v as number;
  };
  const flag = (v: unknown) => {
    if (typeof v !== 'boolean') throw invalid();
    return v;
  };
  const turn = value.turn == null ? null : integer(value.turn, 0, 3);
  if (typeof value.phase !== 'string' || !thronePhases.includes(value.phase)) throw invalid();
  if (!Array.isArray(value.hand) || value.hand.length > 10) throw invalid();
  const hand = value.hand.map(readThroneCard),
    reserve = value.reserve == null ? null : readThroneCard(value.reserve);
  const all = [...hand, ...(reserve ? [reserve] : [])];
  if (new Set(all.map((c) => c.id)).size !== all.length) throw invalid();
  const ids = (v: unknown) => {
    if (!Array.isArray(v) || v.length > 10 || new Set(v).size !== v.length) throw invalid();
    return v.map((id) => {
      if (typeof id !== 'string' || !hand.some((c) => c.id === id)) throw invalid();
      return id;
    });
  };
  const legal = ids(value.legal),
    hiddenLegal = ids(value.hiddenLegal),
    influence = integer(value.influence, 0, 2);
  const opening = flag(value.opening),
    automaticReserve = flag(value.automaticReserve),
    canUseInfluence = flag(value.canUseInfluence),
    canUseManeuver = flag(value.canUseManeuver),
    influenceBlocked = flag(value.influenceBlocked);
  const awaiting = value.phase === 'await-play' && turn === 0;
  if (
    (!awaiting &&
      (legal.length || hiddenLegal.length || canUseInfluence || canUseManeuver || opening)) ||
    (automaticReserve &&
      (legal.length || hiddenLegal.length || canUseInfluence || canUseManeuver || opening)) ||
    hiddenLegal.some(
      (id) => !legal.includes(id) || hand.find((c) => c.id === id)!.publicReason === 'Corte Aberta',
    ) ||
    (canUseInfluence && (influenceBlocked || influence < 1 || !hiddenLegal.length)) ||
    (canUseManeuver && (!canUseInfluence || influence !== 2)) ||
    (demo &&
      (all.length ||
        legal.length ||
        hiddenLegal.length ||
        influence ||
        canUseInfluence ||
        canUseManeuver))
  )
    throw invalid();
  if (
    typeof value.decreeName !== 'string' ||
    !value.decreeName.trim() ||
    value.decreeName.length > 100
  )
    throw invalid();
  return freezeGame({
    you: 0,
    round: integer(value.round, 1, 3),
    trick: integer(value.trick, 1, 10),
    phase: value.phase,
    turn,
    hand,
    reserve,
    influence,
    legal,
    hiddenLegal,
    opening,
    automaticReserve,
    canUseInfluence,
    canUseManeuver,
    influenceBlocked,
    decreeName: value.decreeName,
  });
}
export function readThroneHandOrigin(value: unknown): ThroneHandOrigin | null {
  if (value == null) return null;
  if (!record(value)) throw invalid();
  const result = { left: value.left, top: value.top, width: value.width, height: value.height };
  for (const v of Object.values(result))
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 100000) throw invalid();
  if ((result.width as number) <= 0 || (result.height as number) <= 0) throw invalid();
  return freezeGame(result as ThroneHandOrigin);
}
