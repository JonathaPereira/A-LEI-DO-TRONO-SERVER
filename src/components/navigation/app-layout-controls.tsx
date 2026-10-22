'use client';

import { useSyncExternalStore } from 'react';
import type { AppLayout } from '../../lib/navigation/app-layout';
import { Avatar } from '../profiles/avatar';

export function AppLayoutPanel({ client }: { client: AppLayout }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <section id="layoutVoiceConnection" aria-label="Conexão de voz">
        <div className="layout-voice-heading">
          <button
            id="layoutVoiceLocation"
            type="button"
            disabled={!state.canOpenVoice}
            title={state.voiceLocationTitle}
            onClick={() => void client.openVoiceChannel()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M4 12a8 8 0 0 1 8 8M4 7a13 13 0 0 1 13 13M4 2a18 18 0 0 1 18 18" />
              <circle cx="4" cy="20" r="1" />
            </svg>
            <span>
              <strong id="layoutVoiceLabel" role="status">
                {state.voiceLabel}
              </strong>
              <small id="layoutVoiceChannel" title={state.voiceChannel}>
                {state.voiceChannel}
              </small>
            </span>
          </button>
          <div id="layoutConnectionControls" />
        </div>
        <section id="layoutCallActions" aria-label="Câmera e compartilhamento" />
      </section>
      <section id="layoutUserBar" aria-label="Seu perfil e controles de áudio">
        <button
          id="layoutProfile"
          type="button"
          title="Minha conta e aparência"
          aria-label="Abrir meu perfil"
          onClick={client.openProfile}
        >
          <Avatar
            id="layoutUserAvatar"
            online={state.online}
            person={state.profile}
            className="community-avatar"
          />
          <span className="layout-user-copy">
            <strong id="layoutUserName" title={state.name}>
              {state.name}
            </strong>
            <small id="layoutUserStatus">{state.userStatus}</small>
          </span>
        </button>
        <div id="layoutUserControls" />
      </section>
    </>
  );
}

export function AppLayoutRail({ client }: { client: AppLayout }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      {(['home', 'game', 'community'] as const).map((area) => (
        <button
          key={area}
          type="button"
          className={
            (area === 'home' ? 'layout-web-home ' : '') + (state.area === area ? 'active' : '')
          }
          data-layout-route={area}
          aria-current={state.area === area ? 'page' : undefined}
          aria-label={area === 'home' ? 'M&N · Ir para o início' : undefined}
          title={area === 'home' ? 'Início' : area === 'game' ? 'Jogos' : 'Comunidade'}
          onClick={() => void client.navigate(area)}
        >
          {area === 'home' ? (
            'M&N'
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d={
                    area === 'game'
                      ? 'm3 6 4 4 5-6 5 6 4-4-2 13H5z'
                      : 'M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z'
                  }
                />
              </svg>
              <span>{area === 'game' ? 'Jogos' : 'Comunidade'}</span>
            </>
          )}
        </button>
      ))}
    </>
  );
}

export function AppLayoutPicker({ client }: { client: AppLayout }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <fieldset className="app-layout-picker">
        <legend>Disposição do aplicativo</legend>
        {(['original', 'discord'] as const).map((layout) => (
          <label className="app-layout-option" key={layout}>
            <input
              type="radio"
              name="appLayout"
              value={layout}
              checked={state.layout === layout}
              onChange={() => client.apply(layout, { save: true })}
            />
            <span className={'layout-preview layout-preview-' + layout} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>{layout === 'original' ? 'Original / Padrão' : 'Discord'}</strong>
            <small>
              {layout === 'original'
                ? 'Visual original, com os controles na barra inferior.'
                : 'Canais à esquerda, conversa ao centro e seu perfil no canto inferior.'}
            </small>
          </label>
        ))}
      </fieldset>
      <p id="appLayoutStatus" className="appearance-help" role="status">
        {state.layoutStatus}
      </p>
    </>
  );
}
