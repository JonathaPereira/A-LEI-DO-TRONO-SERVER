import type {
  LoveLetterCard,
  LoveLetterPlayer,
  LoveLetterState,
  LoveLetterEvent,
  LoveLetterSecret,
  LoveLetterMove,
} from '../../types/love-letter';

export interface LoveLetterParticipant {
  id: string;
  name?: string;
  bot?: boolean;
}
export interface LoveLetterGamePlayer extends Omit<LoveLetterPlayer, 'hand' | 'handCount'> {
  hand: LoveLetterCard[];
}
/** Authoritative state: this type must never be broadcast without publicState(viewer). */
export interface LoveLetterGameState extends Omit<
  LoveLetterState,
  'players' | 'deckCount' | 'removed' | 'private'
> {
  players: LoveLetterGamePlayer[];
  deck: LoveLetterCard[];
  removed: LoveLetterCard | null;
  private: Record<string, LoveLetterSecret[]>;
}
type LoveLetterActionState = Pick<LoveLetterState, 'phase' | 'turn'> & {
  players: Pick<LoveLetterPlayer, 'id' | 'hand' | 'eliminated' | 'protected'>[];
};
type PendingEvent = Omit<LoveLetterEvent, 'revision' | 'round'>;
type ChancellorMove = Extract<LoveLetterMove, { kind: 'chancellor' }>;
type PlayMove = Extract<LoveLetterMove, { kind: 'play' }>;
const visibleHand = (p: Pick<LoveLetterPlayer, 'hand'>): LoveLetterCard[] =>
  p.hand.filter((c): c is LoveLetterCard => 'rank' in c);
export const version = '2019-2e';

