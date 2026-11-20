import { TicketToRideData as D } from './ticket-to-ride-data.ts';
import type {
  TicketToRideCardColor,
  TicketToRideMove,
  TicketToRidePaymentOption,
  TicketToRidePlayerInput,
  TicketToRidePlayerResult,
  TicketToRidePublicPlayer,
  TicketToRidePublicState,
  TicketToRideRoute,
  TicketToRideState,
  TicketToRideStatePlayer,
} from '../../types/ticket-to-ride';

type RulesBoardLike = {
  claimed: Record<string, string>;
  players: readonly { id: string }[];
};

type RulesPlayerLike = {
  id: string;
  trains: number;
  hand: readonly TicketToRideCardColor[] | null;
};

function fail(message: string): never {
  throw Object.assign(Error(message), { code: 'TICKET_TO_RIDE_INVALID_MOVE' });
}

const shuffle = <T>(array: T[], random: () => number): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
};

function draw(s: TicketToRideState): TicketToRideCardColor | undefined {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s.discard.splice(0), s.random);
  }
  return s.deck.pop();
}

function refill(s: TicketToRideState): void {
  while (s.market.length < 5) {
    const card = draw(s);
    if (!card) break;
    s.market.push(card);
  }
  // With fewer than three non-locomotives in the entire available supply a legal
  // five-card display is impossible. Leave it drawable rather than looping forever.
  const supply = [...s.market, ...s.deck, ...s.discard];
  if (
    s.market.filter((c) => c === 'loco').length >= 3 &&
    supply.filter((c) => c !== 'loco').length >= 3
  ) {
    // Discard the display and draw from the existing deck. Shuffle discards
    // only when that deck runs out, preserving the tabletop draw order.
    for (let n = 0; n < 100; n++) {
      s.discard.push(...s.market.splice(0));
      while (s.market.length < 5) {
        const card = draw(s);
        if (!card) break;
        s.market.push(card);
      }
      if (s.market.filter((c) => c === 'loco').length < 3) return;
    }
    // A deterministic/random-source edge case must not lock the server.
    const market = shuffle([...s.market, ...s.deck, ...s.discard], s.random);
    const non = market.filter((c) => c !== 'loco');
    const locos = market.filter((c) => c === 'loco');
    s.discard = [];
    s.market = non.splice(0, 3);
    s.deck = shuffle([...non, ...locos], s.random);
    while (s.market.length < 5) {
      const next = s.deck.pop();
      if (!next) break;
      s.market.push(next);
    }
  }
}

export function create(
  players: readonly TicketToRidePlayerInput[],
  { random = Math.random }: { random?: () => number } = {},
): TicketToRideState {
  if (
    !Array.isArray(players) ||
    players.length < 2 ||
    players.length > 5 ||
    new Set(players.map((p) => p.id)).size !== players.length
  ) {
    fail('Escolha de 2 a 5 participantes distintos.');
  }
  const s: TicketToRideState = {
    revision: 0,
    phase: 'setup',
    turn: Math.floor(random() * players.length),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      forfeited: !!p.forfeited,
      trains: 45,
      score: 0,
      hand: [],
      tickets: [],
      pending: [],
      initial: true,
    })),
    deck: shuffle(
      [
        ...D.colors.flatMap((c) => Array<TicketToRideCardColor>(12).fill(c)),
        ...Array<TicketToRideCardColor>(14).fill('loco'),
      ],
      random,
    ),
    discard: [],
    ticketDeck: shuffle(
      D.tickets.map((t) => t.id),
      random,
    ),
    market: [],
    claimed: {},
    drawn: 0,
    finalTurns: null,
    log: [],
    random,
  };
  for (const p of s.players) {
    for (let i = 0; i < 4; i++) {
      const card = draw(s);
      if (card) p.hand.push(card);
    }
    p.pending = s.ticketDeck.splice(-3);
  }
  refill(s);
  return s;
}

