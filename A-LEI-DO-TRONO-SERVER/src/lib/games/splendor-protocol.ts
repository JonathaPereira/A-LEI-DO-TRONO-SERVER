import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import type {
  SplendorCard,
  SplendorNoble,
  SplendorPlayer,
  SplendorState,
  SplendorRoom,
  SplendorEvent,
  SplendorRecord,
  SplendorOpenRoom,
} from '../../types/splendor';

// DTO freezing is shared; no game rules or state are shared with the Azul owner.
export const freezeSplendor = freezeGame;
const bad = () => new Error('Dados da mesa de Splendor inválidos.');
function obj(v: unknown): Record<string, unknown> {
  if (!record(v)) throw bad();
  return v;
}
function str(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 500) throw bad();
  return v;
}
function num(v: unknown, min = 0, max = 10000): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw bad();
  return v as number;
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw bad();
  return v;
}
function arr<T>(v: unknown, read: (v: unknown, i: number) => T, min = 0, max = 100): T[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw bad();
  return v.map(read);
}
const vector = (v: unknown, n = 6, max = 10) => arr(v, (x) => num(x, 0, max), n, n);
function card(v: unknown): SplendorCard {
  const c = obj(v);
  return {
    id: str(c.id),
    level: num(c.level, 1, 3),
    points: num(c.points, 0, 5),
    bonus: num(c.bonus, 0, 4),
    cost: vector(c.cost, 5),
  };
}
function noble(v: unknown): SplendorNoble {
  const n = obj(v);
  return { id: str(n.id), points: num(n.points, 3, 3), cost: vector(n.cost, 5) };
}
function event(v: unknown, ids: Set<string>): SplendorEvent {
  const e = obj(v);
  if (!['take', 'reserve', 'buy', 'noble', 'pass'].includes(String(e.kind))) throw bad();
  const result: SplendorEvent = {
    kind: e.kind as SplendorEvent['kind'],
    playerId: str(e.playerId),
    points: num(e.points, 0, 20),
    revision: num(e.revision, 1),
    score: num(e.score, 0, 200),
  };
  if (!ids.has(result.playerId)) throw bad();
  if (e.card !== undefined) result.card = card(e.card);
  if (e.noble !== undefined) result.noble = noble(e.noble);
  for (const key of ['payment', 'tokens', 'returned'] as const)
    if (e[key] !== undefined) result[key] = vector(e[key]);
  if (e.gold !== undefined) result.gold = num(e.gold, 0, 1);
  if (e.level !== undefined) result.level = num(e.level, 1, 3);
  if (e.blind !== undefined) result.blind = bool(e.blind);
  if (
    (result.kind === 'take' && !result.tokens) ||
    (result.kind === 'buy' && (!result.card || !result.payment)) ||
    (result.kind === 'reserve' && (!result.level || result.gold === undefined)) ||
    (result.kind === 'noble' && !result.noble)
  )
    throw bad();
  return result;
}
function player(v: unknown, viewer: string): SplendorPlayer {
  const p = obj(v),
    id = str(p.id);
  const result: SplendorPlayer = {
    id,
    name: str(p.name),
    bot: bool(p.bot),
    tokens: vector(p.tokens),
    bonuses: vector(p.bonuses, 5, 90),
    cards: arr(p.cards, card, 0, 90),
    reserved: arr(
      p.reserved,
      (v) => {
        const c = obj(v);
        if (id !== viewer) {
          if (c.hidden !== true) throw bad();
          return { hidden: true as const, level: num(c.level, 1, 3) };
        }
        if (c.hidden) throw bad();
        return card(c);
      },
      0,
      3,
    ),
    nobles: arr(p.nobles, noble, 0, 5),
    score: num(p.score, 0, 200),
    turns: num(p.turns),
  };
  if (result.tokens.reduce((a, b) => a + b, 0) > 10) throw bad();
  if (p.forfeited !== undefined) result.forfeited = bool(p.forfeited);
  return result;
}
export function readSplendorRoom(v: unknown, viewer: string): SplendorRoom {
  const r = obj(v),
    maxPlayers = num(r.maxPlayers, 2, 4),
    players = arr(
      r.players,
      (v) => {
        const p = obj(v);
        return {
          id: str(p.id),
          name: str(p.name),
          bot: bool(p.bot),
          online: bool(p.online),
          forfeited: bool(p.forfeited),
        };
      },
      1,
      maxPlayers,
    ),
    ids = new Set(players.map((p) => p.id)),
    hostId = str(r.hostId);
  if (
    ids.size !== players.length ||
    !ids.has(hostId) ||
    !ids.has(viewer) ||
    ![null, 'saving', 'saved', 'pending', 'unranked'].includes(r.recordStatus as string | null)
  )
    throw bad();
  let state: SplendorState | null = null;
  if (r.state !== null) {
    const s = obj(r.state);
    if (s.version !== 1 || !['action', 'noble', 'finished'].includes(String(s.phase))) throw bad();
    const boards = arr(s.players, (p) => player(p, viewer), 2, 4);
    if (
      boards.length !== players.length ||
      new Set(boards.map((p) => p.id)).size !== boards.length ||
      boards.some((p) => !ids.has(p.id))
    )
      throw bad();
    const nobles = arr(s.nobles, noble, 0, 5),
      eligible = arr(s.eligible, str, 0, 5),
      winners = arr(s.winners, str, 0, players.length),
      revision = num(s.revision);
    if (
      eligible.some((id) => !nobles.some((n) => n.id === id)) ||
      winners.some((id) => !ids.has(id)) ||
      (s.phase === 'finished' && !winners.length) ||
      (s.phase === 'noble' && eligible.length < 2)
    )
      throw bad();
    state = {
      version: 1,
      phase: s.phase as SplendorState['phase'],
      revision,
      round: num(s.round, 1),
      turn: num(s.turn, 0, players.length - 1),
      starter: num(s.starter, 0, players.length - 1),
      players: boards,
      bank: vector(s.bank, 6, 7),
      deckCounts: vector(s.deckCounts, 3, 40),
      market: arr(s.market, (row) => arr(row, (v) => (v === null ? null : card(v)), 4, 4), 3, 3),
      nobles,
      eligible,
      finalRound: bool(s.finalRound),
      winners,
      last: s.last === null ? null : event(s.last, ids),
      log: arr(s.log, (e) => event(e, ids), 0, 30),
    };
    if (state.last && state.last.revision !== revision) throw bad();
    const known = [
      ...state.market.flat().filter((c): c is SplendorCard => !!c),
      ...boards.flatMap((p) => [
        ...p.cards,
        ...p.reserved.filter((c): c is SplendorCard => !c.hidden),
      ]),
    ].map((c) => c.id);
    if (new Set(known).size !== known.length) throw bad();
  }
  return {
    id: str(r.id),
    hostId,
    maxPlayers,
    players,
    state,
    recordStatus: r.recordStatus as SplendorRoom['recordStatus'],
  };
}
export function readSplendorRooms(v: unknown): SplendorOpenRoom[] {
  const rows = arr(
    v,
    (v) => {
      const r = obj(v),
        maxPlayers = num(r.maxPlayers, 2, 4);
      return {
        id: str(r.id),
        name: str(r.name),
        players: num(r.players, 1, maxPlayers),
        maxPlayers,
      };
    },
    0,
    500,
  );
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw bad();
  return rows;
}
export function readSplendorRanking(v: unknown): SplendorRecord[] {
  const rows = arr(
    v,
    (v) => {
      const r = obj(v),
        date = str(r.date);
      if (!Number.isFinite(Date.parse(date)) || !['online', 'bots'].includes(String(r.mode)))
        throw bad();
      return {
        playerId: str(r.playerId),
        name: str(r.name),
        score: num(r.score, 0, 200),
        cards: num(r.cards, 0, 90),
        mode: r.mode as SplendorRecord['mode'],
        date,
      };
    },
    0,
    5,
  );
  if (new Set(rows.map((r) => r.playerId)).size !== rows.length) throw bad();
  return rows;
}
