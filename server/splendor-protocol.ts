import type {
  SplendorMove,
  SplendorRoom,
  SplendorOpenRoom,
  SplendorRecord,
} from '../src/types/splendor';
import { object } from './http-api.ts';
import { readRequestId as requestId } from './socket-command.ts';
export { requestId };
export const splendorFailure = (code: string, message: string) =>
  Object.assign(Error(message), { code: 'SPLENDOR_' + code });
export type SplendorCommand = { requestId?: string } & (
  | { action: 'list' | 'ranking' | 'state' | 'leave' | 'retry-record' }
  | { action: 'create'; maxPlayers: number }
  | { action: 'join' | 'resume'; roomId: string }
  | { action: 'start'; fillBots: boolean }
  | { action: 'move'; revision: number; move: unknown }
);
export type SplendorServerEvent =
  | { type: 'splendor-state'; room: SplendorRoom }
  | { type: 'splendor-rooms'; rooms: SplendorOpenRoom[]; resumeId: string | null }
  | { type: 'splendor-ranking'; rows: SplendorRecord[]; requestId?: string }
  | { type: 'splendor-left'; reason?: string }
  | { type: 'splendor-error'; code: string; message: string; requestId?: string };
export function readSplendorCommand(value: unknown): SplendorCommand {
  const fail = () => splendorFailure('ACTION', 'Opção inválida.');
  if (!object(value) || (value.requestId !== undefined && requestId(value) === undefined))
    throw fail();
  const id = requestId(value);
  switch (value.action) {
    case 'list':
    case 'ranking':
    case 'state':
    case 'leave':
    case 'retry-record':
      return { action: value.action, requestId: id };
    case 'create':
      if (value.maxPlayers !== 2 && value.maxPlayers !== 3 && value.maxPlayers !== 4)
        throw splendorFailure('PLAYERS', 'Escolha 2, 3 ou 4 participantes.');
      return { action: 'create', maxPlayers: value.maxPlayers, requestId: id };
    case 'join':
    case 'resume':
      if (typeof value.roomId !== 'string' || !/^[0-9A-F]{10}$/.test(value.roomId))
        throw splendorFailure('NOT_FOUND', 'Essa mesa não está mais disponível.');
      return { action: value.action, roomId: value.roomId, requestId: id };
    case 'start':
      if (value.fillBots !== undefined && typeof value.fillBots !== 'boolean') throw fail();
      return { action: 'start', fillBots: value.fillBots === true, requestId: id };
    case 'move':
      if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision))
        throw splendorFailure('STALE', 'A mesa mudou. Confira a jogada e tente novamente.');
      return { action: 'move', revision: value.revision, move: value.move, requestId: id };
    default:
      throw fail();
  }
}

/** Structural bounds precede authoritative market, wallet, turn and noble checks. */
export function readSplendorMove(value: unknown): SplendorMove {
  const invalid = () =>
    splendorFailure('INVALID_MOVE', 'Escolha pegar fichas, reservar ou comprar uma carta.');
  const id = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[\x00-\x1f\x7f]/.test(v);
  const vector = (v: unknown): number[] => {
    if (
      !Array.isArray(v) ||
      v.length !== 6 ||
      v.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10)
    )
      throw invalid();
    return [...v];
  };
  if (!object(value)) throw invalid();
  const extra = value.returnTokens == null ? {} : { returnTokens: vector(value.returnTokens) };
  switch (value.kind) {
    case 'take':
      return { kind: 'take', tokens: vector(value.tokens), ...extra };
    case 'reserve':
      if (
        typeof value.level === 'number' &&
        Number.isInteger(value.level) &&
        value.level >= 1 &&
        value.level <= 3
      )
        return { kind: 'reserve', level: value.level, ...extra };
      if (!id(value.id)) throw invalid();
      return { kind: 'reserve', id: value.id, ...extra };
    case 'buy':
      if (!id(value.id)) throw invalid();
      return {
        kind: 'buy',
        id: value.id,
        ...(value.payment == null ? {} : { payment: vector(value.payment) }),
        ...extra,
      };
    case 'noble':
      if (!id(value.id)) throw invalid();
      return { kind: 'noble', id: value.id, ...extra };
    case 'pass':
      return { kind: 'pass', ...extra };
    default:
      throw invalid();
  }
}
