import type { SocketMessage } from '../../types/socket';
import type { ThroneMatchSnapshot, ThroneMatchState } from '../../types/throne-match';
import type {
  ThroneDisclosure,
  ThronePrivateDialog,
  ThronePrivateSnapshot,
} from '../../types/throne-private';
import type { ThroneChoiceScope } from './throne-choices';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import { readThroneDisclosure, readThroneIntelligence } from './throne-private-protocol.ts';

interface Options {
  scope(): ThroneChoiceScope | null;
  match(): ThroneMatchSnapshot;
  connected(): boolean;
  visible(): boolean;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  send(action: string, payload: Record<string, unknown>): boolean;
  warn?(error: unknown): void;
}
const initial: ThronePrivateSnapshot = freezeGame({
  intelligence: null,
  dialog: null,
  open: false,
  pending: false,
  notice: '',
});
const abort = () =>
  Object.assign(new Error('A informação privada foi encerrada.'), { name: 'AbortError' });
export function createThronePrivate(options: Options) {
  let state = initial,
    started = false,
    disposed = false,
    blocked = false;
  let scope: ThroneChoiceScope | null = null,
    round: number | null = null,
    stage: string | null = null;
  let queued: { data: ThroneDisclosure; round: number | null; trick: number | null } | null = null;
  let exchange: object | null = null;
  let local: { dialog: ThronePrivateDialog; resolve(): void; reject(error: Error): void } | null =
    null;
  const acknowledged = new Set<string>(),
    listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function update(patch: Partial<ThronePrivateSnapshot>) {
    if (disposed) return;
    const next = { ...state, ...patch };
    const open =
      !!next.dialog &&
      options.visible() &&
      !exchange &&
      (options.match().mode === 'local' || options.connected());
    if (!Object.keys(patch).length && open === state.open) return;
    state = freezeGame({ ...next, open });
    listeners.forEach((fn) => fn());
  }
  function reset(block = true) {
    blocked = block;
    queued = null;
    exchange = null;
    round = null;
    stage = null;
    acknowledged.clear();
    const previous = local;
    local = null;
    previous?.reject(abort());
    update(initial);
  }
  function key(data: ThroneDisclosure, m: ThroneMatchState) {
    return data.kind === 'intelligence' ? `i:${m.round}` : `u:${m.round}:${m.trick}`;
  }
  function valid(data: ThroneDisclosure, m: ThroneMatchState): boolean {
    if (data.kind === 'intelligence')
      return (
        m.decree === 'espionagem' &&
        data.clue.target === (m.localPlayerId + 3) % 4 &&
        m.players[data.clue.target].name === data.clue.name
      );
    if (m.currentLaw !== 'usurpacao' || m.lastShadow == null) return false;
    return data.role === 'shadow'
      ? m.lastShadow === m.localPlayerId &&
          m.players.some((p) => p.id !== m.localPlayerId && p.name === data.otherName)
      : m.lastShadow !== m.localPlayerId && m.players[m.lastShadow].name === data.otherName;
  }
  function phase(data: ThroneDisclosure) {
    return data.kind === 'intelligence' ? 'private-intelligence' : 'usurp-reveal';
  }
  function activate() {
    const m = options.match().match;
    if (!queued || !m || blocked || m.phase !== phase(queued.data)) return;
    const item = queued;
    queued = null;
    if (
      (item.round != null && item.round !== m.round) ||
      (item.trick != null && item.data.kind === 'usurpation' && item.trick !== m.trick) ||
      !valid(item.data, m) ||
      acknowledged.has(key(item.data, m))
    )
      return;
    const dialog: ThronePrivateDialog = {
      data: item.data,
      required: true,
      action: item.data.kind === 'intelligence' ? 'intelligence-ack' : 'usurp-ack',
    };
    // A duplicate packet must not reopen an acknowledged dialog or replace an offered token.
    if (
      state.dialog &&
      state.dialog.action === dialog.action &&
      JSON.stringify(state.dialog.data) === JSON.stringify(dialog.data)
    )
      return;
    update({
      dialog,
      pending: false,
      notice: '',
      ...(item.data.kind === 'intelligence' ? { intelligence: item.data.clue } : {}),
    });
  }
  function sync() {
    if (disposed) return;
    const current = options.scope(),
      view = options.match(),
      m = view.match;
    if (scope?.key !== current?.key || scope?.seat !== current?.seat) {
      scope = current;
      reset(false);
    }
    if (view.mode !== 'local' && (!options.connected() || !scope)) {
      if (state.dialog || state.intelligence || queued) reset(false);
      return;
    }
    const nextRound = m?.round ?? (view.mode === 'local' ? view.status.round : null);
    if (round != null && nextRound !== round) {
      reset(false);
    }
    round = nextRound;
    if (view.mode === 'online' && !m) {
      if (state.dialog || state.intelligence || queued) reset(false);
      return;
    }
    const nextStage = m ? `${m.round}:${m.trick}:${m.phase}` : null;
    if (stage !== nextStage && state.dialog?.action && m?.phase !== phase(state.dialog.data))
      update({ dialog: null, pending: false, notice: '' });
    stage = nextStage;
    if (
      state.intelligence &&
      m &&
      (m.decree !== 'espionagem' || !valid({ kind: 'intelligence', clue: state.intelligence }, m))
    )
      update({ intelligence: null });
    activate();
    update({});
  }
  function receive(message: SocketMessage) {
    if (!started || disposed) return;
    sync();
    if (message.type === 'game-started') {
      reset(false);
      return;
    }
    if (!scope || !options.connected() || blocked || options.match().mode === 'local') return;
    const m = options.match().match;
    try {
      if (message.type === 'private-intelligence' || message.type === 'private-usurpation') {
        const data = readThroneDisclosure(
          message.type === 'private-intelligence'
            ? { kind: 'intelligence', clue: message.intelligence }
            : { ...message, kind: 'usurpation' },
        );
        queued = { data, round: m?.round ?? null, trick: m?.trick ?? null };
        activate();
      } else if (message.type === 'game-state' && m && record(message.state)) {
        const raw = message.state;
        if (
          raw.youSeat !== m.localPlayerId ||
          raw.round !== m.round ||
          raw.trick !== m.trick ||
          raw.phase !== m.phase
        )
          return;
        if (raw.intelligence == null) {
          if (state.intelligence) update({ intelligence: null });
        } else {
          const clue = readThroneIntelligence(raw.intelligence);
          if (!valid({ kind: 'intelligence', clue }, m))
            throw new Error('Destinatário da Espionagem inválido.');
          if (JSON.stringify(clue) !== JSON.stringify(state.intelligence))
            update({ intelligence: clue });
        }
        if (queued && m.phase !== phase(queued.data)) queued = null;
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
    clear: () => reset(),
    refresh: sync,
    holdExchange() {
      const token = {};
      exchange = token;
      update({});
      return () => {
        if (disposed || exchange !== token) return;
        exchange = null;
        sync();
      };
    },
    openIntelligence() {
      sync();
      if (!state.intelligence || state.dialog?.required || !options.visible()) return false;
      update({
        dialog: {
          data: { kind: 'intelligence', clue: state.intelligence },
          required: false,
          action: null,
        },
        pending: false,
        notice: '',
      });
      return true;
    },
    showLocal(value: ThroneDisclosure): Promise<void> {
      if (disposed || options.match().mode !== 'local') return Promise.reject(abort());
      const data = readThroneDisclosure(value);
      const previous = local;
      local = null;
      previous?.reject(abort());
      blocked = false;
      const dialog: ThronePrivateDialog = freezeGame({ data, required: true, action: null });
      const promise = new Promise<void>((resolve, reject) => {
        local = { dialog, resolve, reject };
      });
      update({
        dialog,
        pending: false,
        notice: '',
        ...(data.kind === 'intelligence' ? { intelligence: data.clue } : {}),
      });
      return promise;
    },
    confirm(offered: ThronePrivateDialog) {
      sync();
      if (disposed || offered !== state.dialog || !state.open || state.pending) return false;
      if (!offered.action) {
        const pending = local;
        local = null;
        update({ dialog: null, notice: '' });
        if (pending?.dialog === offered) pending.resolve();
        return true;
      }
      const m = options.match().match;
      if (!m || m.phase !== phase(offered.data) || !valid(offered.data, m)) return false;
      update({ pending: true, notice: '' });
      try {
        if (options.send(offered.action, {})) {
          acknowledged.add(key(offered.data, m));
          if (state.dialog === offered) update({ dialog: null, pending: false });
          return true;
        }
      } catch (error) {
        options.warn?.(error);
      }
      if (state.dialog === offered)
        update({
          pending: false,
          notice: 'Não foi possível confirmar. Confira a conexão e tente novamente.',
        });
      return false;
    },
    start() {
      if (started || disposed) return;
      started = true;
      scope = options.scope();
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
    },
  };
}
export type ThronePrivate = ReturnType<typeof createThronePrivate>;
