import crypto from 'node:crypto';
import * as R from '../src/lib/games/similo/rules.ts';
import type { BackendAccount } from './auth-contract';
import type { SimiloRoom, SimiloSettings, SimiloEvent } from '../src/types/similo';
import { object } from './http-api.ts';
import { readRequestId } from './socket-command.ts';
import { readSimiloCommand, similoFailure as failure } from './similo-protocol.ts';
type Account = Pick<
  BackendAccount,
  'id' | 'nickname' | 'expiresAt' | 'avatar_preset' | 'avatar_file_id'
>;
export interface SimiloConnection {
  account?: Account | null;
  similoWatching?: boolean;
  similoRoomId?: string | null;
}
interface Player {
  id: string;
  name: string;
  ws: SimiloConnection | null;
  avatar_preset?: string | null;
  avatar_file_id?: string | null;
  timer?: NodeJS.Timeout;
}
interface Room {
  id: string;
  hostId: string;
  revision: number;
  settings: SimiloSettings;
  players: Player[];
  state: R.Game | null;
  updatedAt: number;
  random: () => number;
  resolveTimer?: NodeJS.Timeout;
}
interface Options {
  wss: { clients: Iterable<SimiloConnection> };
  send(ws: SimiloConnection, event: SimiloEvent): void;
  now?: () => number;
  createRandom?: () => () => number;
  disconnectDelay?: number;
  revealDelay?: number;
}
/** Owns authenticated room membership, hidden cards, decisions and reveal deadlines. */
export function createSimiloService({
  wss,
  send,
  now = Date.now,
  createRandom = () => () => crypto.randomInt(0x100000000) / 0x100000000,
  disconnectDelay = 90000,
  revealDelay = 2200,
}: Options) {
  const rooms = new Map<string, Room>(),
    membership = new Map<string, string>(),
    rates = new Map<string, { count: number; until: number }>(),
    timers = new Set<NodeJS.Timeout>();
  let closed = false;
  const valid = (ws: SimiloConnection): ws is SimiloConnection & { account: Account } =>
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
  function cancel(t?: NodeJS.Timeout) {
    if (t) {
      clearTimeout(t);
      timers.delete(t);
    }
  }
  function view(r: Room, id: string): SimiloRoom {
    return {
      id: r.id,
      hostId: r.hostId,
      revision: r.revision,
      settings: structuredClone(r.settings),
      players: r.players.map((p) => ({
        id: p.id,
        name: p.name,
        online: !!p.ws,
        avatar_preset: p.avatar_preset,
        avatar_file_id: p.avatar_file_id,
      })),
      state: r.state ? R.publicState(r.state, id) : null,
    };
  }
  function publish(r: Room) {
    if (closed) return;
    for (const p of r.players)
      if (p.ws && valid(p.ws) && p.ws.account.id === p.id)
        send(p.ws, { type: 'similo-state', room: view(r, p.id) });
  }
  function list(ws: SimiloConnection & { account: Account }) {
    send(ws, {
      type: 'similo-rooms',
      rooms: [...rooms.values()]
        .filter((r) => !r.state && r.players.length < r.settings.maxPlayers)
        .map((r) => ({
          id: r.id,
          name: r.players.find((p) => p.id === r.hostId)?.name || 'Mesa',
          players: r.players.length,
          maxPlayers: r.settings.maxPlayers,
        })),
      resumeId: membership.get(ws.account.id) || null,
    });
  }
  function lists() {
    for (const ws of wss.clients) if (valid(ws) && ws.similoWatching) list(ws);
  }
  function remove(r: Room, reason?: string) {
    cancel(r.resolveTimer);
    for (const p of r.players) {
      cancel(p.timer);
      membership.delete(p.id);
      if (p.ws) {
        p.ws.similoRoomId = null;
        if (reason) send(p.ws, { type: 'similo-left', reason });
      }
      p.ws = null;
    }
    rooms.delete(r.id);
  }
  function detach(ws: SimiloConnection, explicit = false) {
    const r = rooms.get(ws.similoRoomId || ''),
      p = r?.players.find((p) => p.ws === ws);
    ws.similoRoomId = null;
    if (!r || !p) return;
    p.ws = null;
    cancel(p.timer);
    const leave = () => {
      if (!rooms.has(r.id) || p.ws) return;
      if (r.state) {
        remove(r, 'A mesa foi encerrada porque ' + p.name + ' saiu. Crie uma nova partida.');
      } else {
        membership.delete(p.id);
        r.players = r.players.filter((x) => x !== p);
        r.revision++;
        if (!r.players.length) remove(r);
        else {
          if (r.hostId === p.id) r.hostId = r.players.find((x) => x.ws)?.id || r.players[0].id;
          if (r.settings.narratorId === p.id) r.settings.narratorId = r.hostId;
          publish(r);
        }
      }
      lists();
    };
    if (explicit) leave();
    else {
      p.timer = later(leave, disconnectDelay);
      publish(r);
    }
  }
  function attach(ws: SimiloConnection & { account: Account }, r: Room) {
    const p = r.players.find((x) => x.id === ws.account.id)!;
    if (p.ws && p.ws !== ws)
      throw failure('OTHER_SESSION', 'Sua conta já está nesta mesa em outra sessão.');
    cancel(p.timer);
    p.timer = undefined;
    p.ws = ws;
    p.name = ws.account.nickname;
    p.avatar_preset = ws.account.avatar_preset;
    p.avatar_file_id = ws.account.avatar_file_id;
    ws.similoRoomId = r.id;
    membership.set(p.id, r.id);
    publish(r);
    lists();
  }
  function handle(ws: SimiloConnection, value: unknown) {
    if (closed) return;
    if (!valid(ws)) {
      send(ws, {
        type: 'similo-error',
        code: 'AUTH_REQUIRED',
        message: 'Entre em uma conta confirmada para jogar Similo.',
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
      const m = readSimiloCommand(value);
      ws.similoWatching = true;
      if (m.action === 'list') {
        list(ws);
        return;
      }
      if (m.action === 'create') {
        if (membership.has(ws.account.id))
          throw failure('ALREADY_SEATED', 'Retome ou saia da sua mesa antes de criar outra.');
        if (rooms.size >= 100) throw failure('BUSY', 'Mesas ocupadas. Tente novamente mais tarde.');
        const r: Room = {
          id: crypto.randomBytes(5).toString('hex').toUpperCase(),
          hostId: ws.account.id,
          revision: 0,
          settings: { ...m.settings, narratorId: ws.account.id },
          players: [{ id: ws.account.id, name: ws.account.nickname, ws: null }],
          state: null,
          updatedAt: now(),
          random: createRandom(),
        };
        rooms.set(r.id, r);
        attach(ws, r);
        return;
      }
      if (m.action === 'join' || m.action === 'resume') {
        const existing = membership.get(ws.account.id);
        if (existing && existing !== m.roomId)
          throw failure('ALREADY_SEATED', 'Saia da mesa atual antes de entrar em outra.');
        const r = rooms.get(m.roomId);
        if (!r) throw failure('NOT_FOUND', 'Esta mesa não está mais disponível.');
        if (!r.players.some((p) => p.id === ws.account.id)) {
          if (r.state || r.players.length >= r.settings.maxPlayers)
            throw failure('FULL', 'Esta mesa está cheia ou já começou.');
          r.players.push({ id: ws.account.id, name: ws.account.nickname, ws: null });
          r.revision++;
        }
        attach(ws, r);
        return;
      }
      const r = rooms.get(ws.similoRoomId || '');
      if (!r || !r.players.some((p) => p.ws === ws))
        throw failure('NOT_MEMBER', 'Entre em uma mesa primeiro.');
      if (m.action === 'leave') {
        detach(ws, true);
        send(ws, { type: 'similo-left' });
        return;
      }
      if (m.action === 'state') {
        publish(r);
        return;
      }
      if (!('revision' in m) || m.revision !== r.revision)
        throw failure('STALE', 'A mesa mudou. Confira a seleção e tente novamente.');
      if (r.players.some((p) => !p.ws))
        throw failure(
          'OFFLINE',
          'A partida está pausada. Aguarde a reconexão dos participantes (até 90 segundos).',
        );
      if (m.action === 'configure') {
        if (r.hostId !== ws.account.id || r.state)
          throw failure('FORBIDDEN', 'Somente o anfitrião pode configurar o lobby.');
        if (
          m.settings.maxPlayers < r.players.length ||
          !r.players.some((p) => p.id === m.settings.narratorId)
        )
          throw failure('SETTINGS', 'Escolha um informante da mesa e vagas suficientes.');
        r.settings = m.settings;
      } else if (m.action === 'start' || m.action === 'rematch') {
        if (
          r.hostId !== ws.account.id ||
          (m.action === 'start' ? !!r.state : r.state?.phase !== 'finished')
        )
          throw failure('FORBIDDEN', 'O anfitrião inicia a partida.');
        if (r.players.length < 2) throw failure('PLAYERS', 'Convide pelo menos mais uma pessoa.');
        r.state = R.createGame(
          {
            boardThemes: r.settings.boardThemes,
            clueThemes: r.settings.clueThemes,
            narrator: r.settings.narratorId,
            guessers: r.players.filter((p) => p.id !== r.settings.narratorId).map((p) => p.id),
          },
          r.random,
        );
      } else if (m.action === 'move') {
        if (!r.state) throw failure('NOT_PLAYING', 'A partida ainda não começou.');
        const g = r.state,
          id = ws.account.id,
          voter = g.config.guessers.indexOf(id),
          narrator = g.config.narrator === id;
        switch (m.move.kind) {
          case 'clue':
            if (!narrator) throw failure('FORBIDDEN', 'Somente o informante pode dar pistas.');
            r.state = R.playClue(g, m.move.cardId, m.move.relation);
            break;
          case 'vote':
            if (voter < 0) throw failure('FORBIDDEN', 'O informante não vota.');
            {
              let next = R.setVote(g, voter, m.move.selected);
              if (m.move.confirmed) next = R.confirmVote(next, voter);
              r.state = next;
            }
            break;
          case 'reopen':
            if (voter < 0) throw failure('FORBIDDEN', 'O informante não vota.');
            r.state = R.reopenVote(g, voter);
            break;
          case 'resolve':
            r.state = R.beginElimination(g, voter, m.move.selected);
            {
              const expected = r.state.revision;
              r.resolveTimer = later(() => {
                if (!rooms.has(r.id) || !r.state) return;
                const next = R.finishElimination(r.state, expected);
                if (next !== r.state) {
                  r.state = next;
                  r.revision++;
                  r.updatedAt = now();
                  publish(r);
                }
              }, revealDelay);
            }
            break;
        }
      }
      r.revision++;
      r.updatedAt = now();
      publish(r);
      lists();
    } catch (e) {
      const known = object(e) && typeof e.code === 'string' && e.code.startsWith('SIMILO_');
      send(ws, {
        type: 'similo-error',
        requestId: readRequestId(value),
        code: known ? (e.code as string) : 'SIMILO_RULE',
        message: e instanceof Error ? e.message : 'Não foi possível atualizar a mesa.',
      });
    }
  }
  const cleanup = setInterval(() => {
    for (const r of rooms.values())
      if (now() - r.updatedAt > 6 * 3600000) remove(r, 'Mesa encerrada por inatividade.');
    for (const [id, rate] of rates) if (rate.until < now()) rates.delete(id);
  }, 60000);
  cleanup.unref?.();
  return {
    handle,
    disconnect: detach,
    rooms,
    health: () => ({ available: !closed, rooms: rooms.size }),
    updateAccount(account: Account) {
      for (const r of rooms.values()) {
        const p = r.players.find((p) => p.id === account.id);
        if (p) {
          p.name = account.nickname;
          p.avatar_preset = account.avatar_preset;
          p.avatar_file_id = account.avatar_file_id;
          publish(r);
        }
      }
      lists();
    },
    stop() {
      if (closed) return;
      closed = true;
      for (const r of rooms.values()) remove(r);
      for (const ws of wss.clients) {
        ws.similoWatching = false;
        ws.similoRoomId = null;
      }
      clearInterval(cleanup);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      rates.clear();
    },
  };
}
