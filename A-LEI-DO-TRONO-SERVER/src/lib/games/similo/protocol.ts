import { CARD_BY_ID, THEME_IDS, type ThemeId } from './catalog.ts';
import { ELIMINATIONS, validateConfig, type PublicGame } from './rules.ts';
import type { SimiloRoom, SimiloOpenRoom, SimiloSettings } from '../../../types/similo';
const invalid = () => new Error('Dados da mesa de Similo inválidos.');
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid();
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 200) throw invalid();
  return v;
}
function number(v: unknown, min = 0, max = 1000000): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw invalid();
  return v as number;
}
function boolean(v: unknown): boolean {
  if (typeof v !== 'boolean') throw invalid();
  return v;
}
function array<T>(v: unknown, read: (v: unknown) => T, max = 120, min = 0): T[] {
  if (!Array.isArray(v) || v.length > max || v.length < min) throw invalid();
  return v.map(read);
}
function unique<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) throw invalid();
  return values;
}
function card(v: unknown): string {
  const id = text(v);
  if (!CARD_BY_ID.has(id)) throw invalid();
  return id;
}
function themes(v: unknown): ThemeId[] {
  return unique(
    array(
      v,
      (x) => {
        if (!THEME_IDS.includes(x as ThemeId)) throw invalid();
        return x as ThemeId;
      },
      2,
      1,
    ),
  );
}
function settings(v: unknown): SimiloSettings {
  const r = record(v);
  return {
    maxPlayers: number(r.maxPlayers, 2, 8),
    narratorId: text(r.narratorId),
    boardThemes: themes(r.boardThemes),
    clueThemes: themes(r.clueThemes),
  };
}
export function readSimiloRoom(value: unknown, viewer: string): SimiloRoom {
  const r = record(value),
    players = array(
      r.players,
      (v) => {
        const p = record(v);
        return {
          id: text(p.id),
          name: text(p.name),
          online: boolean(p.online),
          avatar_preset: p.avatar_preset == null ? null : text(p.avatar_preset),
          avatar_file_id: p.avatar_file_id == null ? null : text(p.avatar_file_id),
        };
      },
      8,
      1,
    ),
    ids = unique(players.map((p) => p.id)),
    hostId = text(r.hostId),
    options = settings(r.settings);
  if (
    !ids.includes(viewer) ||
    !ids.includes(hostId) ||
    !ids.includes(options.narratorId) ||
    options.maxPlayers < ids.length
  )
    throw invalid();
  let state: PublicGame | null = null;
  if (r.state !== null) {
    const g = record(r.state),
      c = record(g.config),
      config = validateConfig({
        narrator: text(c.narrator),
        guessers: unique(array(c.guessers, text, 7, 1)),
        boardThemes: themes(c.boardThemes),
        clueThemes: themes(c.clueThemes),
      });
    if (
      config.narrator !== options.narratorId ||
      !ids.includes(config.narrator) ||
      config.guessers.length !== ids.length - 1 ||
      config.guessers.some((id) => !ids.includes(id) || id === config.narrator)
    )
      throw invalid();
    if (!['clue', 'vote', 'resolving', 'finished'].includes(g.phase as string)) throw invalid();
    const phase = g.phase as PublicGame['phase'],
      round = number(g.round, 0, 4),
      board = unique(array(g.board, card, 12, 12)),
      eliminated = unique(array(g.eliminated, card, 11)),
      pending = unique(array(g.pending, card, 4)),
      hand = unique(array(g.hand, card, 5));
    if (
      [...eliminated, ...pending].some((id) => !board.includes(id)) ||
      pending.some((id) => eliminated.includes(id)) ||
      hand.some((id) => board.includes(id))
    )
      throw invalid();
    const secretId = g.secretId === null ? null : card(g.secretId),
      narrator = config.narrator === viewer;
    if (secretId !== null && !board.includes(secretId)) throw invalid();
    if (
      (!narrator && phase !== 'finished' && secretId !== null) ||
      (!narrator && hand.length) ||
      ((narrator || phase === 'finished') && secretId === null)
    )
      throw invalid();
    if (g.won !== null && typeof g.won !== 'boolean') throw invalid();
    if ((phase === 'finished') !== (g.won !== null)) throw invalid();
    const voteData = record(g.votes),
      votes = Object.fromEntries(
        config.guessers.map((_, i) => {
          const v = record(voteData[i]),
            selected = unique(array(v.selected, card, ELIMINATIONS[round]));
          if (selected.some((id) => !board.includes(id) || eliminated.includes(id)))
            throw invalid();
          const confirmed = boolean(v.confirmed);
          if (confirmed && selected.length !== ELIMINATIONS[round]) throw invalid();
          return [i, { selected, confirmed }];
        }),
      );
    const clues = array(
      g.clues,
      (v) => {
        const clue = record(v);
        if (clue.relation !== 'like' && clue.relation !== 'unlike') throw invalid();
        return {
          cardId: card(clue.cardId),
          relation: clue.relation,
          round: number(clue.round, 0, 4),
        } as const;
      },
      5,
    );
    if (
      clues.some((c, i) => c.round !== i || board.includes(c.cardId)) ||
      new Set(clues.map((c) => c.cardId)).size !== clues.length
    )
      throw invalid();
    state = {
      id: text(g.id),
      revision: number(g.revision),
      config,
      phase,
      round,
      board,
      eliminated,
      pending,
      hand,
      secretId,
      won: g.won as boolean | null,
      votes,
      clues,
    };
  }
  return {
    id: text(r.id),
    hostId,
    revision: number(r.revision),
    players,
    settings: options,
    state,
  };
}
export function readSimiloRooms(v: unknown): SimiloOpenRoom[] {
  return array(
    v,
    (x) => {
      const r = record(x),
        maxPlayers = number(r.maxPlayers, 2, 8),
        players = number(r.players, 1, maxPlayers);
      return { id: text(r.id), name: text(r.name), maxPlayers, players };
    },
    100,
  );
}
