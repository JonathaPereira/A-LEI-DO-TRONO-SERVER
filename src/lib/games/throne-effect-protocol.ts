import type { ThroneSuit } from '../../types/throne-choices';
import { record } from '../files/protocol.ts';
import { readThroneCard, throneSuits } from './throne-choice-protocol.ts';

const invalid = () => new Error('Efeito público de A Lei do Trono inválido.');
export function effectObject(value: unknown) {
  if (!record(value)) throw invalid();
  return value;
}
export function effectText(value: unknown, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
}
export function effectSeat(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3) throw invalid();
  return value as number;
}
function amount(value: unknown, max: number) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) throw invalid();
  return value as number;
}
export function effectPlayer(value: unknown) {
  const p = effectObject(value);
  return { id: effectSeat(p.id), name: effectText(p.name) };
}
export function effectPlayers(value: unknown) {
  if (!Array.isArray(value) || value.length !== 4) throw invalid();
  const players = value.map(effectPlayer).sort((a, b) => a.id - b.id);
  if (new Set(players.map((p) => p.id)).size !== 4) throw invalid();
  return players;
}
export function effectGains(value: unknown) {
  if (!Array.isArray(value) || value.length > 4) throw invalid();
  const gains = value.map((v) => {
    const g = effectObject(v);
    return { player: effectPlayer(g.player), after: amount(g.after, 2) };
  });
  if (new Set(gains.map((g) => g.player.id)).size !== gains.length || gains.some((g) => !g.after))
    throw invalid();
  return gains;
}
export function effectOutcome(value: unknown) {
  const v = effectObject(value),
    crown = effectPlayer(v.crown),
    shadow = effectPlayer(v.shadow);
  if (crown.id === shadow.id) throw invalid();
  return { crown, shadow };
}
export function effectResult(value: unknown) {
  const v = effectObject(value),
    players = effectPlayers(v.players),
    crown = players[effectSeat(v.crownId)],
    shadow = players[effectSeat(v.shadowId)];
  if (crown.id === shadow.id || !Array.isArray(v.influenceGains) || v.influenceGains.length > 2)
    throw invalid();
  const gains = effectGains(
    v.influenceGains.map((raw) => {
      const g = effectObject(raw),
        seat = effectSeat(g.seat);
      if (seat === crown.id || seat === shadow.id) throw invalid();
      return { player: players[seat], after: g.after };
    }),
  );
  return { crown, shadow, gains };
}
export function effectInfluence(value: unknown) {
  const v = effectObject(value),
    action = v.action;
  if (typeof action !== 'string' || !['sigilo', 'plus', 'minus'].includes(action)) throw invalid();
  const cost = action === 'sigilo' ? 1 : 2,
    modifier = action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
  if ((v.cost != null && v.cost !== cost) || (v.modifier != null && v.modifier !== modifier))
    throw invalid();
  const declaredSuit = v.declaredSuit == null ? null : effectText(v.declaredSuit);
  if (declaredSuit !== null && !throneSuits.includes(declaredSuit as ThroneSuit)) throw invalid();
  return {
    name: effectText(v.name),
    action: action as 'sigilo' | 'plus' | 'minus',
    cost,
    modifier,
    declaredSuit: declaredSuit as ThroneSuit | null,
  };
}
export function effectExchange(value: unknown) {
  const v = effectObject(value),
    kind = effectText(v.kind);
  if (
    !['exchange', 'conselho', 'rotation', 'usurpacao'].includes(kind) ||
    !Array.isArray(v.moves) ||
    !v.moves.length ||
    v.moves.length > 4
  )
    throw invalid();
  const players = effectPlayers(v.players),
    moves = v.moves.map((raw) => {
      const m = effectObject(raw),
        from = effectSeat(m.from),
        to = effectSeat(m.to);
      if (
        from === to ||
        (m.role != null && (typeof m.role !== 'string' || !['shadow', 'crown'].includes(m.role)))
      )
        throw invalid();
      return {
        from,
        to,
        role: m.role === 'shadow' ? 'shadow' : '',
        label:
          m.label == null
            ? `${players[from].name} → ${players[to].name}`
            : effectText(m.label, 300),
        delay: m.delay == null ? 0 : amount(m.delay, 1000),
      };
    });
  if (
    new Set(moves.map((m) => m.from)).size !== moves.length ||
    new Set(moves.map((m) => m.to)).size !== moves.length
  )
    throw invalid();
  return {
    kind,
    players,
    moves,
    title: effectText(v.title, 200),
    subtitle: v.subtitle ? effectText(v.subtitle, 500) : 'Cartas ocultas estão mudando de mãos.',
    crown: v.crown == null ? null : effectSeat(v.crown),
    shadow: v.shadow == null ? null : effectSeat(v.shadow),
  };
}
export function effectChallenge(value: unknown) {
  const v = effectObject(value),
    card = readThroneCard(v.card);
  if (!card.public || card.publicReason !== 'Desafio') throw invalid();
  return { seat: effectSeat(v.seat), card };
}
export function effectCardArrival(value: unknown) {
  const v = effectObject(value),
    seat = effectSeat(v.seat);
  if (v.from == null) return { seat, from: null, card: null };
  const r = effectObject(v.from);
  for (const key of ['left', 'top', 'width', 'height'])
    if (
      typeof r[key] !== 'number' ||
      !Number.isFinite(r[key]) ||
      Math.abs(r[key] as number) > 100000
    )
      throw invalid();
  if ((r.width as number) <= 0 || (r.height as number) <= 0) throw invalid();
  return {
    seat,
    from: {
      left: r.left as number,
      top: r.top as number,
      width: r.width as number,
      height: r.height as number,
    },
    card: readThroneCard(v.card),
  };
}
