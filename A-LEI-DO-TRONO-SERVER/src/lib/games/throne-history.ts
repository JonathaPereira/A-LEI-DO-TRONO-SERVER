import type { SocketMessage } from '../../types/socket';
import type { ThroneMatchSnapshot } from '../../types/throne-match';
import type { ThroneHistorySnapshot, ThroneResult } from '../../types/throne-history';
import type { ThroneChoiceScope } from './throne-choices';
import { freezeGame } from './freeze.ts';
import { readThroneLog, readThroneResult } from './throne-history-protocol.ts';

interface Options {
  identity(): string | null;
  scope(): ThroneChoiceScope | null;
  match(): ThroneMatchSnapshot;
  connected(): boolean;
  visible(): boolean;
  now(): number;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  notify(message: string): void;
  leave(): void;
  warn?(error: unknown): void;
}
const initial: ThroneHistorySnapshot = freezeGame({
  entries: [],
  logOpen: false,
  dialog: null,
  resultOpen: false,
  lastRound: null,
});
const aborted = () =>
  Object.assign(new Error('O resultado da mesa foi encerrado.'), { name: 'AbortError' });
export function createThroneHistory(options: Options) {
  let state = initial,
    started = false,
    disposed = false,
    blocked = false,
    awaitingInitial = false,
    hadMatch = false,
    nextId = 0;
  let identity = options.identity(),
    scope = options.scope(),
    previousMode = options.match().mode;
  let queued: ThroneResult | null = null;
  let local: { dialog: ThroneResult; resolve(): void; reject(error: Error): void } | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [],
    completed = new Set<string>();
  function update(patch: Partial<ThroneHistorySnapshot> = {}) {
    if (disposed) return;
    const next = { ...state, ...patch },
      resultOpen =
        !!next.dialog &&
        options.visible() &&
        (options.match().mode === 'local' || options.connected());
    if (!Object.keys(patch).length && resultOpen === state.resultOpen) return;
    state = freezeGame({ ...next, resultOpen });
    listeners.forEach((fn) => fn());
  }
  function reset(block = true) {
    blocked = block;
    queued = null;
    awaitingInitial = false;
    hadMatch = false;
    completed.clear();
    const pending = local;
    local = null;
    pending?.reject(aborted());
    update({ entries: [], dialog: null, lastRound: null });
  }
  function activate() {
    const m = options.match().match,
      result = queued;
    if (!m || !result || blocked) return;
    if (m.round > result.round) {
      queued = null;
      return;
    }
    if (
      m.round !== result.round ||
      (result.kind === 'final'
        ? m.phase !== 'game-over'
        : !['round-end', 'game-over'].includes(m.phase))
    )
      return;
    queued = null;
    if (
      result.scores.some((p) => {
        const actual = m.players[p.seat];
        return (
          actual.name !== p.name ||
          actual.totalCrowns !== p.crowns ||
          actual.totalShadows !== p.shadows
        );
      })
    ) {
      options.warn?.(new Error('Resultado não corresponde à mesa atual.'));
      return;
    }
    const key = `${result.kind}:${result.round}`;
    if (completed.has(key)) return;
    completed.add(key);
    if (result.kind === 'final') update({ dialog: result });
    else {
      update({ lastRound: result });
      const me = result.scores.find((p) => p.seat === m.localPlayerId)!;
      options.notify(`Fim da Rodada ${result.round} • ${me.prestige} Prestígio`);
    }
  }
  function sync() {
    if (disposed) return;
    const view = options.match(),
      nextScope = options.scope(),
      nextIdentity = options.identity();
    if (
      identity !== nextIdentity ||
      (view.mode !== 'local' && (scope?.key !== nextScope?.key || scope?.seat !== nextScope?.seat))
    )
      reset(false);
    identity = nextIdentity;
    scope = nextScope;
    if (
      (previousMode !== null && view.mode === null) ||
      (view.mode === 'online' && (!options.connected() || !scope || (hadMatch && !view.match)))
    )
      reset();
    previousMode = view.mode;
    if (view.mode === 'online' && view.match) {
      hadMatch = true;
      awaitingInitial = false;
    }
    activate();
    update();
  }
  function receive(message: SocketMessage) {
    if (!started || disposed) return;
    sync();
    if (!scope || !options.connected()) return;
    if (message.type === 'game-started') {
      reset(false);
      awaitingInitial = true;
      return;
    }
    const view = options.match(),
      m = view.match;
    if (
      blocked ||
      view.mode !== 'online' ||
      (!m && !awaitingInitial) ||
      message.type !== 'game-event'
    )
      return;
    try {
      if (message.event === 'log') {
        const entry = readThroneLog(
          {
            message: message.message,
            round: m?.round || 1,
            trick: m?.trick || 1,
            ts: options.now(),
          },
          ++nextId,
        );
        update({ entries: [...state.entries.slice(-599), entry] });
      } else if (message.event === 'round-ended' || message.event === 'game-ended') {
        const result = readThroneResult(
          {
            ...message,
            kind: message.event === 'round-ended' ? 'round' : 'final',
            round: message.event === 'round-ended' ? message.round : 3,
          },
          'online',
          state.entries,
        );
        if (!completed.has(`${result.kind}:${result.round}`)) {
          queued = result;
          activate();
        }
      }
    } catch (error) {
      queued = null;
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
    refresh: sync,
    clear: () => reset(),
    clearEntries() {
      if (!disposed) update({ entries: [] });
    },
    toggleLog(force?: boolean) {
      if (!disposed) update({ logOpen: force ?? !state.logOpen });
    },
    appendPublic(message: string, round: number, trick: number) {
      const view = options.match();
      if (
        disposed ||
        !view.mode ||
        (view.mode === 'online' && (blocked || !view.match || !options.connected()))
      )
        return;
      const entry = readThroneLog({ message, round, trick, ts: options.now() }, ++nextId);
      update({ entries: [...state.entries.slice(-599), entry] });
    },
    showLocal(value: unknown): Promise<void> {
      if (disposed || options.match().mode !== 'local') return Promise.reject(aborted());
      const dialog = readThroneResult(value, 'local', state.entries),
        pending = local;
      local = null;
      pending?.reject(aborted());
      const promise = new Promise<void>((resolve, reject) => {
        local = { dialog, resolve, reject };
      });
      blocked = false;
      update({ dialog });
      return promise;
    },
    confirm(offered: ThroneResult) {
      sync();
      if (disposed || !state.resultOpen || state.dialog !== offered) return false;
      const pending = local;
      local = null;
      update({ dialog: null });
      if (pending?.dialog === offered) pending.resolve();
      else if (offered.mode === 'online') options.leave();
      return true;
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(sync), options.subscribeMessages(receive));
      sync();
    },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
      scope = null;
      identity = null;
    },
  };
}
export type ThroneHistory = ReturnType<typeof createThroneHistory>;
