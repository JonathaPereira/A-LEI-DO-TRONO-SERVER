import type {
  TicketToRideMove,
  TicketToRideOpenRoom,
  TicketToRideRoom,
} from '../src/types/ticket-to-ride';
import { object } from './http-api.ts';
import { readRequestId as requestId } from './socket-command.ts';
export { requestId };

export const ticketToRideFailure = (code: string, message: string) =>
  Object.assign(Error(message), { code: 'TICKET_TO_RIDE_' + code });

export type TicketToRideCommand = { requestId?: string } & (
  | { action: 'list' | 'state' | 'leave' }
  | { action: 'create'; maxPlayers: number }
  | { action: 'join' | 'resume'; roomId: string }
  | { action: 'start'; fillBots: boolean }
  | { action: 'move'; revision: number; move: unknown }
);

export type TicketToRideServerEvent =
  | { type: 'ticket-to-ride-state'; room: TicketToRideRoom }
  | {
      type: 'ticket-to-ride-rooms';
      rooms: TicketToRideOpenRoom[];
      resumeId: string | null;
    }
  | { type: 'ticket-to-ride-left'; reason?: string }
  | {
      type: 'ticket-to-ride-error';
      requestId?: string;
      code: string;
      message: string;
    };

export function readTicketToRideCommand(value: unknown): TicketToRideCommand {
  const invalid = () => ticketToRideFailure('ACTION', 'Opção inválida.');
  if (!object(value) || (value.requestId !== undefined && requestId(value) === undefined)) {
    throw invalid();
  }
  const id = requestId(value);
  switch (value.action) {
    case 'list':
    case 'state':
    case 'leave':
      return { action: value.action, requestId: id };
    case 'create':
      if (
        typeof value.maxPlayers !== 'number' ||
        !Number.isInteger(value.maxPlayers) ||
        value.maxPlayers < 2 ||
        value.maxPlayers > 5
      ) {
        throw ticketToRideFailure('PLAYERS', 'Escolha de 2 a 5 participantes.');
      }
      return { action: 'create', maxPlayers: value.maxPlayers, requestId: id };
    case 'join':
    case 'resume':
      if (typeof value.roomId !== 'string' || !/^[0-9A-F]{10}$/.test(value.roomId)) {
        throw ticketToRideFailure('NOT_FOUND', 'Esta mesa não está mais disponível.');
      }
      return { action: value.action, roomId: value.roomId, requestId: id };
    case 'start':
      if (value.fillBots !== undefined && typeof value.fillBots !== 'boolean') {
        throw invalid();
      }
      return {
        action: 'start',
        fillBots: value.fillBots === true,
        requestId: id,
      };
    case 'move':
      if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision)) {
        throw ticketToRideFailure('STALE', 'A mesa mudou. Confira sua jogada.');
      }
      return {
        action: 'move',
        revision: value.revision,
        move: value.move,
        requestId: id,
      };
    default:
      throw invalid();
  }
}

export function readTicketToRideMove(value: unknown): TicketToRideMove {
  if (!object(value)) {
    throw ticketToRideFailure('INVALID_MOVE', 'Jogada inválida.');
  }
  return value as unknown as TicketToRideMove;
}
