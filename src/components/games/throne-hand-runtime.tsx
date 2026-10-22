import type { ThroneChoices } from '../../lib/games/throne-choices';
import type { ThroneHistory } from '../../lib/games/throne-history';
import type { ThronePrivate } from '../../lib/games/throne-private';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { NetworkClient } from '../../lib/socket/client';
import { createThroneHand, type ThroneHand } from '../../lib/games/throne-hand';
import { ThroneHandContents } from './throne-hand';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThronePrivate: ThronePrivate;
  TronoThroneHistory: ThroneHistory;
  TronoThroneChoices: ThroneChoices;
  TronoThroneHand?: ThroneHand;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneHand(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    local = doc.getElementById('throneLocalHand')!,
    host = doc.getElementById('throneOnlineHand')!;

  const controller = createThroneHand({
    identity: () =>
      runtime.TronoAuth.user
        ? `user:${runtime.TronoAuth.user.id}`
        : runtime.TronoAuth.guest
          ? `guest:${runtime.TronoAuth.guest.id}`
          : null,
    scope() {
      const lobby = runtime.TronoThroneLobby.getSnapshot();
      const identity = runtime.TronoAuth.user
        ? 'user:' + runtime.TronoAuth.user.id
        : runtime.TronoAuth.guest
          ? 'guest:' + runtime.TronoAuth.guest.id
          : null;
      return identity && lobby.room && lobby.me
        ? { key: `${identity}:${lobby.room.id}`, seat: lobby.me.seat }
        : null;
    },
    connected: () => runtime.TronoNetwork.connected,
    visible: () =>
      !doc.hidden &&
      !board.classList.contains('hidden') &&
      !runtime.TronoThroneChoices.getSnapshot().open &&
      !runtime.TronoThronePrivate.getSnapshot().open &&
      !runtime.TronoThroneHistory.getSnapshot().resultOpen,
    subscribeSource(fn) {
      const choiceRelease = runtime.TronoThroneChoices.subscribe(fn);
      const privateRelease = runtime.TronoThronePrivate.subscribe(fn);
      const historyRelease = runtime.TronoThroneHistory.subscribe(fn);
      const release = runtime.TronoThroneLobby.subscribe(fn),
        observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      doc.addEventListener('visibilitychange', fn);
      return () => {
        release();
        privateRelease();
        choiceRelease();
        historyRelease();
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
        doc.removeEventListener('visibilitychange', fn);
      };
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    send: (action, payload) => runtime.TronoNetwork.gameAction(action, payload),
    warn: (error) => console.warn('[ThroneHand]', error),
  });
  runtime.TronoThroneHand = controller;
  const dialogHost = doc.createElement('div');
  dialogHost.id = 'throneHandDialogHost';
  doc.body.append(dialogHost);
  const root = createRoot(host),
    localRoot = createRoot(local);
  flushSync(() =>
    root.render(
      <ThroneHandContents controller={controller} dialogHost={dialogHost} mode="online" />,
    ),
  );
  flushSync(() =>
    localRoot.render(
      <ThroneHandContents controller={controller} dialogHost={dialogHost} mode="local" />,
    ),
  );
  const syncHosts = () => {
    const mode = controller.getSnapshot().mode;
    local.classList.toggle('hidden', mode !== 'local');
    host.classList.toggle('hidden', mode !== 'online');
  };
  const releaseHosts = controller.subscribe(syncHosts);
  controller.start();
  syncHosts();
  const dispose = () => {
    releaseHosts();
    controller.dispose();
    flushSync(() => {
      root.unmount();
      localRoot.unmount();
    });
    dialogHost.remove();
    host.classList.add('hidden');
    local.classList.remove('hidden');
    if (runtime.TronoThroneHand === controller) delete runtime.TronoThroneHand;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
