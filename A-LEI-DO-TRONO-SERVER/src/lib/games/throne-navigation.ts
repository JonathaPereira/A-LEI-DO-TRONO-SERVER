import type { NetworkClient } from '../socket/client';
import type { SocketMessage } from '../../types/socket';
import type { ThroneMatchState } from '../../types/throne-match';
import { throneRules } from './throne-rules.ts';

type PublicBoard = Omit<ThroneMatchState, 'decree'> & {
  decree: (typeof throneRules.decrees)[number] | null;
  gameOver: boolean;
};
interface Options {
  network: Pick<
    NetworkClient,
    'gameRoom' | 'primaryRoom' | 'leaveGameRoom' | 'requestRooms' | 'onMessage'
  >;
  hub(): boolean;
  hasLobby(): boolean;
  joined(): boolean;
  leaveVoice(): Promise<unknown>;
  leaveCommunity(): Promise<void>;
  prepareName(name: string): void;
  clearGame(): void;
  setHub(hub: boolean): void;
  showPanel(show: boolean): void;
  showSetup(): void;
  showBoard(): void;
  setNameFeedback(value: { available: boolean; code: string; message: string }): void;
  notify(text: string, ms?: number): void;
  connection(name: string, reason: 'disconnect' | 'self-disconnect'): void;
  schedule(fn: () => void, ms: number): () => void;
  warn(error: unknown): void;
}
/** Navigation flags and a public compatibility view only; ThroneMatch owns the online game. */
export function createThroneNavigation(options: Options) {
  let game: PublicBoard | null = null,
    online = false,
    leaving = false,
    disposed = false;
  let release: (() => void) | null = null,
    timer: (() => void) | null = null;
  function backToLobby() {
    if (disposed) return;
    leaving = true;
    if (options.network.gameRoom && options.network.primaryRoom === options.network.gameRoom)
      void options.leaveVoice().catch(options.warn);
    options.clearGame();
    options.network.leaveGameRoom();
    online = false;
    game = null;
    options.setHub(false);
    options.showSetup();
    if (!options.joined()) options.showPanel(false);
    timer?.();
    timer = options.schedule(() => {
      timer = null;
      if (!disposed) options.network.requestRooms();
    }, 120);
  }
  function message(msg: SocketMessage) {
    if (disposed) return;
    if (
      msg.type === 'connection' &&
      msg.connected === false &&
      (options.hasLobby() || online || options.hub())
    )
      options.connection('Você', 'self-disconnect');
    if (msg.type === 'version-mismatch')
      options.notify('⚠ Frontend e backend estão em versões diferentes.', 3200);
    if (msg.type === 'player-left' && !online) {
      const name = typeof msg.name === 'string' && msg.name ? msg.name : 'Um jogador';
      if (options.hub()) options.notify(`${name} saiu do canal.`, 1500);
      else if (msg.reason === 'disconnect') options.connection(name, 'disconnect');
      else options.notify(`${name} deixou o salão.`, 1600);
    }
    if (msg.type === 'error') {
      const text = typeof msg.message === 'string' ? msg.message : '';
      if (msg.code === 'NAME_TAKEN' || msg.code === 'NAME_REQUIRED') {
        options.setNameFeedback({
          available: false,
          code: msg.code,
          message: text || 'Nome indisponível.',
        });
        options.notify(text || 'Escolha outro nome.', 2800);
        if (options.hub()) void options.leaveCommunity().catch(options.warn);
        else if (options.hasLobby() && !online) backToLobby();
      } else options.notify(text || 'Erro de sala', 2400);
    }
  }
  return {
    getState: () => game,
    get online() {
      return !!game?.online;
    },
    presentOnlineMatch(state: ThroneMatchState | null) {
      if (disposed) return;
      if (!state) {
        game = null;
        return;
      }
      if (leaving) return;
      if (!online) {
        online = true;
        options.showBoard();
      }
      const next = {
        ...state,
        decree: state.decree ? throneRules.decrees.find((d) => d.id === state.decree)! : null,
        gameOver: state.phase === 'game-over',
      };
      if (game) Object.assign(game, next);
      else game = next;
    },
    enterLocal() {
      if (!disposed) {
        game = null;
        online = false;
        leaving = false;
      }
    },
    clearLobbyMode() {
      if (!disposed) online = false;
    },
    prepareRoom(name: string) {
      if (!disposed) {
        timer?.();
        timer = null;
        leaving = false;
        options.setHub(false);
        options.prepareName(name);
      }
    },
    backToLobby,
    notify: options.notify,
    start() {
      if (!disposed && !release) release = options.network.onMessage(message);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release?.();
      timer?.();
      release = timer = null;
      game = null;
    },
  };
}
export type ThroneNavigation = ReturnType<typeof createThroneNavigation>;
