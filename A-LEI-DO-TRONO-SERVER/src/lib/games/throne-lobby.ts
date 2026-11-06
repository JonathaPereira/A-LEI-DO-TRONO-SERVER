import type { SocketMessage } from '../../types/socket';
import type { IdentityValidation } from '../navigation/portal';
import type {
  ThroneLobbySnapshot,
  ThroneRecoveryScreen,
  ThroneRoom,
  ThroneRoomDefinition,
  ThroneRoomId,
} from '../../types/throne-lobby';
import { readThroneRoom, readThroneRooms, throneRoomId } from './throne-lobby-protocol.ts';
import { freezeGame } from './freeze.ts';

export const throneRooms: readonly ThroneRoomDefinition[] = freezeGame([
  { id: 'sala-cetro', name: 'Sala do Cetro', glyph: '♜', suit: 'cetro' },
  { id: 'sala-chave', name: 'Sala da Chave', glyph: '⚿', suit: 'chave' },
  { id: 'sala-mascara', name: 'Sala da Máscara', glyph: '◉', suit: 'mascara' },
]);
interface Options {
  identity(): string | null;
  clientId(): string | null;
  connected(): boolean;
  gameRoom(): string | null;
  screen(): string | null;
  recoveryScreen(): ThroneRecoveryScreen;
  subscribeIdentity(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  validateIdentity(): Promise<IdentityValidation>;
  ensureAudio(): Promise<unknown>;
  prepareJoin(name: string): void;
  showRoom(): void;
  restore(screen: ThroneRecoveryScreen): void;
  joinRoom(id: ThroneRoomId, name: string, current: () => boolean): Promise<boolean>;
  setReady(ready: boolean): boolean;
  startRoom(): boolean;
  requestRooms(): void;
  requestState(): void;
  focusIdentity(): void;
  notify(text: string): void;
  schedule?(fn: () => void, ms: number): () => void;
  warn?(error: unknown): void;
}
const initial: ThroneLobbySnapshot = freezeGame({
  connected: false,
  selected: null,
  room: null,
  me: null,
  rooms: [],
  entering: false,
  readyPending: false,
  starting: false,
  networkStatus: 'Conectando ao servidor da Corte...',
  notice: '',
});
/** Owns lobby rosters and join/ready/start intents. The board retains all game state. */
export function createThroneLobby(options: Options) {
  let state = initial,
    disposed = false,
    started = false,
    epoch = 0,
    version = 0,
    identity = options.identity();
  let entering: {
    version: number;
    id: ThroneRoomId;
    sent: boolean;
    previous: Pick<ThroneLobbySnapshot, 'selected' | 'room' | 'me'>;
    screen: ThroneRecoveryScreen;
    visibleScreen: string | null;
  } | null = null;
  let desiredReady: boolean | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  const timers = new Map<'enter' | 'ready' | 'start', () => void>();
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  function update(patch: Partial<ThroneLobbySnapshot>) {
    if (disposed) return;
    state = freezeGame({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  function cancel(kind: 'enter' | 'ready' | 'start') {
    timers.get(kind)?.();
    timers.delete(kind);
  }
  function cancelAll() {
    for (const kind of ['enter', 'ready', 'start'] as const) cancel(kind);
    desiredReady = null;
  }
  function timeout(kind: 'enter' | 'ready' | 'start', fn: () => void) {
    cancel(kind);
    const generation = epoch;
    const release = schedule(() => {
      if (disposed || generation !== epoch || timers.get(kind) !== off) return;
      timers.delete(kind);
      fn();
    }, 12000);
    const off = () => release();
    timers.set(kind, off);
  }
  function clear() {
    version++;
    entering = null;
    cancelAll();
    update({
      selected: null,
      room: null,
      me: null,
      entering: false,
      readyPending: false,
      starting: false,
      notice: '',
    });
  }
  function resetIdentity() {
    epoch++;
    version++;
    entering = null;
    cancelAll();
    identity = options.identity();
    update({ ...initial, connected: options.connected(), networkStatus: state.networkStatus });
  }
  function restoreEntry(message: string) {
    const operation = entering;
    if (!operation) return;
    version++;
    entering = null;
    cancel('enter');
    update({ ...operation.previous, entering: false, notice: message });
    if (options.screen() === 'roomScreen') {
      options.restore(operation.screen);
      if (operation.screen === 'gameScreen') options.requestState();
    }
  }
  function consume(room: ThroneRoom) {
    const me = room.players.find((p) => p.id === options.clientId()) ?? null;
    if (!me) return;
    update({ room, selected: throneRooms.find((r) => r.id === room.id)!, me, notice: '' });
    if (desiredReady === me.ready) {
      desiredReady = null;
      cancel('ready');
      update({ readyPending: false });
    }
    if (room.gameActive) {
      cancel('start');
      update({ starting: false });
    }
  }
  async function enter(id: string) {
    if (disposed || !started || entering || !throneRoomId(id)) return false;
    const generation = epoch,
      account = options.identity(),
      originalScreen = options.screen(),
      v = ++version;
    entering = {
      version: v,
      id,
      sent: false,
      previous: { selected: state.selected, room: state.room, me: state.me },
      screen: options.recoveryScreen(),
      visibleScreen: originalScreen,
    };
    update({ entering: true, notice: '' });
    const current = () =>
      !disposed &&
      generation === epoch &&
      account === options.identity() &&
      entering?.version === v;
    try {
      const validation = await options.validateIdentity();
      if (!current()) return false;
      if (options.screen() !== originalScreen) {
        restoreEntry('');
        return false;
      }
      if (!validation.ok || !validation.name) {
        restoreEntry(validation.message || 'Escolha um nome disponível.');
        options.notify(validation.message || 'Escolha um nome disponível.');
        options.focusIdentity();
        return false;
      }
      cancelAll();
      options.prepareJoin(validation.name);
      update({
        selected: throneRooms.find((room) => room.id === id)!,
        room: null,
        me: null,
        readyPending: false,
        starting: false,
      });
      entering!.visibleScreen = 'roomScreen';
      options.showRoom();
      await options.ensureAudio();
      if (!current()) return false;
      if (options.screen() !== 'roomScreen') {
        restoreEntry('');
        return false;
      }
      entering!.sent = true;
      timeout('enter', () => {
        restoreEntry('O servidor demorou para confirmar a entrada. Tente novamente.');
        options.requestRooms();
      });
      const sent = await options.joinRoom(
        id,
        validation.name,
        () => current() && options.screen() === 'roomScreen',
      );
      if (!current()) return state.room?.id === id;
      update({
        networkStatus: sent
          ? 'Servidor online. Entrando no salão...'
          : 'Não foi possível conectar ao servidor agora.',
      });
      if (!sent) restoreEntry('Não foi possível conectar ao servidor agora.');
      return sent;
    } catch (error) {
      if (!current()) return false;
      restoreEntry(error instanceof Error ? error.message : 'Não foi possível entrar no salão.');
      options.warn?.(error);
      return false;
    }
  }
  function receive(message: SocketMessage) {
    if (disposed || !started) return;
    if (options.identity() !== identity) resetIdentity();
    try {
      switch (message.type) {
        case 'connection':
          if (typeof message.connected !== 'boolean') return;
          update({
            connected: message.connected,
            networkStatus: message.connected
              ? 'Servidor multiplayer conectado.'
              : 'Servidor offline ou reconectando...',
          });
          if (!message.connected) {
            epoch++;
            restoreEntry('Servidor desconectado. Aguarde a reconexão.');
            cancelAll();
            update({ readyPending: false, starting: false });
          }
          break;
        case 'welcome':
        case 'rooms': {
          const rooms = readThroneRooms(message.rooms);
          update({
            rooms,
            ...(message.type === 'welcome'
              ? {
                  connected: true,
                  networkStatus: `Servidor multiplayer conectado • ${typeof message.serverVersion === 'string' ? message.serverVersion : 'online'}.`,
                }
              : {}),
          });
          break;
        }
        case 'version-mismatch':
          if (
            typeof message.clientVersion === 'string' &&
            typeof message.serverVersion === 'string'
          )
            update({
              networkStatus: `Versões diferentes: site ${message.clientVersion} • servidor ${message.serverVersion}. Atualize o deploy para evitar incompatibilidades.`,
            });
          break;
        case 'joined-game-room':
        case 'joined-room': {
          if (
            message.type === 'joined-room' &&
            (!message.room ||
              typeof message.room !== 'object' ||
              !('kind' in message.room) ||
              message.room.kind !== 'game')
          )
            return;
          const room = readThroneRoom(message.room);
          if (
            !entering?.sent ||
            entering.id !== room.id ||
            !options.identity() ||
            !room.players.some((p) => p.id === options.clientId())
          )
            return;
          entering = null;
          version++;
          cancel('enter');
          consume(room);
          update({ entering: false });
          break;
        }
        case 'room-state':
        case 'game-started': {
          if (!state.room || !options.identity()) return;
          if (
            !message.room ||
            typeof message.room !== 'object' ||
            !('kind' in message.room) ||
            message.room.kind !== 'game'
          )
            return;
          const room = readThroneRoom(message.room);
          if (room.id !== state.room.id || options.gameRoom() !== room.id) return;
          consume(room);
          break;
        }
        case 'left-game-room':
          if (state.room?.id === message.roomId && (!entering || entering.id === message.roomId))
            clear();
          break;
        case 'error':
          if (
            entering?.sent &&
            [
              'GAME_IN_PROGRESS',
              'ROOM_FULL',
              'ROOM_NOT_FOUND',
              'NO_SEAT',
              'NAME_TAKEN',
              'NAME_REQUIRED',
            ].includes(String(message.code))
          )
            restoreEntry(
              typeof message.message === 'string'
                ? message.message
                : 'Não foi possível entrar neste salão.',
            );
          if (state.readyPending || state.starting) {
            cancel('ready');
            cancel('start');
            desiredReady = null;
            update({ readyPending: false, starting: false });
          }
          break;
      }
    } catch (error) {
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
    enter,
    clear,
    navigationChanged() {
      if (entering && !entering.sent && options.screen() !== entering.visibleScreen)
        restoreEntry('');
    },
    toggleReady() {
      if (
        disposed ||
        !state.connected ||
        entering ||
        !state.me ||
        state.readyPending ||
        state.starting ||
        state.room?.gameActive
      )
        return;
      desiredReady = !state.me.ready;
      update({ readyPending: true });
      if (!options.setReady(desiredReady)) {
        desiredReady = null;
        update({ readyPending: false });
        return;
      }
      timeout('ready', () => {
        desiredReady = null;
        update({ readyPending: false, notice: 'O servidor demorou para confirmar Pronto.' });
        options.requestRooms();
      });
    },
    startGame() {
      if (
        disposed ||
        !state.connected ||
        entering ||
        state.starting ||
        state.readyPending ||
        !state.me?.host ||
        !state.room ||
        state.room.gameActive ||
        state.room.players.length < 2 ||
        !state.room.players.every((p) => p.ready)
      )
        return;
      update({ starting: true });
      if (!options.startRoom()) {
        update({ starting: false });
        return;
      }
      timeout('start', () => {
        update({ starting: false, notice: 'O servidor demorou para iniciar a partida.' });
        options.requestState();
      });
    },
    start() {
      if (started || disposed) return;
      started = true;
      identity = options.identity();
      update({ connected: options.connected() });
      cleanup.push(options.subscribeIdentity(resetIdentity), options.subscribeMessages(receive));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      version++;
      entering = null;
      cancelAll();
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
    },
  };
}
export type ThroneLobby = ReturnType<typeof createThroneLobby>;
