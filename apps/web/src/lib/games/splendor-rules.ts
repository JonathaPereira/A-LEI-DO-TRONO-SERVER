import type {
  SplendorState,
  SplendorPlayer,
  SplendorCard,
  SplendorNoble,
  SplendorMove,
  SplendorReserve,
  SplendorEvent,
} from '../../types/splendor';
import * as D from './splendor-data.ts';

export interface SplendorParticipant {
  id: string;
  name: string;
  bot?: boolean;
}
export interface SplendorGamePlayer extends Omit<SplendorPlayer, 'reserved'> {
  reserved: SplendorCard[];
}
/** Authoritative decks and reserved cards must be projected per viewer before broadcast. */
export interface SplendorGameState extends Omit<SplendorState, 'deckCounts' | 'players'> {
  decks: SplendorCard[][];
  players: SplendorGamePlayer[];
}
type WorkingState = Omit<SplendorGameState, 'last'> & {
  last: Omit<SplendorEvent, 'revision' | 'score'> | null;
};
type Wallet = Pick<SplendorPlayer, 'tokens' | 'bonuses'>;
type SplendorBoardState = Pick<
  SplendorState,
  'phase' | 'turn' | 'eligible' | 'players' | 'bank' | 'market' | 'nobles'
> & { decks?: SplendorCard[][]; deckCounts?: number[] };
const visibleCard = (value: SplendorCard | SplendorReserve | null): value is SplendorCard =>
  !!value && 'id' in value;

