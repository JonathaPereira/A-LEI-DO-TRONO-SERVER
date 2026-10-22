import { createThroneEffectLifetime, type ThroneEffectTask } from './throne-effect-lifetime.ts';
import {
  effectCardArrival,
  effectChallenge,
  effectExchange,
  effectGains,
  effectInfluence,
  effectOutcome,
  effectResult,
  effectSeat,
  effectText,
} from './throne-effect-protocol.ts';
import type { ThroneCard } from '../../types/throne-choices';

export interface ThroneEffectContext {
  identity: string | null;
  session: string | null;
  stage: string | null;
  visible: boolean;
  localSeat: number | null;
}
interface Options {
  target: Window;
  context(): ThroneEffectContext;
  sound(name: string): void;
  append(message: string): void;
  warn(error: unknown): void;
}
const suits = { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' };
const glyphs = ['♜', '⚿', '⚔', '◉'];
const points = [
  { x: 50, y: 88 },
  { x: 10, y: 50 },
  { x: 50, y: 12 },
  { x: 90, y: 50 },
];
const asset = (card: ThroneCard) =>
  `assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`;

/** Owns only transient presentation. It never owns a socket, turn clock or media resource. */
export function createThroneEffects(options: Options) {
  const win = options.target,
    doc = win.document;
  const lifetime = createThroneEffectLifetime((fn, ms) => {
    const timer = win.setTimeout(fn, ms);
    return () => win.clearTimeout(timer);
  }, options.warn);
  let context = options.context(),
    disposed = false;
  const node = (id: string) => doc.getElementById(id)!;
  const scaleOf = (value: number) =>
    Number.isFinite(value) ? Math.max(0.001, Math.min(2, value)) : 1;
  function refresh() {
    const next = options.context();
    if (
      context.identity !== next.identity ||
      context.session !== next.session ||
      context.stage !== next.stage ||
      context.visible !== next.visible
    )
      lifetime.clear();
    context = next;
  }
  function begin(key: string, table = true) {
    refresh();
    return disposed || (table && (!context.session || !context.visible))
      ? null
      : lifetime.begin(key);
  }
  function element(tag: string, className = '', text = '') {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }
  function show(task: ThroneEffectTask, el: HTMLElement, play = 'show') {
    task.own(() => {
      el.classList.add('hidden');
      if (play) el.classList.remove(play);
      el.setAttribute('aria-hidden', 'true');
    });
    el.classList.remove('hidden');
    if (play) el.classList.remove(play);
    el.setAttribute('aria-hidden', 'false');
    void el.offsetWidth;
    if (play) el.classList.add(play);
  }
  function classes(task: ThroneEffectTask, el: HTMLElement, ...names: string[]) {
    el.classList.add(...names);
    task.own(() => el.classList.remove(...names));
  }
  async function expire(task: ThroneEffectTask, ms: number) {
    await task.wait(ms);
    task.finish();
  }
  function safe<T>(work: () => T): T | undefined {
    if (disposed) return;
    try {
      return work();
    } catch (error) {
      options.warn(error);
    }
  }
  function toast(text: string, milliseconds = 1500, scale = 1) {
    safe(() => {
      const message = effectText(text, 2000),
        task = begin('toast', false);
      if (!task) return;
      node('toast').textContent = message;
      show(task, node('toast'));
      void expire(task, Math.max(0, Math.min(10000, milliseconds)) * scaleOf(scale) + 250);
    });
  }
  function connection(name: string, botName: string | null = null, reason = 'disconnect') {
    safe(() => {
      const player = effectText(name || 'Um jogador'),
        bot = botName ? effectText(botName) : null;
      const task = begin('connection', false);
      if (!task) return;
      const title =
        reason === 'self-disconnect'
          ? 'CONEXÃO COM O SERVIDOR INTERROMPIDA'
          : `${player} ${reason === 'disconnect' ? 'SE DESCONECTOU' : 'SAIU DA SALA'}`;
      const detail =
        reason === 'self-disconnect'
          ? 'Tentando manter o estado local. Recarregue se a conexão não voltar.'
          : bot
            ? `${bot} assumiu o assento e a partida continua.`
            : 'O assento ficou livre.';
      const el = node('connectionNotice');
      el.replaceChildren(element('strong', '', title), element('span', '', detail));
      show(task, el);
      void expire(task, 3600);
    });
  }
  function influence(value: unknown) {
    safe(() => {
      const v = effectInfluence(value),
        task = begin('influence');
      if (!task) return;
      const el = node('influencePublicNotice');
      el.className = `influence-public-notice ${v.action === 'sigilo' ? '' : v.action}`;
      const coins = element('div', 'influence-coins-public');
      for (let i = 0; i < v.cost; i++) coins.append(element('i', '', '✦'));
      const label =
        v.action === 'sigilo' ? 'SIGILO' : `MANOBRA DA CORTE ${v.modifier > 0 ? '+3' : '-3'}`;
      const detail =
        v.action === 'sigilo'
          ? 'Carta jogada oculta • valor original mantido'
          : `Modificador público ${v.modifier > 0 ? '+3' : '-3'} • valor efetivo limitado entre 1 e 12`;
      el.replaceChildren(
        coins,
        element('strong', '', v.name),
        element('b', '', label),
        element(
          'span',
          '',
          detail + (v.declaredSuit ? ` • Naipe anunciado: ${suits[v.declaredSuit]}` : ''),
        ),
      );
      show(task, el);
      options.sound('influence');
      void expire(task, 2700);
    });
  }
  function turn(law: string, scale = 1) {
    safe(() => {
      const text = effectText(law),
        task = begin('turn');
      if (!task) return;
      node('turnNoticeLaw').textContent = `${text} • escolha uma carta válida`;
      show(task, node('turnNotice'), 'play');
      options.sound('turn');
      void expire(task, 2400 * Math.max(0.35, scaleOf(scale)));
    });
  }
  async function exchange(value: unknown, speed = 1) {
    const v = safe(() => effectExchange(value));
    if (!v) return false;
    const task = begin('exchange');
    if (!task) return false;
    const scale = scaleOf(speed),
      wrap = node('exchangeCinematic'),
      stage = node('exchangeStage');
    const duration = win.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 450
      : Math.max(900, 3000 * scale);
    wrap.style.setProperty('--exchange-duration', `${duration}ms`);
    task.own(() => {
      stage.replaceChildren();
      wrap.style.removeProperty('--exchange-duration');
    });
    node('exchangeIcon').textContent = v.kind === 'rotation' ? '⟳' : '⇄';
    node('exchangeKicker').textContent =
      v.kind === 'rotation' ? 'DECRETO EM MOVIMENTO' : 'LEI EM MOVIMENTO';
    node('exchangeTitle').textContent = v.title;
    node('exchangeSubtitle').textContent = v.subtitle;
    const touched = [...new Set(v.moves.flatMap((m) => [m.from, m.to]))];
    for (const id of touched) {
      const player = element('div', `exchange-player-node exchange-node-${id}`),
        label = element('div');
      label.append(element('b', '', v.players[id].name));
      const roles =
        v.kind === 'usurpacao'
          ? [id === v.shadow ? 'Sombra' : '', id === v.crown ? 'Coroa' : ''].filter(Boolean)
          : [];
      if (roles.length) label.append(element('div', 'node-role', roles.join(' • ')));
      player.append(element('span', '', glyphs[id]), label);
      stage.append(player);
    }
    for (const move of v.moves) {
      const a = points[move.from],
        b = points[move.to],
        arrow = element('div', 'exchange-arrow');
      Object.assign(arrow.style, {
        left: `${a.x}%`,
        top: `${a.y}%`,
        width: `${Math.hypot(b.x - a.x, b.y - a.y)}%`,
        transform: `rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI}deg)`,
      });
      stage.append(arrow);
    }
    const seal = element('div', 'exchange-center-seal');
    seal.append(
      element('strong', '', v.kind === 'rotation' ? 'ROTAÇÃO' : 'TROCA'),
      element('small', '', v.kind === 'rotation' ? 'À ESQUERDA' : 'CARTAS OCULTAS'),
    );
    stage.append(seal);
    v.moves.forEach((m, i) => {
      const a = points[m.from],
        b = points[m.to],
        token = element(
          'div',
          `exchange-card-token ${v.kind === 'rotation' ? 'rotation-card' : m.role === 'shadow' ? 'shadow-card' : ''}`,
        );
      const properties = {
        sx: `${a.x}%`,
        sy: `${a.y}%`,
        tx: `${b.x}%`,
        ty: `${b.y}%`,
        delay: `${m.delay * scale}ms`,
        r0: `${i % 2 ? 7 : -7}deg`,
        rm: `${i % 2 ? -7 : 7}deg`,
        r1: `${i % 2 ? -5 : 5}deg`,
      };
      Object.entries(properties).forEach(([key, val]) => token.style.setProperty(`--${key}`, val));
      token.append(element('span', 'exchange-card-label', m.label));
      stage.append(token);
    });
    show(task, wrap, '');
    options.sound('card');
    const complete =
      (await task.wait(duration + Math.max(...v.moves.map((m) => m.delay * scale)) + 80)) &&
      task.active();
    task.finish();
    return complete;
  }
  async function arrival(value: unknown, speed = 1) {
    const v = safe(() => effectCardArrival(value));
    if (!v) return false;
    const task = begin(`card:${v.seat}`);
    if (!task) return false;
    const slot = node(`tableCard${v.seat}`),
      scale = scaleOf(speed);
    classes(task, slot, 'active-drop', 'receiving-card');
    options.sound('card');
    if (v.from && v.card) {
      const from = v.from,
        to = slot.getBoundingClientRect(),
        ghost = doc.createElement('img');
      ghost.className = 'throne-card-ghost';
      ghost.src = asset(v.card);
      ghost.alt = '';
      Object.assign(ghost.style, {
        position: 'fixed',
        zIndex: '200',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: '8px',
        boxShadow: '0 15px 40px #000',
        pointerEvents: 'none',
        willChange: 'transform,opacity',
      });
      doc.body.append(ghost);
      task.own(() => ghost.remove());
      const animation = ghost.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${(to.left - from.left) * 0.58}px,${(to.top - from.top) * 0.58}px) scale(.92)`,
            opacity: 0.98,
            offset: 0.64,
          },
          {
            transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width})`,
            opacity: 0.96,
          },
        ],
        { duration: 560 * scale, easing: 'cubic-bezier(.22,.75,.22,1)', fill: 'forwards' },
      );
      task.own(() => animation.cancel());
      await animation.finished.catch(() => {});
      ghost.remove();
    } else if (!(await task.wait(Math.max(30, 420 * scale)))) return false;
    if (!task.active()) return false;
    slot.classList.remove('receiving-card');
    classes(task, slot, 'settling-card');
    const complete = (await task.wait(Math.max(30, 260 * scale))) && task.active();
    task.finish();
    return complete;
  }
  function played(seat: unknown, speed = 1) {
    safe(() => {
      const id = effectSeat(seat),
        task = begin(`card:${id}`);
      if (!task) return;
      classes(task, node(`tableCard${id}`), 'receiving-card');
      options.sound('card');
      void expire(task, 520 * scaleOf(speed));
    });
  }
  async function runOutcome(
    task: ThroneEffectTask,
    crownName: string,
    shadowName: string,
    speed: number,
  ) {
    const wrap = node('trickOutcome'),
      crown = node('crownOutcome'),
      shadow = node('shadowOutcome'),
      scale = scaleOf(speed);
    node('crownOutcomeName').textContent = crownName;
    node('shadowOutcomeName').textContent = shadowName;
    show(task, wrap, '');
    show(task, crown, 'play');
    options.sound('crown');
    if (!(await task.wait(Math.max(30, 3000 * scale))) || !task.active()) return false;
    crown.classList.add('hidden');
    crown.classList.remove('play');
    if (!(await task.wait(Math.max(30, 220 * scale))) || !task.active()) return false;
    show(task, shadow, 'play');
    options.sound('shadow');
    return (await task.wait(Math.max(30, 3000 * scale))) && task.active();
  }
  async function outcome(value: unknown, speed = 1) {
    const v = safe(() => effectOutcome(value));
    if (!v) return false;
    const task = begin('outcome');
    if (!task) return false;
    const complete = await runOutcome(task, v.crown.name, v.shadow.name, speed);
    task.finish();
    return complete;
  }
  type Gains = ReturnType<typeof effectGains>;
  function recordGains(gains: Gains) {
    for (const gain of gains)
      options.append(
        `Influência: ${gain.player.name} não recebeu Coroa nem Sombra e ganhou +1 (${gain.after}/2).`,
      );
  }
  function paintGains(gains: Gains, speed: number) {
    if (!context.visible || !gains.length) return;
    options.sound('influence');
    for (const gain of gains) {
      const task = begin(`gain:${gain.player.id}`);
      if (!task) continue;
      const el = element(
        'div',
        'influence-gain-float',
        gain.after >= 2 ? '✦ +1 INFLUÊNCIA • PRONTA' : '✦ +1 INFLUÊNCIA',
      );
      node(`playerEffects${gain.player.id}`).append(el);
      task.own(() => el.remove());
      const bank = node(`coinBank${gain.player.id}`);
      if (bank) {
        classes(task, bank, 'gain-flash');
        void task.wait(950).then((active) => {
          if (active && task.active()) bank.classList.remove('gain-flash');
        });
      }
      if (gain.player.id === context.localSeat)
        toast(
          gain.after >= 2
            ? '✦ Influência 2/2 — você pode jogar uma carta oculta!'
            : '✦ Você recebeu +1 Influência.',
          1800,
          speed,
        );
      void expire(task, 1900);
    }
  }
  function gains(value: unknown, speed = 1) {
    safe(() => {
      const gains = effectGains(value);
      refresh();
      if (!context.session) return;
      recordGains(gains);
      paintGains(gains, speed);
    });
  }
  async function result(value: unknown, speed = 1) {
    const v = safe(() => effectResult(value));
    if (!v) return;
    refresh();
    if (!context.session) return;
    // Record public facts on receipt; a cancelled animation must not lose history.
    recordGains(v.gains);
    const task = begin('outcome');
    if (!task) return;
    const complete = await runOutcome(task, v.crown.name, v.shadow.name, speed);
    refresh();
    if (complete && task.active()) paintGains(v.gains, speed);
    task.finish();
  }
  function challenge(value: unknown) {
    safe(() => {
      const v = effectChallenge(value),
        task = begin(`challenge:${v.seat}`);
      if (!task) return;
      const r = node(`player${v.seat}`).getBoundingClientRect(),
        el = element('div', 'challenge-reveal-float');
      el.style.left = `${Math.max(12, Math.min(win.innerWidth - 170, r.left + r.width / 2 - 75))}px`;
      el.style.top = `${Math.max(90, Math.min(win.innerHeight - 240, r.top + r.height / 2 - 95))}px`;
      const label = `${suits[v.card.suit]} ${v.card.value}`,
        img = doc.createElement('img');
      img.src = asset(v.card);
      img.alt = label;
      el.append(element('div', 'challenge-bubble', '⚔ DESAFIO'), img, element('strong', '', label));
      doc.body.append(el);
      task.own(() => el.remove());
      void expire(task, 3000);
    });
  }
  return {
    refresh,
    clear: lifetime.clear,
    toast,
    connection,
    influence,
    turn,
    exchange,
    arrival,
    played,
    outcome,
    gains,
    result,
    challenge,
    dispose() {
      disposed = true;
      lifetime.dispose();
    },
  };
}
export type ThroneEffects = ReturnType<typeof createThroneEffects>;
