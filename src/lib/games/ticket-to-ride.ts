import type {
  TicketToRideCardColor,
  TicketToRideMove,
  TicketToRideOpenRoom,
  TicketToRidePublicPlayer,
  TicketToRidePublicState,
  TicketToRideRoom,
} from '../../types/ticket-to-ride';
import type { SocketMessage } from '../../types/socket';
import { TicketToRideArt } from './ticket-to-ride-art';
import { TicketToRideData } from './ticket-to-ride-data';
import { TicketToRideRules } from './ticket-to-ride-rules';

export interface TronoTicketToRideController {
  open(): void;
  readonly room: TicketToRideRoom | null;
}

interface TicketToRideWindow extends Window {
  TicketToRideData?: typeof TicketToRideData;
  TicketToRideRules?: typeof TicketToRideRules;
  TicketToRideArt?: typeof TicketToRideArt;
  TronoTicketToRide?: TronoTicketToRideController;
  TronoAuth?: {
    readonly user: { readonly id: string } | null;
  };
  TronoNetwork?: {
    readonly connected: boolean;
    ensureTicketToRide(): Promise<boolean>;
    ticketToRide(action: string, payload?: Record<string, unknown>): boolean;
    onMessage(handler: (msg: SocketMessage) => void): () => void;
  };
  TronoPortal?: {
    showOnly(id: string): void;
  };
  TronoSocial?: {
    showForRoom(show: boolean): void;
  };
  TronoGames?: {
    openLibrary(): void;
  };
}

const installed = new WeakMap<Window, () => void>();

