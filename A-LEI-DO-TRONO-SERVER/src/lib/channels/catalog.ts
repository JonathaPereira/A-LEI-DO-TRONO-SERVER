import type { ChannelNotice, ChannelsSnapshot } from '../../types/channels';
import type { NetworkClient } from '../socket/client.ts';
import { readChannels } from './protocol.ts';

interface ChannelsOptions {
  network: Pick<NetworkClient, 'getSnapshot' | 'subscribe' | 'onMessage'>;
  getAccountId(): string | null;
  getNotice(id: string): ChannelNotice;
  subscribeIdentity(listener: () => void): () => void;
  subscribeNotices(listener: () => void): () => void;
  warn?: (error: unknown) => void;
}

export const EMPTY_CHANNELS: ChannelsSnapshot = Object.freeze({
  channels: readChannels(
    [
      { id: 'chat-livre', name: 'Geral', type: 'mixed' },
      { id: 'chat-jogos', name: 'Jogos', type: 'mixed' },
      { id: 'chat-conversa', name: 'Conversa', type: 'mixed' },
    ],
    [],
  ),
  selectedId: null,
  ready: false,
  version: 0,
  notices: Object.freeze({}),
});

/** Owns the channel catalog and its view of selection; media navigation stays with its owner. */
export function createChannels({
  network,
  getAccountId,
  getNotice,
  subscribeIdentity,
  subscribeNotices,
  warn = (error) => console.warn('[Channels]', error),
}: ChannelsOptions) {
  let state = EMPTY_CHANNELS;
  let accountId = getAccountId(),
    disposed = false;
  const listeners = new Set<() => void>();
  function update(patch: Partial<ChannelsSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }
  function notices(channels = state.channels) {
    return Object.freeze(
      Object.fromEntries(channels.map((c) => [c.id, Object.freeze({ ...getNotice(c.id) })])),
    );
  }
  function replace(value: unknown, expectedVersion?: number): boolean {
    if (disposed || (expectedVersion !== undefined && expectedVersion !== state.version))
      return false;
    const channels = readChannels(value, state.channels);
    update({ channels, ready: true, version: state.version + 1, notices: notices(channels) });
    return true;
  }
  function syncSelection() {
    const selectedId = network.getSnapshot().currentRoom;
    if (selectedId !== state.selectedId) update({ selectedId });
  }
  const unsubscribeState = network.subscribe(syncSelection);
  const unsubscribeMessages = network.onMessage((message) => {
    try {
      if (message.type === 'chat-channels') replace(message.channels);
      if (message.type === 'welcome' && message.chatChannels !== undefined)
        replace(message.chatChannels);
      if (message.type === 'channel-deleted')
        replace(state.channels.filter((c) => c.id !== message.roomId));
    } catch (error) {
      warn(error);
    }
  });
  const unsubscribeIdentity = subscribeIdentity(() => {
    const next = getAccountId();
    const channels =
      accountId === next
        ? state.channels
        : Object.freeze(
            state.channels.map((c) => Object.freeze({ ...c, players: Object.freeze([]) })),
          );
    accountId = next;
    update({
      channels,
      version: state.version + 1,
      notices: notices(channels),
    });
  });
  const unsubscribeNotices = subscribeNotices(() => update({ notices: notices() }));
  syncSelection();
  return {
    getSnapshot: () => state,
    get: (id: string | null | undefined) => state.channels.find((c) => c.id === id),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replace,
    dispose() {
      disposed = true;
      unsubscribeState();
      unsubscribeMessages();
      unsubscribeIdentity();
      unsubscribeNotices();
      listeners.clear();
    },
  };
}
export type ChannelsController = ReturnType<typeof createChannels>;
