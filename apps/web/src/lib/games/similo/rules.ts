import { pool, THEME_IDS, type ThemeId } from './catalog.ts';

export const ELIMINATIONS = [1, 2, 3, 4, 1] as const;
export type Relation = 'like' | 'unlike';
export interface Config {
  boardThemes: ThemeId[];
  clueThemes: ThemeId[];
  narrator: string;
  guessers: string[];
}
export interface Vote {
  selected: string[];
  confirmed: boolean;
}
export interface Clue {
  cardId: string;
  relation: Relation;
  round: number;
}
export interface Game {
  id: string;
  config: Config;
  revision: number;
  round: number;
  phase: 'clue' | 'vote' | 'resolving' | 'finished';
  board: string[];
  secretId: string;
  hand: string[];
  drawPile: string[];
  clues: Clue[];
  eliminated: string[];
  votes: Record<string, Vote>;
  pending: string[];
  won: boolean | null;
}
export type Role = { kind: 'narrator' } | { kind: 'guesser'; index: number };
let sequence = 0;
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateConfig(config: Config): Config {
  for (const list of [config.boardThemes, config.clueThemes]) {
    requireRule(
      Array.isArray(list) && list.length >= 1 && list.length <= 2,
      'Escolha um ou dois temas para cada baralho.',
    );
    requireRule(
      new Set(list).size === list.length && list.every((id) => THEME_IDS.includes(id)),
      'Os temas precisam ser válidos e diferentes.',
    );
  }
  requireRule(
    config.guessers.length >= 1 && config.guessers.length <= 7,
    'A mesa precisa de um a sete adivinhadores.',
  );
  const names = [config.narrator, ...config.guessers].map((name) => name.trim());
  requireRule(
    names.every((name) => name.length >= 1 && name.length <= 128),
    'Preencha identificadores válidos.',
  );
  requireRule(
    new Set(names.map((name) => name.toLocaleLowerCase('pt-BR'))).size === names.length,
    'Use um nome diferente para cada pessoa.',
  );
  return {
    boardThemes: [...config.boardThemes],
    clueThemes: [...config.clueThemes],
    narrator: names[0],
    guessers: names.slice(1),
  };
}
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const value = random();
    requireRule(Number.isFinite(value) && value >= 0 && value < 1, 'Sorteio inválido.');
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function blankVotes(config: Config): Record<string, Vote> {
  return Object.fromEntries(
    config.guessers.map((_, index) => [String(index), { selected: [], confirmed: false }]),
  );
}
export function createGame(input: Config, random: () => number = Math.random): Game {
  const config = validateConfig(input);
  const board = shuffle(pool(config.boardThemes), random)
    .slice(0, 12)
    .map((card) => card.id);
  const deck = shuffle(
    pool(config.clueThemes).filter((card) => !board.includes(card.id)),
    random,
  ).map((card) => card.id);
  requireRule(deck.length >= 9, 'Não há cartas suficientes para as cinco pistas.');
  const secretId = shuffle(board, random)[0];
  return {
    id: `local-${Date.now()}-${++sequence}`,
    config,
    revision: 0,
    round: 0,
    phase: 'clue',
    board,
    secretId,
    hand: deck.slice(0, 5),
    drawPile: deck.slice(5),
    clues: [],
    eliminated: [],
    votes: blankVotes(config),
    pending: [],
    won: null,
  };
}
export function playClue(game: Game, cardId: string, relation: Relation): Game {
  requireRule(game.phase === 'clue', 'Aguarde a vez do informante.');
  requireRule(game.hand.includes(cardId), 'Escolha uma carta da mão do informante.');
  requireRule(relation === 'like' || relation === 'unlike', 'Indique semelhança ou diferença.');
  const hand = game.hand.filter((id) => id !== cardId);
  const replenish = game.round < 4 && game.drawPile.length > 0;
  return {
    ...game,
    revision: game.revision + 1,
    phase: 'vote',
    hand: replenish ? [...hand, game.drawPile[0]] : hand,
    drawPile: replenish ? game.drawPile.slice(1) : game.drawPile,
    clues: [...game.clues, { cardId, relation, round: game.round }],
    votes: blankVotes(game.config),
  };
}
export function setVote(game: Game, voter: number, selected: readonly string[]): Game {
  requireRule(game.phase === 'vote', 'A votação ainda não está aberta.');
  requireRule(
    Number.isInteger(voter) && voter >= 0 && voter < game.config.guessers.length,
    'Adivinhador inválido.',
  );
  requireRule(!game.votes[voter].confirmed, 'Reabra seu voto antes de alterar a seleção.');
  requireRule(
    new Set(selected).size === selected.length && selected.length <= ELIMINATIONS[game.round],
    'Selecione a quantidade pedida, sem repetir cartas.',
  );
  requireRule(
    selected.every((id) => game.board.includes(id) && !game.eliminated.includes(id)),
    'Só é possível votar em cartas que continuam na mesa.',
  );
  return {
    ...game,
    revision: game.revision + 1,
    votes: {
      ...game.votes,
      [voter]: { selected: [...selected], confirmed: false },
    },
  };
}
export function confirmVote(game: Game, voter: number): Game {
  requireRule(game.phase === 'vote' && !!game.votes[voter], 'A votação não está disponível.');
  requireRule(
    game.votes[voter].selected.length === ELIMINATIONS[game.round],
    `Escolha exatamente ${ELIMINATIONS[game.round]} carta(s).`,
  );
  requireRule(!game.votes[voter].confirmed, 'Esse voto já foi confirmado.');
  return {
    ...game,
    revision: game.revision + 1,
    votes: {
      ...game.votes,
      [voter]: { ...game.votes[voter], confirmed: true },
    },
  };
}
export function reopenVote(game: Game, voter: number): Game {
  requireRule(game.phase === 'vote' && !!game.votes[voter], 'A votação não está disponível.');
  return {
    ...game,
    revision: game.revision + 1,
    votes: {
      ...game.votes,
      [voter]: { ...game.votes[voter], confirmed: false },
    },
  };
}
export function consensus(game: Pick<Game, 'votes' | 'phase' | 'round'>): {
  ready: boolean;
  confirmed: number;
  selected: string[];
  disagreement: boolean;
} {
  const votes = Object.values(game.votes);
  const confirmed = votes.filter((vote) => vote.confirmed).length;
  const first = votes[0]?.selected ?? [];
  const same = votes.every(
    (vote) =>
      vote.selected.length === first.length && vote.selected.every((id) => first.includes(id)),
  );
  return {
    ready:
      game.phase === 'vote' &&
      confirmed === votes.length &&
      same &&
      first.length === ELIMINATIONS[game.round],
    confirmed,
    selected: [...first],
    disagreement: confirmed === votes.length && !same,
  };
}
export function captain(game: Pick<Game, 'round' | 'config'>): number {
  return game.round % game.config.guessers.length;
}
export function beginElimination(game: Game, voter: number, selected: readonly string[]): Game {
  const agreement = consensus(game);
  requireRule(
    game.phase === 'vote' && agreement.confirmed === game.config.guessers.length,
    'Aguarde todos confirmarem seus votos.',
  );
  requireRule(voter === captain(game), 'Somente o capitão desta rodada pode decidir.');
  requireRule(
    Array.isArray(selected) &&
      selected.length === ELIMINATIONS[game.round] &&
      new Set(selected).size === selected.length &&
      selected.every((id) => game.board.includes(id) && !game.eliminated.includes(id)),
    'Escolha a quantidade indicada de cartas que continuam na mesa.',
  );
  requireRule(
    !agreement.ready || selected.every((id) => agreement.selected.includes(id)),
    'A mesa concordou: confirme a seleção unânime.',
  );
  return {
    ...game,
    revision: game.revision + 1,
    phase: 'resolving',
    pending: game.board.filter((id) => selected.includes(id)),
  };
}
export function finishElimination(game: Game, expectedRevision: number): Game {
  // An animation from a previous turn cannot advance a newer turn.
  if (game.phase !== 'resolving' || game.revision !== expectedRevision) return game;
  const eliminated = [...game.eliminated, ...game.pending];
  const lost = game.pending.includes(game.secretId);
  const finished = lost || game.round === 4;
  return {
    ...game,
    revision: game.revision + 1,
    eliminated,
    pending: [],
    round: finished ? game.round : game.round + 1,
    phase: finished ? 'finished' : 'clue',
    won: finished ? !lost : null,
    votes: blankVotes(game.config),
  };
}
export interface PublicGame {
  id: string;
  revision: number;
  config: Config;
  phase: Game['phase'];
  round: number;
  board: string[];
  clues: Clue[];
  eliminated: string[];
  votes: Record<string, Vote>;
  pending: string[];
  won: boolean | null;
  secretId: string | null;
  hand: string[];
}
/** The server chooses viewerId from the authenticated connection, never a client role. */
export function publicState(game: Game, viewerId: string): PublicGame {
  const narrator = game.config.narrator === viewerId;
  return structuredClone({
    id: game.id,
    revision: game.revision,
    config: game.config,
    phase: game.phase,
    round: game.round,
    board: game.board,
    clues: game.clues,
    eliminated: game.eliminated,
    votes: game.votes,
    pending: game.pending,
    won: game.won,
    secretId: narrator || game.phase === 'finished' ? game.secretId : null,
    hand: narrator ? game.hand : [],
  });
}
