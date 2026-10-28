import type { SocketMessage } from '../../../types/socket';
import type { SimiloRoom, SimiloOpenRoom, SimiloSettings, SimiloMove } from '../../../types/similo';
import { readSimiloRoom, readSimiloRooms } from './protocol.ts';
export interface SimiloSnapshot {
  accountId: string | null;
  connected: boolean;
  room: SimiloRoom | null;
  rooms: SimiloOpenRoom[];
  resumeId: string | null;
  notice: string;
  pending: boolean;
  visible: boolean;
}
interface Options {
  getAccountId(): string | null;
  connected(): boolean;
  visible(): boolean;
  subscribeIdentity(fn: () => void): () => void;
  subscribeMessages(fn: (m: SocketMessage) => void): () => void;
  ensureAuthenticated(): Promise<boolean>;
  send(action: string, payload: Record<string, unknown>): boolean;
  schedule?(fn: () => void, ms: number): () => void;
  warn?(e: unknown): void;
}
const initial: SimiloSnapshot = {
  accountId: null,
  connected: false,
  room: null,
  rooms: [],
  resumeId: null,
  notice: '',
  pending: false,
  visible: false,
};
/** One subscription on the existing socket; account generations invalidate pending work. */
export function createSimilo(options: Options) {
  let state = initial,
    disposed = false,
    started = false,
    epoch = 0,
    authenticatedEpoch = -1,
    operation = 0;
  let cancelPending: (() => void) | undefined;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });
  function update(patch: Partial<SimiloSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  function cancel() {
    operation++;
    cancelPending?.();
    cancelPending = undefined;
  }
  async function request(action: string, payload: Record<string, unknown> = {}, tracked = false) {
    if (tracked && state.pending) return false;
    const ticket = epoch,
      op = tracked ? ++operation : operation,
      room = state.room?.id;
    if (tracked) {
      cancelPending?.();
      cancelPending = undefined;
      update({ pending: true, notice: '' });
    }
    const current = () =>
      !disposed && ticket === epoch && (!tracked || op === operation) && room === state.room?.id;
    try {
      if (!(await options.ensureAuthenticated()) || !current() || !state.accountId) {
        if (current() && tracked) update({ pending: false });
        return false;
      }
      authenticatedEpoch = ticket;
      if (!options.connected() || !options.send(action, payload))
        throw Error('Conexão interrompida.');
      if (tracked && current())
        cancelPending = schedule(() => {
          if (current()) {
            cancel();
            update({
              pending: false,
              notice: 'Aguardando confirmação da mesa. Confira sua conexão.',
            });
            void request('state');
          }
        }, 12000);
      return true;
    } catch (e) {
      if (current())
        update({
          pending: false,
          notice: e instanceof Error ? e.message : 'Não foi possível consultar a mesa.',
        });
      return false;
    }
  }
  function syncIdentity() {
    const id = options.getAccountId();
    if (disposed || id === state.accountId) return;
    epoch++;
    authenticatedEpoch = -1;
    cancel();
    update({
      ...initial,
      accountId: id,
      connected: options.connected(),
      visible: options.visible(),
    });
    if (id && options.visible()) void request('list');
  }
  function message(m: SocketMessage) {
    if (disposed) return;
    if (m.type === 'connection' && typeof m.connected === 'boolean') {
      update({ connected: m.connected });
      if (!m.connected) {
        epoch++;
        authenticatedEpoch = -1;
        cancel();
        update({
          pending: false,
          ...(state.room
            ? { notice: 'Conexão interrompida. Retome sua cadeira em até 90 segundos.' }
            : {}),
        });
      }
      return;
    }
    if (!state.accountId) return;
    if (m.type === 'auth-result' && m.ok === true) {
      void request(state.room ? 'resume' : 'list', state.room ? { roomId: state.room.id } : {});
      return;
    }
    if (m.type.startsWith('similo-') && authenticatedEpoch !== epoch) return;
    try {
      switch (m.type) {
        case 'similo-state': {
          const next = readSimiloRoom(m.room, state.accountId);
          if (state.room?.id === next.id && next.revision < state.room.revision) return;
          cancel();
          update({ room: next, resumeId: next.id, pending: false, notice: '' });
          break;
        }
        case 'similo-rooms': {
          const rooms = readSimiloRooms(m.rooms);
          if (m.resumeId !== null && (typeof m.resumeId !== 'string' || !m.resumeId))
            throw Error('Mesa de retomada inválida.');
          if (!state.room) {
            cancel();
            update({ pending: false });
          }
          update({ rooms, resumeId: m.resumeId as string | null });
          break;
        }
        case 'similo-left':
          if (m.reason !== undefined && typeof m.reason !== 'string')
            throw Error('Aviso inválido.');
          cancel();
          update({
            room: null,
            resumeId: null,
            pending: false,
            notice: typeof m.reason === 'string' ? m.reason : '',
          });
          void request('list');
          break;
        case 'similo-error':
          if (typeof m.message !== 'string') throw Error('Aviso inválido.');
          cancel();
          update({ pending: false, notice: m.message });
          if (m.code === 'SIMILO_STALE') void request('state');
          break;
      }
    } catch (e) {
      options.warn?.(e);
    }
  }
  function command(action: string, payload: Record<string, unknown> = {}) {
    if (disposed || state.pending || !state.connected) return;
    return request(action, { revision: state.room?.revision, ...payload }, true);
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      syncIdentity();
      cleanup.push(options.subscribeIdentity(syncIdentity), options.subscribeMessages(message));
    },
    open() {
      syncIdentity();
      update({ visible: options.visible() });
      void request(state.room ? 'state' : 'list');
    },
    visibilityChanged() {
      update({ visible: options.visible() });
    },
    refresh: () => request('list'),
    create: (settings: Omit<SimiloSettings, 'narratorId'>) => command('create', { settings }),
    join: (roomId: string) => command('join', { roomId }),
    resume() {
      if (state.resumeId) return command('resume', { roomId: state.resumeId });
    },
    configure: (settings: SimiloSettings) => command('configure', { settings }),
    startGame: () => command('start'),
    rematch: () => command('rematch'),
    move: (move: SimiloMove) => command('move', { move }),
    leave: () => command('leave'),
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      cancel();
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type SimiloController = ReturnType<typeof createSimilo>;
