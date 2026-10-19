import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { NetworkClient } from '../../lib/socket/client';
import { createThroneHand, type ThroneHand } from '../../lib/games/throne-hand';
import { ThroneOnlineHand } from './throne-hand';
import './throne-choices.css';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
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
    host = doc.getElementById('throneOnlineHand')!,
    localModal = doc.getElementById('modal')!;
  const controller = createThroneHand({
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
      !doc.hidden && !board.classList.contains('hidden') && localModal.classList.contains('hidden'),
    subscribeSource(fn) {
      const release = runtime.TronoThroneLobby.subscribe(fn),
        observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      observer.observe(localModal, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      doc.addEventListener('visibilitychange', fn);
      return () => {
        release();
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
  const root = createRoot(host);
  flushSync(() =>
    root.render(<ThroneOnlineHand controller={controller} dialogHost={dialogHost} />),
  );
  const syncHosts = () => {
    const active = controller.getSnapshot().active;
    local.classList.toggle('hidden', active);
    host.classList.toggle('hidden', !active);
  };
  const releaseHosts = controller.subscribe(syncHosts);
  controller.start();
  syncHosts();
  const dispose = () => {
    releaseHosts();
    controller.dispose();
    flushSync(() => root.unmount());
    dialogHost.remove();
    host.classList.add('hidden');
    local.classList.remove('hidden');
    if (runtime.TronoThroneHand === controller) delete runtime.TronoThroneHand;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
