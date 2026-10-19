import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { NetworkClient } from '../../lib/socket/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { ThronePrivate } from '../../lib/games/throne-private';
import { createThroneHistory, type ThroneHistory } from '../../lib/games/throne-history';
import { installThroneLogLayout } from '../../lib/games/throne-log-layout';
import { ThroneHistoryContents } from './throne-history';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThronePrivate: ThronePrivate;
  TronoThroneHistory?: ThroneHistory;
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoThroneBoard?: { backToLobby(): void; notify(message: string, duration?: number): void };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneHistory(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    panel = doc.getElementById('eventLogPanel')!,
    modal = doc.getElementById('modal')!,
    toggleHost = doc.getElementById('throneLogToggleHost')!;
  const identity = () =>
    runtime.TronoAuth.user
      ? `user:${runtime.TronoAuth.user.id}`
      : runtime.TronoAuth.guest
        ? `guest:${runtime.TronoAuth.guest.id}`
        : null;
  const controller = createThroneHistory({
    identity,
    scope() {
      const lobby = runtime.TronoThroneLobby.getSnapshot(),
        id = identity();
      return id && lobby.room && lobby.me
        ? { key: `${id}:${lobby.room.id}`, seat: lobby.me.seat }
        : null;
    },
    match: runtime.TronoThroneMatch.getSnapshot,
    connected: () => runtime.TronoNetwork.connected,
    visible: () =>
      !doc.hidden &&
      !board.classList.contains('hidden') &&
      modal.classList.contains('hidden') &&
      !runtime.TronoThronePrivate.getSnapshot().open,
    now: () => Date.now(),
    subscribeSource(fn) {
      const releases = [
          runtime.TronoThroneMatch.subscribe(fn),
          runtime.TronoThroneLobby.subscribe(fn),
          runtime.TronoThronePrivate.subscribe(fn),
        ],
        observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      doc.addEventListener('visibilitychange', fn);
      return () => {
        releases.forEach((release) => release());
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
        doc.removeEventListener('visibilitychange', fn);
      };
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    notify: (message) => runtime.TronoThroneBoard?.notify(message, 2400),
    leave: () => runtime.TronoThroneBoard?.backToLobby(),
    warn: (error) => console.warn('[ThroneHistory]', error),
  });
  runtime.TronoThroneHistory = controller;
  const root = createRoot(panel);
  let layout: ReturnType<typeof installThroneLogLayout> | null = null;
  flushSync(() =>
    root.render(
      <ThroneHistoryContents
        controller={controller}
        toggleHost={toggleHost}
        resetLayout={() => layout?.reset()}
      />,
    ),
  );
  layout = installThroneLogLayout(target, panel, runtime.TronoStorage || target.localStorage);
  const sync = () => panel.classList.toggle('log-hidden', !controller.getSnapshot().logOpen),
    release = controller.subscribe(sync);
  controller.start();
  sync();
  const dispose = () => {
    release();
    layout?.dispose();
    controller.dispose();
    flushSync(() => root.unmount());
    panel.classList.add('log-hidden');
    if (runtime.TronoThroneHistory === controller) delete runtime.TronoThroneHistory;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
