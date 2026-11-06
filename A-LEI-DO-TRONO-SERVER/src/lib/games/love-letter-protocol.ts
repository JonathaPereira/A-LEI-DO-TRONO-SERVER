import { record } from '../files/protocol.ts';
import type {
  LoveLetterCard,
  LoveLetterPlayer,
  LoveLetterRoundResult,
  LoveLetterEvent,
  LoveLetterState,
  LoveLetterRoom,
  LoveLetterOpenRoom,
} from '../../types/love-letter';
const invalid = () => new Error('Dados da mesa de Love Letter inválidos.');
function obj(v: unknown): Record<string, unknown> {
  if (!record(v)) throw invalid();
  return v;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 500) throw invalid();
  return v;
}
function num(v: unknown, min = 0, max = 10000): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw invalid();
  return v as number;
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw invalid();
  return v;
}
function list<T>(v: unknown, read: (v: unknown, i: number) => T, min = 0, max = 100): T[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw invalid();
  return v.map(read);
}
function card(v: unknown): LoveLetterCard {
  const c = obj(v),
    rank = num(c.rank, 0, 9),
    id = text(c.id);
  if (c.hidden || !new RegExp('^' + rank + '-[0-5]$').test(id)) throw invalid();
  return { id, rank };
}
function memberId(v: unknown, ids: Set<string>): string {
  const id = text(v);
  if (!ids.has(id)) throw invalid();
  return id;
}
function members(v: unknown, ids: Set<string>, min = 0) {
  const values = list(v, (v) => memberId(v, ids), min, ids.size);
  if (new Set(values).size !== values.length) throw invalid();
  return values;
}
function result(v: unknown, ids: Set<string>): LoveLetterRoundResult {
  const r = obj(v);
  if (!['last-survivor', 'deck-empty'].includes(String(r.reason))) throw invalid();
  const hands = list(
    r.hands,
    (v) => {
      const h = obj(v);
      return { playerId: memberId(h.playerId, ids), card: card(h.card) };
    },
    1,
    ids.size,
  );
  if (new Set(hands.map((h) => h.playerId)).size !== hands.length) throw invalid();
  return {
    reason: r.reason as LoveLetterRoundResult['reason'],
    hands,
    winners: members(r.winners, ids, 1),
    spyWinner: r.spyWinner === null ? null : memberId(r.spyWinner, ids),
  };
}
function event(
  v: unknown,
  ids: Set<string>,
  round: number,
  revision: number,
  ended: boolean,
): LoveLetterEvent {
  const e = obj(v);
  if (!['play', 'chancellor', 'round-start'].includes(String(e.kind))) throw invalid();
  const r: LoveLetterEvent = {
    kind: e.kind as LoveLetterEvent['kind'],
    playerId: memberId(e.playerId, ids),
    eliminated: members(e.eliminated, ids),
    revision: num(e.revision, 1, revision),
    round: num(e.round, 1, round),
  };
  if (e.card !== undefined) r.card = card(e.card);
  if (e.targetId !== undefined) r.targetId = e.targetId === null ? null : memberId(e.targetId, ids);
  for (const key of ['noTarget', 'missed', 'tied'] as const)
    if (e[key] !== undefined) r[key] = bool(e[key]);
  if (e.guess !== undefined) {
    r.guess = num(e.guess, 0, 9);
    if (r.guess === 1) throw invalid();
  }
  if (e.discarded !== undefined) r.discarded = card(e.discarded);
  if (e.roundResult !== undefined) {
    if (r.round === round && !ended) throw invalid();
    r.roundResult = result(e.roundResult, ids);
  }
  if (
    r.kind === 'play' &&
    (!r.card ||
      (r.card.rank === 1 && r.targetId && r.guess === undefined) ||
      (r.card.rank === 5 && r.targetId && !r.discarded))
  )
    throw invalid();
  return r;
}
function player(v: unknown, viewer: string): LoveLetterPlayer {
  const p = obj(v),
    id = text(p.id);
  const hand = list(
      p.hand,
      (v) => {
        if (id === viewer) return card(v);
        const c = obj(v);
        if (c.hidden !== true) throw invalid();
        return { hidden: true as const };
      },
      0,
      3,
    ),
    handCount = num(p.handCount, 0, 3);
  if (handCount !== hand.length) throw invalid();
  const r: LoveLetterPlayer = {
    id,
    name: text(p.name),
    bot: bool(p.bot),
    score: num(p.score, 0, 100),
    hand,
    handCount,
    discards: list(p.discards, card, 0, 21),
    eliminated: bool(p.eliminated),
    protected: bool(p.protected),
  };
  if (p.forfeited !== undefined) r.forfeited = bool(p.forfeited);
  return r;
}
export function readLoveLetterRoom(v: unknown, viewer: string): LoveLetterRoom {
  const r = obj(v),
    maxPlayers = num(r.maxPlayers, 2, 6),
    players = list(
      r.players,
      (v) => {
        const p = obj(v);
        return {
          id: text(p.id),
          name: text(p.name),
          bot: bool(p.bot),
          online: bool(p.online),
          forfeited: bool(p.forfeited),
          avatar_preset: p.avatar_preset == null ? null : text(p.avatar_preset),
          avatar_file_id: p.avatar_file_id == null ? null : text(p.avatar_file_id),
        };
      },
      1,
      maxPlayers,
    ),
    ids = new Set(players.map((p) => p.id)),
    hostId = memberId(r.hostId, ids);
  if (ids.size !== players.length || !ids.has(viewer)) throw invalid();
  let state: LoveLetterState | null = null;
  if (r.state !== null) {
    const s = obj(r.state);
    if (
      s.version !== 1 ||
      !['action', 'chancellor', 'round-over', 'finished'].includes(String(s.phase))
    )
      throw invalid();
    const boards = list(s.players, (p) => player(p, viewer), 2, 6),
      round = num(s.round, 1),
      revision = num(s.revision),
      ended = s.phase === 'round-over' || s.phase === 'finished';
    if (
      boards.length !== players.length ||
      new Set(boards.map((p) => p.id)).size !== boards.length ||
      boards.some((p) => !ids.has(p.id))
    )
      throw invalid();
    const secrets = list(
      s.private,
      (v) => {
        const p = obj(v);
        if (p.kind !== 'peek') throw invalid();
        const targetId = memberId(p.targetId, ids);
        if (targetId === viewer) throw invalid();
        return {
          kind: 'peek' as const,
          revision: num(p.revision, 1, revision),
          targetId,
          card: card(p.card),
        };
      },
      0,
      21,
    );
    const log = list(s.log, (e) => event(e, ids, round, revision, ended), 0, 80),
      last = s.last === null ? null : event(s.last, ids, round, revision, ended);
    if (
      new Set(secrets.map((p) => p.revision)).size !== secrets.length ||
      secrets.some(
        (p) =>
          !log.some(
            (e) =>
              e.revision === p.revision &&
              e.round === round &&
              e.kind === 'play' &&
              e.playerId === viewer &&
              e.card?.rank === 2 &&
              e.targetId === p.targetId,
          ),
      )
    )
      throw invalid();
    if (last && last.revision !== revision) throw invalid();
    state = {
      version: 1,
      phase: s.phase as LoveLetterState['phase'],
      revision,
      round,
      target: num(s.target, 3, 6),
      players: boards,
      turn: num(s.turn, 0, players.length - 1),
      starter: num(s.starter, 0, players.length - 1),
      deckCount: num(s.deckCount, 0, 21),
      removed: bool(s.removed),
      faceUpRemoved: list(s.faceUpRemoved, card, 0, 3),
      private: secrets,
      chancellor:
        s.chancellor === null ? null : { playerId: memberId(obj(s.chancellor).playerId, ids) },
      roundResult: s.roundResult === null ? null : result(s.roundResult, ids),
      roundWinners: members(s.roundWinners, ids),
      spyWinner: s.spyWinner === null ? null : memberId(s.spyWinner, ids),
      winners: members(s.winners, ids),
      last,
      log,
    };
    if (
      ended !== !!state.roundResult ||
      (state.phase === 'finished' && !state.winners.length) ||
      (state.phase === 'chancellor' && state.chancellor?.playerId !== boards[state.turn].id) ||
      (state.phase === 'chancellor' && boards[state.turn].handCount < 2) ||
      (state.phase === 'action' && boards[state.turn].handCount !== 2) ||
      (!ended && state.roundWinners.length)
    )
      throw invalid();
    const known = [
      ...state.faceUpRemoved,
      ...boards.flatMap((p) => [
        ...p.discards,
        ...p.hand.filter((c): c is LoveLetterCard => !c.hidden),
      ]),
    ].map((c) => c.id);
    if (new Set(known).size !== known.length || known.length > 21) throw invalid();
  }
  return { id: text(r.id), hostId, maxPlayers, players, state };
}
export function readLoveLetterRooms(v: unknown): LoveLetterOpenRoom[] {
  const rooms = list(
    v,
    (v) => {
      const r = obj(v),
        maxPlayers = num(r.maxPlayers, 2, 6);
      return {
        id: text(r.id),
        name: text(r.name),
        players: num(r.players, 1, maxPlayers),
        maxPlayers,
      };
    },
    0,
    500,
  );
  if (new Set(rooms.map((r) => r.id)).size !== rooms.length) throw invalid();
  return rooms;
}
