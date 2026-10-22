import type {
  AzulSnapshot,
  AzulRoom,
  AzulReplay,
  AzulDetail,
  AzulPresentation,
  AzulRules,
} from '../../types/azul';
import type { SocketMessage } from '../../types/socket';
import { freezeAzul, readAzulRoom, readAzulRooms, readAzulRanking } from './azul-protocol.ts';

type Action =
  | 'list'
  | 'ranking'
  | 'create'
  | 'join'
  | 'resume'
  | 'leave'
  | 'start'
  | 'move'
  | 'state'
  | 'retry-record';
interface Options {
  getAccountId(): string | null;
  subscribeIdentity(listener: () => void): () => void;
  subscribeMessages(listener: (message: SocketMessage) => void): () => void;
  ensureAuthenticated(): Promise<boolean>;
  send(action: Action, payload: Record<string, unknown>): boolean;
  visible(): boolean;
  reducedMotion(): boolean;
  rules: AzulRules;
  presentation: AzulPresentation;
  uuid(): string;
  schedule?(callback: () => void, delay: number): () => void;
  animate?(step: AzulDetail, points: boolean): void;
  captureMove?(room: AzulRoom): (() => void) | undefined;
  cancelAnimations?(): void;
  sound?(kind: string): void;
  warn?(error: unknown): void;
}
const initial: AzulSnapshot = freezeAzul({
  accountId: null,
  room: null,
  rooms: [],
  resumeId: null,
  ranking: [],
  rankingError: '',
  notice: '',
  selection: null,
  pending: false,
  replay: null,
});

/** One owner for authoritative rooms, local intent and cancellable score replay.
 * The rule engine/server retain scoring authority; animation only uses copies. */
