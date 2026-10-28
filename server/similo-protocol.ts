import { object } from './http-api.ts';
import { THEME_IDS, CARD_BY_ID, type ThemeId } from '../src/lib/games/similo/catalog.ts';
import type { SimiloCommand, SimiloSettings, SimiloMove } from '../src/types/similo';
export const similoFailure = (code: string, message: string) =>
  Object.assign(new Error(message), { code: 'SIMILO_' + code });
const bad = () => similoFailure('ACTION', 'Comando de Similo inválido.');
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 128) throw bad();
  return v;
}
function revision(v: unknown): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw bad();
  return v as number;
}
function themes(v: unknown): ThemeId[] {
  if (
    !Array.isArray(v) ||
    v.length < 1 ||
    v.length > 2 ||
    new Set(v).size !== v.length ||
    v.some((x) => !THEME_IDS.includes(x))
  )
    throw bad();
  return [...v];
}
function settings(v: unknown): Omit<SimiloSettings, 'narratorId'> {
  if (
    !object(v) ||
    !Number.isInteger(v.maxPlayers) ||
    (v.maxPlayers as number) < 2 ||
    (v.maxPlayers as number) > 8
  )
    throw bad();
  return {
    boardThemes: themes(v.boardThemes),
    clueThemes: themes(v.clueThemes),
    maxPlayers: v.maxPlayers as number,
  };
}
function cards(v: unknown): string[] {
  if (
    !Array.isArray(v) ||
    v.length > 4 ||
    new Set(v).size !== v.length ||
    v.some((x) => typeof x !== 'string' || !CARD_BY_ID.has(x))
  )
    throw bad();
  return [...v];
}
function move(v: unknown): SimiloMove {
  if (!object(v)) throw bad();
  switch (v.kind) {
    case 'clue':
      if (
        typeof v.cardId !== 'string' ||
        !CARD_BY_ID.has(v.cardId) ||
        (v.relation !== 'like' && v.relation !== 'unlike')
      )
        throw bad();
      return { kind: 'clue', cardId: v.cardId, relation: v.relation };
    case 'vote':
      if (typeof v.confirmed !== 'boolean') throw bad();
      return { kind: 'vote', selected: cards(v.selected), confirmed: v.confirmed };
    case 'reopen':
      return { kind: 'reopen' };
    case 'resolve':
      return { kind: 'resolve', selected: cards(v.selected) };
    default:
      throw bad();
  }
}
export function readSimiloCommand(v: unknown): SimiloCommand {
  if (!object(v)) throw bad();
  if (v.requestId !== undefined) text(v.requestId);
  switch (v.action) {
    case 'list':
    case 'leave':
    case 'state':
      return { action: v.action };
    case 'create':
      return { action: v.action, settings: settings(v.settings) };
    case 'join':
    case 'resume':
      return { action: v.action, roomId: text(v.roomId) };
    case 'configure':
      if (!object(v.settings)) throw bad();
      return {
        action: v.action,
        revision: revision(v.revision),
        settings: { ...settings(v.settings), narratorId: text(v.settings.narratorId) },
      };
    case 'start':
    case 'rematch':
      return { action: v.action, revision: revision(v.revision) };
    case 'move':
      return { action: v.action, revision: revision(v.revision), move: move(v.move) };
    default:
      throw bad();
  }
}