export function connected(
  s: { claimed: Record<string, string> },
  id: string,
  a: string,
  b: string,
): boolean {
  const visited = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const city = queue.pop()!;
    if (city === b) return true;
    for (const r of D.routes) {
      if (s.claimed[r.id] === id && (r.a === city || r.b === city)) {
        const next = r.a === city ? r.b : r.a;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }
  return false;
}

export function longest(s: { claimed: Record<string, string> }, id: string): number {
  const edges = D.routes.filter((r) => s.claimed[r.id] === id);
  const adj = new Map<string, number[]>();
  edges.forEach((e, i) => {
    for (const city of [e.a, e.b]) {
      if (!adj.has(city)) adj.set(city, []);
      adj.get(city)!.push(i);
    }
  });
  const memo = new Map<string, number>();
  function walk(city: string, used: bigint): number {
    const key = city + ':' + used;
    if (memo.has(key)) return memo.get(key)!;
    let best = 0;
    for (const i of adj.get(city) || []) {
      const bit = 1n << BigInt(i);
      if (used & bit) continue;
      const e = edges[i]!;
      best = Math.max(best, e.length + walk(e.a === city ? e.b : e.a, used | bit));
    }
    memo.set(key, best);
    return best;
  }
  return Math.max(0, ...[...adj.keys()].map((city) => walk(city, 0n)));
}

function finish(s: TicketToRideState): void {
  s.phase = 'finished';
  const results: TicketToRidePlayerResult[] = s.players.map((p) => {
    const tickets = p.tickets.map((id) => {
      const t = D.tickets.find((ticket) => ticket.id === id)!;
      return { ...t, complete: connected(s, p.id, t.a, t.b) };
    });
    return {
      id: p.id,
      routeScore: p.score,
      tickets,
      completed: tickets.filter((t) => t.complete).length,
      ticketScore: tickets.reduce((n, t) => n + (t.complete ? t.points : -t.points), 0),
      longest: longest(s, p.id),
    };
  });
  const max = Math.max(...results.map((r) => r.longest));
  for (const r of results) {
    r.bonus = r.longest === max ? 10 : 0;
    r.total = r.routeScore + r.ticketScore + r.bonus;
  }
  const order = [...results].sort(
    (a, b) => (b.total ?? 0) - (a.total ?? 0) || b.completed - a.completed || b.longest - a.longest,
  );
  const best = order[0]!;
  s.results = results;
  s.winners = results
    .filter(
      (r) => r.total === best.total && r.completed === best.completed && r.longest === best.longest,
    )
    .map((r) => r.id);
}

function endTurn(s: TicketToRideState): void {
  if (s.finalTurns !== null) {
    s.finalTurns--;
    if (!s.finalTurns) {
      finish(s);
      return;
    }
  } else if (s.players[s.turn]!.trains <= 2) {
    s.finalTurns = s.players.length;
    s.log.push({ kind: 'final', playerId: s.players[s.turn]!.id });
  }
  s.turn = (s.turn + 1) % s.players.length;
  s.drawn = 0;
}

export function available(
  s: RulesBoardLike,
  p: { id: string; trains: number },
  r: TicketToRideRoute | undefined | null,
): boolean {
  if (!r || s.claimed[r.id] || p.trains < r.length) return false;
  return !D.routes.some(
    (x) =>
      x.id !== r.id &&
      x.group === r.group &&
      s.claimed[x.id] &&
      (s.players.length < 4 || s.claimed[x.id] === p.id),
  );
}

export function payments(
  s: RulesBoardLike,
  p: RulesPlayerLike,
  r: TicketToRideRoute | undefined | null,
): TicketToRidePaymentOption[] {
  if (!r || !available(s, p, r)) return [];
  const hand = p.hand || [];
  const options: TicketToRidePaymentOption[] = [];
  for (const color of r.color === 'gray' ? D.colors : [r.color]) {
    const count = hand.filter((c) => c === color).length;
    const locos = hand.filter((c) => c === 'loco').length;
    for (let wild = Math.max(0, r.length - count); wild <= Math.min(r.length, locos); wild++) {
      options.push({ color, locos: wild });
    }
  }
  return options;
}

export function move(
  source: TicketToRideState,
  id: string,
  m: TicketToRideMove,
): TicketToRideState {
  if (!m || typeof m !== 'object') fail('Jogada inválida.');
  const s: TicketToRideState = {
    ...source,
    players: source.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      tickets: [...p.tickets],
      pending: [...p.pending],
    })),
    deck: [...source.deck],
    discard: [...source.discard],
    ticketDeck: [...source.ticketDeck],
    market: [...source.market],
    claimed: { ...source.claimed },
    log: [...source.log],
  };
  const p: TicketToRideStatePlayer | undefined = s.players.find((player) => player.id === id);
  if (!p || s.phase === 'finished') fail('Esta partida não aceita jogadas.');
  if (m.kind === 'tickets') {
    if (!p.pending.length || (s.phase !== 'setup' && s.players[s.turn] !== p)) {
      fail('Não há bilhetes para escolher.');
    }
    const min = p.initial ? 2 : 1;
    if (
      !Array.isArray(m.keep) ||
      m.keep.length < Math.min(min, p.pending.length) ||
      new Set(m.keep).size !== m.keep.length ||
      m.keep.some((t) => !p.pending.includes(t))
    ) {
      fail('Escolha pelo menos ' + min + ' bilhete(s) oferecido(s).');
    }
    // Rejected tickets go to the bottom, preserving hidden choices.
    s.ticketDeck.unshift(...p.pending.filter((t) => !m.keep.includes(t)));
    p.tickets.push(...m.keep);
    p.pending = [];
    const initial = p.initial;
    p.initial = false;
    if (initial) {
      if (s.players.every((x) => !x.initial)) s.phase = 'playing';
    } else {
      endTurn(s);
    }
  } else {
    if (s.phase !== 'playing' || s.players[s.turn] !== p || p.pending.length) {
      fail('Aguarde sua vez e conclua seus bilhetes.');
    }
    if (m.kind === 'draw') {
      const face = m.source === 'market';
      if (!face && m.source !== 'deck') {
        fail('Escolha o monte ou uma carta aberta.');
      }
      let card: TicketToRideCardColor | undefined;
      if (face) {
        if (typeof m.index !== 'number' || !Number.isInteger(m.index) || !s.market[m.index]) {
          fail('Esta carta não está disponível.');
        }
        card = s.market[m.index]!;
        if (card === 'loco' && s.drawn) {
          fail('Locomotiva aberta só pode ser a primeira compra.');
        }
        s.market.splice(m.index, 1);
      } else {
        card = draw(s);
        if (!card) fail('Não há cartas no monte.');
      }
      p.hand.push(card);
      s.drawn += face && card === 'loco' ? 2 : 1;
      refill(s);
      s.log.push({ kind: 'draw', playerId: id, card: face ? card : null });
      if (
        s.drawn >= 2 ||
        (!s.deck.length && !s.discard.length && !s.market.some((c) => c !== 'loco'))
      ) {
        endTurn(s);
      }
    } else if (m.kind === 'claim') {
      if (s.drawn) fail('Conclua a compra de cartas antes de construir.');
      const r = D.routes.find((route) => route.id === m.routeId);
      if (!r || !payments(s, p, r).some((x) => x.color === m.color && x.locos === m.locos)) {
        fail('Rota indisponível ou pagamento inválido.');
      }
      for (let i = 0; i < r.length; i++) {
        const card: TicketToRideCardColor = i < m.locos ? 'loco' : m.color;
        const index = p.hand.indexOf(card);
        s.discard.push(...p.hand.splice(index, 1));
      }
      s.claimed[r.id] = id;
      p.trains -= r.length;
      p.score += D.points[r.length]!;
      s.log.push({
        kind: 'claim',
        playerId: id,
        routeId: r.id,
        points: D.points[r.length]!,
      });
      endTurn(s);
    } else if (m.kind === 'draw-tickets') {
      if (s.drawn || !s.ticketDeck.length) {
        fail('Não é possível comprar bilhetes agora.');
      }
      p.pending = s.ticketDeck.splice(-3);
    } else if (m.kind === 'pass') {
      if (
        s.market.length ||
        s.deck.length ||
        s.discard.length ||
        D.routes.some((r) => payments(s, p, r).length)
      ) {
        fail('Ainda há jogadas disponíveis.');
      }
      endTurn(s);
    } else {
      fail('Jogada desconhecida.');
    }
  }
  s.revision++;
  s.log = s.log.slice(-80);
  return s;
}

