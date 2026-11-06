import type { NetworkClient } from '../../lib/socket/client';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { ThroneHistory } from '../../lib/games/throne-history';
import { createThroneEffects, type ThroneEffects } from '../../lib/games/throne-effects';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThroneHistory: ThroneHistory;
  TronoThroneEffects?: ThroneEffects;
  TronoAudio?: { playSfx(name: string): void };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneEffects(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!;
  const controller = createThroneEffects({
    target,
    context() {
      const auth = runtime.TronoAuth,
        identity = auth.user
          ? `user:${auth.user.id}`
          : auth.guest
            ? `guest:${auth.guest.id}`
            : null;
      const match = runtime.TronoThroneMatch.getSnapshot(),
        lobby = runtime.TronoThroneLobby.getSnapshot();
      const session =
        match.mode === 'local' && identity
          ? `local:${identity}`
          : identity &&
              runtime.TronoNetwork.connected &&
              match.mode === 'online' &&
              match.match &&
              lobby.room &&
              lobby.me
            ? `${identity}:${lobby.room.id}:${lobby.me.seat}`
            : null;
      return {
        identity,
        session,
        stage: session ? `${match.status.round}:${match.status.trick}` : null,
        visible: !doc.hidden && !board.classList.contains('hidden'),
        localSeat: match.mode === 'online' ? (match.match?.localPlayerId ?? null) : 0,
      };
    },
    sound: (name) => runtime.TronoAudio?.playSfx(name),
    append(message) {
      const { status } = runtime.TronoThroneMatch.getSnapshot();
      runtime.TronoThroneHistory.appendPublic(message, status.round, status.trick);
    },
    warn: (error) => console.warn('[ThroneEffects]', error),
  });
  runtime.TronoThroneEffects = controller;
  const refresh = controller.refresh,
    observer = new MutationObserver(refresh),
    releases = [
      runtime.TronoThroneMatch.subscribe(refresh),
      runtime.TronoThroneLobby.subscribe(refresh),
    ];
  observer.observe(board, { attributes: true, attributeFilter: ['class'] });
  target.addEventListener('trono-auth-change', refresh);
  doc.addEventListener('visibilitychange', refresh);
  const dispose = () => {
    releases.forEach((release) => release());
    observer.disconnect();
    target.removeEventListener('trono-auth-change', refresh);
    doc.removeEventListener('visibilitychange', refresh);
    controller.dispose();
    if (runtime.TronoThroneEffects === controller) delete runtime.TronoThroneEffects;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