export const cards = [
  {
    rank: 0,
    name: 'Espiã',
    count: 2,
    effect:
      'No fim da rodada, ganhe 1 favor se só você, entre os sobreviventes, jogou ou descartou Espiã. Não precisa vencer a rodada; no máximo 1 favor, mesmo usando as duas.',
  },
  {
    rank: 1,
    name: 'Guarda',
    count: 6,
    effect:
      'Adivinhe a carta de outra pessoa. Não pode dizer Guarda. Se acertar, ela sai da rodada.',
  },
  { rank: 2, name: 'Padre', count: 2, effect: 'Veja em segredo a carta de outra pessoa.' },
  {
    rank: 3,
    name: 'Barão',
    count: 2,
    effect:
      'Compare sua carta com a de outra pessoa. O menor valor sai da rodada; empate não elimina.',
  },
  {
    rank: 4,
    name: 'Aia',
    count: 2,
    effect: 'Você fica protegido dos efeitos de outras pessoas até seu próximo turno.',
  },
  {
    rank: 5,
    name: 'Príncipe',
    count: 2,
    effect: 'Escolha alguém, inclusive você, para descartar a mão e comprar outra carta.',
  },
  {
    rank: 6,
    name: 'Chanceler',
    count: 2,
    effect:
      'Compre até 2 cartas. Guarde uma e devolva as outras ao fundo do baralho, na ordem que escolher.',
  },
  { rank: 7, name: 'Rei', count: 1, effect: 'Troque a mão com a de outra pessoa.' },
  {
    rank: 8,
    name: 'Condessa',
    count: 1,
    effect: 'Se estiver com o Rei ou o Príncipe, você deve jogar a Condessa.',
  },
  {
    rank: 9,
    name: 'Princesa',
    count: 1,
    effect: 'Se jogar ou descartar esta carta, você sai da rodada.',
  },
];
function fail(message: string): never {
  throw Object.assign(Error(message), { code: 'LOVE_LETTER_INVALID_MOVE' });
}
const clone = <T>(s: T): T => JSON.parse(JSON.stringify(s)) as T;
const shuffle = <T>(list: T[], rng: () => number): T[] => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};
function deck(rng: () => number): LoveLetterCard[] {
  return shuffle(
    cards.flatMap((c) =>
      Array.from({ length: c.count }, (_, i) => ({ id: c.rank + '-' + i, rank: c.rank })),
    ),
    rng,
  );
}
export function targetScore(n: number): number | undefined {
  return ({ 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 } as Record<number, number>)[n];
}
function beginRound(s: LoveLetterGameState, starter: number, rng: () => number): void {
  s.round++;
  s.deck = deck(rng);
  s.removed = s.deck.pop()!;
  s.faceUpRemoved = s.players.length === 2 ? s.deck.splice(-3) : [];
  s.phase = 'action';
  s.roundWinners = [];
  s.spyWinner = null;
  s.private = {};
  s.chancellor = null;
  s.roundResult = null;
  for (const p of s.players) {
    p.hand = [s.deck.pop()!];
    p.discards = [];
    p.eliminated = false;
    p.protected = false;
  }
  s.turn = starter;
  s.starter = starter;
  s.players[starter].hand.push(s.deck.pop()!);
}
export function create(
  players: readonly LoveLetterParticipant[],
  rng = Math.random,
): LoveLetterGameState {
  if (
    !Array.isArray(players) ||
    !targetScore(players.length) ||
    new Set(players.map((p) => p.id)).size !== players.length ||
    players.some((p) => typeof p.id !== 'string' || !p.id)
  )
    fail('Escolha de 2 a 6 participantes distintos.');
  const s: LoveLetterGameState = {
    version: 1,
    revision: 0,
    round: 0,
    target: targetScore(players.length)!,
    players: players.map((p) => ({
      id: p.id,
      name: p.name || 'Cortesão',
      bot: !!p.bot,
      score: 0,
      hand: [],
      discards: [],
      eliminated: false,
      protected: false,
    })),
    turn: 0,
    starter: 0,
    log: [],
    last: null,
    winners: [],
    phase: 'action',
    deck: [],
    removed: null,
    faceUpRemoved: [],
    private: {},
    chancellor: null,
    roundResult: null,
    roundWinners: [],
    spyWinner: null,
  };
  beginRound(s, Math.floor(rng() * players.length), rng);
  return s;
}
export function eligible(s: LoveLetterActionState, rank: number): string[] {
  const me = s.players[s.turn];
  return s.players
    .filter((p) => !p.eliminated && !p.protected && (rank === 5 || p.id !== me.id))
    .map((p) => p.id);
}
export function forced(p: Pick<LoveLetterPlayer, 'hand'>): boolean {
  return (
    p.hand.some((c) => 'rank' in c && c.rank === 8) &&
    p.hand.some((c) => 'rank' in c && (c.rank === 5 || c.rank === 7))
  );
}
function eliminate(p: LoveLetterGamePlayer, event: PendingEvent): void {
  p.eliminated = true;
  p.protected = false;
  const c = p.hand.splice(0);
  p.discards.push(...c);
  event.eliminated.push(p.id);
}
function settle(s: LoveLetterGameState, event: PendingEvent): void {
  const survivors = s.players.filter((p) => !p.eliminated);
  if (survivors.length > 1 && s.deck.length) {
    let next = s.turn;
    do {
      next = (next + 1) % s.players.length;
    } while (s.players[next].eliminated);
    s.turn = next;
    const p = s.players[next];
    p.protected = false;
    p.hand.push(s.deck.pop()!);
    s.phase = 'action';
    return;
  }
  const high = Math.max(...survivors.map((p) => p.hand[0].rank));
  s.roundWinners = survivors.filter((p) => p.hand[0].rank === high).map((p) => p.id);
  s.roundWinners.forEach((id) => s.players.find((p) => p.id === id)!.score++);
  const spies = survivors.filter((p) => p.discards.some((c) => c.rank === 0));
  s.spyWinner = spies.length === 1 ? spies[0].id : null;
  if (s.spyWinner) spies[0].score++;
  s.roundResult = {
    reason: survivors.length === 1 ? 'last-survivor' : 'deck-empty',
    hands: survivors.map((p) => ({ playerId: p.id, card: p.hand[0] })),
    winners: [...s.roundWinners],
    spyWinner: s.spyWinner,
  };
  event.roundResult = clone(s.roundResult);
  const reached = s.players.filter((p) => p.score >= s.target);
  s.phase = reached.length ? 'finished' : 'round-over';
  s.winners = reached.map((p) => p.id);
}
export function move(
  input: LoveLetterGameState,
  playerId: string,
  value: unknown,
): LoveLetterGameState {
  const action = value as Record<string, unknown> | null;
  if (!action || typeof action !== 'object') fail('Jogada inválida.');
  const s = clone(input),
    p = s.players[s.turn];
  if (!p || p.id !== playerId || !['action', 'chancellor'].includes(s.phase))
    fail('Aguarde sua vez de jogar.');
  if (s.phase === 'chancellor') {
    if (
      action.kind !== 'chancellor' ||
      typeof action.keep !== 'string' ||
      !Array.isArray(action.bottom) ||
      new Set([action.keep, ...action.bottom]).size !== p.hand.length ||
      action.bottom.length !== p.hand.length - 1 ||
      [action.keep, ...action.bottom].some((id) => !p.hand.some((c) => c.id === id))
    )
      fail('Guarde uma carta e ordene as demais para o fundo.');
    const keep = p.hand.find((c) => c.id === action.keep)!,
      ordered = action.bottom.map((id: unknown) => p.hand.find((c) => c.id === id)!);
    p.hand = [keep];
    s.deck.unshift(...ordered.reverse());
    s.chancellor = null;
    const event: PendingEvent = { kind: 'chancellor', playerId, eliminated: [] };
    settle(s, event);
    return stamp(s, event);
  }
  if (action.kind !== 'play' || typeof action.cardId !== 'string')
    fail('Escolha uma carta da sua mão.');
  const index = p.hand.findIndex((c) => c.id === action.cardId);
  if (index < 0) fail('Essa carta não está na sua mão.');
  const c = p.hand[index],
    rank = c.rank;
  if (forced(p) && rank !== 8) fail('Com Príncipe ou Rei na mão, você precisa jogar a Condessa.');
  const targeted = [1, 2, 3, 5, 7].includes(rank),
    targets = targeted ? eligible(s, rank) : [],
    target = targets.length ? s.players.find((x) => x.id === action.targetId) : null;
  if (
    targets.length &&
    !targets.includes(typeof action.targetId === 'string' ? action.targetId : '')
  )
    fail('Escolha um alvo disponível.');
  if (!targets.length && action.targetId) fail('Não há alvo disponível para essa carta.');
  if (
    rank === 1 &&
    target &&
    (typeof action.guess !== 'number' ||
      !Number.isInteger(action.guess) ||
      action.guess < 0 ||
      action.guess > 9 ||
      action.guess === 1)
  )
    fail('Escolha uma carta de 0 a 9, exceto Guarda.');
  p.hand.splice(index, 1);
  p.discards.push(c);
  const event: PendingEvent = {
    kind: 'play',
    playerId,
    card: c,
    targetId: target?.id || null,
    eliminated: [],
  };
  if (targeted && !target) event.noTarget = true;
  if (rank === 1 && target) {
    event.guess = action.guess as number;
    if (target.hand[0].rank === action.guess) eliminate(target, event);
    else event.missed = true;
  }
  if (rank === 2 && target) {
    (s.private[playerId] ??= []).push({
      revision: s.revision + 1,
      kind: 'peek',
      targetId: target.id,
      card: clone(target.hand[0]),
    });
  }
  if (rank === 3 && target) {
    const a = p.hand[0].rank,
      b = target.hand[0].rank;
    if (a < b) eliminate(p, event);
    else if (b < a) eliminate(target, event);
    else event.tied = true;
  }
  if (rank === 4) p.protected = true;
  if (rank === 5 && target) {
    const discarded = target.hand.pop()!;
    target.discards.push(discarded);
    event.discarded = discarded;
    if (discarded.rank === 9) eliminate(target, event);
    else {
      let replacement;
      if (s.deck.length) replacement = s.deck.pop()!;
      else {
        replacement = s.removed;
        s.removed = null;
      }
      if (replacement) target.hand = [replacement];
      else fail('Não há carta de reposição.');
    }
  }
  if (rank === 6) {
    p.hand.push(...s.deck.splice(Math.max(0, s.deck.length - 2)).reverse());
    if (p.hand.length > 1) {
      s.phase = 'chancellor';
      s.chancellor = { playerId };
      return stamp(s, event);
    }
  }
  if (rank === 7 && target) {
    [p.hand, target.hand] = [target.hand, p.hand];
  }
  if (rank === 9) eliminate(p, event);
  settle(s, event);
  return stamp(s, event);
}
function stamp(s: LoveLetterGameState, event: PendingEvent): LoveLetterGameState {
  s.revision++;
  const stamped = Object.assign(event, { revision: s.revision, round: s.round });
  s.last = stamped;
  s.log.push(stamped);
  if (s.log.length > 80) s.log.shift();
  return s;
}
export function nextRound(input: LoveLetterGameState, rng = Math.random): LoveLetterGameState {
  if (!input || input.phase !== 'round-over') fail('A rodada ainda não terminou.');
  const s = clone(input),
    w = s.roundWinners[Math.floor(rng() * s.roundWinners.length)],
    starter = s.players.findIndex((p) => p.id === w);
  beginRound(s, starter, rng);
  return stamp(s, { kind: 'round-start', playerId: s.players[starter].id, eliminated: [] });
}
export function publicState(input: LoveLetterGameState, viewer: string): LoveLetterState {
  const { deck, removed, private: secrets, players, ...view } = clone(input);
  return {
    ...view,
    deckCount: deck.length,
    removed: !!removed,
    private: secrets[viewer] || [],
    players: players.map((p) => ({
      ...p,
      handCount: p.hand.length,
      hand: p.id === viewer ? p.hand : p.hand.map(() => ({ hidden: true as const })),
    })),
  };
}
export function legalActions(s: LoveLetterActionState): LoveLetterMove[] {
  const p = s.players[s.turn],
    hand = visibleHand(p);
  if (s.phase === 'chancellor') {
    const out: LoveLetterMove[] = [];
    for (const c of hand) {
      const rest = hand.filter((x) => x.id !== c.id).map((x) => x.id);
      out.push({ kind: 'chancellor', keep: c.id, bottom: rest });
      if (rest.length === 2)
        out.push({ kind: 'chancellor', keep: c.id, bottom: [...rest].reverse() });
    }
    return out;
  }
  if (s.phase !== 'action') return [];
  const out: LoveLetterMove[] = [];
  for (const c of hand) {
    if (forced(p) && c.rank !== 8) continue;
    const ids = [1, 2, 3, 5, 7].includes(c.rank) ? eligible(s, c.rank) : [];
    if (!ids.length) out.push({ kind: 'play', cardId: c.id });
    else
      for (const targetId of ids) {
        if (c.rank === 1)
          for (const guess of [0, 2, 3, 4, 5, 6, 7, 8, 9])
            out.push({ kind: 'play', cardId: c.id, targetId, guess });
        else out.push({ kind: 'play', cardId: c.id, targetId });
      }
  }
  return out;
}
export function botMove(s: LoveLetterActionState, rng = Math.random): LoveLetterMove | undefined {
  const actions = legalActions(s),
    p = s.players[s.turn],
    hand = visibleHand(p);
  if (s.phase === 'chancellor')
    return actions
      .filter((a): a is ChancellorMove => a.kind === 'chancellor')
      .sort(
        (a, b) => hand.find((c) => c.id === b.keep)!.rank - hand.find((c) => c.id === a.keep)!.rank,
      )[0];
  const score = (a: PlayMove) => {
    const c = hand.find((c) => c.id === a.cardId)!;
    let v = 10 - c.rank;
    if (c.rank === 9) v = -100;
    if (c.rank === 4) v += 1;
    if (c.rank === 5 && a.targetId === p.id) v -= 4;
    return v;
  };
  return actions
    .filter((a): a is PlayMove => a.kind === 'play')
    .map((a) => ({ a, v: score(a) + rng() * 0.5 }))
    .sort((a, b) => b.v - a.v)[0]?.a;
}
