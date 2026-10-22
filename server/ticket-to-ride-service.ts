import * as Bots from '../src/lib/games/bot-names.ts';
import crypto from 'node:crypto';
import * as Rules from '../src/lib/games/ticket-to-ride-rules.ts';
import type { BackendAccount } from './auth-contract';
import type {
  TicketToRideMove,
  TicketToRideRoom,
  TicketToRideState,
} from '../src/types/ticket-to-ride';
import {
  readTicketToRideCommand,
  readTicketToRideMove,
  requestId,
  ticketToRideFailure as failure,
  type TicketToRideServerEvent,
} from './ticket-to-ride-protocol.ts';
import { object } from './http-api.ts';

type Account = Pick<
  BackendAccount,
  'id' | 'nickname' | 'expiresAt' | 'avatar_preset' | 'avatar_file_id'
>;

export interface TicketToRideConnection {
  account?: Account | null;
  ticketToRideWatching?: boolean;
  ticketToRideRoomId?: string | null;
}

type Connection = TicketToRideConnection;
type AuthenticatedConnection = Connection & { account: Account };

interface Player {
  id: string;
  name: string;
  bot: boolean;
  ws: Connection | null;
  forfeited?: boolean;
  avatar_preset?: string;
  avatar_file_id?: string | null;
  offlineTimer?: NodeJS.Timeout | null;
}

interface Room {
  id: string;
  hostId: string;
  maxPlayers: number;
  players: Player[];
  state: TicketToRideState | null;
  updatedAt: number;
  botTimer?: NodeJS.Timeout;
}

interface Options {
  wss: { clients: Iterable<Connection> };
  send(connection: Connection, event: TicketToRideServerEvent): void;
  now?: () => number;
  botDelay?: number;
  disconnectDelay?: number;
}