export function publicState(s: TicketToRideState, id: string): TicketToRidePublicState {
  const finished = s.phase === 'finished';
  const players: TicketToRidePublicPlayer[] = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    bot: p.bot,
    forfeited: p.forfeited,
    trains: p.trains,
    score: p.score,
    handCount: p.hand.length,
    ticketCount: p.tickets.length,
    initial: p.initial,
    hand: p.id === id ? [...p.hand] : null,
    tickets: p.id === id || finished ? [...p.tickets] : null,
    pending: p.id === id ? [...p.pending] : [],
    completed:
      p.id === id
        ? p.tickets.filter((tid) => {
            const t = D.tickets.find((ticket) => ticket.id === tid);
            return t ? connected(s, p.id, t.a, t.b) : false;
          })
        : [],
  }));
  return {
    revision: s.revision,
    phase: s.phase,
    turn: s.turn,
    market: [...s.market],
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    ticketCount: s.ticketDeck.length,
    claimed: { ...s.claimed },
    drawn: s.drawn,
    finalTurns: s.finalTurns,
    log: s.log.map((e) => ({ ...e })),
    players,
    results: s.results ? structuredClone(s.results) : null,
    winners: s.winners ? [...s.winners] : [],
  };
}

// Bots receive the same private view as their human seat; no hidden deck access.
export function botMove(v: TicketToRidePublicState): TicketToRideMove {
  const p = v.players[v.turn]!;
  if (p.pending.length) {
    return { kind: 'tickets', keep: p.pending.slice(0, p.initial ? 2 : 1) };
  }
  const possible = D.routes
    .flatMap((r) => payments(v, p, r).map((pay) => ({ r, pay })))
    .sort((a, b) => b.r.length - a.r.length || a.pay.locos - b.pay.locos);
  if (!v.drawn && possible.length) {
    const { r, pay } = possible[0]!;
    return { kind: 'claim', routeId: r.id, ...pay };
  }
  if (!v.drawn && p.trains <= 2 && v.ticketCount) {
    return { kind: 'draw-tickets' };
  }
  const hand = p.hand || [];
  const counts = Object.fromEntries(
    D.colors.map((c) => [c, hand.filter((x) => x === c).length]),
  ) as Record<string, number>;
  const indices = v.market
    .map((c, i) => ({ c, i }))
    .filter((x) => !v.drawn || x.c !== 'loco')
    .sort(
      (a, b) =>
        (b.c === 'loco' ? 20 : (counts[b.c] ?? 0)) - (a.c === 'loco' ? 20 : (counts[a.c] ?? 0)),
    );
  if (indices.length) {
    return { kind: 'draw', source: 'market', index: indices[0]!.i };
  }
  if (v.deckCount || v.discardCount) {
    return { kind: 'draw', source: 'deck' };
  }
  if (v.ticketCount && !v.drawn) {
    return { kind: 'draw-tickets' };
  }
  return { kind: 'pass' };
}

export const TicketToRideRules = {
  create,
  move,
  publicState,
  botMove,
  connected,
  longest,
  payments,
  available,
};

(
  globalThis as typeof globalThis & {
    TicketToRideRules?: typeof TicketToRideRules;
  }
).TicketToRideRules = TicketToRideRules;
