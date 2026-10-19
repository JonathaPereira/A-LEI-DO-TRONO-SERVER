import type { NetworkClient } from '../../lib/socket/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { ThronePrivate } from '../../lib/games/throne-private';
import type { ThroneEffects } from '../../lib/games/throne-effects';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import { createThroneEvents, type ThroneEvents } from '../../lib/games/throne-events';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoRules: ThroneChoiceRules;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThronePrivate: ThronePrivate;
  TronoThroneEffects: ThroneEffects;
  TronoThroneEvents?: ThroneEvents;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneEvents(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime;
  const controller = createThroneEvents({
    scope() {
      const lobby = runtime.TronoThroneLobby.getSnapshot(),
        auth = runtime.TronoAuth;
      const identity = auth.user
        ? `user:${auth.user.id}`
        : auth.guest
          ? `guest:${auth.guest.id}`
          : null;
      return identity && lobby.room && lobby.me
        ? { key: `${identity}:${lobby.room.id}`, room: lobby.room.id, seat: lobby.me.seat }
        : null;
    },
    match: runtime.TronoThroneMatch.getSnapshot,
    connected: () => runtime.TronoNetwork.connected,
    effects: runtime.TronoThroneEffects,
    holdExchange: runtime.TronoThronePrivate.holdExchange,
    lawName: (law) => runtime.TronoRules.laws[law].name,
    requestState: () => runtime.TronoNetwork.requestState(),
    subscribeSource(fn) {
      const releases = [
        runtime.TronoThroneMatch.subscribe(fn),
        runtime.TronoThroneLobby.subscribe(fn),
      ];
      target.addEventListener('trono-auth-change', fn);
      return () => {
        releases.forEach((release) => release());
        target.removeEventListener('trono-auth-change', fn);
      };
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    warn: (error) => console.warn('[ThroneEvents]', error),
  });
  runtime.TronoThroneEvents = controller;
  controller.start();
  const dispose = () => {
    controller.dispose();
    if (runtime.TronoThroneEvents === controller) delete runtime.TronoThroneEvents;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
