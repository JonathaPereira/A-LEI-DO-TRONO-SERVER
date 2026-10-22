import { record } from '../files/protocol.ts';
import type {
  AzulRoom,
  AzulState,
  AzulPlayer,
  AzulRoundScore,
  AzulOpenRoom,
  AzulRecord,
} from '../../types/azul';

const invalid = () => new Error('Dados da mesa de Azul inválidos.');
function object(value: unknown): Record<string, unknown> {
  if (!record(value)) throw invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 500) throw invalid();
  return value;
}
function integer(value: unknown, min = 0, max = 10000): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw invalid();
  return value as number;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}
function array<T>(
  value: unknown,
  read: (item: unknown, index: number) => T,
  min = 0,
  max = 100,
): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid();
  return value.map(read);
}
const color = (value: unknown) => integer(value, 0, 4);
function score(value: unknown): AzulRoundScore | null {
  if (value === null) return null;
  const s = object(value);
  return {
    before: integer(s.before),
    points: integer(s.points),
    penalty: integer(s.penalty, 0, 14),
    delta: integer(s.delta, -14),
    placements: array(
      s.placements,
      (value) => {
        const p = object(value);
        return {
          row: integer(p.row, 0, 4),
          col: integer(p.col, 0, 4),
          color: color(p.color),
          points: integer(p.points, 1, 10),
        };
      },
      0,
      5,
    ),
  };
}
function player(value: unknown): AzulPlayer {
  const p = object(value);
  const lines = array(
    p.lines,
    (value, row) => {
      const line = object(value),
        count = integer(line.count, 0, row + 1),
        tile = line.color === null ? null : color(line.color);
      if ((count === 0) !== (tile === null)) throw invalid();
      return { color: tile, count };
    },
    5,
    5,
  );
  const result: AzulPlayer = {
    id: text(p.id),
    name: text(p.name),
    bot: bool(p.bot),
    score: integer(p.score),
    lines,
    wall: array(p.wall, (row) => array(row, bool, 5, 5), 5, 5),
    floor: array(p.floor, (v) => integer(v, 0, 5), 0, 7),
    last: score(p.last),
  };
  if (p.forfeited !== undefined) result.forfeited = bool(p.forfeited);
  if (p.bonus !== undefined) {
    const b = object(p.bonus);
    result.bonus = {
      rows: integer(b.rows, 0, 5),
      columns: integer(b.columns, 0, 5),
      sets: integer(b.sets, 0, 5),
      total: integer(b.total, 0, 95),
    };
  }
  return result;
}
export function readAzulState(value: unknown): AzulState {
  const s = object(value),
    players = array(s.players, player, 2, 4),
    ids = new Set(players.map((p) => p.id));
  if (
    ids.size !== players.length ||
    !['draft', 'finished'].includes(String(s.phase)) ||
    s.version !== 1
  )
    throw invalid();
  const factories = array(
    s.factories,
    (f) => array(f, color, 0, 4),
    players.length * 2 + 1,
    players.length * 2 + 1,
  );
  const winners = array(s.winners, text, 0, players.length);
  if (
    winners.some((id) => !ids.has(id)) ||
    new Set(winners).size !== winners.length ||
    (s.phase === 'finished' && (!winners.length || players.some((p) => !p.last || !p.bonus)))
  )
    throw invalid();
  const state: AzulState = {
    version: 1,
    phase: s.phase as 'draft' | 'finished',
    round: integer(s.round, 1),
    revision: integer(s.revision),
    players,
    factories,
    center: array(s.center, color),
    marker: bool(s.marker),
    starter: integer(s.starter, 0, players.length - 1),
    nextStarter: s.nextStarter === null ? null : integer(s.nextStarter, 0, players.length - 1),
    turn: integer(s.turn, 0, players.length - 1),
    winners,
    bagCount: integer(s.bagCount, 0, 100),
    discardCount: integer(s.discardCount, 0, 100),
    last: null,
  };
  if (s.last !== null) {
    const m = object(s.last),
      row = integer(m.row, -1, 4),
      count = integer(m.count, 1, 100),
      accepted = integer(m.accepted, 0, count),
      id = text(m.playerId);
    if (!ids.has(id) || accepted > row + 1) throw invalid();
    state.last = {
      playerId: id,
      source: integer(m.source, -1, factories.length - 1),
      row,
      color: color(m.color),
      count,
      accepted,
    };
  }
  return state;
}
export function readAzulRoom(value: unknown): AzulRoom {
  const r = object(value),
    maxPlayers = integer(r.maxPlayers, 2, 4);
  const players = array(
    r.players,
    (value) => {
      const p = object(value);
      return {
        id: text(p.id),
        name: text(p.name),
        bot: bool(p.bot),
        online: bool(p.online),
        forfeited: bool(p.forfeited),
      };
    },
    1,
    maxPlayers,
  );
  const ids = new Set(players.map((p) => p.id)),
    hostId = text(r.hostId),
    state = r.state === null ? null : readAzulState(r.state);
  if (
    ids.size !== players.length ||
    !ids.has(hostId) ||
    (state &&
      (state.players.length !== players.length || state.players.some((p) => !ids.has(p.id)))) ||
    ![null, 'saving', 'saved', 'pending', 'unranked'].includes(r.recordStatus as string | null)
  )
    throw invalid();
  return {
    id: text(r.id),
    hostId,
    maxPlayers,
    players,
    state,
    recordStatus: r.recordStatus as AzulRoom['recordStatus'],
  };
}
export function readAzulRooms(value: unknown): AzulOpenRoom[] {
  const rooms = array(
    value,
    (value) => {
      const r = object(value),
        maxPlayers = integer(r.maxPlayers, 2, 4);
      return {
        id: text(r.id),
        name: text(r.name),
        maxPlayers,
        players: integer(r.players, 1, maxPlayers),
      };
    },
    0,
    500,
  );
  if (new Set(rooms.map((r) => r.id)).size !== rooms.length) throw invalid();
  return rooms;
}
export function readAzulRanking(value: unknown): AzulRecord[] {
  const rows = array(
    value,
    (value) => {
      const r = object(value),
        date = text(r.date);
      if (!Number.isFinite(Date.parse(date)) || !['bots', 'online'].includes(String(r.mode)))
        throw invalid();
      return {
        playerId: text(r.playerId),
        name: text(r.name),
        score: integer(r.score, 0, 1000),
        mode: r.mode as AzulRecord['mode'],
        date,
      };
    },
    0,
    5,
  );
  if (new Set(rows.map((r) => r.playerId)).size !== rows.length) throw invalid();
  return rows;
}
/** Freeze owned DTOs; parsing never freezes or retains a caller's wire payload. */
export { freezeGame as freezeAzul } from './freeze.ts';
