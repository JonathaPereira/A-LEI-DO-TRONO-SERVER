'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import type { DesktopShell } from '../../lib/desktop/shell';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {children}
    </svg>
  );
}
export function DesktopRail({ client }: { client: DesktopShell }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <button
        id="desktopHome"
        type="button"
        className={'desktop-brand' + (state.view === 'home' ? ' active' : '')}
        data-desktop-route="home"
        aria-label="M&N · Ir para o início"
        title="M&N · Início"
        aria-current={state.view === 'home' ? 'page' : undefined}
        onClick={() => void client.navigate('home')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 19V5l9 9 9-9v14l-9-9-9 9" />
        </svg>
        <span>M&amp;N</span>
      </button>
      {(['game', 'community'] as const).map((view) => (
        <button
          key={view}
          type="button"
          data-desktop-route={view}
          className={state.view === view ? 'active' : undefined}
          aria-current={state.view === view ? 'page' : undefined}
          onClick={() => void client.navigate(view)}
        >
          <Icon>
            {view === 'game' ? (
              <path d="m3 6 4 4 5-6 5 6 4-4-2 13H5z" />
            ) : (
              <>
                <path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z" />
                <path d="M8 10h8M8 14h5" />
              </>
            )}
          </Icon>
          <span>{view === 'game' ? 'Jogos' : 'Comunidade'}</span>
        </button>
      ))}
      <button
        type="button"
        data-desktop-route="clips"
        disabled
        title="Opção em desenvolvimento"
        aria-label="Clipes · opção em desenvolvimento"
      >
        <Icon>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="m10 8 6 4-6 4zM3 7h18" />
        </Icon>
        <span>
          Clipes <span aria-hidden="true">🔒</span>
          <small>Em desenvolvimento</small>
        </span>
      </button>
      <button
        id="desktopFullscreen"
        type="button"
        title={state.fullscreenTitle}
        aria-pressed={state.fullscreen}
        aria-label={state.fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
        disabled={state.fullscreenPending}
        onClick={() => void client.toggleFullscreen()}
      >
        <Icon>
          <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
        </Icon>
        <span>{state.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</span>
      </button>
      <span id="desktopUpdateCheckHost" style={{ display: 'contents' }} />
    </>
  );
}
export function DesktopTopbar({ client }: { client: DesktopShell }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <span className="desktop-top-label">Jogue. Converse. Compartilhe.</span>
      <button
        id="desktopChannelsToggle"
        type="button"
        aria-expanded={state.channelsOpen}
        aria-controls="chatChannelList"
        onClick={client.toggleChannels}
      >
        ☰ Canais
      </button>
    </>
  );
}
export function DesktopSidebarShade({ client }: { client: DesktopShell }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <button
      id="desktopSidebarShade"
      type="button"
      aria-label="Fechar lista de canais"
      hidden={!state.channelsOpen}
      onClick={client.closeChannels}
    />
  );
}
export function DesktopCallInfo({ client }: { client: DesktopShell }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <div className="desktop-call-info">
      <small>SEU ESPAÇO, SEM INTERRUPÇÕES</small>
      <strong id="desktopCallName">{state.callName}</strong>
      <span id="desktopCallStatus">{state.callStatus}</span>
    </div>
  );
}
/** The soundboard action bridge keeps its outer button; React owns its label. */
export function DesktopEffectsLabel() {
  const drawing = <path d="M3 9v6m4-9v12m5-16v20m5-16v12m4-9v6" />;
  return (
    <>
      <span className="workspace-control-icon">
        <Icon>{drawing}</Icon>
      </span>
      <Icon>{drawing}</Icon>
      <span>Efeitos</span>
    </>
  );
}
