import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createThroneLobby, type ThroneLobby } from '../../lib/games/throne-lobby';
import type { NetworkClient } from '../../lib/socket/client';
import { primaryScreens, type Portal } from '../../lib/navigation/portal';
import { ThroneLobbyControls, type ThroneLobbyHosts } from './throne-lobby-controls';

interface Runtime extends Window {
  TronoNetwork: NetworkClient;
  TronoPortal: Portal;
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoAudio: { ensureAudio(): Promise<unknown> };
  TronoThroneLobby?: ThroneLobby;
  TronoThroneBoard?: {
    readonly online: boolean;
    prepareRoom(name: string): void;
    backToLobby(): void;
    notify(text: string): void;
  };
}
const installed = new WeakMap<Window, () => void>();
/** Mounted before game.js binds. The board bridge is looked up only on an actual user action. */
export function initializeThroneLobby(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const screen = () =>
    [
      'portalScreen',
      'setupScreen',
      'roomScreen',
      'gameScreen',
      'chatOnlyScreen',
      'gamesScreen',
      'azulScreen',
      'splendorScreen',
      'loveLetterScreen',
      'rogueliteScreen',
    ].find((id) => {
      const node = doc.getElementById(id);
      return node && !node.classList.contains('hidden');
    }) ?? null;
  const controller = createThroneLobby({
    identity: () =>
      runtime.TronoAuth.user
        ? 'user:' + runtime.TronoAuth.user.id
        : runtime.TronoAuth.guest
          ? 'guest:' + runtime.TronoAuth.guest.id
          : null,
    clientId: () => runtime.TronoNetwork.clientId,
    connected: () => runtime.TronoNetwork.connected,
    gameRoom: () => runtime.TronoNetwork.gameRoom,
    screen,
    recoveryScreen: () =>
      runtime.TronoThroneBoard?.online
        ? 'gameScreen'
        : controller.getSnapshot().room
          ? 'roomScreen'
          : 'setupScreen',
    subscribeIdentity(fn) {
      target.addEventListener('trono-auth-change', fn);
      return () => target.removeEventListener('trono-auth-change', fn);
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    validateIdentity: () => runtime.TronoPortal.validateIdentity({ game: true }),
    ensureAudio: () => runtime.TronoAudio.ensureAudio(),
    prepareJoin: (name) => runtime.TronoThroneBoard!.prepareRoom(name),
    showRoom: () => runtime.TronoPortal.showOnly('roomScreen'),
    restore: (id) => runtime.TronoPortal.showOnly(id),
    joinRoom: (id, name, current) => runtime.TronoNetwork.joinRoom(id, name, current),
    setReady: (ready) => runtime.TronoNetwork.setReady(ready),
    startRoom: () => runtime.TronoNetwork.startRoom(),
    requestRooms: () => runtime.TronoNetwork.requestRooms(),
    requestState: () => runtime.TronoNetwork.requestState(),
    focusIdentity: () => (doc.getElementById('playerIdentity') as HTMLInputElement).focus(),
    notify: (text) => runtime.TronoThroneBoard?.notify(text),
    warn: (error) => console.warn('[ThroneLobby]', error),
  });
  runtime.TronoThroneLobby = controller;
  const host = doc.createElement('div');
  host.id = 'throneLobbyHost';
  host.style.display = 'contents';
  doc.body.append(host);
  const get = (id: string) => doc.getElementById(id)!;
  const hosts: ThroneLobbyHosts = {
    grid: get('roomGrid'),
    status: get('throneNetworkStatus'),
    title: get('selectedRoomName'),
    seats: get('roomSeats'),
    actions: get('throneRoomActions'),
    roomStatus: get('roomOnlineStatus'),
    back: get('throneLobbyBack'),
  };
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <ThroneLobbyControls
        controller={controller}
        hosts={hosts}
        back={() => runtime.TronoThroneBoard?.backToLobby()}
      />,
    ),
  );
  controller.start();
  const observer = new MutationObserver(() => controller.navigationChanged());
  for (const id of primaryScreens) {
    const node = doc.getElementById(id);
    if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
  }
  const dispose = () => {
    observer.disconnect();
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    if (runtime.TronoThroneLobby === controller) delete runtime.TronoThroneLobby;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
