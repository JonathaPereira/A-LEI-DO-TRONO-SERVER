import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { NetworkClient } from '../../lib/socket/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatchState } from '../../types/throne-match';
import { createThroneMatch, type ThroneMatch } from '../../lib/games/throne-match';
import { ThroneMatchStatus } from './throne-match-status';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch?: ThroneMatch;
  TronoThroneBoard?: { presentOnlineMatch(match: ThroneMatchState | null): void };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneMatch(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    host = doc.getElementById('throneStatusHost')!,
    noticeClock = doc.getElementById('turnNoticeClock')!;
  const controller = createThroneMatch({
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
    visible: () => !doc.hidden && !board.classList.contains('hidden'),
    now: () => Date.now(),
    every250ms(fn) {
      const timer = target.setInterval(fn, 250);
      return () => target.clearInterval(timer);
    },
    subscribeSource(fn) {
      const release = runtime.TronoThroneLobby.subscribe(fn),
        observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
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
    warn: (error) => console.warn('[ThroneMatch]', error),
  });
  runtime.TronoThroneMatch = controller;
  const root = createRoot(host);
  flushSync(() =>
    root.render(<ThroneMatchStatus controller={controller} noticeClock={noticeClock} />),
  );
  let previousMatch: ThroneMatchState | null = null;
  const sync = () => {
    const s = controller.getSnapshot();
    board.classList.toggle('your-turn-active', s.visible && s.status.yourTurn);
    if (s.match !== previousMatch) {
      previousMatch = s.match;
      runtime.TronoThroneBoard?.presentOnlineMatch(s.match);
    }
  };
  const release = controller.subscribe(sync);
  controller.start();
  sync();
  const dispose = () => {
    release();
    controller.dispose();
    flushSync(() => root.unmount());
    board.classList.remove('your-turn-active');
    if (runtime.TronoThroneMatch === controller) delete runtime.TronoThroneMatch;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
