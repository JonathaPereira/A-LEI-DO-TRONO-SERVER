import type { LoveLetterRoom, LoveLetterOpenRoom, LoveLetterMove } from '../src/types/love-letter';
import { object } from './http-api.ts';

export const loveLetterFailure = (code: string, message: string) =>
  Object.assign(Error(message), { code: 'LOVE_LETTER_' + code });
export type LoveLetterCommand = { requestId?: string } & (
  | { action: 'list' | 'state' | 'leave' | 'next-round' }
  | { action: 'create'; maxPlayers: number }
  | { action: 'join' | 'resume'; roomId: string }
  | { action: 'start'; fillBots: boolean }
  | { action: 'move'; revision: number; move: unknown }
);
export type LoveLetterServerEvent =
  | { type: 'love-letter-state'; room: LoveLetterRoom }
  | { type: 'love-letter-rooms'; rooms: LoveLetterOpenRoom[]; resumeId: string | null }
  | { type: 'love-letter-left'; reason?: string }
  | { type: 'love-letter-error'; requestId?: string; code: string; message: string };
export const requestId = (value: unknown): string | undefined =>
  object(value) &&
  typeof value.requestId === 'string' &&
  value.requestId.length > 0 &&
  value.requestId.length <= 128
    ? value.requestId
    : undefined;
/** Structure is checked here; the authoritative rules validate moves after the revision check. */
export function readLoveLetterCommand(value: unknown): LoveLetterCommand {
  const invalid = () => loveLetterFailure('ACTION', 'Opção inválida.');
  if (!object(value) || (value.requestId !== undefined && requestId(value) === undefined))
    throw invalid();
  const id = requestId(value);
  switch (value.action) {
    case 'list':
    case 'state':
    case 'leave':
    case 'next-round':
      return { action: value.action, requestId: id };
    case 'create':
      if (
        typeof value.maxPlayers !== 'number' ||
        !Number.isInteger(value.maxPlayers) ||
        value.maxPlayers < 2 ||
        value.maxPlayers > 6
      )
        throw loveLetterFailure('PLAYERS', 'Escolha de 2 a 6 participantes.');
      return { action: 'create', maxPlayers: value.maxPlayers, requestId: id };
    case 'join':
    case 'resume':
      if (typeof value.roomId !== 'string' || !/^[0-9A-F]{10}$/.test(value.roomId))
        throw loveLetterFailure('NOT_FOUND', 'Esta mesa não está mais disponível.');
      return { action: value.action, roomId: value.roomId, requestId: id };
    case 'start':
      if (value.fillBots !== undefined && typeof value.fillBots !== 'boolean') throw invalid();
      return { action: 'start', fillBots: value.fillBots === true, requestId: id };
    case 'move':
      if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision))
        throw loveLetterFailure('STALE', 'A mesa mudou. Confira sua jogada.');
      return { action: 'move', revision: value.revision, move: value.move, requestId: id };
    default:
      throw invalid();
  }
}

/** Bounds/shape belong to the socket boundary; legal cards, targets and turns belong to Rules.move. */
export function readLoveLetterMove(value: unknown): LoveLetterMove {
  const invalid = () => loveLetterFailure('INVALID_MOVE', 'Jogada inválida.');
  const identifier = (field: unknown): field is string =>
    typeof field === 'string' &&
    field.length > 0 &&
    field.length <= 128 &&
    !/[\x00-\x1f\x7f]/.test(field);
  if (!object(value)) throw invalid();
  if (value.kind === 'play') {
    if (
      !identifier(value.cardId) ||
      (value.targetId !== undefined && !identifier(value.targetId)) ||
      (value.guess !== undefined &&
        (typeof value.guess !== 'number' ||
          !Number.isInteger(value.guess) ||
          value.guess < 0 ||
          value.guess > 9))
    )
      throw invalid();
    return {
      kind: 'play',
      cardId: value.cardId,
      ...(typeof value.targetId === 'string' ? { targetId: value.targetId } : {}),
      ...(typeof value.guess === 'number' ? { guess: value.guess } : {}),
    };
  }
  if (value.kind === 'chancellor') {
    if (
      !identifier(value.keep) ||
      !Array.isArray(value.bottom) ||
      value.bottom.length > 2 ||
      !value.bottom.every(identifier) ||
      new Set([value.keep, ...value.bottom]).size !== value.bottom.length + 1
    )
      throw invalid();
    return { kind: 'chancellor', keep: value.keep, bottom: [...value.bottom] };
  }
  throw invalid();
}
