import type { ChatMessage } from '../../types/domain';
import type { ChatActivity, MessagesSnapshot, ModerationAction } from '../../types/chat';
import type { NetworkAccount } from '../../types/network';
import type { SocketMessage } from '../../types/socket';
import type { NetworkClient } from '../socket/client.ts';
import { identifier, readChatMessage, readHistory, record, revision } from './message-protocol.ts';

interface MessagesOptions {
  network: Pick<
    NetworkClient,
    | 'getSnapshot'
    | 'subscribe'
    | 'onMessage'
    | 'requestChatHistory'
    | 'deleteChatMessage'
    | 'clearChatHistory'
  >;
  getAccount(): NetworkAccount | null;
  subscribeIdentity(listener: () => void): () => void;
  reportStatus(message: string): void;
  onActivity(activity: ChatActivity): void;
  warn?: (error: unknown) => void;
}

export const EMPTY_MESSAGES: MessagesSnapshot = Object.freeze({
  roomId: null,
  messages: Object.freeze([]),
  before: null,
  hasMore: false,
  loadingOlder: false,
  canModerate: false,
  accountId: null,
  clientId: null,
  viewVersion: 0,
  change: 'replace',
  choice: null,
  pending: null,
});

/** Owns messages, revisions, pagination and moderation; it never touches DOM or media. */
export function createChatMessages({
  network,
  getAccount,
  subscribeIdentity,
  reportStatus,
  onActivity,
  warn = (error) => console.warn('[ChatMessages]', error),
}: MessagesOptions) {
  let state: MessagesSnapshot = EMPTY_MESSAGES;
  let room: { id: string; kind: string; channelType: string | null } | null = null;
  let supported = false,
    disposed = false;
  let moderationTimer: ReturnType<typeof setTimeout> | undefined;
  let historyTimer: ReturnType<typeof setTimeout> | undefined;
  const revisions = new Map<string, number>();
  const listeners = new Set<() => void>();

  function update(patch: Partial<MessagesSnapshot>) {
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
  function cancelTimers() {
    clearTimeout(moderationTimer);
    clearTimeout(historyTimer);
    moderationTimer = historyTimer = undefined;
  }
  function clear() {
    cancelTimers();
    update({
      messages: Object.freeze([]),
      before: null,
      hasMore: false,
      loadingOlder: false,
      choice: null,
      pending: null,
      change: 'replace',
    });
  }
  function refreshPermissions() {
    const account = getAccount(),
      snapshot = network.getSnapshot();
    const allowed =
      supported &&
      snapshot.connected &&
      account?.role === 'creator' &&
      room?.id === snapshot.currentRoom &&
      room?.kind === 'chat' &&
      room.channelType !== 'voice';
    if (!allowed) {
      clearTimeout(moderationTimer);
      moderationTimer = undefined;
    }
    update({
      canModerate: !!allowed,
      accountId: account?.id ?? null,
      clientId: snapshot.clientId,
      ...(!allowed ? { choice: null, pending: null } : {}),
    });
  }
  function syncRoom() {
    const snapshot = network.getSnapshot();
    if (state.roomId !== snapshot.currentRoom) {
      room = null;
      clear();
      update({ roomId: snapshot.currentRoom });
    }
    if (!snapshot.connected) {
      cancelTimers();
      update({ choice: null, pending: null, loadingOlder: false });
    }
    refreshPermissions();
  }
  const unsubscribeState = network.subscribe(syncRoom);
  const unsubscribeIdentity = subscribeIdentity(() => {
    if (state.accountId !== (getAccount()?.id ?? null)) clear();
    refreshPermissions();
    update({ viewVersion: state.viewVersion + 1 });
  });
  syncRoom();

  function accept(roomId: string, next: number | undefined): boolean {
    if (roomId !== state.roomId) return false;
    if (next !== undefined) {
      if (next < (revisions.get(roomId) ?? 0)) return false;
      revisions.set(roomId, next);
    }
    return true;
  }
  function merge(older: readonly ChatMessage[], current: readonly ChatMessage[]) {
    const existing = new Map(current.map((message) => [message.id, message]));
    const unique = new Map<string, ChatMessage>();
    for (const message of [...older, ...current])
      if (!unique.has(message.id)) unique.set(message.id, existing.get(message.id) ?? message);
    return Object.freeze([...unique.values()]);
  }
  function finishModeration(ok: boolean, error?: string) {
    const pending = state.pending;
    if (!pending) return;
    clearTimeout(moderationTimer);
    moderationTimer = undefined;
    update({ pending: null });
    if (pending.roomId === state.roomId)
      reportStatus(
        ok
          ? pending.action === 'clear'
            ? 'Histórico do canal apagado.'
            : 'Mensagem apagada.'
          : error || 'Não foi possível apagar as mensagens.',
      );
  }
  function receive(message: SocketMessage) {
    try {
      if (message.type === 'welcome') {
        revisions.clear();
        supported = record(message.features) && message.features.chatModeration === true;
        refreshPermissions();
      }
      if (
        [
          'joined-room',
          'joined-game-room',
          'joined-text-channel',
          'voice-room-attached',
          'room-state',
        ].includes(message.type) &&
        record(message.room) &&
        message.room.id === state.roomId
      ) {
        const value = message.room;
        if (
          (value.kind !== 'chat' && value.kind !== 'game') ||
          (value.channelType != null &&
            (typeof value.channelType !== 'string' ||
              !['text', 'voice', 'mixed'].includes(value.channelType)))
        )
          return;
        room = {
          id: identifier(value.id),
          kind: value.kind,
          channelType: typeof value.channelType === 'string' ? value.channelType : null,
        };
        refreshPermissions();
      }
      if (message.type === 'chat-history' && message.roomId === state.roomId) {
        const history = readHistory(message);
        if (history.older && !state.loadingOlder) return;
        if (!accept(history.roomId, history.revision)) {
          if (history.older) {
            clearTimeout(historyTimer);
            historyTimer = undefined;
            update({ loadingOlder: false });
          }
          return;
        }
        clearTimeout(historyTimer);
        historyTimer = undefined;
        update({
          messages: merge(history.messages, history.older ? state.messages : []),
          before: history.before,
          hasMore: history.hasMore,
          loadingOlder: false,
          change: history.older ? 'prepend' : 'replace',
        });
        onActivity({ type: 'read' });
      }
      if (message.type === 'chat-message') {
        if (!record(message.message) || message.message.roomId !== state.roomId || !state.roomId)
          return;
        const item = readChatMessage(message.message, state.roomId);
        if (
          !accept(item.roomId, revision(message.revision)) ||
          state.messages.some((old) => old.id === item.id)
        )
          return;
        update({ messages: Object.freeze([...state.messages, item]), change: 'append' });
        onActivity({ type: 'message', message: item });
      }
      if (
        ['chat-message-deleted', 'chat-history-cleared'].includes(message.type) &&
        message.roomId === state.roomId
      ) {
        const roomId = identifier(message.roomId);
        const id = message.type === 'chat-message-deleted' ? identifier(message.id) : null;
        if (!accept(roomId, revision(message.revision))) return;
        if (id === null) {
          clearTimeout(historyTimer);
          historyTimer = undefined;
          update({
            messages: Object.freeze([]),
            before: null,
            hasMore: false,
            loadingOlder: false,
            change: 'remove',
            choice: null,
          });
          onActivity({ type: 'read' });
        } else {
          const messages = Object.freeze(state.messages.filter((item) => item.id !== id));
          const before = state.before === id ? (messages[0]?.id ?? null) : state.before;
          update({
            messages,
            before,
            hasMore: state.hasMore && !!before,
            change: 'remove',
            ...(state.choice?.action === 'delete' && state.choice.id === id
              ? { choice: null }
              : {}),
          });
        }
      }
      if (message.type === 'attachment-deleted' && typeof message.id === 'string') {
        if (state.messages.some((item) => item.attachment?.id === message.id))
          update({
            messages: Object.freeze(
              state.messages.map((item) => {
                const attachment = item.attachment;
                return attachment && attachment.id === message.id
                  ? Object.freeze({
                      ...item,
                      attachment: Object.freeze({ ...attachment, deleted: true }),
                    })
                  : item;
              }),
            ),
            change: 'remove',
          });
      }
      if (
        message.type === 'chat-moderation-result' &&
        state.pending &&
        message.requestId === state.pending.requestId &&
        message.roomId === state.pending.roomId &&
        message.action === state.pending.action &&
        (state.pending.action !== 'delete' || message.id === state.pending.id) &&
        typeof message.ok === 'boolean'
      )
        finishModeration(
          message.ok,
          record(message.error) && typeof message.error.message === 'string'
            ? message.error.message
            : undefined,
        );
      if (
        message.type === 'error' &&
        ['CHAT_HISTORY_UNAVAILABLE', 'CHAT_HISTORY_RATE'].includes(String(message.code)) &&
        (message.roomId === undefined || message.roomId === state.roomId)
      ) {
        clearTimeout(historyTimer);
        historyTimer = undefined;
        update({ loadingOlder: false });
      }
    } catch (error) {
      warn(error);
    }
  }
  const unsubscribeMessages = network.onMessage(receive);

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear,
    loadOlder(): boolean {
      if (disposed) return false;
      if (!state.hasMore || !state.before || state.loadingOlder || !network.getSnapshot().connected)
        return false;
      update({ loadingOlder: true });
      historyTimer = setTimeout(() => {
        historyTimer = undefined;
        update({ loadingOlder: false });
        reportStatus('O histórico demorou. Tente carregar novamente.');
      }, 15000);
      if (network.requestChatHistory(state.before)) return true;
      clearTimeout(historyTimer);
      historyTimer = undefined;
      update({ loadingOlder: false });
      reportStatus('Conexão interrompida. Tente novamente.');
      return false;
    },
    chooseModeration(choice: ModerationAction) {
      if (disposed) return;
      refreshPermissions();
      if (
        !state.canModerate ||
        state.pending ||
        !state.roomId ||
        (choice.action === 'delete' && !state.messages.some((item) => item.id === choice.id))
      )
        return;
      update({ choice: Object.freeze({ ...choice, roomId: state.roomId }) });
    },
    cancelModeration() {
      update({ choice: null });
    },
    confirmModeration(): boolean {
      if (disposed) return false;
      const choice = state.choice;
      refreshPermissions();
      update({ choice: null });
      if (
        !choice ||
        !state.canModerate ||
        state.pending ||
        choice.roomId !== network.getSnapshot().currentRoom
      )
        return false;
      const pending = Object.freeze({ ...choice, requestId: crypto.randomUUID() });
      update({ pending });
      moderationTimer = setTimeout(
        () =>
          finishModeration(false, 'A confirmação demorou. Confira a conexão e tente novamente.'),
        30000,
      );
      const sent =
        choice.action === 'clear'
          ? network.clearChatHistory(pending.requestId)
          : network.deleteChatMessage(choice.id, pending.requestId);
      if (!sent) finishModeration(false, 'Conexão interrompida. Aguarde a reconexão para apagar.');
      return sent;
    },
    dispose() {
      cancelTimers();
      disposed = true;
      unsubscribeState();
      unsubscribeIdentity();
      unsubscribeMessages();
      listeners.clear();
    },
  };
}

export type ChatMessagesController = ReturnType<typeof createChatMessages>;