export function createAzul(options: Options) {
  let state = initial,
    disposed = false,
    started = false,
    epoch = 0,
    authenticatedEpoch = -1,
    replayVersion = 0;
  let rankingRequest: string | null = null,
    queue: AzulReplay[] = [],
    pendingVersion = 0;
  let cancelPending: (() => void) | undefined,
    cancelDelay: (() => void) | undefined,
    wake: (() => void) | undefined;
  const listeners = new Set<() => void>(),
    subscriptions: (() => void)[] = [];
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  function update(patch: Partial<AzulSnapshot>) {
    if (disposed) return;
    state = freezeAzul({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function clearPending() {
    pendingVersion++;
    cancelPending?.();
    cancelPending = undefined;
  }
  function finishReplay() {
    replayVersion++;
    queue = [];
    cancelDelay?.();
    cancelDelay = undefined;
    wake?.();
    wake = undefined;
    options.cancelAnimations?.();
    update({ replay: null });
  }
  function delay(ms: number, version: number) {
    if (version !== replayVersion || disposed) return Promise.resolve();
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
    stillCurrent = () => true,
  ) {
    const operation = epoch;
    try {
      if (
        disposed ||
        !(await options.ensureAuthenticated()) ||
        disposed ||
        !state.accountId ||
        operation !== epoch ||
        !stillCurrent()
      )
        return false;
      authenticatedEpoch = operation;
      if (!options.send(action, payload)) throw new Error('Conexão interrompida. Tente novamente.');
      return true;
    } catch (error) {
      if (!disposed && operation === epoch && stillCurrent())
        update({
          notice: error instanceof Error ? error.message : 'Não foi possível consultar a mesa.',
        });
      return false;
    }
  }
  function refreshRanking() {
    const id = options.uuid();
    rankingRequest = id;
    update({ rankingError: '' });
    void request('ranking', { requestId: id }, () => rankingRequest === id);
  }
  async function playReplays() {
    if (state.replay || !queue.length || disposed) return;
    const version = replayVersion,
      current = () => !disposed && version === replayVersion;
    while (queue.length && current()) {
      const job = queue.shift()!;
      let working = structuredClone(job.state);
      update({
        replay: {
          state: working,
          round: job.round,
          progress: 0,
          total: job.steps.filter((s) => s.kind !== 'recap').length,
          detail: null,
        },
      });
      await delay(900, version);
      for (const step of job.steps) {
        if (!current()) return;
        if (step.kind === 'recap') {
          working = options.presentation.apply(structuredClone(working), step);
          continue;
        }
        let detail: AzulDetail = { ...step, landed: false };
        update({
          replay: {
            ...state.replay!,
            detail,
            progress: state.replay!.progress + 1,
            state: working,
          },
        });
        options.animate?.(detail, false);
        if (step.kind === 'placement') {
          await delay(720, version);
          if (!current()) return;
        }
        detail = { ...detail, landed: true };
        working = options.presentation.apply(structuredClone(working), step);
        update({ replay: { ...state.replay!, detail, state: working } });
        options.animate?.(detail, true);
        if (options.visible())
          options.sound?.(step.kind === 'floor' ? 'azul-penalty' : 'azul-score');
        await delay(step.kind === 'bonus' ? 2200 : 1950, version);
      }
      if (!current()) return;
      update({ replay: { ...state.replay!, detail: null, state: working } });
      await delay(800, version);
      if (!current()) return;
      update({ replay: null });
    }
  }
  function receiveRoom(next: AzulRoom) {
    if (!state.accountId || !next.players.some((p) => p.id === state.accountId)) return;
    const previous = state.room;
    if (
      previous?.id === next.id &&
      previous.state &&
      next.state &&
      next.state.revision < previous.state.revision
    )
      return;
    if (previous && previous.id !== next.id) finishReplay();
    const job =
      previous?.id === next.id ? options.presentation.round(previous.state, next.state) : null;
    const changed = previous?.id !== next.id || previous?.state?.revision !== next.state?.revision;
    const animateMove =
      !job &&
      !state.replay &&
      previous?.id === next.id &&
      previous.state &&
      next.state &&
      previous.state.revision + 1 === next.state.revision
        ? options.captureMove?.(next)
        : undefined;
    if (changed) clearPending();
    update({
      room: next,
      resumeId: next.id,
      notice: '',
      ...(changed ? { selection: null, pending: false } : {}),
    });
    if (job && options.visible() && !options.reducedMotion()) queue.push(job);
    if (!state.replay && queue.length)
      void playReplays().catch((error) => {
        options.warn?.(error);
        finishReplay();
      });
    else if (!state.replay) animateMove?.();
    if (next.recordStatus === 'saved' && previous?.recordStatus !== 'saved') refreshRanking();
  }
  function message(value: SocketMessage) {
    if (disposed || !state.accountId) return;
    // Ordered socket authentication separates account scopes, including late lists.
    if (value.type.startsWith('azul-') && authenticatedEpoch !== epoch) return;
    try {
      switch (value.type) {
        case 'azul-state':
          receiveRoom(readAzulRoom(value.room));
          break;
        case 'azul-rooms': {
          const rooms = readAzulRooms(value.rooms);
          if (value.resumeId !== null && (typeof value.resumeId !== 'string' || !value.resumeId))
            throw new Error('Mesa de retomada inválida.');
          update({ rooms, resumeId: value.resumeId });
          break;
        }
        case 'azul-left':
          if (value.reason != null && typeof value.reason !== 'string')
            throw new Error('Aviso da mesa inválido.');
          clearPending();
          finishReplay();
          update({
            room: null,
            resumeId: null,
            selection: null,
            pending: false,
            notice: (value.reason as string | undefined) ?? '',
          });
          void request('list');
          break;
        case 'azul-ranking':
          if (value.requestId === rankingRequest)
            update({ ranking: readAzulRanking(value.rows), rankingError: '' });
          break;
        case 'azul-error':
          if (typeof value.message !== 'string') throw new Error('Aviso da mesa inválido.');
          if (value.requestId === rankingRequest) update({ rankingError: value.message });
          else if (!value.requestId) {
            clearPending();
            update({ pending: false, notice: value.message });
          }
          break;
        case 'connection':
          if (value.connected === false) {
            authenticatedEpoch = -1;
            clearPending();
            finishReplay();
            update({
              pending: false,
              ...(state.room
                ? { notice: 'Conexão perdida. Reconecte para retomar a mesa em até 90 segundos.' }
                : {}),
            });
          }
          break;
        case 'auth-result':
          if (value.ok === true) {
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
  function syncIdentity() {
    const accountId = options.getAccountId();
    if (disposed || accountId === state.accountId) return;
    epoch++;
    authenticatedEpoch = -1;
    rankingRequest = null;
    clearPending();
    finishReplay();
    update({ ...initial, accountId });
    if (accountId && options.visible()) {
      void request('list');
      refreshRanking();
    }
  }
  function select(source: number, color: number) {
    const s = state.replay?.state ?? state.room?.state;
    if (
      disposed ||
      state.pending ||
      state.replay ||
      !s ||
      s.phase !== 'draft' ||
      s.players[s.turn].id !== state.accountId ||
      !Number.isInteger(source) ||
      source < -1 ||
      source >= s.factories.length ||
      !Number.isInteger(color) ||
      color < 0 ||
      color > 4 ||
      !(source === -1 ? s.center : s.factories[source]).includes(color)
    )
      return;
    update({ selection: { source, color }, notice: '' });
    if (options.visible()) options.sound?.('azul-pick');
  }
  async function move(row: number) {
    const room = state.room,
      selection = state.selection,
      s = room?.state;
    if (
      disposed ||
      state.pending ||
      state.replay ||
      !room ||
      !s ||
      !selection ||
      s.phase !== 'draft' ||
      s.players[s.turn].id !== state.accountId ||
      !Number.isInteger(row) ||
      row < -1 ||
      row > 4 ||
      (row !== -1 && !options.rules.canPlace(s.players[s.turn], row, selection.color))
    )
      return;
    clearPending();
    const version = pendingVersion,
      revision = s.revision,
      current = () =>
        version === pendingVersion &&
        state.room?.id === room.id &&
        state.room.state?.revision === revision;
    update({ pending: true });
    cancelPending = schedule(() => {
      if (!current() || disposed) return;
      clearPending();
      update({
        pending: false,
        notice: 'Aguardando conexão. Confira a mesa antes de tentar novamente.',
      });
      void request('state', {}, () => state.room?.id === room.id);
    }, 12000);
    const ok = await request('move', { revision, move: { ...selection, row } }, current);
    if (!ok && current() && !disposed) {
      clearPending();
      update({ pending: false });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
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
    refreshRooms: () => request('list'),
    refreshRanking,
    select,
    move,
    finishReplay,
    visibilityChanged() {
      if (!options.visible() || options.reducedMotion()) finishReplay();
    },
    create(maxPlayers: number) {
      if ([2, 3, 4].includes(maxPlayers)) void request('create', { maxPlayers });
    },
    join(roomId: string) {
      if (state.rooms.some((r) => r.id === roomId)) void request('join', { roomId });
    },
    resume() {
      if (state.resumeId) void request('resume', { roomId: state.resumeId });
    },
    startGame(fillBots: boolean) {
      if (
        state.room &&
        !state.room.state &&
        state.room.hostId === state.accountId &&
        (fillBots || state.room.players.length >= 2)
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
      finishReplay();
      subscriptions.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type Azul = ReturnType<typeof createAzul>;
