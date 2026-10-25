'use client';
import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Avatar } from '../profiles/avatar';
import { Attachment } from '../files/attachment';
import type { ChatMessage } from '../../types/domain';
import { directPeople, directPerson } from '../../lib/messenger/selectors';
import { useModel, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import styles from './shell.module.css';

class Timeline extends Component<{ scope: string; change: string; children: ReactNode }> {
  private host: HTMLDivElement | null = null;
  getSnapshotBeforeUpdate(
    previous: Readonly<{ scope: string; change: string; children: ReactNode }>,
  ) {
    const host = this.host;
    return host
      ? {
          height: host.scrollHeight,
          top: host.scrollTop,
          preserve: previous.scope === this.props.scope && this.props.change === 'prepend',
          bottom: host.scrollHeight - host.scrollTop - host.clientHeight < 100,
        }
      : null;
  }
  componentDidUpdate(
    _p: unknown,
    _s: unknown,
    snapshot: { height: number; top: number; preserve: boolean; bottom: boolean } | null,
  ) {
    if (!snapshot || !this.host) return;
    if (snapshot.preserve)
      this.host.scrollTop = snapshot.top + this.host.scrollHeight - snapshot.height;
    else if (
      snapshot.bottom ||
      (_p && typeof _p === 'object' && 'scope' in _p && _p.scope !== this.props.scope)
    )
      this.host.scrollTop = this.host.scrollHeight;
  }
  render() {
    return (
      <div
        ref={(e) => {
          this.host = e;
        }}
        className={styles.timeline}
        role="log"
        aria-label="Mensagens"
        aria-live="polite"
      >
        {this.props.children}
      </div>
    );
  }
}
function DateLabel({ value }: { value: string | number }) {
  const date = new Date(value);
  return (
    <time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>
      {Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
    </time>
  );
}
function ChannelMessage({
  runtime,
  message,
}: {
  runtime: ApplicationServices;
  message: ChatMessage;
}) {
  const state = useModel(runtime.TronoChatMessages);
  return (
    <article className={styles.message} data-message-id={message.id}>
      <Avatar person={message} className={styles.avatar} />
      <div>
        <div className={styles.messageHeading}>
          <strong>{message.name || 'Jogador'}</strong>
          <DateLabel value={message.ts} />
          {state.canModerate && (
            <button
              aria-label={'Apagar mensagem de ' + message.name}
              disabled={!!state.pending}
              onClick={() =>
                runtime.TronoChatMessages.chooseModeration({ action: 'delete', id: message.id })
              }
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <p>{message.text}</p>
        {message.attachment && (
          <div className={styles.attachment}>
            <Attachment file={message.attachment} />
          </div>
        )}
      </div>
    </article>
  );
}
function Composer({ runtime, direct }: { runtime: ApplicationServices; direct: boolean }) {
  const channel = useModel(runtime.TronoChatComposer),
    dm = useModel(runtime.TronoDirectMessages);
  const room = useModel(runtime.TronoChatMessages),
    catalog = useModel(runtime.TronoChannels);
  const file = useRef<HTMLInputElement>(null),
    text = direct ? dm.draft.text : channel.draft;
  const attachment = direct ? dm.draft.file : channel.file,
    busy = direct ? !!dm.sending : channel.uploading;
  const selected = catalog.channels.find((c) => c.id === room.roomId);
  const allowed = direct ? !!dm.peerId : !!room.roomId && selected?.type !== 'voice';
  const setText = (value: string) =>
    direct ? runtime.TronoDirectMessages.setText(value) : runtime.TronoChatComposer.setDraft(value);
  const select = (value: File) =>
    direct
      ? runtime.TronoDirectMessages.setFile(value)
      : runtime.TronoChatComposer.selectFile(value);
  const send = () => {
    if (allowed && !busy)
      void (direct ? runtime.TronoDirectMessages.submit() : runtime.TronoChatComposer.send());
  };
  const [emoji, setEmoji] = useState(false);
  return (
    <div
      className={styles.composerArea}
      onDragOver={(e) => {
        if (allowed) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (allowed && !busy && e.dataTransfer.files[0]) select(e.dataTransfer.files[0]);
      }}
    >
      {attachment && (
        <div className={styles.attachmentPreview}>
          <span>▧ {attachment.name}</span>
          <button
            type="button"
            disabled={direct && dm.sending === 'send'}
            onClick={() =>
              direct ? runtime.TronoDirectMessages.removeFile() : runtime.TronoChatComposer.cancel()
            }
          >
            Remover anexo
          </button>
        </div>
      )}
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Anexar arquivo"
          disabled={busy || !allowed}
          onClick={() => file.current?.click()}
        >
          <Icon name="attach" />
        </button>
        <input
          ref={file}
          hidden
          type="file"
          onChange={(e) => {
            if (e.target.files?.[0]) select(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <textarea
          id={direct ? 'directMessageInput' : 'channelMessageInput'}
          aria-label={direct ? 'Mensagem privada' : 'Mensagem no canal'}
          placeholder={
            allowed
              ? direct
                ? 'Envie uma mensagem privada…'
                : 'Converse em #' + (selected?.name || 'canal')
              : 'Selecione uma conversa de texto para começar'
          }
          rows={1}
          maxLength={direct ? 2000 : 300}
          disabled={busy || !allowed}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.files[0];
            if (pasted && !busy) {
              e.preventDefault();
              select(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Escolher emoji"
          aria-expanded={emoji}
          disabled={busy || !allowed}
          onClick={() => setEmoji(!emoji)}
        >
          <Icon name="emoji" />
        </button>
        <button
          className={styles.send}
          type="submit"
          aria-label="Enviar mensagem"
          disabled={busy || !allowed || (!text.trim() && !attachment)}
        >
          <Icon name="send" />
        </button>
      </form>
      {emoji && (
        <div
          className={styles.emojis}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEmoji(false);
              e.stopPropagation();
            }
          }}
        >
          {['😀', '😂', '❤️', '🔥', '👍', '🎮', '👑', '🎉'].map((value) => (
            <button
              type="button"
              aria-label={value}
              key={value}
              onClick={() => {
                if (text.length + value.length <= (direct ? 2000 : 300)) setText(text + value);
                setEmoji(false);
              }}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <div className={styles.composerStatus}>
        <span role="status">{direct ? dm.status : channel.status}</span>
        <small>{direct ? '2.000' : '300'} caracteres · um anexo</small>
      </div>
    </div>
  );
}
function Moderation({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoChatMessages),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state.choice && !dialog.current?.open) {
      trigger.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else if (!state.choice && dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [state.choice]);
  return (
    <dialog
      ref={dialog}
      className={styles.confirmDialog}
      aria-labelledby="moderationTitle"
      onCancel={(e) => {
        e.preventDefault();
        runtime.TronoChatMessages.cancelModeration();
      }}
    >
      <h2 id="moderationTitle">
        {state.choice?.action === 'clear'
          ? 'Limpar o histórico do canal?'
          : 'Apagar esta mensagem?'}
      </h2>
      <p>A alteração será aplicada pelo servidor para todas as pessoas deste canal.</p>
      <div>
        <button onClick={() => runtime.TronoChatMessages.cancelModeration()}>Cancelar</button>
        <button
          className={styles.danger}
          onClick={() => runtime.TronoChatMessages.confirmModeration()}
        >
          Apagar
        </button>
      </div>
    </dialog>
  );
}
export function Conversation({ runtime }: { runtime: ApplicationServices }) {
  const messages = useModel(runtime.TronoChatMessages),
    dm = useModel(runtime.TronoDirectMessages),
    nav = useModel(runtime.TronoCommunityNavigation);
  const direct = dm.open;
  const peer = directPerson(dm, dm.peerId ?? '');
  return (
    <div className={styles.conversation}>
      {direct && !dm.peerId ? (
        <Friends runtime={runtime} />
      ) : (
        <>
          <div className={styles.conversationHeading}>
            <strong>{direct ? peer?.name || 'Conversa privada' : '# ' + nav.roomName}</strong>
            {direct ? (
              <button
                className={styles.link}
                onClick={() => void runtime.TronoDirectMessages.openFriends()}
              >
                Ver amigos
              </button>
            ) : (
              messages.canModerate && (
                <button
                  className={styles.link}
                  disabled={!!messages.pending}
                  onClick={() => runtime.TronoChatMessages.chooseModeration({ action: 'clear' })}
                >
                  Limpar histórico
                </button>
              )
            )}
          </div>
          {(direct ? dm.hasMore : messages.hasMore) && (
            <button
              className={styles.older}
              disabled={direct ? dm.reading : messages.loadingOlder}
              onClick={() =>
                direct
                  ? void runtime.TronoDirectMessages.read(true)
                  : runtime.TronoChatMessages.loadOlder()
              }
            >
              Carregar mensagens anteriores
            </button>
          )}
          <Timeline
            scope={direct ? 'direct:' + dm.peerId : 'channel:' + messages.roomId}
            change={direct ? dm.change : messages.change}
          >
            {(direct ? dm.messages : messages.messages).length === 0 && (
              <div className={styles.emptyConversation}>
                <span>
                  <Icon name="hash" size={36} />
                </span>
                <h2>{direct ? 'Comece a conversa' : 'Bem-vindo a ' + nav.roomName}</h2>
                <p>
                  {direct
                    ? 'Uma mensagem pode ser o início da próxima partida.'
                    : messages.roomId
                      ? 'Este é o começo das mensagens deste canal.'
                      : 'Escolha um canal na barra lateral.'}
                </p>
              </div>
            )}
            {direct
              ? dm.messages.map((message) => (
                  <article className={styles.message} key={message.id} data-message-id={message.id}>
                    <span className={styles.initialAvatar}>
                      {message.senderId === dm.accountId
                        ? runtime.TronoAuth.user?.nickname.slice(0, 1)
                        : peer?.name.slice(0, 1)}
                    </span>
                    <div>
                      <div className={styles.messageHeading}>
                        <strong>
                          {message.senderId === dm.accountId
                            ? runtime.TronoAuth.user?.nickname
                            : peer?.name || 'Jogador'}
                        </strong>
                        <DateLabel value={message.ts} />
                      </div>
                      <p>{message.text}</p>
                      {message.attachment && (
                        <div className={styles.attachment}>
                          <Attachment file={message.attachment} privateMessage />
                        </div>
                      )}
                      {message.roomId && (
                        <button
                          className={styles.link}
                          onClick={() =>
                            void runtime.TronoMessenger.joinChannel(message.roomId!, {
                              showText: true,
                            })
                          }
                        >
                          Abrir canal do convite
                        </button>
                      )}
                    </div>
                  </article>
                ))
              : messages.messages.map((message) => (
                  <ChannelMessage runtime={runtime} message={message} key={message.id} />
                ))}
          </Timeline>
          {direct &&
            dm.peerId &&
            dm.friends.some((f) => f.id === dm.peerId && f.state === 'accepted') && (
              <div className={styles.invite}>
                <button
                  className={styles.link}
                  onClick={() =>
                    runtime.TronoDirectMessages.toggleInvite(runtime.TronoNetwork.currentRoom)
                  }
                >
                  Convidar para canal
                </button>
                {dm.inviteOpen && (
                  <>
                    <select
                      aria-label="Canal do convite"
                      value={dm.inviteChannel}
                      onChange={(e) => runtime.TronoDirectMessages.selectInvite(e.target.value)}
                    >
                      {runtime.TronoChannels.getSnapshot().channels.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => void runtime.TronoDirectMessages.invite()}>
                      Enviar convite
                    </button>
                  </>
                )}
              </div>
            )}
          <Composer runtime={runtime} direct={direct} />
        </>
      )}
      <Moderation runtime={runtime} />
    </div>
  );
}
export function Friends({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoDirectMessages);
  const people = [
    ...new Map(
      [...state.members, ...state.friends, ...directPeople(state)].map((person) => [
        person.id,
        person,
      ]),
    ).values(),
  ].filter(
    (p) =>
      p.id !== state.accountId &&
      p.name.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()),
  );
  return (
    <div className={styles.friends}>
      <div className={styles.friendsHeader}>
        <h2>Amigos</h2>
        <button
          className={styles.secondary}
          onClick={() => void runtime.TronoDirectMessages.refresh()}
        >
          Atualizar
        </button>
      </div>
      <label className={styles.search}>
        Buscar pessoas
        <input
          type="search"
          placeholder="Encontre alguém para conversar"
          value={state.search}
          onChange={(e) => runtime.TronoDirectMessages.setSearch(e.target.value)}
        />
      </label>
      <p className={styles.sectionLabel}>PESSOAS · {people.length}</p>
      {people.map((person) => {
        const friend = state.friends.find((f) => f.id === person.id),
          pending = state.actionPending.includes(person.id);
        return (
          <div className={styles.friend} data-person={person.id} key={person.id}>
            <Avatar person={person} className={styles.avatar} />
            <div>
              <strong>{person.name}</strong>
              <small>
                {friend?.state === 'pending'
                  ? friend.incoming
                    ? 'Solicitação recebida'
                    : 'Convite enviado'
                  : person.online
                    ? 'Disponível'
                    : 'Offline'}
              </small>
            </div>
            {friend?.state === 'pending' ? (
              <>
                {friend.incoming && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      void runtime.TronoDirectMessages.friendAction(person.id, 'accept')
                    }
                  >
                    Aceitar
                  </button>
                )}
                <button
                  disabled={pending}
                  onClick={() =>
                    void runtime.TronoDirectMessages.friendAction(person.id, 'decline')
                  }
                >
                  {friend.incoming ? 'Recusar' : 'Cancelar'}
                </button>
              </>
            ) : (
              <>
                <button
                  aria-label={'Conversar com ' + person.name}
                  onClick={() => void runtime.TronoDirectMessages.open(person.id)}
                >
                  Mensagem
                </button>
                {friend?.state === 'accepted' ? (
                  <button
                    aria-label={'Remover amizade com ' + person.name}
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm('Remover amizade com ' + person.name + '?'))
                        void runtime.TronoDirectMessages.friendAction(person.id, 'remove');
                    }}
                  >
                    ×
                  </button>
                ) : (
                  <button
                    disabled={pending}
                    onClick={() =>
                      void runtime.TronoDirectMessages.friendAction(person.id, 'request')
                    }
                  >
                    Adicionar
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      {!people.length && (
        <div className={styles.emptyConversation}>
          <h2>Encontre sua próxima companhia</h2>
          <p>Os membros da comunidade aparecem aqui quando estiverem disponíveis.</p>
        </div>
      )}
      <p role="status">{state.status}</p>
    </div>
  );
}
