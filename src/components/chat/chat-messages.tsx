'use client';

import { Component, memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatMessage } from '../../types/domain';
import type { MessagesSnapshot } from '../../types/chat';
import { EMPTY_MESSAGES } from '../../lib/chat/messages';
import type { ChatMessagesController } from '../../lib/chat/messages';
import { initializeChatMessages } from '../../lib/chat/browser';
import { Avatar } from '../profiles/avatar';
import { Attachment } from '../files/attachment';

const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY_MESSAGES;
function useMessages() {
  const [controller, setController] = useState<ChatMessagesController | null>(null);
  useEffect(() => {
    setController(initializeChatMessages(window));
  }, []);
  const state = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return { controller, state };
}

interface RowProps {
  message: ChatMessage;
  mine: boolean;
  canModerate: boolean;
  pending: boolean;
  controller: ChatMessagesController | null;
}
const MessageRow = memo(function MessageRow({
  message,
  mine,
  canModerate,
  pending,
  controller,
}: RowProps) {
  const timestamp = new Date(message.ts);
  const valid = !Number.isNaN(timestamp.getTime());
  return (
    <div data-message-id={message.id} className={`court-chat-msg${mine ? ' mine' : ''}`}>
      <div>
        <Avatar person={message} className="chat-author-icon" />
        <strong>{message.name || 'Jogador'}</strong>
        <time dateTime={valid ? timestamp.toISOString() : undefined}>
          {valid
            ? timestamp.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Data indisponível'}
        </time>
        {canModerate && (
          <button
            type="button"
            className="chat-message-delete"
            title="Apagar mensagem"
            aria-label={`Apagar mensagem de ${message.name || 'usuário'}`}
            disabled={pending}
            onClick={() => controller?.chooseModeration({ action: 'delete', id: message.id })}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" />
            </svg>
          </button>
        )}
      </div>
      <p>{message.text}</p>
      {message.attachment && <Attachment file={message.attachment} />}
    </div>
  );
});

interface ListProps {
  state: MessagesSnapshot;
  controller: ChatMessagesController | null;
}
/** React's pre-mutation snapshot preserves the exact scroll anchor when older rows arrive. */
class MessageList extends Component<ListProps> {
  private host = { current: null as HTMLDivElement | null };
  getSnapshotBeforeUpdate(previous: ListProps) {
    const host = this.host.current;
    if (!host || previous.state.messages === this.props.state.messages) return null;
    return {
      height: host.scrollHeight,
      top: host.scrollTop,
      preserve:
        previous.state.roomId === this.props.state.roomId && this.props.state.change === 'prepend',
    };
  }
  componentDidUpdate(
    _previous: ListProps,
    _previousState: unknown,
    snapshot: { height: number; top: number; preserve: boolean } | null,
  ) {
    const host = this.host.current;
    if (!host || !snapshot) return;
    if (snapshot.preserve) host.scrollTop = snapshot.top + host.scrollHeight - snapshot.height;
    else if (this.props.state.change !== 'remove') host.scrollTop = host.scrollHeight;
  }
  render() {
    const { state, controller } = this.props;
    return (
      <div
        ref={this.host}
        id="courtChatMessages"
        className="court-chat-messages"
        aria-live="polite"
      >
        {state.messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            controller={controller}
            mine={
              message.accountId
                ? message.accountId === state.accountId
                : message.senderId === state.clientId
            }
            canModerate={state.canModerate}
            pending={!!state.pending}
          />
        ))}
      </div>
    );
  }
}

export function ChatMessages() {
  const { state, controller } = useMessages();
  return (
    <>
      <button
        id="olderChatMessages"
        type="button"
        className={`older-chat-messages${state.hasMore ? '' : ' hidden'}`}
        disabled={state.loadingOlder}
        onClick={() => controller?.loadOlder()}
      >
        Mensagens anteriores
      </button>
      <MessageList state={state} controller={controller} />
    </>
  );
}
export function ChatClearButton() {
  const { state, controller } = useMessages();
  return (
    <button
      id="clearChatHistoryBtn"
      type="button"
      className="small-btn chat-history-clear"
      title="Apagar todo o histórico deste canal"
      hidden={!state.canModerate}
      disabled={!!state.pending}
      onClick={() => controller?.chooseModeration({ action: 'clear' })}
    >
      Limpar chat
    </button>
  );
}
export function ChatModerationDialog() {
  const { state, controller } = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const clear = state.choice?.action === 'clear';
  useEffect(() => {
    if (state.choice) {
      dialog.current?.showModal();
      cancel.current?.focus();
    } else dialog.current?.close();
  }, [state.choice]);
  return (
    <dialog
      ref={dialog}
      id="chatModerationDialog"
      className="feature-dialog chat-moderation-dialog"
      aria-labelledby="chatModerationTitle"
      aria-describedby="chatModerationDescription"
      onCancel={() => controller?.cancelModeration()}
    >
      <h2 id="chatModerationTitle">
        {clear ? 'Apagar o histórico do canal?' : 'Apagar esta mensagem?'}
      </h2>
      <p id="chatModerationDescription">
        {clear
          ? 'Todas as mensagens deste canal serão apagadas para todos. A sala e os arquivos da galeria serão mantidos. Esta ação não pode ser desfeita.'
          : 'A mensagem será apagada para todos. Os arquivos da galeria serão mantidos. Esta ação não pode ser desfeita.'}
      </p>
      <div className="chat-moderation-actions">
        <button
          ref={cancel}
          id="chatModerationCancel"
          type="button"
          onClick={() => controller?.cancelModeration()}
        >
          Cancelar
        </button>
        <button
          id="chatModerationConfirm"
          type="button"
          onClick={() => controller?.confirmModeration()}
        >
          {clear ? 'Apagar histórico' : 'Apagar mensagem'}
        </button>
      </div>
    </dialog>
  );
}
