import { useSyncExternalStore } from 'react';
import type { CommunityController } from '../../lib/community/controller';
import type { CommunityPerson, GamePresence } from '../../types/community';
import { Avatar } from '../profiles/avatar';

export interface CommunityActions {
  openProfile(id: string): void;
  openMessage(id: string): void;
  editRole(person: CommunityPerson): void;
}
export function CommunityContents({
  controller,
  actions,
}: {
  controller: CommunityController;
  actions: CommunityActions;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const active = state.presence?.members.filter((person) => person.online) ?? [];
  const offline = state.presence?.members.filter((person) => !person.online) ?? [];
  const disconnected = !!state.presence && !state.connected;
  const scope = disconnected
    ? 'Sem conexão · última presença recebida'
    : state.presence?.scope === 'game'
      ? 'Convidado: participantes das salas do jogo'
      : state.presence?.directoryReady
        ? 'Comunidade · contas confirmadas'
        : state.presence
          ? 'Conectados e pessoas vistas nesta sessão'
          : 'Entre para ver a comunidade.';
  function personRow(person: CommunityPerson) {
    const picture = (
      <>
        <Avatar person={person} className="community-avatar-picture" />
        <i className="community-status-dot" />
      </>
    );
    return (
      <div
        key={person.id}
        data-person-id={person.id}
        className={`community-person ${person.online ? 'is-online' : 'is-offline'}`}
      >
        {person.guest ? (
          <span className="community-avatar">{picture}</span>
        ) : (
          <span
            className="community-avatar profile-avatar-clickable"
            role="button"
            tabIndex={0}
            title={`Ver perfil de ${person.name}`}
            aria-label={`Ver perfil de ${person.name}`}
            onClick={() => actions.openProfile(person.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                actions.openProfile(person.id);
              }
            }}
          >
            {picture}
          </span>
        )}
        <div className="community-person-copy">
          <strong>{person.name}</strong>
          <small>
            {!person.online
              ? 'Offline'
              : person.roomName
                ? `${person.roomName}${person.inVoice ? ' · na voz' : ''}`
                : 'Online · no início'}
          </small>
          {person.online && person.activity?.name && (
            <small className="community-game-activity" title={`Atividade: ${person.activity.name}`}>
              🎮 {person.activity.name}
            </small>
          )}
          {person.guest ? (
            <span className="community-guest-tag">Convidado</span>
          ) : (
            <span className={`role-badge role-${person.role}`}>
              {person.role === 'creator' ? 'Criador' : person.role === 'admin' ? 'Admin' : 'Membro'}
            </span>
          )}
        </div>
        {state.identity?.manageRoles && !person.guest && person.role !== 'creator' && (
          <button
            type="button"
            className="role-edit-btn"
            title={`Alterar cargo de ${person.name}`}
            aria-label={`Alterar cargo de ${person.name}`}
            onClick={() => actions.editRole(person)}
          >
            Cargo
          </button>
        )}
        {!person.guest && person.id !== state.identity?.accountId && (
          <button
            type="button"
            className="social-small-button community-message-btn"
            onClick={() => actions.openMessage(person.id)}
          >
            Conversar
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <header>
        <div>
          <strong>Pessoas</strong>
          <small id="communitySummary">
            {disconnected
              ? 'Aguardando conexão'
              : state.presence
                ? `${active.length} online · ${offline.length} offline`
                : 'Conectando…'}
          </small>
        </div>
        <button
          id="communityClose"
          className="community-close"
          type="button"
          aria-label="Fechar painel de pessoas"
          onClick={() => controller.toggle(false)}
        >
          ×
        </button>
      </header>
      <p id="communityScope" className="community-scope">
        {scope}
      </p>
      <div id="communityMembers" className="community-members">
        <h3>Online — {active.length}</h3>
        {!active.length && (
          <p className="community-empty">
            {state.presence ? 'Nenhuma pessoa online nesta lista.' : 'Aguardando conexão…'}
          </p>
        )}
        {active.map(personRow)}
        {!!offline.length && (
          <details>
            <summary>Offline — {offline.length}</summary>
            {offline.map(personRow)}
          </details>
        )}
      </div>
      <section className="community-activity">
        <strong>Atividade da voz</strong>
        <ul id="communityActivity">
          {state.activities.map((item) => (
            <li key={item.key}>
              {new Date(item.at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {item.text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
export function CommunityNotices({ controller }: { controller: CommunityController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return state.notices.map((item) => (
    <div key={item.key} className={`community-call-notice ${item.kind}`}>
      {item.text}
    </div>
  ));
}
export function GamePresenceIcons({ room }: { room: GamePresence }) {
  return (
    <>
      {room.players.slice(0, 8).map((person) => (
        <Avatar
          key={person.id}
          person={person}
          className="community-avatar"
          title={`${person.name}${person.guest ? ' · convidado' : ''}${person.inVoice ? ' · na voz' : ''}`}
        />
      ))}
      {room.players.length > 8 && <small>+{room.players.length - 8}</small>}
    </>
  );
}
