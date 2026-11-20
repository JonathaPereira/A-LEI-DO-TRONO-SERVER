import type { AzulMove, AzulRoom, AzulOpenRoom, AzulRecord } from '../src/types/azul';
import { object } from './http-api.ts';
import { readRequestId as requestId } from './socket-command.ts';
export { requestId };
export const azulFailure = (code: string, message: string) =>
  Object.assign(Error(message), { code: 'AZUL_' + code });
export type AzulCommand = { requestId?: string } & (
  | { action: 'list' | 'ranking' | 'state' | 'leave' | 'retry-record' }
  | { action: 'create'; maxPlayers: number }
  | { action: 'join' | 'resume'; roomId: string }
  | { action: 'start'; fillBots: boolean }
  | { action: 'move'; revision: number; move: unknown }
);
export type AzulServerEvent =
  | { type: 'azul-state'; room: AzulRoom }
  | { type: 'azul-rooms'; rooms: AzulOpenRoom[]; resumeId: string | null }
  | { type: 'azul-ranking'; rows: AzulRecord[]; requestId?: string }
  | { type: 'azul-left'; reason?: string }
  | { type: 'azul-error'; code: string; message: string; requestId?: string };
export function readAzulCommand(value: unknown): AzulCommand {
  const fail = () => azulFailure('ACTION', 'Opção inválida.');
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
        throw azulFailure('PLAYERS', 'Escolha 2, 3 ou 4 participantes.');
      return { action: 'create', maxPlayers: value.maxPlayers, requestId: id };
    case 'join':
    case 'resume':
      if (typeof value.roomId !== 'string' || !/^[0-9A-F]{10}$/.test(value.roomId))
        throw azulFailure('NOT_FOUND', 'Essa mesa não está mais disponível.');
      return { action: value.action, roomId: value.roomId, requestId: id };
    case 'start':
      if (value.fillBots !== undefined && typeof value.fillBots !== 'boolean') throw fail();
      return { action: 'start', fillBots: value.fillBots === true, requestId: id };
    case 'move':
      if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision))
        throw azulFailure('STALE', 'A mesa mudou. Confira a jogada e tente novamente.');
      return { action: 'move', revision: value.revision, move: value.move, requestId: id };
    default:
      throw fail();
  }
}
export function readAzulMove(value: unknown): AzulMove {
  if (
    !object(value) ||
    typeof value.source !== 'number' ||
    !Number.isInteger(value.source) ||
    value.source < -1 ||
    value.source > 8 ||
    typeof value.color !== 'number' ||
    !Number.isInteger(value.color) ||
    value.color < 0 ||
    value.color > 4 ||
    typeof value.row !== 'number' ||
    !Number.isInteger(value.row) ||
    value.row < -1 ||
    value.row > 4
  )
    throw azulFailure('INVALID_MOVE', 'Escolha uma fábrica, uma cor e uma linha.');
  return { source: value.source, color: value.color, row: value.row };
}
