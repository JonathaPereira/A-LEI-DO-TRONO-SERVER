import type { NetworkSnapshot, NetworkStateEvent } from '../../types/network';
import { NO_NETWORK_FEATURES } from './protocol.ts';

/** One immutable snapshot for membership; consumers never mutate or reconstruct it. */
export function createNetworkState(warn: (error: unknown) => void) {
  let state: NetworkSnapshot = Object.freeze({
    connected: false,
    clientId: null,
    currentRoom: null,
    primaryRoom: null,
    gameRoom: null,
    features: NO_NETWORK_FEATURES,
  });
  const listeners = new Set<() => void>();

  function update(patch: Partial<NetworkSnapshot>) {
    if (
      Object.entries(patch).every(([key, value]) => state[key as keyof NetworkSnapshot] === value)
    )
      return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clearMembership() {
      update({ currentRoom: null, primaryRoom: null, gameRoom: null });
    },
    apply(event: NetworkStateEvent) {
      switch (event.type) {
        case 'connection':
          // On remote close, keep last-known membership until the controllers leave/rejoin.
          update({
            connected: event.connected,
            ...(!event.connected
              ? { features: Object.freeze({ ...state.features, gameActivity: false }) }
              : {}),
          });
          break;
        case 'welcome':
          update({ clientId: event.clientId, features: event.features });
          break;
        case 'joined-room':
          update({
            primaryRoom: event.room.id,
            currentRoom: event.room.id,
            ...(event.room.kind === 'game' ? { gameRoom: event.room.id } : {}),
          });
          break;
        case 'joined-game-room':
          update({
            gameRoom: event.room.id,
            primaryRoom: event.primaryRoomId ?? null,
            currentRoom: event.chatRoomId ?? null,
          });
          break;
        case 'left-game-room':
          update({
            gameRoom: null,
            primaryRoom: event.primaryRoomId ?? null,
            currentRoom: event.chatRoomId ?? null,
          });
          break;
        case 'left-voice-room':
          update({ primaryRoom: null, currentRoom: event.chatRoomId ?? null });
          break;
        case 'voice-room-attached':
          update({ primaryRoom: event.room.id, currentRoom: state.currentRoom ?? event.room.id });
          break;
        case 'joined-text-channel':
          update({ currentRoom: event.room.id, primaryRoom: event.primaryRoomId ?? null });
          break;
        case 'channel-deleted':
          update({
            ...(event.roomId === state.primaryRoom ? { primaryRoom: null } : {}),
            ...(event.roomId === state.currentRoom ? { currentRoom: null } : {}),
          });
          break;
      }
    },
  };
}
