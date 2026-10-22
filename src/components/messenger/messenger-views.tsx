import { Component, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Messenger } from '../../lib/messenger/controller';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { NotificationsController } from '../../lib/notifications/controller';
import type { MessengerSnapshot, DirectPerson } from '../../types/messenger';
import { directPerson, directUnread } from '../../lib/messenger/selectors';
import { Avatar } from '../profiles/avatar';
import { AttachmentContent } from '../files/attachment';
import { formatFileSize } from '../../lib/files/client';

export interface MessengerViewsProps {
  controller: Messenger;
  channels: ChannelsController;
  notifications: NotificationsController;
  joinChannel(id: string): Promise<void>;
  defaultChannel(): string | null;
}
function SmallButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="social-small-button" {...props}>
      {children}
    </button>
  );
}
export function MessengerToggleContents({ controller }: { controller: Messenger }) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    unread = directUnread(state);
  return (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5" />
      </svg>
      <span>Amigos</span>
      <b id="messengerUnread" className="social-badge" hidden={!unread}>
        {unread ? Math.min(unread, 99) : ''}
      </b>
    </>
  );
}
function AttachmentDraft({
  state,
  controller,
}: {
  state: MessengerSnapshot;
  controller: Messenger;
}) {
  const file = state.open ? state.draft.file : null,
    [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div id="messengerAttachmentDraft" hidden={!state.draft.file}>
      {state.draft.file && (
        <>
          {state.draft.file.type.startsWith('image/') ? (
            preview?.file === file && (
              <img className="messenger-draft-image" alt="Prévia da imagem" src={preview.url} />
            )
          ) : (
            <span>
              {state.draft.file.name} · {formatFileSize(state.draft.file.size)}
            </span>
          )}
          <SmallButton disabled={state.sending === 'send'} onClick={controller.removeFile}>
            Remover anexo
          </SmallButton>
        </>
      )}
    </div>
  );
}
interface MessageListProps {
  state: MessengerSnapshot;
  joinChannel(id: string): Promise<void>;
}
class DirectMessages extends Component<MessageListProps> {
  private host = { current: null as HTMLDivElement | null };
  getSnapshotBeforeUpdate(previous: MessageListProps) {
    const host = this.host.current;
    return host && previous.state.messages !== this.props.state.messages
      ? {
          height: host.scrollHeight,
          top: host.scrollTop,
          prepend:
            previous.state.peerId === this.props.state.peerId &&
            this.props.state.change === 'prepend',
        }
      : null;
  }
  componentDidUpdate(
    _previous: MessageListProps,
    _state: unknown,
    snapshot: { height: number; top: number; prepend: boolean } | null,
  ) {
    if (snapshot && this.host.current)
      this.host.current.scrollTop = snapshot.prepend
        ? snapshot.top + this.host.current.scrollHeight - snapshot.height
        : this.host.current.scrollHeight;
  }
  render() {
    const { state, joinChannel } = this.props;
    return (
      <div id="messengerMessages" className="messenger-messages" ref={this.host}>
        {!state.peerId && (
          <p className="messenger-empty">
            Escolha um amigo para começar. Você pode conversar enquanto joga ou participa de uma
            chamada.
          </p>
        )}
        {state.messages.map((message) => (
          <article
            key={message.id}
            data-message-id={message.id}
            className={`direct-message${message.senderId === state.accountId ? ' own' : ''}`}
          >
            <strong>
              {message.senderId === state.accountId
                ? 'Você'
                : (directPerson(state, state.peerId)?.name ?? 'Amigo')}
            </strong>
            {!!message.text && <p>{message.text}</p>}
            {message.attachment && (
              <div
                data-attachment={message.attachment.id}
                className={`chat-attachment direct-attachment${['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(message.attachment.mime) ? ' image-attachment' : ''}`}
              >
                <AttachmentContent file={message.attachment} privateMessage />
              </div>
            )}
            <time dateTime={message.ts}>
              {new Date(message.ts).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {message.roomId && (
              <SmallButton onClick={() => void joinChannel(message.roomId!)}>
                Entrar no canal
              </SmallButton>
            )}
          </article>
        ))}
      </div>
    );
  }
}
export function MessengerPanelContents({
  controller,
  channels,
  notifications,
  joinChannel,
  defaultChannel,
}: MessengerViewsProps) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const catalog = useSyncExternalStore(
    channels.subscribe,
    channels.getSnapshot,
    channels.getSnapshot,
  );
  useSyncExternalStore(
    notifications.subscribe,
    notifications.getSnapshot,
    notifications.getSnapshot,
  );
  const fileInput = useRef<HTMLInputElement>(null),
    entry = state.friends.find((row) => row.id === state.peerId),
    person = directPerson(state, state.peerId),
    accepted = entry?.state === 'accepted';
  function row(member: DirectPerson) {
    const friend = state.friends.find((row) => row.id === member.id),
      thread = state.threads.find((row) => row.id === member.id);
    return (
      <div
        key={member.id}
        data-peer-id={member.id}
        className={`messenger-person${member.id === state.peerId ? ' selected' : ''}`}
      >
        <button
          type="button"
          className="messenger-person-main"
          onClick={() => void controller.open(member.id)}
        >
          <Avatar person={member} className="community-avatar" />
          <span className="messenger-person-copy">
            <strong>{directPerson(state, member.id)?.name ?? member.name}</strong>
            <small>
              {friend?.state === 'pending'
                ? friend.incoming
                  ? 'Pedido recebido'
                  : 'Pedido enviado'
                : thread?.last.text ||
                  (thread?.last.attachment
                    ? 'Enviou um anexo'
                    : directPerson(state, member.id)?.online
                      ? 'Online'
                      : 'Offline')}
            </small>
          </span>
          {!!thread?.unread && <b className="social-badge">{thread.unread}</b>}
        </button>
        {friend?.state === 'pending' && (
          <>
            {friend.incoming && (
              <SmallButton
                disabled={state.actionPending.includes(member.id)}
                onClick={() => void controller.friendAction(member.id, 'accept')}
              >
                Aceitar
              </SmallButton>
            )}
            <SmallButton
              disabled={state.actionPending.includes(member.id)}
              onClick={() => void controller.friendAction(member.id, 'decline')}
            >
              {friend.incoming ? 'Recusar' : 'Cancelar'}
            </SmallButton>
          </>
        )}
      </div>
    );
  }
  const ids = new Set<string>(),
    groups = [
      { name: 'Pedidos', people: state.friends.filter((row) => row.state === 'pending') },
      { name: 'Conversas', people: state.threads },
      { name: 'Amigos', people: state.friends.filter((row) => row.state === 'accepted') },
    ].map((group) => ({
      ...group,
      people: group.people.filter((row) => {
        if (ids.has(row.id)) return false;
        ids.add(row.id);
        return true;
      }),
    }));
  const search = state.search.trim().toLocaleLowerCase('pt-BR'),
    matches =
      search.length < 2
        ? []
        : state.members
            .filter(
              (row) =>
                row.id !== state.accountId && row.name.toLocaleLowerCase('pt-BR').includes(search),
            )
            .slice(0, 12);
  return (
    <>
      <header className="messenger-heading">
        <strong>Amigos &amp; conversas</strong>
        <button
          id="messengerClose"
          className="settings-close"
          type="button"
          aria-label="Fechar amigos"
          onClick={controller.close}
        >
          ×
        </button>
      </header>
      <div className="messenger-layout">
        <section className="messenger-sidebar">
          <label className="messenger-search-label">
            Adicionar amigo
            <input
              id="messengerSearch"
              placeholder="Buscar pelo apelido"
              maxLength={20}
              autoComplete="off"
              value={state.search}
              onChange={(event) => controller.setSearch(event.target.value)}
            />
          </label>
          <div id="messengerSearchResults">
            {matches.map((member) => (
              <div className="messenger-search-row" key={member.id}>
                <span>{member.name}</span>
                <SmallButton
                  disabled={state.actionPending.includes(member.id)}
                  onClick={() =>
                    void (state.friends.some((row) => row.id === member.id)
                      ? controller.open(member.id)
                      : controller.friendAction(member.id, 'request'))
                  }
                >
                  {state.friends.some((row) => row.id === member.id) ? 'Ver' : 'Adicionar'}
                </SmallButton>
              </div>
            ))}
            {search.length >= 2 && !matches.length && (
              <p className="appearance-help">Nenhuma conta encontrada.</p>
            )}
          </div>
          <div id="messengerList">
            {groups
              .filter((group) => group.people.length)
              .map((group) => (
                <section key={group.name}>
                  <h3>{group.name}</h3>
                  {group.people.map(row)}
                </section>
              ))}
            {!ids.size && (
              <p className="appearance-help">
                Adicione alguém da comunidade para conversar em particular.
              </p>
            )}
          </div>
        </section>
        <section className="messenger-conversation">
          <header>
            <SmallButton id="messengerBack" onClick={() => void controller.openFriends()}>
              ‹ Amigos
            </SmallButton>
            <div>
              <strong id="messengerName">
                {state.peerId ? (person?.name ?? 'Conversa privada') : 'Sua comunidade, mais perto'}
              </strong>
              <small id="messengerSubtitle">
                {!state.peerId
                  ? 'Amigos, pedidos e mensagens privadas'
                  : accepted
                    ? 'Conversa privada · chamada permanece conectada'
                    : entry
                      ? 'Aceite a amizade para conversar.'
                      : 'Histórico preservado · adicione aos amigos para conversar.'}
              </small>
            </div>
          </header>
          <div className="messenger-tools">
            <SmallButton
              id="messengerAdd"
              hidden={!state.peerId || !!entry}
              onClick={() => void controller.friendAction(state.peerId!, 'request')}
            >
              Adicionar amigo
            </SmallButton>
            <SmallButton
              id="messengerMute"
              hidden={!state.peerId}
              onClick={() => notifications.mute(state.peerId!, !notifications.muted(state.peerId!))}
            >
              {notifications.muted(state.peerId ?? '') ? 'Ativar avisos' : 'Silenciar avisos'}
            </SmallButton>
            <SmallButton
              id="messengerInvite"
              hidden={!accepted}
              onClick={() => controller.toggleInvite(defaultChannel())}
            >
              Convidar para canal
            </SmallButton>
            <SmallButton
              id="messengerRemove"
              hidden={!accepted}
              onClick={() => {
                if (confirm('Remover esta amizade? O histórico da conversa será preservado.'))
                  void controller.friendAction(state.peerId!, 'remove');
              }}
            >
              Remover amigo
            </SmallButton>
            <SmallButton
              id="messengerEarlier"
              hidden={!state.hasMore}
              disabled={state.reading}
              onClick={() => void controller.read(true)}
            >
              Mensagens anteriores
            </SmallButton>
          </div>
          <div id="messengerInvitePicker" hidden={!state.inviteOpen}>
            <label>
              Canal
              <select
                id="messengerInviteChannel"
                value={state.inviteChannel}
                onChange={(event) => controller.selectInvite(event.target.value)}
              >
                {catalog.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <SmallButton id="messengerInviteSend" onClick={() => void controller.invite()}>
              Enviar convite
            </SmallButton>
          </div>
          <DirectMessages state={state} joinChannel={joinChannel} />
          <form
            id="messengerComposer"
            hidden={!state.peerId}
            onSubmit={(event) => {
              event.preventDefault();
              void controller.submit();
            }}
          >
            <AttachmentDraft state={state} controller={controller} />
            <input
              id="messengerFile"
              type="file"
              hidden
              ref={fileInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) controller.setFile(file);
                event.target.value = '';
              }}
            />
            <div className="messenger-compose-line">
              <button
                id="messengerAttach"
                type="button"
                title="Anexar arquivo · até 10 MB; vídeos MP4/WebM até 100 MB"
                aria-label="Anexar arquivo"
                disabled={!accepted || !!state.sending}
                onClick={() => fileInput.current?.click()}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7L13 2m-6 12 8-8" />
                </svg>
              </button>
              <textarea
                id="messengerInput"
                rows={2}
                maxLength={2000}
                placeholder="Mensagem privada"
                aria-label="Mensagem privada"
                value={state.draft.text}
                disabled={!accepted}
                onChange={(event) => controller.setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void controller.submit();
                  }
                }}
              />
              <button id="messengerSend" type="submit" disabled={!accepted || !!state.sending}>
                Enviar
              </button>
            </div>
            <small className="messenger-upload-help">
              Imagens, documentos e áudios até 10 MB · vídeos MP4/WebM até 100 MB
            </small>
          </form>
        </section>
      </div>
      <p id="messengerStatus" role="status">
        {state.status}
      </p>
    </>
  );
}
export function MessengerNotices({ controller }: { controller: Messenger }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return state.toasts.map((toast) => (
    <article
      key={toast.peerId}
      className="messenger-toast"
      onPointerEnter={() => controller.toastTimer(toast.peerId, true)}
      onPointerLeave={() => controller.toastTimer(toast.peerId)}
      onFocus={() => controller.toastTimer(toast.peerId, true)}
      onBlur={() => controller.toastTimer(toast.peerId)}
    >
      <button
        type="button"
        className="messenger-toast-open"
        onClick={() => void controller.open(toast.peerId)}
      >
        <Avatar person={directPerson(state, toast.peerId) ?? {}} className="community-avatar" />
        <span className="messenger-toast-copy">
          <strong>{toast.name}</strong>
          <span>{toast.text}</span>
        </span>
      </button>
      <button
        type="button"
        className="messenger-toast-dismiss"
        aria-label="Dispensar aviso"
        onClick={() => controller.removeToast(toast.peerId)}
      >
        ×
      </button>
    </article>
  ));
}
