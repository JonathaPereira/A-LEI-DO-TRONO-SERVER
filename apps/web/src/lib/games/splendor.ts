import type { SocketMessage } from '../../types/socket';
import type {
  SplendorSnapshot,
  SplendorRoom,
  SplendorMove,
  SplendorState,
  SplendorEvent,
  SplendorPhase,
  SplendorRules,
  SplendorCard,
} from '../../types/splendor';
import {
  freezeSplendor,
  readSplendorRoom,
  readSplendorRooms,
  readSplendorRanking,
} from './splendor-protocol.ts';
type Action =
  | 'list'
  | 'ranking'
  | 'create'
  | 'join'
  | 'resume'
  | 'start'
  | 'leave'
  | 'move'
  | 'state'
  | 'retry-record';
interface Options {
  getAccountId(): string | null;
  connected(): boolean;
  visible(): boolean;
  reduced(): boolean;
  subscribeIdentity(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  ensureAuthenticated(): Promise<boolean>;
  send(action: Action, payload: Record<string, unknown>): boolean;
  rules: SplendorRules;
  uuid(): string;
  schedule?(fn: () => void, ms: number): () => void;
  effect?(event: SplendorEvent, phase: SplendorPhase): void;
  capturePurchase?(event: SplendorEvent): (() => void) | undefined;
  cancelEffects?(): void;
  sound?(kind: string): void;
  warn?(error: unknown): void;
}
const zero = () => Array<number>(6).fill(0);
const initial: SplendorSnapshot = freezeSplendor({
  accountId: null,
  connected: false,
  room: null,
  rooms: [],
  resumeId: null,
  notice: '',
  ranking: [],
  rankingError: '',
  pending: false,
  selected: zero(),
  replay: null,
  card: null,
  returns: null,
  collection: null,
  rulesOpen: false,
});
export function createSplendor(options: Options) {
  let state = initial,
    disposed = false,
    started = false,
    epoch = 0,
    authenticatedEpoch = -1,
    rankRequest: string | null = null,
    version = 0,
    pendingVersion = 0;
  let queue: { from: SplendorState; to: SplendorState }[] = [],
    cancelPending: (() => void) | undefined,
    cancelDelay: (() => void) | undefined,
    wake: (() => void) | undefined;
  const listeners = new Set<() => void>(),
    subscriptions: (() => void)[] = [],
    R = options.rules;
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  function update(patch: Partial<SplendorSnapshot>) {
    if (disposed) return;
    state = freezeSplendor({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  const display = () => state.replay?.state ?? state.room?.state;
  const local = (s = display()) => s?.players.find((p) => p.id === state.accountId);
  const locked = () => disposed || state.pending || !!state.replay || !state.connected;
  const turn = (s = state.room?.state) =>
    !!s && s.phase !== 'finished' && s.players[s.turn].id === state.accountId;
  const sound = (kind: string) => {
    if (options.visible()) options.sound?.('splendor-' + kind);
  };
  function clearPending() {
    pendingVersion++;
    cancelPending?.();
    cancelPending = undefined;
  }
  function dismiss() {
    update({ card: null, returns: null, collection: null, rulesOpen: false });
  }
  function stopAnimations() {
    version++;
    queue = [];
    cancelDelay?.();
    cancelDelay = undefined;
    wake?.();
    wake = undefined;
    options.cancelEffects?.();
    update({ replay: null });
  }
  function wait(ms: number, ticket: number) {
    if (disposed || ticket !== version) return Promise.resolve();
    return new Promise<void>((resolve) => {
      wake = resolve;
      cancelDelay = schedule(() => {
        wake = undefined;
        cancelDelay = undefined;
        resolve();
      }, ms);
    });
  }
  async function request(
    action: Action,
    payload: Record<string, unknown> = {},
    valid = () => true,
  ) {
    const operation = epoch;
    try {
      if (
        disposed ||
        !(await options.ensureAuthenticated()) ||
        disposed ||
        operation !== epoch ||
        !state.accountId ||
        !options.connected() ||
        !valid()
      )
        return false;
      authenticatedEpoch = operation;
      if (!options.send(action, payload)) throw Error('Conexão interrompida. Tente novamente.');
      return true;
    } catch (error) {
      if (!disposed && operation === epoch && valid())
        update({
          notice: error instanceof Error ? error.message : 'Não foi possível consultar a mesa.',
        });
      return false;
    }
  }
  function refreshRanking() {
    const id = options.uuid();
    rankRequest = id;
    update({ rankingError: '' });
    void request('ranking', { requestId: id }, () => rankRequest === id);
  }
  const transferTime = (tokens: number[] | undefined) => {
    const n = R.sum(tokens ?? []);
    return n ? 1800 + (n - 1) * 90 : 0;
  };
  async function animateQueue() {
    if (disposed || state.replay || !queue.length) return;
    const ticket = version,
      current = () => !disposed && ticket === version && options.visible();
    while (queue.length && current()) {
      const job = queue.shift()!,
        next = job.to,
        event = next.last!;
      let visual = structuredClone(job.from),
        displayScore = visual.players.find((p) => p.id === event.playerId)!.score;
      const phase = (phase: SplendorPhase) =>
        update({ replay: { state: visual, event, displayScore, phase } });
      if (event.kind === 'buy') {
        phase('payment');
        sound('chip');
        options.effect?.(event, 'payment');
        await wait(Math.max(1000, transferTime(event.payment) + 300), ticket);
        if (!current()) return;
        visual = structuredClone(visual);
        visual.players.find((p) => p.id === event.playerId)!.tokens = [
          ...next.players.find((p) => p.id === event.playerId)!.tokens,
        ];
        visual.bank = [...next.bank];
        phase('showcase');
        sound('card');
        await wait(1900, ticket);
        if (!current()) return;
        const flight = options.capturePurchase?.(event);
        phase('flight');
        flight?.();
        await wait(1900, ticket);
      } else if (event.kind === 'take') {
        phase('flight');
        sound('chip');
        options.effect?.(event, 'flight');
        await wait(transferTime(event.tokens) + 350, ticket);
      } else {
        phase('flight');
        sound(event.kind === 'noble' ? 'noble' : 'card');
        options.effect?.(event, 'flight');
        await wait(2050, ticket);
      }
      if (!current()) return;
      if (R.sum(event.returned ?? [])) {
        visual = structuredClone(visual);
        visual.players.find((p) => p.id === event.playerId)!.tokens = next.players
          .find((p) => p.id === event.playerId)!
          .tokens.map((n, i) => n + event.returned![i]);
        visual.bank = next.bank.map((n, i) => n - event.returned![i]);
        phase('returned');
        sound('chip');
        options.effect?.(event, 'returned');
        await wait(transferTime(event.returned) + 300, ticket);
        if (!current()) return;
      }
      visual = next;
      displayScore = next.players.find((p) => p.id === event.playerId)!.score;
      phase('landed');
      if (event.points) sound('score');
      await wait(event.points ? 1900 : 1400, ticket);
    }
    if (current()) update({ replay: null });
  }
  function accept(next: SplendorRoom) {
    const previous = state.room;
    if (
      previous?.id === next.id &&
      previous.state &&
      (!next.state || next.state.revision < previous.state.revision)
    )
      return;
    const changed = previous?.id !== next.id || previous?.state?.revision !== next.state?.revision;
    if (previous && previous.id !== next.id) {
      stopAnimations();
      dismiss();
    }
    if (changed) clearPending();
    update({
      room: next,
      resumeId: next.id,
      notice: '',
      ...(changed
        ? { pending: false, selected: zero(), card: null, returns: null, collection: null }
        : {}),
    });
    if (
      previous?.id === next.id &&
      previous.state &&
      next.state &&
      next.state.last &&
      next.state.revision === previous.state.revision + 1 &&
      options.visible() &&
      !options.reduced()
    ) {
      queue.push({ from: previous.state, to: next.state });
      if (queue.length > 12) {
        stopAnimations();
      } else
        void animateQueue().catch((error) => {
          options.warn?.(error);
          stopAnimations();
        });
    }
    if (
      next.state?.phase === 'finished' &&
      next.recordStatus === 'saved' &&
      previous?.recordStatus !== 'saved'
    )
      refreshRanking();
  }
  function syncIdentity() {
    const id = options.getAccountId();
    if (disposed || id === state.accountId) return;
    epoch++;
    authenticatedEpoch = -1;
    rankRequest = null;
    clearPending();
    stopAnimations();
    update({ ...initial, accountId: id, connected: options.connected() });
    if (id && options.visible()) {
      void request('list');
      refreshRanking();
    }
  }
  function message(m: SocketMessage) {
    if (disposed) return;
    if (m.type === 'connection' && typeof m.connected === 'boolean') {
      update({ connected: m.connected });
      if (!m.connected) {
        epoch++;
        authenticatedEpoch = -1;
        rankRequest = null;
        clearPending();
        stopAnimations();
        dismiss();
        update({
          pending: false,
          ...(state.room ? { notice: 'Conexão interrompida. Sua mesa aguarda sua volta.' } : {}),
        });
      }
      return;
    }
    if (!state.accountId) return;
    if (m.type.startsWith('splendor-') && authenticatedEpoch !== epoch) return;
    try {
      switch (m.type) {
        case 'splendor-state':
          accept(readSplendorRoom(m.room, state.accountId));
          break;
        case 'splendor-rooms': {
          const rooms = readSplendorRooms(m.rooms);
          if (m.resumeId !== null && (typeof m.resumeId !== 'string' || !m.resumeId))
            throw Error('Mesa de retomada inválida.');
          update({ rooms, resumeId: m.resumeId });
          break;
        }
        case 'splendor-left':
          clearPending();
          stopAnimations();
          dismiss();
          update({ room: null, resumeId: null, pending: false, selected: zero() });
          void request('list');
          break;
        case 'splendor-ranking':
          if (m.requestId === rankRequest)
            update({ ranking: readSplendorRanking(m.rows), rankingError: '' });
          break;
        case 'splendor-error':
          if (typeof m.message !== 'string') throw Error('Aviso da mesa inválido.');
          if (m.requestId === rankRequest) update({ rankingError: m.message });
          else if (!m.requestId) {
            clearPending();
            update({ pending: false, notice: m.message });
            if (m.code === 'SPLENDOR_STALE') {
              dismiss();
              void request('state');
            }
          }
          break;
        case 'auth-result':
          if (m.ok === true) {
            if (state.room) void request('resume', { roomId: state.room.id });
            else if (options.visible()) {
              void request('list');
              refreshRanking();
            }
          }
          break;
      }
    } catch (error) {
      options.warn?.(error);
    }
  }
  function validMove(move: SplendorMove, s: SplendorState) {
    if (
      !R.legalActions(s).some(
        (m) =>
          m.kind === move.kind &&
          (m.kind === 'take' && move.kind === 'take'
            ? m.tokens.every((n, i) => n === move.tokens[i]) && move.tokens.length === 6
            : m.kind === 'reserve' && move.kind === 'reserve'
              ? m.id === move.id && m.level === move.level
              : 'id' in m && 'id' in move
                ? m.id === move.id
                : m.kind === 'pass'),
      )
    )
      return false;
    if (move.kind === 'buy' && move.payment) {
      const p = local(s)!,
        c = [...s.market.flat(), ...p.reserved].find(
          (c): c is SplendorCard => !!c && !c.hidden && c.id === move.id,
        );
      if (!c) return false;
      const due = R.price(p, c),
        pay = move.payment;
      if (
        pay.length !== 6 ||
        pay.some((n, i) => !Number.isInteger(n) || n < 0 || n > p.tokens[i]) ||
        due.some((n, i) => pay[i] > n) ||
        pay[5] !== due.reduce((sum, n, i) => sum + n - pay[i], 0)
      )
        return false;
    }
    return true;
  }
  async function commit(move: SplendorMove, expected = state.room?.state?.revision) {
    const room = state.room,
      s = room?.state;
    if (locked() || !s || !room || !turn(s) || s.revision !== expected || !validMove(move, s))
      return;
    clearPending();
    const ticket = pendingVersion,
      current = () =>
        ticket === pendingVersion &&
        state.room?.id === room.id &&
        state.room.state?.revision === expected;
    update({
      pending: true,
      selected: zero(),
      notice: '',
      card: null,
      returns: null,
      collection: null,
      rulesOpen: false,
    });
    cancelPending = schedule(() => {
      if (disposed || !current()) return;
      clearPending();
      update({
        pending: false,
        notice: 'Aguardando confirmação. Confira a conexão antes de tentar novamente.',
      });
      void request('state', {}, () => state.room?.id === room.id);
    }, 12000);
    if (!(await request('move', { revision: expected, move }, current)) && current() && !disposed) {
      clearPending();
      update({ pending: false });
    }
  }
  function submit(input: SplendorMove) {
    const s = state.room?.state;
    if (locked() || !s || !turn(s) || !validMove(input, s)) return;
    const move = structuredClone(input),
      held = [...local(s)!.tokens];
    if (move.kind === 'take') move.tokens.forEach((n, i) => (held[i] += n));
    if (move.kind === 'reserve') held[5] += Math.min(1, s.bank[5]);
    const excess = Math.max(0, R.sum(held) - 10);
    if (excess) {
      update({
        card: null,
        returns: { move, held, excess, returned: zero(), revision: s.revision },
      });
      return;
    }
    return commit(move);
  }
  function openCard(id: string, actions = true) {
    const s = display();
    if (!s) return;
    const c = [...s.market.flat(), ...s.players.flatMap((p) => [...p.cards, ...p.reserved])].find(
      (c): c is SplendorCard => !!c && !c.hidden && c.id === id,
    );
    if (!c) return;
    update({
      card: {
        card: c,
        payment: local(s) ? R.payment(local(s)!, c) : null,
        actions,
        revision: s.revision,
      },
    });
    sound('card');
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      if (disposed) return () => {};
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      syncIdentity();
      subscriptions.push(
        options.subscribeIdentity(syncIdentity),
        options.subscribeMessages(message),
      );
    },
    open() {
      if (disposed) return;
      syncIdentity();
      void request('list');
      refreshRanking();
    },
    refreshRanking,
    refreshRooms: () => request('list'),
    submit,
    openCard,
    stopAnimations,
    dismiss,
    visibilityChanged() {
      if (!options.visible()) {
        stopAnimations();
        dismiss();
      } else if (options.reduced()) stopAnimations();
    },
    selectToken(color: number) {
      const s = state.room?.state;
      if (
        locked() ||
        !s ||
        s.phase !== 'action' ||
        !turn(s) ||
        !Number.isInteger(color) ||
        color < 0 ||
        color > 4
      )
        return;
      const selected = [...state.selected];
      if (selected[color] === 2) selected[color] = 0;
      else if (selected[color] === 1)
        selected[color] = R.sum(selected) === 1 && s.bank[color] >= 4 ? 2 : 0;
      else if (!selected.includes(2) && R.sum(selected) < 3 && s.bank[color] > 0)
        selected[color] = 1;
      update({ selected });
      sound('chip');
    },
    clearSelection() {
      update({ selected: zero() });
    },
    payGold(color: number, use: boolean) {
      const choice = state.card,
        s = display(),
        p = local(s);
      if (!choice?.payment || !s || !p || !Number.isInteger(color) || color < 0 || color > 4)
        return;
      const pay = [...choice.payment],
        due = R.price(p, choice.card);
      if (use) {
        if (!pay[color] || pay[5] >= p.tokens[5]) return;
        pay[color]--;
        pay[5]++;
      } else {
        if (!pay[5] || pay[color] >= Math.min(due[color], p.tokens[color])) return;
        pay[color]++;
        pay[5]--;
      }
      update({ card: { ...choice, payment: pay } });
    },
    buy() {
      const c = state.card;
      if (c?.payment && c.actions && c.revision === state.room?.state?.revision)
        return submit({ kind: 'buy', id: c.card.id, payment: [...c.payment] });
    },
    reserve() {
      const c = state.card;
      if (c?.actions && c.revision === state.room?.state?.revision)
        return submit({ kind: 'reserve', id: c.card.id });
    },
    returnToken(color: number) {
      const c = state.returns;
      if (!c || !Number.isInteger(color) || color < 0 || color > 5) return;
      const returned = [...c.returned];
      returned[color] =
        returned[color] < c.held[color] && R.sum(returned) < c.excess ? returned[color] + 1 : 0;
      update({ returns: { ...c, returned } });
    },
    confirmReturn() {
      const c = state.returns;
      if (c && R.sum(c.returned) === c.excess)
        return commit({ ...c.move, returnTokens: [...c.returned] }, c.revision);
    },
    closeCard() {
      update({ card: null });
    },
    closeReturn() {
      update({ returns: null });
    },
    closeCollection() {
      update({ collection: null });
    },
    showRules(value: boolean) {
      update({ rulesOpen: value });
    },
    openCollection(id: string) {
      if (display()?.players.some((p) => p.id === id)) update({ collection: id });
    },
    create(n: number) {
      if ([2, 3, 4].includes(n)) void request('create', { maxPlayers: n });
    },
    join(id: string) {
      if (state.rooms.some((r) => r.id === id)) void request('join', { roomId: id });
    },
    resume() {
      if (state.resumeId) void request('resume', { roomId: state.resumeId });
    },
    startGame(fillBots: boolean) {
      const r = state.room;
      if (
        r &&
        !r.state &&
        r.hostId === state.accountId &&
        r.players.every((p) => p.online) &&
        (fillBots || r.players.length >= 2)
      )
        void request('start', { fillBots });
    },
    leave: () => request('leave'),
    retryRecord: () => request('retry-record'),
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      clearPending();
      stopAnimations();
      subscriptions.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type Splendor = ReturnType<typeof createSplendor>;