export const colors = ['Diamante', 'Safira', 'Esmeralda', 'Rubi', 'Ônix', 'Ouro'];
export const symbols = ['◇', '●', '⬢', '◆', '⬟', '✦'];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const sum = (a: readonly number[]): number => a.reduce((a, b) => a + b, 0);
const zero = (): number[] => Array(6).fill(0);
function fail(message: string): never {
  throw Object.assign(Error(message), { code: 'SPLENDOR_INVALID_MOVE' });
}
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const a = copy([...values]);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function create(
  players: readonly SplendorParticipant[],
  random = Math.random,
): SplendorGameState {
  if (
    !Array.isArray(players) ||
    players.length < 2 ||
    players.length > 4 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    fail('A mesa precisa de 2 a 4 participantes diferentes.');
  const decks = [1, 2, 3].map((l) =>
      shuffle(
        D.cards.filter((c) => c.level === l),
        random,
      ),
    ),
    market = decks.map((d) => d.splice(0, 4)),
    starter = Math.floor(random() * players.length);
  return {
    version: 1,
    phase: 'action',
    revision: 0,
    round: 1,
    turn: starter,
    starter,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      tokens: zero(),
      bonuses: Array(5).fill(0),
      cards: [],
      reserved: [],
      nobles: [],
      score: 0,
      turns: 0,
    })),
    bank: [...Array(5).fill(players.length === 2 ? 4 : players.length === 3 ? 5 : 7), 5],
    decks,
    market,
    nobles: shuffle(D.nobles, random).slice(0, players.length + 1),
    eligible: [],
    finalRound: false,
    winners: [],
    last: null,
    log: [],
  };
}
export const cardById = (id: string) => D.cards.find((c) => c.id === id);
export function price(p: Pick<SplendorPlayer, 'bonuses'>, card: SplendorCard): number[] {
  return card.cost.map((n, i) => Math.max(0, n - p.bonuses[i]));
}
export function payment(p: Wallet, card: SplendorCard): number[] | null {
  const due = price(p, card),
    pay = zero();
  due.forEach((n, i) => {
    pay[i] = Math.min(n, p.tokens[i]);
    pay[5] += n - pay[i];
  });
  return pay[5] <= p.tokens[5] ? pay : null;
}
export function eligibleNobles(
  s: Pick<SplendorState, 'nobles'>,
  p: Pick<SplendorPlayer, 'bonuses'>,
): SplendorNoble[] {
  return s.nobles.filter((n) => n.cost.every((n, i) => p.bonuses[i] >= n));
}
function vector(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === 6 &&
    v.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 10)
  );
}
function finishTurn(s: WorkingState): void {
  const p = s.players[s.turn];
  p.turns++;
  if (p.score >= 15) s.finalRound = true;
  const next = (s.turn + 1) % s.players.length;
  if (s.finalRound && next === s.starter) {
    s.phase = 'finished';
    const best = Math.max(...s.players.map((p) => p.score)),
      tied = s.players.filter((p) => p.score === best),
      least = Math.min(...tied.map((p) => p.cards.length));
    s.winners = tied.filter((p) => p.cards.length === least).map((p) => p.id);
  } else {
    s.turn = next;
    s.phase = 'action';
    if (next === s.starter) s.round++;
  }
  s.eligible = [];
}
function visit(s: WorkingState): void {
  const p = s.players[s.turn],
    eligible = eligibleNobles(s, p);
  if (eligible.length > 1) {
    s.phase = 'noble';
    s.eligible = eligible.map((n) => n.id);
  } else {
    if (eligible.length) claim(s, eligible[0].id);
    finishTurn(s);
  }
}
function claim(s: WorkingState, id: string): void {
  const n = s.nobles.find((n) => n.id === id)!,
    p = s.players[s.turn];
  p.nobles.push(n);
  p.score += n.points;
  s.nobles = s.nobles.filter((n) => n.id !== id);
  s.last!.noble = copy(n);
  s.last!.points += n.points;
}
function returnTokens(s: WorkingState, p: Wallet, v: unknown): number[] {
  const excess = Math.max(0, sum(p.tokens) - 10);
  v = v ?? zero();
  if (!vector(v) || sum(v) !== excess || v.some((n, i) => n > p.tokens[i]))
    fail(
      excess
        ? 'Devolva exatamente ' + excess + ' ficha(s) para ficar com 10.'
        : 'Não é necessário devolver fichas.',
    );
  v.forEach((n, i) => {
    p.tokens[i] -= n;
    s.bank[i] += n;
  });
  return v;
}
export function move(state: SplendorGameState, id: string, input: unknown): SplendorGameState {
  if (!['action', 'noble'].includes(state.phase) || state.players[state.turn]?.id !== id)
    fail('Aguarde a sua vez.');
  const m = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const s: WorkingState = copy(state),
    p = s.players[s.turn];
  if (s.phase === 'noble') {
    if (m.kind !== 'noble' || typeof m.id !== 'string' || !s.eligible.includes(m.id))
      fail('Escolha um dos nobres disponíveis.');
    s.last = { kind: 'noble', playerId: id, points: 0 };
    claim(s, m.id);
    finishTurn(s);
  } else {
    s.last = { kind: m.kind as SplendorMove['kind'], playerId: id, points: 0 };
    if (m.kind === 'take') {
      const v = m.tokens;
      if (!vector(v) || v[5]) fail('Escolha fichas coloridas; ouro só vem de reservas.');
      const count = sum(v),
        distinct = v.filter(Boolean).length;
      if (
        !(
          (count >= 1 && count <= 3 && distinct === count) ||
          (count === 2 && distinct === 1 && s.bank[v.findIndex(Boolean)] >= 4)
        ) ||
        v.some((n, i) => n > s.bank[i])
      )
        fail('Pegue até 3 cores diferentes ou 2 iguais de uma pilha com pelo menos 4 fichas.');
      v.forEach((n, i) => {
        p.tokens[i] += n;
        s.bank[i] -= n;
      });
      s.last.tokens = copy(v);
      s.last.returned = returnTokens(s, p, m.returnTokens);
    } else if (m.kind === 'reserve') {
      if (p.reserved.length >= 3) fail('O limite é de 3 cartas reservadas.');
      let card;
      if (
        typeof m.level === 'number' &&
        Number.isInteger(m.level) &&
        m.level >= 1 &&
        m.level <= 3
      ) {
        const deck = s.decks[m.level - 1];
        if (!deck.length) fail('Esse baralho acabou.');
        card = deck.shift()!;
        s.last.blind = true;
      } else {
        const found = locate(s, m.id);
        if (!found) fail('Essa carta não está disponível no mercado.');
        card = found.card;
        s.market[found.level][found.slot] = s.decks[found.level].shift() || null;
        s.last.card = copy(card);
      }
      p.reserved.push(card);
      const gold = Math.min(1, s.bank[5]);
      p.tokens[5] += gold;
      s.bank[5] -= gold;
      s.last.gold = gold;
      s.last.level = card.level;
      s.last.returned = returnTokens(s, p, m.returnTokens);
    } else if (m.kind === 'buy') {
      const found = locate(s, m.id),
        reserved = p.reserved.find((c) => c.id === m.id),
        card = reserved || found?.card;
      if (!card) fail('Escolha uma carta do mercado ou da sua reserva.');
      const due = price(p, card),
        pay = m.payment ?? payment(p, card);
      if (
        !vector(pay) ||
        pay.some((n, i) => n > p.tokens[i]) ||
        due.some((n, i) => pay[i] > n) ||
        pay[5] !== due.reduce((n, d, i) => n + d - pay[i], 0)
      )
        fail('As fichas e o ouro precisam pagar exatamente o custo após os bônus.');
      pay.forEach((n, i) => {
        p.tokens[i] -= n;
        s.bank[i] += n;
      });
      if (reserved) p.reserved = p.reserved.filter((c) => c.id !== m.id);
      else s.market[found!.level][found!.slot] = s.decks[found!.level].shift() || null;
      p.cards.push(card);
      p.bonuses[card.bonus]++;
      p.score += card.points;
      s.last.card = copy(card);
      s.last.payment = copy(pay);
      s.last.points = card.points;
    } else if (m.kind === 'pass') {
      if (legalActions(s).length) fail('Há uma ação disponível; não é possível passar.');
    } else fail('Escolha pegar fichas, reservar ou comprar uma carta.');
    visit(s);
  }
  s.revision++;
  const last = Object.assign(s.last!, {
    revision: s.revision,
    score: s.players.find((p) => p.id === id)!.score,
  });
  s.log.push(copy(last));
  s.log = s.log.slice(-30);
  return { ...s, last };
}
function locate(s: Pick<SplendorState, 'market'>, id: unknown) {
  if (typeof id !== 'string') return null;
  for (let level = 0; level < 3; level++) {
    const slot = s.market[level].findIndex((c) => c?.id === id);
    if (slot >= 0) return { level, slot, card: s.market[level][slot]! };
  }
  return null;
}
export function legalActions(s: SplendorBoardState): SplendorMove[] {
  if (s.phase === 'noble') return s.eligible.map((id) => ({ kind: 'noble', id }));
  if (s.phase !== 'action') return [];
  const p = s.players[s.turn],
    out: SplendorMove[] = [];
  for (const c of [...s.market.flat().filter(visibleCard), ...p.reserved.filter(visibleCard)])
    if (payment(p, c)) out.push({ kind: 'buy', id: c.id });
  const available = [0, 1, 2, 3, 4].filter((i) => s.bank[i] > 0);
  for (let mask = 1; mask < 1 << available.length; mask++) {
    const indices = available.filter((_, j) => mask & (1 << j));
    if (indices.length <= 3) {
      const tokens = zero();
      indices.forEach((i) => (tokens[i] = 1));
      out.push({ kind: 'take', tokens });
    }
  }
  for (let i = 0; i < 5; i++)
    if (s.bank[i] >= 4) {
      const tokens = zero();
      tokens[i] = 2;
      out.push({ kind: 'take', tokens });
    }
  if (p.reserved.length < 3) {
    for (const c of s.market.flat().filter(visibleCard)) out.push({ kind: 'reserve', id: c.id });
    for (let level = 1; level <= 3; level++)
      if ((s.decks?.[level - 1]?.length ?? s.deckCounts?.[level - 1] ?? 0) > 0)
        out.push({ kind: 'reserve', level });
  }
  return out;
}
export function botMove(s: SplendorBoardState, random = Math.random): SplendorMove {
  const p = s.players[s.turn],
    actions = legalActions(s);
  if (!actions.length) return { kind: 'pass' };
  if (s.phase === 'noble') return actions[0];
  const cards = [...s.market.flat().filter(visibleCard), ...p.reserved.filter(visibleCard)],
    nobleValue = (c: number) => s.nobles.filter((n) => n.cost[c] > p.bonuses[c]).length * 0.25;
  const buys = actions.filter((a) => a.kind === 'buy');
  if (buys.length)
    return buys.sort((a, b) => {
      const value = (a: Extract<SplendorMove, { kind: 'buy' }>) => {
        const c = cardById(a.id)!;
        return c.points * 4 + 1 + nobleValue(c.bonus) - sum(price(p, c)) * 0.05;
      };
      return value(b) - value(a);
    })[0];
  const targets = cards
    .map((c) => {
      const due = price(p, c),
        missing = due.map((n, i) => Math.max(0, n - p.tokens[i])),
        distance = Math.max(0, sum(missing) - p.tokens[5]);
      return {
        c,
        missing,
        distance,
        value:
          (c.points * 1.5 + 3 + nobleValue(c.bonus)) / (distance + 1) +
          (p.reserved.some((r) => 'id' in r && r.id === c.id) ? 0.2 : 0),
      };
    })
    .sort((a, b) => b.value - a.value);
  const target = targets[0];
  let best: SplendorMove | null = null,
    weight = -Infinity;
  for (const a of actions) {
    let score = -10;
    if (a.kind === 'take')
      score =
        a.tokens.reduce((v, n, i) => v + n * (target?.missing[i] ? 2 : 0.15), 0) -
        Math.max(0, sum(p.tokens) + sum(a.tokens) - 10) * 1.1;
    if (a.kind === 'reserve' && a.id && s.bank[5] && target?.c.id === a.id && target.distance <= 2)
      score = 2.7;
    score += random() * 0.05;
    if (score > weight) {
      best = a;
      weight = score;
    }
  }
  best = copy(best!);
  const held = copy(p.tokens);
  if (best.kind === 'take') best.tokens.forEach((n, i) => (held[i] += n));
  if (best.kind === 'reserve') held[5] += Math.min(1, s.bank[5]);
  let excess = Math.max(0, sum(held) - 10);
  if (excess) {
    const returns = zero();
    const order = [0, 1, 2, 3, 4, 5].sort(
      (a, b) => (a === 5 ? 20 : target?.missing[a] || 0) - (b === 5 ? 20 : target?.missing[b] || 0),
    );
    for (const i of order)
      while (excess && held[i] > 0) {
        returns[i]++;
        held[i]--;
        excess--;
      }
    best.returnTokens = returns;
  }
  return best;
}
export function publicState(s: SplendorGameState, viewer: string): SplendorState {
  const { decks, players, ...out } = copy(s);
  return {
    ...out,
    deckCounts: decks.map((d) => d.length),
    players: players.map((p) => ({
      ...p,
      reserved:
        p.id === viewer
          ? p.reserved
          : p.reserved.map((c) => ({ hidden: true as const, level: c.level })),
    })),
  };
}
