import type { ChatActivity } from '../../types/chat';
import type { CallNavigationSnapshot, NavigationRoom } from '../../types/call-navigation';
import type { NetworkClient } from '../socket/client';
import type { SocketMessage } from '../../types/socket';
import { readNavigationRoom } from './navigation-protocol.ts';

interface NavigationOptions {
  network: Pick<NetworkClient, 'getSnapshot' | 'onMessage'>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  joined(): boolean;
  accountId(): string | null;
  onVoiceRoom(room: NavigationRoom | null): void;
  onChange(): void;
  closeSettings(): void;
  focusComposer(): void;
  playTextSound(): void;
  onDisconnected(): void;
}
/** Owns presentation and room metadata, never membership, messages, sockets or media. */
export function createCallNavigation(options: NavigationOptions) {
  let state: CallNavigationSnapshot = Object.freeze({
    hub: false,
    panelAvailable: false,
    panelOpen: false,
    drawerOpen: false,
    unread: 0,
    muted: options.storage.getItem('tronoChatMuted') === '1',
    gameCommunicationOpen: false,
    voiceRoom: null,
    textRoom: null,
  });
  let disposed = false,
    unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  function update(patch: Partial<CallNavigationSnapshot>, beforeNotify?: () => void) {
    if (disposed) return;
    const next = { ...state, ...patch };
    if (next.hub && next.textRoom?.channelType === 'text') next.drawerOpen = true;
    if (next.hub && next.textRoom?.channelType === 'voice') next.drawerOpen = false;
    if ((next.hub && next.drawerOpen) || (!next.hub && next.panelOpen)) next.unread = 0;
    state = Object.freeze(next);
    beforeNotify?.();
    for (const listener of listeners) listener();
    options.onChange();
  }
  function showPanel(show = true) {
    update({ panelOpen: show });
  }
  function toggleTextChat(force?: boolean) {
    if (disposed) return;
    if (!state.hub) {
      showPanel(force ?? !state.panelOpen);
      return;
    }
    update({ drawerOpen: force ?? !state.drawerOpen });
    if (state.drawerOpen) options.focusComposer();
  }
  function showForRoom(show = true) {
    if (disposed) return;
    update({ panelAvailable: show, panelOpen: show });
    if (!show) options.closeSettings();
  }
  function consumeTextRoom(value: unknown) {
    if (disposed) return;
    const room = value == null ? null : readNavigationRoom(value);
    if (value != null && !room) return;
    update({
      textRoom: room,
      ...(room?.id !== state.textRoom?.id ? { drawerOpen: room?.channelType === 'text' } : {}),
      ...(room || options.joined() ? { panelAvailable: true, panelOpen: true } : {}),
    });
    if (state.hub && room?.channelType === 'text') options.focusComposer();
  }
  function consumeVoiceRoom(value: unknown) {
    if (disposed) return;
    const room = value == null ? null : readNavigationRoom(value);
    if (value != null && !room) return;
    const previous = state.voiceRoom?.id;
    update({ voiceRoom: room, ...(room ? { panelAvailable: true, panelOpen: true } : {}) }, () =>
      options.onVoiceRoom(room),
    );
    const currentText = options.network.getSnapshot().currentRoom;
    if (room?.id === currentText) consumeTextRoom(room);
    else if (!room && (state.textRoom?.id === previous || !currentText)) consumeTextRoom(null);
  }
  function message(message: SocketMessage) {
    if (disposed) return;
    const membership = options.network.getSnapshot();
    switch (message.type) {
      case 'joined-room':
      case 'voice-room-attached':
        consumeVoiceRoom(message.room);
        break;
      case 'joined-game-room': {
        const room = readNavigationRoom(message.room);
        if (room && message.primaryRoomId === room.id) consumeVoiceRoom(room);
        break;
      }
      case 'joined-text-channel':
        consumeTextRoom(message.room);
        break;
      case 'room-state': {
        const room = readNavigationRoom(message.room);
        if (room?.id === membership.primaryRoom) consumeVoiceRoom(room);
        else if (room && room.id === membership.currentRoom) consumeTextRoom(room);
        break;
      }
      case 'left-game-room':
      case 'left-voice-room':
        if (typeof message.roomId === 'string' && message.roomId === state.voiceRoom?.id)
          consumeVoiceRoom(null);
        break;
      case 'channel-deleted':
        if (typeof message.roomId !== 'string') break;
        if (message.roomId === state.voiceRoom?.id) consumeVoiceRoom(null);
        if (message.roomId === state.textRoom?.id) {
          consumeTextRoom(null);
          update({ unread: 0, drawerOpen: false });
        }
        break;
      case 'connection':
        if (message.connected === false) options.onDisconnected();
        break;
    }
  }
  return {
    getSnapshot: () => state,
    showPanel,
    showForRoom,
    toggleTextChat,
    consumeVoiceRoom,
    consumeTextRoom,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setHub(hub: boolean) {
      update({
        hub,
        ...(hub ? { drawerOpen: state.textRoom?.channelType === 'text', panelOpen: true } : {}),
      });
    },
    clearText() {
      update({ unread: 0 });
      toggleTextChat(false);
    },
    toggleMute() {
      if (disposed) return;
      const muted = !state.muted;
      options.storage.setItem('tronoChatMuted', muted ? '1' : '0');
      update({ muted, ...(muted ? { unread: 0 } : {}) });
    },
    onChatActivity(activity: ChatActivity) {
      if (disposed) return;
      if (activity.type === 'read') {
        update({ unread: 0 });
        return;
      }
      const message = activity.message,
        mine = message.accountId
          ? message.accountId === options.accountId()
          : message.senderId === options.network.getSnapshot().clientId;
      if (mine) return;
      if (!state.muted) {
        if (!(state.hub ? state.drawerOpen : state.panelOpen)) update({ unread: state.unread + 1 });
        options.playTextSound();
      }
    },
    openFromGame(desktop: boolean) {
      update({
        panelOpen: desktop || !state.panelOpen,
        ...(desktop ? { gameCommunicationOpen: true } : {}),
      });
    },
    minimize() {
      update({ panelOpen: false, gameCommunicationOpen: false });
    },
    start() {
      if (!disposed && !unsubscribe) unsubscribe = options.network.onMessage(message);
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}
export type CallNavigation = ReturnType<typeof createCallNavigation>;