export function initializeTicketToRide(target: Window): () => void {
  const existing = installed.get(target);
  if (existing) return existing;

  const runtime = target as TicketToRideWindow;
  const doc = target.document;
  runtime.TicketToRideData = TicketToRideData;
  runtime.TicketToRideRules = TicketToRideRules;
  runtime.TicketToRideArt = TicketToRideArt;

  const $ = (id: string) => doc.getElementById(id);
  const D = TicketToRideData;
  const R = TicketToRideRules;
  const A = TicketToRideArt;
  const ns = 'http://www.w3.org/2000/svg';

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string | number,
  ): HTMLElementTagNameMap[K] => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = String(text);
    return n;
  };

  const button = (text: string, fn: () => void, cls = 'tr-button'): HTMLButtonElement => {
    const n = el('button', cls, text);
    n.type = 'button';
    n.onclick = fn;
    return n;
  };

  const svg = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
    const n = doc.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  const uid = () => runtime.TronoAuth?.user?.id;
  const palette = A.playerColors;
  let room: TicketToRideRoom | null = null;
  let rooms: TicketToRideOpenRoom[] = [];
  let resume: string | null = null;
  let notice = '';
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let selection: string | null = null;
  let highlight: string | null = null;
  let drawOrigin: { rect: DOMRect | undefined; revision: number | undefined } | null = null;

  const effects = new Set<Animation>();
  const reducedMotion = () => target.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mine = (s: TicketToRidePublicState) => s.players.find((p) => p.id === uid());
  const active = (s: TicketToRidePublicState) =>
    s.phase === 'playing' && s.players[s.turn]?.id === uid();
  const locked = () => pending || !runtime.TronoNetwork?.connected;

  async function request(action: string, payload: Record<string, unknown> = {}) {
    try {
      if (!(await runtime.TronoNetwork?.ensureTicketToRide())) return false;
      if (!runtime.TronoNetwork?.ticketToRide(action, payload)) {
        throw new Error('Conexão interrompida.');
      }
      return true;
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      render();
      return false;
    }
  }

  function open() {
    runtime.TronoPortal?.showOnly('ticketToRideScreen');
    runtime.TronoSocial?.showForRoom(false);
    doc.body.dataset.gamesView = 'ticket-to-ride';
    render();
    void request('list');
  }

  async function commit(move: TicketToRideMove) {
    if (locked() || !room?.state) return;
    const source =
      move.kind === 'draw'
        ? move.source === 'deck'
          ? $('ticketToRideDeck')
          : doc.querySelector<HTMLElement>(`[data-market-index="${move.index}"]`)
        : move.kind === 'draw-tickets'
          ? $('ticketToRideDrawTickets')
          : null;
    drawOrigin = source
      ? { rect: source.getBoundingClientRect(), revision: room.state.revision }
      : null;
    pending = true;
    notice = '';
    render();
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      drawOrigin = null;
      notice = 'Aguardando confirmação. Confira a conexão.';
      void request('state');
      render();
    }, 12000);
    if (
      !(await request('move', {
        revision: room.state.revision,
        move: move as unknown as Record<string, unknown>,
      }))
    ) {
      pending = false;
      drawOrigin = null;
      clearTimeout(timer);
      render();
    }
  }

  function clearEffects() {
    for (const animation of effects) animation.cancel();
    effects.clear();
  }

  function animate(
    node: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
    remove = false,
  ) {
    if (typeof node.animate !== 'function') return;
    const animation = node.animate(frames, options);
    effects.add(animation);
    const clean = () => {
      effects.delete(animation);
      if (remove) node.remove();
    };
    animation.onfinish = clean;
    animation.oncancel = clean;
  }

  function cardBack(destination = false) {
    const n = el('div', destination ? 'tr-destination-card' : 'tr-train-card tr-deck');
    const image = el('img', 'tr-back-art');
    image.src = destination ? A.destinations : A.back;
    image.alt = '';
    image.width = 512;
    image.height = 768;
    image.setAttribute('aria-hidden', 'true');
    n.append(image);
    return n;
  }

  function trainCard(
    color: TicketToRideCardColor,
    count?: number,
    onClick?: () => void,
  ): HTMLElement {
    const n = onClick ? button('', onClick, 'tr-train-card') : el('div', 'tr-train-card');
    n.dataset.trainColor = color;
    if (!onClick) n.setAttribute('role', 'img');
    const picture = svg('svg', {
      viewBox: A.cards[color].join(' '),
      class: 'tr-train-art',
      'aria-hidden': 'true',
    });
    picture.append(svg('image', { href: A.fronts, width: 1024, height: 1536 }));
    n.append(picture, el('span', 'tr-card-name', D.names[color]));
    if (count !== undefined) {
      n.append(el('b', '', String(count)));
      n.setAttribute('aria-label', D.names[color] + ': ' + count + ' carta(s)');
    }
    return n;
  }

  function flyCard(
    source: DOMRect | undefined,
    targetElement: Element | null | undefined,
    color: TicketToRideCardColor | null | undefined,
    ticket = false,
    index = 0,
  ) {
    if (!source || !targetElement || !source.width || !source.height) return;
    const end = targetElement.getBoundingClientRect();
    if (!end.width || !end.height) return;
    const card = ticket ? cardBack(true) : color ? trainCard(color) : cardBack();
    card.classList.add('tr-card-flight');
    card.setAttribute('aria-hidden', 'true');
    Object.assign(card.style, {
      left: source.left + 'px',
      top: source.top + 'px',
      width: source.width + 'px',
      height: source.height + 'px',
    });
    $('ticketToRideScreen')?.append(card);
    const x = end.left + end.width / 2 - source.left - source.width / 2;
    const y = end.top + end.height / 2 - source.top - source.height / 2;
    animate(
      card,
      [
        { transform: 'translate(0,0) rotate(-5deg)', opacity: 1 },
        {
          transform: `translate(${x * 0.55}px,${y * 0.35 - 45}px) rotate(8deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${x}px,${y}px) scale(.65) rotate(0deg)`, opacity: 0 },
      ],
      { duration: 560, delay: index * 80, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'both' },
      true,
    );
  }

  function animateState(
    previous: TicketToRidePublicState | null | undefined,
    next: TicketToRidePublicState | null | undefined,
    origin: { rect?: DOMRect | undefined } | null,
  ) {
    const screen = $('ticketToRideScreen');
    if (
      !previous ||
      !next ||
      next.revision <= previous.revision ||
      reducedMotion() ||
      !screen ||
      screen.classList.contains('hidden')
    )
      return;
    // State acknowledgement, rather than clicks, is the source of visual changes.
    for (const id of Object.keys(next.claimed)) {
      if (!previous.claimed[id]) {
        const route = doc.querySelector(`.tr-map [data-route="${id}"]`);
        route?.querySelectorAll('.tr-wagon-art').forEach((wagon, i) =>
          animate(
            wagon,
            [
              { opacity: 0, transform: 'translateY(-18px) scale(.4)' },
              { opacity: 1, transform: 'translateY(2px) scale(1.08)', offset: 0.7 },
              { opacity: 1, transform: 'translateY(0) scale(1)' },
            ],
            { duration: 420, delay: i * 85, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' },
          ),
        );
      }
    }
    const before = mine(previous);
    const after = mine(next);
    if (!before || !after) return;
    const counts = new Map<TicketToRideCardColor, number>();
    for (const color of before.hand || []) counts.set(color, (counts.get(color) || 0) + 1);
    const added: TicketToRideCardColor[] = [];
    for (const color of after.hand || []) {
      const existingCount = counts.get(color);
      if (existingCount) counts.set(color, existingCount - 1);
      else added.push(color);
    }
    const source = origin?.rect || $('ticketToRideDeck')?.getBoundingClientRect();
    added.forEach((color, i) =>
      flyCard(source, doc.querySelector(`.tr-hand [data-train-color="${color}"]`), color, false, i),
    );
    for (const player of next.players) {
      if (
        player.id !== uid() &&
        player.handCount >
          (previous.players.find((p) => p.id === player.id)?.handCount ?? player.handCount)
      ) {
        const event = next.log.at(-1);
        const color = event?.kind === 'draw' && event.playerId === player.id ? event.card : null;
        flyCard(
          source,
          [...doc.querySelectorAll<HTMLElement>('.tr-player')].find(
            (n) => n.dataset.playerId === player.id,
          ),
          color,
        );
      }
    }
    if (after.pending.length && !before.pending.length) {
      const deck = origin?.rect || $('ticketToRideDrawTickets')?.getBoundingClientRect();
      doc
        .querySelectorAll('.tr-ticket-option .tr-ticket')
        .forEach((ticket, i) => flyCard(deck, ticket, null, true, i));
    }
  }

  function lobby(host: HTMLElement) {
    const intro = el('div', 'tr-intro');
    intro.append(
      el('span', 'tr-eyebrow', 'UMA VIAGEM PELO MAPA CLÁSSICO'),
      el('h2', '', 'De costa a costa.'),
      el(
        'p',
        '',
        'Colecione vagões, conecte cidades e guarde seus destinos em segredo. Cada trecho aproxima sua ferrovia de uma grande viagem.',
      ),
    );
    const metrics = el('div', 'tr-metrics');
    for (const t of ['2–5 viajantes', '45 vagões por pessoa', '30 bilhetes de destino']) {
      metrics.append(el('span', '', t));
    }
    intro.append(metrics);
    host.append(intro);

    const grid = el('div', 'tr-lobby');
    const create = el('section', 'tr-panel');
    create.append(el('span', 'tr-eyebrow', 'PRÓXIMA PARTIDA'), el('h3', '', 'Uma nova ferrovia'));
    const label = el('label', '', 'Lugares na mesa ');
    const select = el('select');
    select.id = 'ticketToRidePlayers';
    select.setAttribute('aria-label', 'Lugares na mesa');
    for (let i = 2; i <= 5; i++) {
      const o = el('option', '', String(i));
      o.value = String(i);
      select.append(o);
    }
    label.append(select);
    create.append(
      label,
      button(
        'Criar mesa',
        () => void request('create', { maxPlayers: Number(select.value) }),
        'tr-button tr-primary',
      ),
    );

    const join = el('section', 'tr-panel');
    join.append(
      el('span', 'tr-eyebrow', 'VIAJE COM AMIGOS'),
      el('h3', '', 'Embarcar com um código'),
    );
    const code = el('input');
    code.id = 'ticketToRideCode';
    code.placeholder = 'Código da mesa';
    code.maxLength = 10;
    code.setAttribute('aria-label', 'Código da mesa');
    join.append(
      code,
      button(
        'Entrar na mesa',
        () => void request('join', { roomId: code.value.trim().toUpperCase() }),
      ),
    );
    if (resume) {
      join.append(
        button(
          'Retomar minha mesa',
          () => void request('resume', { roomId: resume }),
          'tr-button tr-primary',
        ),
      );
    }
    grid.append(create, join);
    host.append(grid);

    const list = el('section', 'tr-open-tables');
    list.append(el('h3', '', 'Mesas aguardando partida'));
    if (!rooms.length) list.append(el('p', '', 'A estação está tranquila. Crie a primeira mesa.'));
    for (const r of rooms) {
      list.append(
        button(
          r.name + ' · ' + r.players + '/' + r.maxPlayers + ' · ' + r.id,
          () => void request('join', { roomId: r.id }),
        ),
      );
    }
    host.append(list);
  }

  function ticketCard(id: string, complete = false) {
    const t = D.tickets.find((ticket) => ticket.id === id)!;
    const n = el('div', 'tr-ticket' + (complete ? ' tr-complete' : ''));
    const preview = svg('svg', {
      viewBox: '0 0 1024 683',
      class: 'tr-ticket-mini-map',
      'aria-hidden': 'true',
    });
    n.dataset.ticketId = id;
    preview.append(svg('image', { href: A.board, width: 1024, height: 683 }));
    for (const city of [t.a, t.b]) {
      const [x, y] = A.cities[city];
      preview.append(
        svg('circle', {
          cx: x,
          cy: y,
          r: 28,
          fill: '#2b9a4b',
          stroke: '#fff5ca',
          'stroke-width': 12,
        }),
      );
    }
    n.append(
      preview,
      el('span', 'tr-ticket-icon', complete ? '✓' : '↔'),
      el('strong', '', t.a + ' → ' + t.b),
      el('b', '', t.points + ' pts'),
    );
    return n;
  }

  function tickets(host: HTMLElement, _s: TicketToRidePublicState, p: TicketToRidePublicPlayer) {
    const playerTickets = p.tickets || [];
    const panel = el('section', 'tr-panel tr-tickets');
    panel.setAttribute('aria-label', 'Seus objetivos');
    panel.append(
      el('span', 'tr-eyebrow', 'SUAS VIAGENS'),
      el('h2', '', 'Objetivos'),
      el(
        'p',
        'tr-muted',
        p.completed.length + ' de ' + playerTickets.length + ' concluídos · bilhetes privados',
      ),
    );
    const collection = el('div', 'tr-ticket-collection');
    for (const id of playerTickets) {
      const n = button(
        '',
        () => {
          highlight = highlight === id ? null : id;
          render();
        },
        'tr-ticket-button',
      );
      n.append(ticketCard(id, p.completed.includes(id)));
      n.setAttribute('aria-pressed', String(highlight === id));
      collection.append(n);
    }
    panel.append(collection);
    if (p.pending.length) {
      const choose = el('div', 'tr-ticket-choice');
      choose.id = 'ticketToRideChoice';
      choose.setAttribute('role', 'region');
      choose.setAttribute('aria-label', 'Escolha de destinos');
      choose.append(
        el('h3', '', p.initial ? 'Escolha seus destinos iniciais' : 'Novos destinos'),
        el(
          'p',
          '',
          p.initial
            ? 'Mantenha pelo menos 2 dos 3 bilhetes.'
            : 'Mantenha pelo menos 1 bilhete. Os demais voltam ao fundo.',
        ),
      );
      const picks = new Set<string>();
      let confirmBtn: HTMLButtonElement;
      for (const id of p.pending) {
        const label = el('label', 'tr-ticket-option');
        const check = el('input');
        check.type = 'checkbox';
        check.value = id;
        check.onchange = () => {
          if (check.checked) picks.add(id);
          else picks.delete(id);
          confirmBtn.disabled =
            locked() || picks.size < Math.min(p.initial ? 2 : 1, p.pending.length);
        };
        label.append(check, ticketCard(id));
        choose.append(label);
      }
      confirmBtn = button(
        'Confirmar destinos',
        () => void commit({ kind: 'tickets', keep: [...picks] }),
        'tr-button tr-primary',
      );
      confirmBtn.id = 'ticketToRideKeep';
      confirmBtn.disabled = true;
      choose.append(confirmBtn);
      panel.append(choose);
    }
    host.append(panel);
  }

  function map(s: TicketToRidePublicState) {
    const wrap = el('section', 'tr-map-wrap');
    const canvas = svg('svg', {
      viewBox: '0 0 1024 683',
      role: 'group',
      'aria-label': 'Ferrovias do mapa clássico dos Estados Unidos',
      class: 'tr-map',
    });
    const defs = svg('defs');
    for (const color of A.playerPieces) {
      const box =
        (A.pieces as Record<string, readonly [number, number, number, number] | undefined>)[
          color
        ] || A.pieces.blue;
      const symbol = svg('symbol', { id: 'tr-piece-' + color, viewBox: box.join(' ') });
      const image = svg('image', { href: A.wagons, width: 1536, height: 1024 });
      if (color === 'purple') image.style.filter = 'hue-rotate(65deg)';
      symbol.append(image);
      defs.append(symbol);
    }
    canvas.append(defs);
    canvas.append(
      svg('image', {
        href: A.board,
        width: 1024,
        height: 683,
        class: 'tr-board-art',
        'aria-hidden': 'true',
      }),
    );
    for (const r of D.routes) {
      const owner = s.claimed[r.id];
      const player = s.players.findIndex((p) => p.id === owner);
      const geometry = A.geometry(r);
      const g = svg('g', {
        'data-route': r.id,
        role: 'button',
        tabindex: 0,
        'aria-label': `${r.a} — ${r.b} · ${r.length} ${D.names[r.color]}${owner ? ' · ' + s.players[player].name : ''}`,
        class: 'tr-route' + (owner ? ' tr-owned' : '') + (selection === r.id ? ' tr-selected' : ''),
      });
      g.append(
        svg('path', {
          d: geometry.path,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': 16,
          class: 'tr-route-path',
        }),
      );
      if (owner) {
        for (const wagon of geometry.wagons) {
          const slot = svg('g', {
            transform: `translate(${wagon.x} ${wagon.y}) rotate(${wagon.angle + 14})`,
          });
          const art = svg('g', { class: 'tr-wagon-art' });
          art.append(
            svg('use', {
              href: '#tr-piece-' + A.playerPieces[player],
              x: -wagon.width / 2,
              y: -wagon.width / 3,
              width: wagon.width,
              height: (wagon.width * 2) / 3,
              'aria-hidden': 'true',
            }),
          );
          slot.append(art);
          g.append(slot);
        }
      }
      g.append(
        svg('circle', {
          cx: geometry.middle.x,
          cy: geometry.middle.y,
          r: 8,
          fill: 'transparent',
          class: 'tr-route-target',
          'aria-hidden': 'true',
        }),
      );
      const choose = () => {
        selection = r.id;
        notice = '';
        render();
        if (!target.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 4/3)').matches) {
          $('ticketToRidePayment')?.scrollIntoView({
            block: 'nearest',
            behavior: reducedMotion() ? 'instant' : 'smooth',
          });
        }
      };
      (g as unknown as HTMLElement).onclick = choose;
      (g as unknown as HTMLElement).onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      };
      canvas.append(g);
    }
    const destination = D.tickets.find((t) => t.id === highlight);
    for (const [name, [x, y]] of Object.entries(A.cities)) {
      const selected = Boolean(destination && [destination.a, destination.b].includes(name));
      canvas.append(
        svg('circle', {
          cx: x,
          cy: y,
          r: selected ? 11 : 5,
          fill: selected ? '#f7d47166' : 'transparent',
          stroke: selected ? '#d69c22' : 'transparent',
          'stroke-width': 3,
          class: 'tr-city' + (selected ? ' tr-city-highlight' : ''),
          'aria-label': name,
        }),
      );
    }
    wrap.append(canvas);
    return wrap;
  }

  function payment(host: HTMLElement, s: TicketToRidePublicState, p: TicketToRidePublicPlayer) {
    const r = D.routes.find((route) => route.id === selection);
    if (!r) return;
    const panel = el('section', 'tr-panel tr-payment');
    panel.id = 'ticketToRidePayment';
    panel.append(
      el('span', 'tr-eyebrow', 'CONSTRUIR FERROVIA'),
      el('h2', '', r.a + ' → ' + r.b),
      el('p', '', r.length + ' vagões · ' + D.points[r.length] + ' pontos · ' + D.names[r.color]),
    );
    const options = R.payments(s, p, r);
    if (s.claimed[r.id]) {
      panel.append(el('p', '', 'Esta rota já tem uma ferrovia.'));
    } else if (!active(s) || s.drawn || p.pending.length) {
      panel.append(el('p', '', 'Construa no seu turno, antes de comprar cartas.'));
    } else if (!options.length) {
      panel.append(
        el(
          'p',
          '',
          'Você precisa de cartas e vagões suficientes. Rotas paralelas ficam bloqueadas em partidas com 2–3 pessoas e não podem pertencer à mesma pessoa.',
        ),
      );
    } else {
      const label = el('label', '', 'Pagamento ');
      const select = el('select');
      select.setAttribute('aria-label', 'Pagamento da rota');
      options.forEach((o, i) => {
        const opt = el(
          'option',
          '',
          r.length - o.locos + ' ' + D.names[o.color] + ' + ' + o.locos + ' locomotiva(s)',
        );
        opt.value = String(i);
        select.append(opt);
      });
      label.append(select);
      const pay = button(
        'Construir rota',
        () => void commit({ kind: 'claim', routeId: r.id, ...options[Number(select.value)] }),
        'tr-button tr-primary',
      );
      pay.id = 'ticketToRideClaim';
      pay.disabled = locked();
      panel.append(label, pay);
    }
    panel.append(
      button(
        'Fechar rota',
        () => {
          selection = null;
          render();
        },
        'tr-link',
      ),
    );
    host.append(panel);
  }

  function market(host: HTMLElement, s: TicketToRidePublicState, p: TicketToRidePublicPlayer) {
    const panel = el('section', 'tr-panel tr-supply');
    panel.setAttribute('aria-label', 'Compra de vagões');
    panel.append(
      el('span', 'tr-eyebrow', 'A ESTAÇÃO'),
      el('h2', '', 'Comprar vagões'),
      el(
        'p',
        'tr-muted',
        s.drawn ? 'Escolha a segunda carta.' : 'Duas cartas ou uma locomotiva aberta.',
      ),
    );
    const cards = el('div', 'tr-market');
    s.market.forEach((c, i) => {
      const n = trainCard(
        c,
        undefined,
        () => void commit({ kind: 'draw', source: 'market', index: i }),
      ) as HTMLButtonElement;
      n.dataset.marketIndex = String(i);
      n.setAttribute('aria-label', 'Comprar ' + D.names[c] + ' · carta ' + (i + 1));
      n.disabled = locked() || !active(s) || p.pending.length > 0 || (c === 'loco' && s.drawn > 0);
      cards.append(n);
    });
    const deck = button(
      '',
      () => void commit({ kind: 'draw', source: 'deck' }),
      'tr-train-card tr-deck',
    );
    deck.append(
      ...cardBack().childNodes,
      el('span', 'tr-card-name', 'MONTE FECHADO'),
      el('b', '', String(s.deckCount)),
    );
    deck.id = 'ticketToRideDeck';
    deck.setAttribute('aria-label', 'Comprar do monte fechado · ' + s.deckCount + ' cartas');
    deck.disabled =
      s.phase !== 'playing' ||
      locked() ||
      !active(s) ||
      p.pending.length > 0 ||
      (!s.deckCount && !s.discardCount);
    panel.append(deck, cards);
    if (!s.market.length && !s.deckCount && !s.discardCount && s.phase === 'playing') {
      const pass = button('Passar · sem cartas disponíveis', () => void commit({ kind: 'pass' }));
      pass.disabled =
        locked() || !active(s) || D.routes.some((r) => R.payments(s, p, r).length > 0);
      panel.append(pass);
    }
    host.append(panel);
  }

  function destinationDeck(
    host: HTMLElement,
    s: TicketToRidePublicState,
    p: TicketToRidePublicPlayer,
  ) {
    const panel = el('section', 'tr-panel tr-destination-deck');
    panel.setAttribute('aria-label', 'Pilha de cartas de destino');
    panel.append(el('span', 'tr-eyebrow', 'PRÓXIMA VIAGEM'), el('h2', '', 'Cartas de destino'));
    const take = button('', () => void commit({ kind: 'draw-tickets' }), 'tr-destination-card');
    take.append(
      ...cardBack(true).childNodes,
      el('span', '', 'COMPRAR DESTINOS'),
      el('strong', '', s.ticketCount + ' bilhetes'),
    );
    take.id = 'ticketToRideDrawTickets';
    take.setAttribute('aria-label', 'Comprar bilhetes · ' + s.ticketCount);
    take.disabled =
      s.phase !== 'playing' ||
      locked() ||
      !active(s) ||
      s.drawn > 0 ||
      p.pending.length > 0 ||
      !s.ticketCount;
    panel.append(take);
    host.append(panel);
  }

  function render() {
    const host = $('ticketToRideContent');
    if (!host) return;
    for (const animation of effects) {
      const animTarget = (animation.effect as KeyframeEffect | null)?.target;
      if (animTarget && host.contains(animTarget)) animation.cancel();
    }
    host.replaceChildren();
    $('ticketToRideScreen')?.classList.toggle('tr-at-table', Boolean(room?.state));
    const noticeEl = $('ticketToRideNotice');
    if (noticeEl) noticeEl.textContent = notice;
    const status = $('ticketToRideStatus');
    if (status) status.textContent = room ? 'MESA ' + room.id : 'ESTAÇÃO M&N';
    if (!room) {
      lobby(host);
      return;
    }

    const toolbar = el('div', 'tr-table-tools');
    toolbar.append(
      el('span', '', 'Código: ' + room.id),
      button(
        room.state ? 'Sair da partida' : 'Sair da mesa',
        () => {
          if (!room?.state || target.confirm('Sair desta partida? Um bot assumirá seu lugar.')) {
            void request('leave');
          }
        },
        'tr-link',
      ),
    );
    host.append(toolbar);

    if (!room.state) {
      const wait = el('section', 'tr-panel');
      wait.append(
        el('span', 'tr-eyebrow', 'AGUARDANDO EMBARQUE'),
        el('h2', '', 'Sua mesa está pronta'),
      );
      for (const p of room.players) {
        wait.append(el('p', '', p.name + (p.online ? ' · online' : ' · reconectando')));
      }
      if (room.hostId === uid()) {
        wait.append(
          button(
            'Iniciar com bots',
            () => void request('start', { fillBots: true }),
            'tr-button tr-primary',
          ),
        );
        if (room.players.length >= 2) {
          wait.append(button('Iniciar com os presentes', () => void request('start')));
        }
      } else {
        wait.append(el('p', '', 'Aguardando o anfitrião iniciar.'));
      }
      host.append(wait);
      return;
    }

    const s = room.state;
    const p = mine(s);
    if (!p) return;

    const scores = el('div', 'tr-scoreboard');
    scores.setAttribute('aria-label', 'Placar dos viajantes');
    s.players.forEach((x, i) => {
      const n = el('article', 'tr-player' + (s.turn === i ? ' tr-active' : ''));
      n.dataset.playerId = x.id;
      n.style.setProperty('--player', palette[i]);
      n.append(
        el('strong', '', x.name + (x.id === uid() ? ' · você' : '')),
        el('b', '', x.score + ' pts'),
        el(
          'small',
          '',
          x.trains +
            ' vagões · ' +
            x.handCount +
            ' cartas · ' +
            x.ticketCount +
            ' destinos' +
            (x.bot ? ' · bot' : ''),
        ),
      );
      scores.append(n);
    });

    const instruction =
      s.phase === 'setup'
        ? 'Escolha os destinos iniciais para começar.'
        : s.phase === 'finished'
          ? 'Viagem concluída. Veja os destinos revelados.'
          : active(s)
            ? p.pending.length
              ? 'Escolha os novos destinos.'
              : s.drawn
                ? 'Sua vez · escolha a segunda carta.'
                : 'Sua vez · compre cartas, construa uma rota ou compre destinos.'
            : 'Vez de ' + s.players[s.turn].name;
    const turn = el(
      'p',
      'tr-turn',
      instruction +
        (s.finalTurns !== null && s.phase !== 'finished'
          ? ' · Rodada final: ' + s.finalTurns + ' turno(s) restante(s)'
          : ''),
    );
    turn.setAttribute('role', 'status');
    host.append(turn);

    const layout = el('div', 'tr-layout');
    const board = el('div', 'tr-board-column');
    const side = el('aside', 'tr-sidebar');
    board.append(map(s));
    payment(board, s, p);

    const hand = el('section', 'tr-panel tr-hand');
    hand.setAttribute('aria-label', 'Suas cartas compradas');
    hand.append(
      el('span', 'tr-eyebrow', 'SUA MÃO'),
      el('h2', '', 'Seus vagões'),
      el('p', 'tr-muted', p.handCount + ' cartas · mão privada'),
    );
    const cards = el('div', 'tr-hand-cards');
    const playerHand = p.hand || [];
    for (const color of [...D.colors, 'loco'] as const) {
      const count = playerHand.filter((c) => c === color).length;
      if (count) cards.append(trainCard(color, count));
    }
    if (!playerHand.length) cards.append(el('p', 'tr-muted', 'Compre cartas na estação.'));
    hand.append(cards);

    market(side, s, p);
    const players = el('aside', 'tr-players-column');
    players.append(scores);
    layout.append(hand, board, side, players);
    tickets(layout, s, p);
    destinationDeck(layout, s, p);
    host.append(layout);

    if (s.phase === 'finished' && s.results) {
      const results = el('section', 'tr-panel tr-results');
      results.id = 'ticketToRideResults';
      results.append(
        el(
          'h2',
          '',
          s.winners.map((id) => s.players.find((pl) => pl.id === id)?.name).join(' e ') +
            ' · vitória!',
        ),
      );
      for (const result of s.results) {
        const item = el('article');
        item.append(
          el(
            'h3',
            '',
            (s.players.find((pl) => pl.id === result.id)?.name || '') +
              ' · ' +
              result.total +
              ' pontos',
          ),
          el(
            'p',
            '',
            result.routeScore +
              ' de rotas + ' +
              result.ticketScore +
              ' de destinos + ' +
              result.bonus +
              ' de maior caminho (' +
              result.longest +
              ' vagões)',
          ),
        );
        for (const t of result.tickets) item.append(ticketCard(t.id, t.complete));
        results.append(item);
      }
      board.append(results);
    }

    const log = el('details', 'tr-log');
    log.append(el('summary', '', 'Diário da viagem'));
    for (const e of [...s.log].reverse().slice(0, 8)) {
      const who = s.players.find((pl) => pl.id === e.playerId)?.name;
      if (e.kind === 'claim') {
        const r = D.routes.find((route) => route.id === e.routeId);
        if (r) {
          log.append(
            el('p', '', who + ' conectou ' + r.a + ' a ' + r.b + ' · +' + e.points + ' pts'),
          );
        }
      } else {
        log.append(
          el(
            'p',
            '',
            who +
              (e.kind === 'final'
                ? ' iniciou a rodada final.'
                : e.card
                  ? ' comprou ' + D.names[e.card] + '.'
                  : ' comprou uma carta fechada.'),
          ),
        );
      }
    }
    players.append(log);
  }

  let observer: MutationObserver | undefined;
  let unsubscribeNetwork: (() => void) | undefined;

  const onFullscreenChange = () => {
    const screen = $('ticketToRideScreen');
    const full = doc.fullscreenElement === screen;
    const fsBtn = $('ticketToRideFullscreen');
    if (fsBtn) {
      fsBtn.textContent = full ? 'Sair da tela cheia' : 'Tela cheia';
      fsBtn.setAttribute('aria-pressed', String(full));
    }
    clearEffects();
  };

  const onAuthChange = () => {
    if (!uid()) {
      clearEffects();
      room = null;
      resume = null;
      pending = false;
      drawOrigin = null;
      clearTimeout(timer);
      selection = null;
      highlight = null;
      render();
    }
  };

  function bind() {
    const playBtn = $('playTicketToRide');
    if (playBtn) playBtn.onclick = open;
    const backBtn = $('ticketToRideBack');
    if (backBtn) backBtn.onclick = () => runtime.TronoGames?.openLibrary();
    const rulesBtn = $('ticketToRideRulesButton');
    const rulesDialog = $('ticketToRideRulesDialog') as HTMLDialogElement | null;
    if (rulesBtn && rulesDialog) {
      rulesBtn.onclick = () => rulesDialog.showModal();
      const closeBtn = rulesDialog.querySelector<HTMLElement>('[data-close]');
      if (closeBtn) closeBtn.onclick = () => rulesDialog.close();
    }
    const fsBtn = $('ticketToRideFullscreen');
    if (fsBtn) {
      fsBtn.onclick = async () => {
        const screen = $('ticketToRideScreen');
        if (!screen) return;
        try {
          if (doc.fullscreenElement === screen) await doc.exitFullscreen();
          else await screen.requestFullscreen();
        } catch {
          notice = 'Tela cheia indisponível neste dispositivo.';
          render();
        }
      };
    }
    doc.addEventListener('fullscreenchange', onFullscreenChange);

    const screen = $('ticketToRideScreen');
    if (screen) {
      observer = new MutationObserver(() => {
        if (screen.classList.contains('hidden')) {
          clearEffects();
          if (doc.fullscreenElement === screen) void doc.exitFullscreen().catch(() => {});
          if (rulesDialog?.open) rulesDialog.close();
        }
      });
      observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    unsubscribeNetwork = runtime.TronoNetwork?.onMessage((msg) => {
      if (msg.type === 'ticket-to-ride-state') {
        const nextRoom = msg.room as TicketToRideRoom;
        const previous = room?.id === nextRoom.id ? room.state : null;
        const event = nextRoom.state?.log.at(-1);
        const index = event?.card && previous ? previous.market.indexOf(event.card) : -1;
        const source =
          index >= 0
            ? doc.querySelector<HTMLElement>(`[data-market-index="${index}"]`)
            : $('ticketToRideDeck');
        const origin =
          drawOrigin?.revision === previous?.revision
            ? drawOrigin
            : { rect: source?.getBoundingClientRect() };
        room = nextRoom;
        resume = room.id;
        pending = false;
        if (!previous || (room.state && room.state.revision > previous.revision)) {
          drawOrigin = null;
        }
        clearTimeout(timer);
        if (
          previous &&
          Object.keys(room.state?.claimed || {}).some((id) => !previous.claimed[id])
        ) {
          selection = null;
        }
        render();
        animateState(previous, room.state, origin);
      }
      if (msg.type === 'ticket-to-ride-rooms') {
        rooms = (msg.rooms as TicketToRideOpenRoom[]) || [];
        resume = (msg.resumeId as string | null) ?? null;
        if (!room) render();
      }
      if (msg.type === 'ticket-to-ride-left') {
        clearEffects();
        room = null;
        resume = null;
        pending = false;
        drawOrigin = null;
        clearTimeout(timer);
        selection = null;
        highlight = null;
        notice = (msg.reason as string) || '';
        render();
        void request('list');
      }
      if (msg.type === 'ticket-to-ride-error') {
        notice = (msg.message as string) || '';
        pending = false;
        drawOrigin = null;
        clearTimeout(timer);
        if (msg.code === 'TICKET_TO_RIDE_STALE') void request('state');
        render();
      }
      if (msg.type === 'connection' && !msg.connected && room) {
        pending = false;
        drawOrigin = null;
        notice = 'Conexão interrompida. Retome sua mesa em até 90 segundos.';
        render();
      }
      if (msg.type === 'auth-result' && msg.ok) {
        if (room) void request('resume', { roomId: room.id });
        else if (!$('ticketToRideScreen')?.classList.contains('hidden')) void request('list');
      }
    });

    target.addEventListener('trono-auth-change', onAuthChange);
    render();
  }

  target.addEventListener('trono:ready', bind, { once: true });

  const controller: TronoTicketToRideController = {
    open,
    get room() {
      return room;
    },
  };
  runtime.TronoTicketToRide = controller;

  const dispose = () => {
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('trono-auth-change', onAuthChange);
    doc.removeEventListener('fullscreenchange', onFullscreenChange);
    observer?.disconnect();
    unsubscribeNetwork?.();
    clearEffects();
    clearTimeout(timer);
    if (runtime.TronoTicketToRide === controller) delete runtime.TronoTicketToRide;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
