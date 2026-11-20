import type { SocketMessage } from '../../types/socket';
import type {
  ThroneLocalStatus,
  ThroneMatchSnapshot,
  ThroneMatchStatus,
} from '../../types/throne-match';
import type { ThroneChoiceScope } from './throne-choices';
import { freezeGame } from './freeze.ts';
import { readThroneMatch } from './throne-match-protocol.ts';

interface Options {
  scope(): ThroneChoiceScope | null;
  connected(): boolean;
  visible(): boolean;
  now(): number;
  every250ms(fn: () => void): () => void;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  warn?(error: unknown): void;
}
const idle: ThroneMatchStatus = freezeGame({
  round: 1,
  trick: 1,
  turn: 'Preparando...',
  yourTurn: false,
  clock: '01:00',
  clockClass: 'idle',
});
const initial: ThroneMatchSnapshot = freezeGame({
  mode: null,
  match: null,
  status: idle,
  visible: false,
});
const phaseNames: Readonly<Record<string, string>> = {
  'round-start': 'Preparando rodada',
  'trick-start': 'Iniciando vaza',
  resolve: 'Resolvendo vaza',
  'round-end': 'Fim da rodada',
  setup: 'Preparando',
};
export function createThroneMatch(options: Options) {
  let state = initial,
    local: ThroneLocalStatus | null = null,
    started = false,
    disposed = false,
    blocked = false;
  let scope: ThroneChoiceScope | null = null,
    stopTick: (() => void) | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function source(): ThroneLocalStatus | null {
    const m = state.match;
    return state.mode === 'local'
      ? local
      : m
        ? {
            round: m.round,
            trick: m.trick,
            phase: m.phase,
            turnName: m.turn == null ? null : m.players[m.turn].name,
            yourTurn: m.phase === 'await-play' && m.turn === m.localPlayerId,
            deadline: m.turnDeadline,
          }
        : null;
  }
  function running() {
    const s = source();
    return !!s && s.phase === 'await-play' && s.turnName != null && !!s.deadline;
  }
  function timer() {
    const needed = state.visible && running() && source()!.deadline! > options.now();
    if (!needed && stopTick) {
      stopTick();
      stopTick = null;
    } else if (needed && !stopTick) stopTick = options.every250ms(() => publish());
  }
  function status(): ThroneMatchStatus {
    const s = source();
    if (!s) return idle;
    const sec = running() ? Math.ceil(Math.max(0, s.deadline! - options.now()) / 1000) : null;
    return {
      round: s.round,
      trick: s.trick,
      turn: s.turnName == null ? phaseNames[s.phase] || 'Corte em movimento' : `Vez: ${s.turnName}`,
      yourTurn: s.yourTurn,
      clock:
        sec == null
          ? '01:00'
          : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
      clockClass: sec == null ? 'idle' : sec <= 10 ? 'danger' : sec <= 20 ? 'warning' : '',
    };
  }
  function publish(patch: Partial<ThroneMatchSnapshot> = {}) {
    if (disposed) return;
    const before = state;
    state = { ...state, ...patch, visible: options.visible() };
    const next = status();
    if (
      before.mode === state.mode &&
      before.match === state.match &&
      before.visible === state.visible &&
      JSON.stringify(before.status) === JSON.stringify(next)
    ) {
      state = before;
      timer();
      return;
    }
    state = freezeGame({ ...state, status: next });
    timer();
    listeners.forEach((fn) => fn());
  }
  function clear() {
    blocked = true;
    local = null;
    publish({ mode: null, match: null });
  }
  function sync() {
    const next = options.scope(),
      changed = next?.key !== scope?.key || next?.seat !== scope?.seat;
    if (changed) {
      scope = next;
      blocked = state.mode === 'local';
    }
    if (state.mode === 'online' && (changed || !options.connected()))
      publish({ match: null, ...(changed ? { mode: null } : {}) });
    else publish();
  }
  function receive(message: SocketMessage) {
    if (!started || disposed) return;
    sync();
    if (!scope || !options.connected()) return;
    if (message.type === 'game-started') {
      blocked = false;
      local = null;
      publish({ mode: 'online', match: null });
      return;
    }
    if (message.type !== 'game-state' || blocked) return;
    try {
      const match = readThroneMatch(message.state, scope.seat),
        old = state.match;
      if (
        old &&
        (match.round < old.round || (match.round === old.round && match.trick < old.trick))
      )
        return;
      if (old && JSON.stringify(match) === JSON.stringify(old)) return;
      local = null;
      publish({ mode: 'online', match });
    } catch (error) {
      publish({ match: null });
      options.warn?.(error);
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    clear,
    refresh: sync,
    setLocal(status: ThroneLocalStatus) {
      if (disposed) return;
      local = freezeGame({ ...status });
      blocked = true;
      publish({ mode: 'local', match: null });
    },
    start() {
      if (started || disposed) return;
      started = true;
      scope = options.scope();
      cleanup.push(options.subscribeSource(sync), options.subscribeMessages(receive));
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTick?.();
      stopTick = null;
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
      local = null;
      scope = null;
      state = initial;
    },
  };
}
export type ThroneMatch = ReturnType<typeof createThroneMatch>;
