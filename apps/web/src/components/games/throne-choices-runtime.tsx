import type { ThroneHistory } from '../../lib/games/throne-history';
import type { ThronePrivate } from '../../lib/games/throne-private';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { NetworkClient } from '../../lib/socket/client';
import { createThroneChoices, type ThroneChoices } from '../../lib/games/throne-choices';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import { ThroneChoiceDialog } from './throne-choices';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThronePrivate: ThronePrivate;
  TronoThroneHistory: ThroneHistory;
  TronoRules: ThroneChoiceRules;
  TronoThroneChoices?: ThroneChoices;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneChoices(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const board = doc.getElementById('gameScreen')!;

  const controller = createThroneChoices({
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
      !runtime.TronoThronePrivate.getSnapshot().open &&
      !runtime.TronoThroneHistory.getSnapshot().resultOpen,
    subscribeSource(fn) {
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
        historyRelease();
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
        doc.removeEventListener('visibilitychange', fn);
      };
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    send: (action, payload) => runtime.TronoNetwork.gameAction(action, payload),
    warn: (error) => console.warn('[ThroneChoices]', error),
  });
  runtime.TronoThroneChoices = controller;
  const host = doc.createElement('div');
  host.id = 'throneChoiceHost';
  (doc.getElementById('gameSurface') ?? doc.body).append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<ThroneChoiceDialog controller={controller} rules={runtime.TronoRules} />),
  );
  controller.start();
  const dispose = () => {
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    if (runtime.TronoThroneChoices === controller) delete runtime.TronoThroneChoices;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
