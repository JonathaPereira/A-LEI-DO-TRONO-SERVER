import { object } from './http-api.ts';
import {
  throneLaws,
  type ThroneDecree,
  type ThroneLaw,
  type ThroneSuit,
} from '../src/types/throne-choices.ts';
import { throneRules } from '../src/lib/games/throne-rules.ts';
import type { ThroneInfluenceAction } from '../src/types/throne-hand';

export interface ThronePlayInput {
  cardId: string;
  hidden?: boolean;
  influenceAction?: ThroneInfluenceAction;
  declaredSuit?: ThroneSuit | null;
}
export type ThroneCommand =
  | { action: 'choose-decree'; payload: { value: ThroneDecree } }
  | { action: 'choose-law'; payload: { value: ThroneLaw } }
  | { action: 'choose-trump'; payload: { value: ThroneSuit } }
  | { action: 'usurp-target'; payload: { targetSeat: number } }
  | { action: 'usurp-pick'; payload: { index: number } }
  | {
      action:
        | 'usurp-give'
        | 'challenge'
        | 'choose-reserva'
        | 'choose-corte'
        | 'choose-conselho'
        | 'rotation';
      payload: { cardId: string };
    }
  | { action: 'play-card'; payload: ThronePlayInput }
  | { action: 'usurp-ack' | 'intelligence-ack'; payload: Record<string, never> };
const SUITS: readonly string[] = ['cetro', 'chave', 'lamina', 'mascara'];
const DECREES: readonly string[] = throneRules.decrees.map((decree) => decree.id);
const isCardId = (value: unknown): value is string =>
  typeof value === 'string' && /^c(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(value);
const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** Project only known inputs. Phase, seat, legal card and influence remain engine decisions. */
export function readThroneCommand(value: unknown): ThroneCommand | null {
  if (!object(value) || value.type !== 'game-action') return null;
  const action = value.action;
  if (action === 'usurp-ack' || action === 'intelligence-ack') return { action, payload: {} };
  const payload = value.payload;
  if (!object(payload)) return null;
  if (action === 'choose-decree')
    return typeof payload.value === 'string' && DECREES.includes(payload.value)
      ? { action, payload: { value: payload.value as ThroneDecree } }
      : null;
  if (action === 'choose-law')
    return throneLaws.some((law) => law === payload.value)
      ? { action, payload: { value: payload.value as ThroneLaw } }
      : null;
  if (action === 'choose-trump')
    return typeof payload.value === 'string' && SUITS.includes(payload.value)
      ? { action, payload: { value: payload.value as ThroneSuit } }
      : null;
  if (action === 'usurp-target')
    return integer(payload.targetSeat, 3)
      ? { action, payload: { targetSeat: payload.targetSeat } }
      : null;
  if (action === 'usurp-pick')
    return integer(payload.index, 11) ? { action, payload: { index: payload.index } } : null;
  if (
    action === 'usurp-give' ||
    action === 'challenge' ||
    action === 'choose-reserva' ||
    action === 'choose-corte' ||
    action === 'choose-conselho' ||
    action === 'rotation'
  )
    return isCardId(payload.cardId) ? { action, payload: { cardId: payload.cardId } } : null;
  if (action !== 'play-card' || !isCardId(payload.cardId)) return null;
  if (payload.hidden !== undefined && typeof payload.hidden !== 'boolean') return null;
  if (
    payload.influenceAction !== undefined &&
    !['none', 'sigilo', 'plus', 'minus'].some((candidate) => candidate === payload.influenceAction)
  )
    return null;
  if (
    payload.declaredSuit !== undefined &&
    payload.declaredSuit !== null &&
    !SUITS.some((suit) => suit === payload.declaredSuit)
  )
    return null;
  return {
    action,
    payload: {
      cardId: payload.cardId,
      ...(payload.hidden === undefined ? {} : { hidden: payload.hidden }),
      ...(payload.influenceAction === undefined
        ? {}
        : { influenceAction: payload.influenceAction as ThroneInfluenceAction }),
      ...(payload.declaredSuit === undefined
        ? {}
        : { declaredSuit: payload.declaredSuit as ThroneSuit | null }),
    },
  };
}