export function createTicketToRideService({
  wss,
  send,
  now = Date.now,
  botDelay = 4200,
  disconnectDelay = 90000,
}: Options) {
  const rooms = new Map<string, Room>(),
    membership = new Map<string, string>(),
    rates = new Map<string, { count: number; until: number }>(),
    timers = new Set<NodeJS.Timeout>();
  let closed = false;
  const valid = (ws: Connection): ws is AuthenticatedConnection =>
    !!ws.account && ws.account.expiresAt > now();
  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!closed) fn();
    }, ms);
    t.unref?.();
    timers.add(t);
    return t;
  }
  function cancel(t?: NodeJS.Timeout | null) {
    clearTimeout(t ?? undefined);
    if (t) timers.delete(t);
  }
  function view(room: Room, id: string): TicketToRideRoom {
    return {
      id: room.id,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        online: !!p.ws,
        forfeited: !!p.forfeited,
        avatar_preset: p.avatar_preset || null,
        avatar_file_id: p.avatar_file_id || null,
      })),
      state: room.state ? Rules.publicState(room.state, id) : null,
    };
  }
  function publish(room: Room) {
    if (closed) return;
    for (const p of room.players)
      if (p.ws && valid(p.ws) && p.ws.account.id === p.id)
        send(p.ws, { type: 'ticket-to-ride-state', room: view(room, p.id) });
  }
  function list(ws: AuthenticatedConnection) {
    send(ws, {
      type: 'ticket-to-ride-rooms',
      rooms: [...rooms.values()]
        .filter((r) => !r.state && r.players.length < r.maxPlayers)
        .map((r) => ({
          id: r.id,
          name: r.players[0]?.name || 'Mesa',
          players: r.players.length,
          maxPlayers: r.maxPlayers,
        })),
      resumeId: membership.get(ws.account.id) || null,
    });
  }
  function lists() {
    if (closed) return;
    for (const ws of wss.clients) if (valid(ws) && ws.ticketToRideWatching) list(ws);
  }
  function remove(room: Room) {
    cancel(room.botTimer);
    for (const p of room.players) {
      cancel(p.offlineTimer);
      if (membership.get(p.id) === room.id) membership.delete(p.id);
      if (p.ws?.ticketToRideRoomId === room.id) p.ws.ticketToRideRoomId = null;
      p.ws = null;
    }
    rooms.delete(room.id);
  }
  function schedule(room: Room) {
    cancel(room.botTimer);
    const s = room.state;
    if (closed || !s || s.phase === 'finished') return;
    const index =
      s.phase === 'setup'
        ? s.players.findIndex((p, i) => p.pending.length && room.players[i]?.bot)
        : s.turn;
    if (index < 0 || !room.players[index]?.bot) return;
    room.botTimer = later(() => {
      if (closed || !rooms.has(room.id) || !room.state) return;
      const v = Rules.publicState(room.state, s.players[index]!.id);
      v.turn = index;
      apply(room, s.players[index]!.id, Rules.botMove(v));
    }, botDelay);
  }
  function apply(room: Room, id: string, move: TicketToRideMove | unknown) {
    if (!room.state) throw failure('NOT_PLAYING', 'A partida ainda não começou.');
    room.state = Rules.move(room.state, id, readTicketToRideMove(move));
    room.updatedAt = now();
    publish(room);
    schedule(room);
  }
  function detach(ws: Connection, explicit = false) {
    if (closed) {
      ws.ticketToRideRoomId = null;
      return;
    }
    const room = rooms.get(ws.ticketToRideRoomId || ''),
      p = room?.players.find((x) => x.id === ws.account?.id && x.ws === ws);
    ws.ticketToRideRoomId = null;
    if (!p || !room) return;
    p.ws = null;
    cancel(p.offlineTimer);
    const leave = () => {
      if (!rooms.has(room.id) || p.ws) return;
      membership.delete(p.id);
      if (room.state) {
        p.bot = true;
        p.forfeited = true;
        p.name = Bots.next(room.players.filter((x) => x !== p));
        Object.assign(
          room.state.players.find((x) => x.id === p.id)!,
          { bot: true, forfeited: true, name: p.name },
        );
      } else room.players = room.players.filter((x) => x !== p);
      if (room.hostId === p.id)
        room.hostId =
          room.players.find((x) => x.ws)?.id || room.players.find((x) => !x.bot)?.id || room.hostId;
      if (!room.players.some((x) => x.ws || (x.offlineTimer && membership.has(x.id)))) remove(room);
      else {
        publish(room);
        schedule(room);
      }
      lists();
    };
    if (explicit) leave();
    else {
      p.offlineTimer = later(leave, disconnectDelay);
      publish(room);
    }
  }
  function attach(ws: AuthenticatedConnection, room: Room) {
    const p = room.players.find((x) => x.id === ws.account.id)!;
    if (p.forfeited) throw failure('LEFT', 'Você saiu desta partida. Entre em uma nova mesa.');
    if (p.ws && p.ws !== ws)
      throw failure('OTHER_SESSION', 'Sua conta já está nesta mesa em outra sessão.');
    cancel(p.offlineTimer);
    p.offlineTimer = null;
    p.ws = ws;
    p.name = ws.account.nickname;
    p.avatar_preset = ws.account.avatar_preset;
    p.avatar_file_id = ws.account.avatar_file_id;
    ws.ticketToRideRoomId = room.id;
    membership.set(p.id, room.id);
    if (room.state) room.state.players.find((x) => x.id === p.id)!.name = p.name;
    publish(room);
    lists();
  }
  function handle(ws: Connection, value: unknown) {
    if (closed) return;
    if (!valid(ws)) {
      send(ws, {
        type: 'ticket-to-ride-error',
        code: 'AUTH_REQUIRED',
        message: 'Entre em uma conta confirmada para jogar Ticket to Ride.',
      });
      return;
    }
    try {
      let rate = rates.get(ws.account.id);
      if (!rate || rate.until < now()) {
        rate = { count: 0, until: now() + 10000 };
        rates.set(ws.account.id, rate);
      }
      if (++rate.count > 100) throw failure('RATE_LIMIT', 'Aguarde um instante.');
      ws.ticketToRideWatching = true;
      const msg = readTicketToRideCommand(value);
      if (msg.action === 'list') {
        list(ws);
        return;
      }
      if (msg.action === 'create') {
        if (membership.has(ws.account.id))
          throw failure('ALREADY_SEATED', 'Retome ou saia da sua mesa antes de criar outra.');
        if (rooms.size >= 100) throw failure('BUSY', 'Mesas ocupadas. Tente novamente mais tarde.');
        if (!Number.isInteger(msg.maxPlayers) || msg.maxPlayers < 2 || msg.maxPlayers > 5)
          throw failure('PLAYERS', 'Escolha de 2 a 5 participantes.');
        const room: Room = {
          id: crypto.randomBytes(5).toString('hex').toUpperCase(),
          hostId: ws.account.id,
          maxPlayers: msg.maxPlayers,
          players: [
            {
              id: ws.account.id,
              name: ws.account.nickname,
              ws: null,
              bot: false,
            },
          ],
          state: null,
          updatedAt: now(),
        };
        rooms.set(room.id, room);
        attach(ws, room);
        return;
      }
      if (msg.action === 'join' || msg.action === 'resume') {
        const existing = membership.get(ws.account.id);
        if (existing && existing !== msg.roomId)
          throw failure('ALREADY_SEATED', 'Saia da mesa atual antes de entrar em outra.');
        const room = rooms.get(String(msg.roomId || ''));
        if (!room) throw failure('NOT_FOUND', 'Esta mesa não está mais disponível.');
        if (!room.players.some((p) => p.id === ws.account.id)) {
          if (room.state || room.players.length >= room.maxPlayers)
            throw failure('FULL', 'Esta mesa está cheia ou já começou.');
          room.players.push({
            id: ws.account.id,
            name: ws.account.nickname,
            ws: null,
            bot: false,
          });
        }
        attach(ws, room);
        return;
      }
      const room = rooms.get(ws.ticketToRideRoomId || '');
      if (!room || !room.players.some((p) => p.ws === ws))
        throw failure('NOT_MEMBER', 'Entre em uma mesa primeiro.');
      if (msg.action === 'leave') {
        detach(ws, true);
        send(ws, { type: 'ticket-to-ride-left' });
        return;
      }
      if (msg.action === 'state') {
        publish(room);
        return;
      }
      if (msg.action === 'start') {
        if (room.hostId !== ws.account.id || room.state)
          throw failure('FORBIDDEN', 'Somente o anfitrião pode iniciar.');
        if (room.players.some((p) => !p.ws))
          throw failure('OFFLINE', 'Aguarde os participantes reconectarem.');
        if (msg.fillBots)
          while (room.players.length < room.maxPlayers)
            room.players.push({
              id: 'bot-' + crypto.randomUUID(),
              name: Bots.next(room.players),
              bot: true,
              ws: null,
            });
        if (room.players.length < 2)
          throw failure('PLAYERS', 'Convide outra pessoa ou complete com bots.');
        room.state = Rules.create(room.players);
        room.updatedAt = now();
        publish(room);
        lists();
        schedule(room);
        return;
      }
      if (msg.action === 'move') {
        if (!room.state) throw failure('NOT_PLAYING', 'A partida ainda não começou.');
        if (msg.revision !== room.state.revision)
          throw failure('STALE', 'A mesa mudou. Confira sua jogada.');
        apply(room, ws.account.id, msg.move);
        return;
      }
      throw failure('ACTION', 'Opção inválida.');
    } catch (e) {
      const known = object(e) && typeof e.code === 'string' && e.code.startsWith('TICKET_TO_RIDE_');
      send(ws, {
        type: 'ticket-to-ride-error',
        requestId: requestId(value),
        code: known ? (e.code as string) : 'TICKET_TO_RIDE_ERROR',
        message: known && e instanceof Error ? e.message : 'Não foi possível atualizar a mesa.',
      });
    }
  }
  const cleanup = setInterval(() => {
    for (const r of rooms.values())
      if (now() - r.updatedAt > 6 * 3600000) {
        for (const p of r.players)
          if (p.ws)
            send(p.ws, {
              type: 'ticket-to-ride-left',
              reason: 'Mesa encerrada por inatividade.',
            });
        remove(r);
      }
    for (const [id, r] of rates) if (r.until < now()) rates.delete(id);
  }, 60000);
  cleanup.unref?.();
  return {
    handle,
    disconnect: detach,
    updateAccount(account: Account) {
      if (closed) return;
      for (const r of rooms.values()) {
        const p = r.players.find((x) => x.id === account.id);
        if (!p || p.forfeited) continue;
        p.name = account.nickname;
        p.avatar_preset = account.avatar_preset;
        p.avatar_file_id = account.avatar_file_id;
        if (r.state) r.state.players.find((x) => x.id === account.id)!.name = p.name;
        publish(r);
      }
      lists();
    },
    health: () => ({ available: !closed, rooms: rooms.size }),
    rooms,
    stop() {
      if (closed) return;
      closed = true;
      for (const ws of wss.clients) {
        ws.ticketToRideWatching = false;
        ws.ticketToRideRoomId = null;
      }
      for (const room of rooms.values()) for (const player of room.players) player.ws = null;
      rooms.clear();
      membership.clear();
      rates.clear();
      clearInterval(cleanup);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
