import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { NetworkClient } from '../../lib/socket/client';
import { createThronePrivate, type ThronePrivate } from '../../lib/games/throne-private';
import { ThronePrivateDialog } from './throne-private-dialog';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThronePrivate?: ThronePrivate;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThronePrivate(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    badge = doc.getElementById('decreeBadge')!;
  const controller = createThronePrivate({
    scope() {
      const lobby = runtime.TronoThroneLobby.getSnapshot(),
        identity = runtime.TronoAuth.user
          ? 'user:' + runtime.TronoAuth.user.id
          : runtime.TronoAuth.guest
            ? 'guest:' + runtime.TronoAuth.guest.id
            : null;
      return identity && lobby.room && lobby.me
        ? { key: `${identity}:${lobby.room.id}`, seat: lobby.me.seat }
        : null;
    },
    match: () => runtime.TronoThroneMatch.getSnapshot(),
    connected: () => runtime.TronoNetwork.connected,
    visible: () => !doc.hidden && !board.classList.contains('hidden'),
    subscribeSource(fn) {
      const lobby = runtime.TronoThroneLobby.subscribe(fn),
        match = runtime.TronoThroneMatch.subscribe(fn),
        observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      doc.addEventListener('visibilitychange', fn);
      return () => {
        lobby();
        match();
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
        doc.removeEventListener('visibilitychange', fn);
      };
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    send: (action, payload) => runtime.TronoNetwork.gameAction(action, payload),
    warn: (error) => console.warn('[ThronePrivate]', error),
  });
  runtime.TronoThronePrivate = controller;
  const host = doc.createElement('div');
  host.id = 'thronePrivateHost';
  doc.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<ThronePrivateDialog controller={controller} />));
  const open = () => {
    controller.openIntelligence();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };
  badge.addEventListener('click', open);
  badge.addEventListener('keydown', key);
  controller.start();
  const dispose = () => {
    badge.removeEventListener('click', open);
    badge.removeEventListener('keydown', key);
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    if (runtime.TronoThronePrivate === controller) delete runtime.TronoThronePrivate;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
