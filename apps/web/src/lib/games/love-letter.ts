import type { SocketMessage } from '../../types/socket';
import type {
  LoveLetterSnapshot,
  LoveLetterRoom,
  LoveLetterMove,
  LoveLetterRules,
  LoveLetterCard,
  LoveLetterState,
  LoveLetterEvent,
} from '../../types/love-letter';
import { readLoveLetterRoom, readLoveLetterRooms } from './love-letter-protocol.ts';
import { freezeGame } from './freeze.ts';
type Action =
  'list' | 'create' | 'join' | 'resume' | 'start' | 'leave' | 'move' | 'state' | 'next-round';
export const loveLetterTimings = { guard: 2000, announce: 1200, result: 2800 } as const;
interface Options {
  getAccountId(): string | null;
  connected(): boolean;
  visible(): boolean;
  reduced(): boolean;
  subscribeIdentity(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  ensureAuthenticated(): Promise<boolean>;
  send(action: Action, payload: Record<string, unknown>): boolean;
  rules: LoveLetterRules;
  schedule?(fn: () => void, ms: number): () => void;
  sound?(kind: string): void;
  warn?(error: unknown): void;
}
const initial: LoveLetterSnapshot = freezeGame({
  accountId: null,
  connected: false,
  room: null,
  rooms: [],
  resumeId: null,
  notice: '',
  pending: false,
  selected: null,
  chancellor: null,
  privateOpen: false,
  rulesOpen: false,
  effectTarget: null,
  displayState: null,
  presentation: null,
});
/** Owns the current viewer's table and choices. Server rules retain all authority. */
export function createLoveLetter(options: Options) {
  let state = initial,
    disposed = false,
    started = false,
    epoch = 0,
    authenticatedEpoch = -1,
    pendingVersion = 0,
    effectVersion = 0,
    seenPrivate = 0;
  let cancelPending: (() => void) | undefined, cancelEffect: (() => void) | undefined;
  const presentations: {
    before: LoveLetterState;
    after: LoveLetterState;
    event: LoveLetterEvent;
  }[] = [];
  const listeners = new Set<() => void>(),
    subscriptions: (() => void)[] = [],
    R = options.rules;
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  function update(patch: Partial<LoveLetterSnapshot>) {
    if (disposed) return;
    state = freezeGame({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  const locked = () => disposed || state.pending || !state.connected || !!state.presentation;
  const own = () => state.room?.state?.players.find((p) => p.id === state.accountId);
  const turn = () => {
    const s = state.room?.state;
    return (
      !!s && ['action', 'chancellor'].includes(s.phase) && s.players[s.turn].id === state.accountId
    );
  };
  const selectedCard = () =>
    own()?.hand.find((c): c is LoveLetterCard => !c.hidden && c.id === state.selected?.cardId);
  function dismiss() {
    update({ selected: null, privateOpen: false, rulesOpen: false });
  }
  function clearPending() {
    pendingVersion++;
    cancelPending?.();
    cancelPending = undefined;
  }
  function clearEffect() {
    effectVersion++;
    cancelEffect?.();
    cancelEffect = undefined;
  }
  function stopEffects() {
    clearEffect();
    presentations.length = 0;
    update({ effectTarget: null, presentation: null, displayState: state.room?.state ?? null });
  }
  function presentNext() {
    if (disposed) return;
    clearEffect();
    const next = presentations.shift();
    if (!next) {
      update({ presentation: null, effectTarget: null, displayState: state.room?.state ?? null });
      checkPrivate();
      return;
    }
    if (next.event.kind === 'round-start') {
      presentNext();
      return;
    }
    update({
      displayState: next.before,
      presentation: { event: next.event, phase: 'announce' },
      effectTarget: next.event.targetId ?? null,
      privateOpen: false,
    });
    if (disposed) return;
    options.sound?.('love-letter-card');
    const ticket = effectVersion;
    cancelEffect = schedule(
      () => {
        if (disposed || ticket !== effectVersion) return;
        clearEffect();
        update({ displayState: next.after, presentation: { event: next.event, phase: 'result' } });
        if (disposed) return;
        if (next.event.roundResult) options.sound?.('love-letter-score');
        const resultTicket = effectVersion;
        cancelEffect = schedule(() => {
          if (!disposed && resultTicket === effectVersion) presentNext();
        }, loveLetterTimings.result);
      },
      next.event.card?.rank === 1 && next.event.targetId
        ? loveLetterTimings.guard
        : loveLetterTimings.announce,
    );
  }
  function checkPrivate() {
    const s = state.room?.state;
    if (!s || !options.visible() || state.presentation) return;
    const unread = s.private.filter((p) => p.revision > seenPrivate);
    if (unread.length) {
      seenPrivate = Math.max(...s.private.map((p) => p.revision));
      update({ privateOpen: true });
    }
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
      if (!options.send(action, payload)) throw Error('Conexão interrompida.');
      return true;
    } catch (error) {
      if (!disposed && operation === epoch && valid())
        update({
          notice: error instanceof Error ? error.message : 'Não foi possível consultar a mesa.',
        });
      return false;
    }
  }
  function accept(next: LoveLetterRoom) {
    const before = state.room,
      s = next.state;
    if (before?.id === next.id && before.state && (!s || s.revision < before.state.revision))
      return;
    const changed = before?.id !== next.id || before?.state?.revision !== s?.revision,
      newTable = before?.id !== next.id,
      newRound = newTable || before?.state?.round !== s?.round,
      continuous = !newTable && !!before?.state && !!s && s.revision === before.state.revision + 1,
      animate = continuous && options.visible() && !!s?.last;
    if (changed) {
      clearPending();
      if (!animate) {
        clearEffect();
        presentations.length = 0;
      }
    }
    if (newTable) seenPrivate = 0;
    let chancellor = state.chancellor;
    if (s?.phase === 'chancellor' && s.players[s.turn].id === state.accountId) {
      const hand = s.players[s.turn].hand.filter((c): c is LoveLetterCard => !c.hidden);
      if (
        changed ||
        !chancellor ||
        ![chancellor.keep, ...chancellor.bottom].every((id) => hand.some((c) => c.id === id))
      )
        chancellor = {
          revision: s.revision,
          keep: hand[0].id,
          bottom: hand.slice(1).map((c) => c.id),
        };
    } else chancellor = null;
    update({
      room: next,
      resumeId: next.id,
      notice: '',
      chancellor,
      ...(changed ? { pending: false, selected: null } : {}),
      ...((changed && !animate) || (!changed && !state.presentation) ? { displayState: s } : {}),
      ...(changed && !animate ? { presentation: null, effectTarget: null } : {}),
      ...(newRound ? { privateOpen: false } : {}),
    });
    if (disposed) return;
    if (changed && animate && s?.last && before?.state) {
      presentations.push({ before: before.state, after: s, event: s.last });
      if (!state.presentation) presentNext();
    }
    checkPrivate();
  }
  function syncIdentity() {
    const id = options.getAccountId();
    if (disposed || id === state.accountId) return;
    epoch++;
    authenticatedEpoch = -1;
    seenPrivate = 0;
    clearPending();
    clearEffect();
    presentations.length = 0;
    update({ ...initial, accountId: id, connected: options.connected() });
    if (id && options.visible()) void request('list');
  }
  function message(m: SocketMessage) {
    if (disposed) return;
    if (m.type === 'connection' && typeof m.connected === 'boolean') {
      update({ connected: m.connected });
      if (!m.connected) {
        epoch++;
        authenticatedEpoch = -1;
        clearPending();
        stopEffects();
        dismiss();
        update({
          pending: false,
          chancellor: null,
          ...(state.room
            ? { notice: 'Conexão interrompida. Você tem 90 segundos para retomar sua cadeira.' }
            : {}),
        });
      }
      return;
    }
    if (!state.accountId) return;
    if (m.type.startsWith('love-letter-') && authenticatedEpoch !== epoch) return;
    try {
      switch (m.type) {
        case 'love-letter-state':
          accept(readLoveLetterRoom(m.room, state.accountId));
          break;
        case 'love-letter-rooms': {
          const rooms = readLoveLetterRooms(m.rooms);
          if (m.resumeId !== null && (typeof m.resumeId !== 'string' || !m.resumeId))
            throw Error('Mesa de retomada inválida.');
          update({ rooms, resumeId: m.resumeId });
          break;
        }
        case 'love-letter-left':
          if (m.reason != null && typeof m.reason !== 'string')
            throw Error('Aviso da mesa inválido.');
          clearPending();
          stopEffects();
          dismiss();
          seenPrivate = 0;
          update({
            room: null,
            resumeId: null,
            pending: false,
            chancellor: null,
            notice: typeof m.reason === 'string' ? m.reason : '',
          });
          void request('list');
          break;
        case 'love-letter-error':
          if (typeof m.message !== 'string') throw Error('Aviso da mesa inválido.');
          if (!m.requestId) {
            clearPending();
            update({ pending: false, notice: m.message });
            if (m.code === 'LOVE_LETTER_STALE') {
              dismiss();
              void request('state');
            }
          }
          break;
        case 'auth-result':
          if (m.ok === true) {
            if (state.room) void request('resume', { roomId: state.room.id });
            else if (options.visible()) void request('list');
          }
          break;
      }
    } catch (error) {
      options.warn?.(error);
    }
  }
  async function confirmed(action: 'move' | 'next-round', payload: Record<string, unknown>) {
    const room = state.room,
      s = room?.state;
    if (locked() || !room || !s) return;
    clearPending();
    const ticket = pendingVersion,
      revision = s.revision,
      current = () =>
        ticket === pendingVersion &&
        state.room?.id === room.id &&
        state.room.state?.revision === revision;
    update({ pending: true, notice: '', selected: null, privateOpen: false, rulesOpen: false });
    cancelPending = schedule(() => {
      if (disposed || !current()) return;
      clearPending();
      update({ pending: false, notice: 'Aguardando confirmação da mesa. Confira sua conexão.' });
      void request('state', {}, () => state.room?.id === room.id);
    }, 12000);
    if (!(await request(action, { revision, ...payload }, current)) && current() && !disposed) {
      clearPending();
      update({ pending: false });
    }
  }
  function commit(input: LoveLetterMove) {
    const s = state.room?.state;
    if (locked() || !s || !turn()) return;
    const legal = R.legalActions(s).find(
      (m) =>
        m.kind === input.kind &&
        (m.kind === 'play' && input.kind === 'play'
          ? m.cardId === input.cardId && m.targetId === input.targetId && m.guess === input.guess
          : m.kind === 'chancellor' && input.kind === 'chancellor'
            ? m.keep === input.keep &&
              m.bottom.length === input.bottom.length &&
              m.bottom.every((id, i) => id === input.bottom[i])
            : false),
    );
    if (legal) return confirmed('move', { move: structuredClone(legal) });
  }
  function selectCard(id: string) {
    const s = state.room?.state,
      p = own();
    if (locked() || !s || !p || !turn() || s.phase !== 'action') return;
    const c = p.hand.find((c): c is LoveLetterCard => !c.hidden && c.id === id);
    if (!c) return;
    if (R.forced(p) && c.rank !== 8) {
      update({ notice: 'Com Rei ou Príncipe na mão, você precisa jogar a Condessa.' });
      return;
    }
    update({ selected: { cardId: id, revision: s.revision, targetId: null }, notice: '' });
  }
  function chooseTarget(id: string) {
    const s = state.room?.state,
      c = selectedCard(),
      choice = state.selected;
    if (
      locked() ||
      !s ||
      !c ||
      !choice ||
      choice.revision !== s.revision ||
      ![1, 2, 3, 5, 7].includes(c.rank) ||
      !R.eligible(s, c.rank).includes(id)
    )
      return;
    if (c.rank === 1) update({ selected: { ...choice, targetId: id } });
    else return commit({ kind: 'play', cardId: c.id, targetId: id });
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
      if (disposed || started) return;
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
      checkPrivate();
    },
    refreshRooms: () => request('list'),
    selectCard,
    chooseTarget,
    commit,
    dismiss,
    guess(rank: number) {
      const c = selectedCard(),
        choice = state.selected;
      if (c?.rank === 1 && choice?.targetId && choice.revision === state.room?.state?.revision)
        return commit({ kind: 'play', cardId: c.id, targetId: choice.targetId, guess: rank });
    },
    confirmSelected() {
      const c = selectedCard(),
        choice = state.selected,
        s = state.room?.state;
      if (
        c &&
        s &&
        choice?.revision === s.revision &&
        (![1, 2, 3, 5, 7].includes(c.rank) || !R.eligible(s, c.rank).length)
      )
        return commit({ kind: 'play', cardId: c.id });
    },
    cancelSelection() {
      update({ selected: null });
    },
    backTargets() {
      if (state.selected) update({ selected: { ...state.selected, targetId: null } });
    },
    chooseKeep(id: string) {
      const s = state.room?.state;
      if (locked() || !s || !turn() || s.phase !== 'chancellor') return;
      const hand = own()!.hand.filter((c): c is LoveLetterCard => !c.hidden);
      if (hand.some((c) => c.id === id))
        update({
          chancellor: {
            revision: s.revision,
            keep: id,
            bottom: hand.filter((c) => c.id !== id).map((c) => c.id),
          },
        });
    },
    invertBottom() {
      const c = state.chancellor;
      if (!locked() && c && c.revision === state.room?.state?.revision && c.bottom.length === 2)
        update({ chancellor: { ...c, bottom: [...c.bottom].reverse() } });
    },
    confirmChancellor() {
      const c = state.chancellor;
      if (c && c.revision === state.room?.state?.revision)
        return commit({ kind: 'chancellor', keep: c.keep, bottom: [...c.bottom] });
    },
    showPrivate() {
      if (!state.presentation && state.room?.state?.private.length) update({ privateOpen: true });
    },
    closePrivate() {
      update({ privateOpen: false });
    },
    showRules(v: boolean) {
      update({ rulesOpen: v });
    },
    visibilityChanged() {
      if (!options.visible()) {
        dismiss();
        stopEffects();
      } else {
        checkPrivate();
      }
    },
    create(n: number) {
      if ([2, 3, 4, 5, 6].includes(n)) void request('create', { maxPlayers: n });
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
    nextRound() {
      if (state.room?.hostId === state.accountId && state.room.state?.phase === 'round-over')
        return confirmed('next-round', {});
    },
    leave: () => request('leave'),
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      clearPending();
      stopEffects();
      subscriptions.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type LoveLetter = ReturnType<typeof createLoveLetter>;
