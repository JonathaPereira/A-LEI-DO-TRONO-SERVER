import { throneLaws } from '../../types/throne-choices.ts';
import type {
  ThroneCard,
  ThroneChoiceContext,
  ThronePrompt,
  ThroneSuit,
  ThroneLaw,
  ThroneDecree,
  ThroneCardChoice,
} from '../../types/throne-choices';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';

export const throneSuits: readonly ThroneSuit[] = ['cetro', 'chave', 'lamina', 'mascara'];
export { throneLaws } from '../../types/throne-choices.ts';
export const throneDecrees: readonly ThroneDecree[] = [
  'reserva',
  'rotacao',
  'corte',
  'desafio',
  'silencio',
  'sucessao',
  'conselho',
  'favor',
  'espionagem',
  'peso',
];
const cardChoices: readonly ThroneCardChoice[] = [
  'choose-reserva',
  'choose-corte',
  'choose-conselho',
  'rotation',
  'challenge',
  'usurp-give',
];
export const thronePhases = [
  'starting',
  'round-start',
  'choose-decree',
  'choose-reserva',
  'choose-corte',
  'choose-conselho',
  'private-intelligence',
  'trick-start',
  'choose-trump',
  'usurp-target',
  'usurp-give',
  'usurp-pick',
  'usurp-reveal',
  'await-play',
  'resolve',
  'trick-result',
  'challenge',
  'rotation',
  'choose-law',
  'round-end',
  'game-over',
];
const invalid = () => new Error('Escolhas de A Lei do Trono inválidas.');
function object(value: unknown): Record<string, unknown> {
  if (!record(value)) throw invalid();
  return value;
}
function integer(value: unknown, min: number, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw invalid();
  return value as number;
}
function text(value: unknown, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
}
function array<T>(value: unknown, read: (v: unknown) => T, min: number, max: number): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid();
  return value.map(read);
}
function unique<T>(items: T[]): T[] {
  if (new Set(items).size !== items.length) throw invalid();
  return items;
}
function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw invalid();
  return value as T;
}
function cardId(value: unknown) {
  const id = text(value, 3);
  if (!/^c(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(id)) throw invalid();
  return id;
}
export function readThroneCard(value: unknown): ThroneCard {
  const raw = object(value),
    suit = member(raw.suit, throneSuits),
    rank = integer(raw.value, 1, 12),
    id = cardId(raw.id);
  if (id !== `c${throneSuits.indexOf(suit) * 12 + rank - 1}` || typeof raw.public !== 'boolean')
    throw invalid();
  return {
    id,
    suit,
    value: rank,
    public: raw.public,
    publicReason: raw.publicReason == null ? null : text(raw.publicReason, 80),
  };
}
export function readThroneChoiceContext(value: unknown, seat: number): ThroneChoiceContext {
  const raw = object(value),
    you = integer(raw.youSeat, 0, 3);
  if (you !== seat) throw invalid();
  const players = array(
    raw.players,
    (value) => {
      const p = object(value);
      const seat = integer(p.id, 0, 3);
      if (p.seat !== seat) throw invalid();
      return { seat, name: text(p.name) };
    },
    4,
    4,
  );
  unique(players.map((p) => p.seat));
  const own = object((raw.players as unknown[]).find((value) => object(value).id === you));
  return readContext(raw, own, players, you);
}
/** Local engine projection: public seats plus the human's own cards, never opponent hands. */
export function readThroneLocalChoiceContext(value: unknown): ThroneChoiceContext {
  const raw = object(value);
  if (raw.you !== 0) throw invalid();
  const players = array(
    raw.players,
    (value) => {
      const p = object(value);
      return { seat: integer(p.seat, 0, 3), name: text(p.name) };
    },
    4,
    4,
  );
  unique(players.map((p) => p.seat));
  return readContext(raw, raw, players, 0);
}
function readContext(
  raw: Record<string, unknown>,
  own: Record<string, unknown>,
  players: { seat: number; name: string }[],
  you: number,
): ThroneChoiceContext {
  const hand = array(own.hand, readThroneCard, 0, 10),
    reserve = own.reserve == null ? null : readThroneCard(own.reserve);
  unique([...hand.map((c) => c.id), ...(reserve ? [reserve.id] : [])]);
  if (own !== raw && own.handCount !== hand.length) throw invalid();
  const usage = object(raw.lawUsage),
    lawUsage = Object.fromEntries(
      throneLaws.map((law) => [law, integer(usage[law], 0, 2)]),
    ) as Record<ThroneLaw, number>;
  return freezeGame({
    you,
    round: integer(raw.round, 1, 3),
    trick: integer(raw.trick, 1, 10),
    phase: member(raw.phase, thronePhases),
    lastCrown: raw.lastCrown == null ? null : integer(raw.lastCrown, 0, 3),
    lastShadow: raw.lastShadow == null ? null : integer(raw.lastShadow, 0, 3),
    name: players.find((p) => p.seat === you)!.name,
    hand,
    reserve,
    players,
    lawUsage,
  });
}
export function readThronePrompt(value: unknown): ThronePrompt {
  const raw = object(value),
    id = text(raw.id, 10);
  if (!/^p[1-9][0-9]{0,8}$/.test(id)) throw invalid();
  const common = { id, number: Number(id.slice(1)) };
  switch (raw.kind) {
    case 'choose-decree':
      return freezeGame({
        ...common,
        kind: raw.kind,
        options: unique(array(raw.options, (v) => member(v, throneDecrees), 1, 10)),
      });
    case 'choose-trump':
      return freezeGame({
        ...common,
        kind: raw.kind,
        options: unique(array(raw.options, (v) => member(v, throneSuits), 1, 4)),
      });
    case 'choose-law':
      return freezeGame({
        ...common,
        kind: raw.kind,
        options: unique(array(raw.options, (v) => member(v, throneLaws), 1, 5)),
      });
    case 'usurp-target': {
      const options = array(
        raw.options,
        (v) => {
          const p = object(v);
          return { seat: integer(p.seat, 0, 3), name: text(p.name) };
        },
        1,
        3,
      );
      unique(options.map((p) => p.seat));
      return freezeGame({ ...common, kind: raw.kind, options });
    }
    case 'usurp-pick':
      return freezeGame({
        ...common,
        kind: raw.kind,
        count: integer(raw.count, 1, 10),
        otherName: raw.otherName == null ? 'A Casa escolhida' : text(raw.otherName),
      });
    default:
      return freezeGame({
        ...common,
        kind: member(raw.kind, cardChoices),
        cardIds: unique(array(raw.cardIds, cardId, 1, 10)),
        otherName: raw.otherName == null ? 'a Casa escolhida' : text(raw.otherName),
      });
  }
}
