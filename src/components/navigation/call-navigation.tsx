'use client';
import { useSyncExternalStore } from 'react';
import type { CallNavigation } from '../../lib/voice/navigation';

export const NAVIGATION_CONTROLS = [
  'socialBtn',
  'roomSocialBtn',
  'chatOnlyOpenSocialBtn',
  'socialCloseBtn',
  'socialMiniDock',
  'chatOnlyTextBtn',
  'chatDrawerCloseBtn',
  'muteTextBtn',
  'returnToVoiceRoom',
] as const;
export type NavigationControlId = (typeof NAVIGATION_CONTROLS)[number];
export function CallNavigationHost({ id }: { id: NavigationControlId }) {
  return <span id={'call-nav-' + id} style={{ display: 'contents' }} />;
}
export function CallNavigationButton({
  client,
  id,
  desktop,
  openText,
  returnToVoice,
}: {
  client: CallNavigation;
  id: NavigationControlId;
  desktop: boolean;
  openText(): void;
  returnToVoice(): void;
}) {
  const s = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const presence = s.voiceRoom?.voiceActive ? (
    <span className="call-presence">🎙 Em call</span>
  ) : null;
  switch (id) {
    case 'socialBtn':
      return (
        <button
          id={id}
          type="button"
          className={'icon-btn social-top-btn' + (s.panelOpen ? ' music-active' : '')}
          title="Chat de texto, voz e câmera"
          onClick={() => client.openFromGame(desktop)}
        >
          💬 Chat {presence}{' '}
          <span id="chatUnread" className={'chat-unread' + (s.unread ? '' : ' hidden')}>
            {s.unread}
          </span>
        </button>
      );
    case 'roomSocialBtn':
      return (
        <button
          id={id}
          type="button"
          className={'royal-btn' + (s.panelOpen ? ' ready-active' : '')}
          onClick={() => client.showPanel(!s.panelOpen)}
        >
          💬 Comunicação {presence}
        </button>
      );
    case 'chatOnlyOpenSocialBtn':
      return (
        <button
          id={id}
          type="button"
          className={'royal-btn' + (s.panelOpen ? ' hidden' : '')}
          onClick={() => client.showPanel(true)}
        >
          Abrir comunicação
        </button>
      );
    case 'socialCloseBtn':
      return (
        <button id={id} type="button" title="Minimizar" onClick={client.minimize}>
          —
        </button>
      );
    case 'socialMiniDock':
      return (
        <button
          id={id}
          type="button"
          className={
            'social-mini-dock' + (!s.panelOpen && !s.hub && s.panelAvailable ? '' : ' hidden')
          }
          title="Restaurar comunicação"
          onClick={() => client.showPanel(true)}
        >
          <span>💬</span>
          <strong>Comunicação</strong>
          <em>abrir</em>
        </button>
      );
    case 'chatOnlyTextBtn':
      return (
        <button
          id={id}
          type="button"
          className={
            'chat-header-action' +
            (s.hub && s.drawerOpen ? ' active' : '') +
            (s.unread ? ' has-unread' : '')
          }
          title="Abrir mensagens de texto"
          aria-expanded={s.hub && s.drawerOpen}
          onClick={openText}
        >
          <span>💬</span>
          <b>Chat</b>
          <em id="chatOnlyUnread" className={'chat-header-unread' + (s.unread ? '' : ' hidden')}>
            {s.unread}
          </em>
        </button>
      );
    case 'chatDrawerCloseBtn':
      return (
        <button
          id={id}
          type="button"
          className={'chat-drawer-close' + (s.hub ? '' : ' hidden')}
          title="Fechar chat"
          onClick={() => client.toggleTextChat(false)}
        >
          ×
        </button>
      );
    case 'muteTextBtn':
      return (
        <button
          id={id}
          type="button"
          className={'small-btn' + (s.muted ? ' danger-active' : '')}
          onClick={client.toggleMute}
        >
          {s.muted ? 'Ativar chat' : 'Silenciar chat'}
        </button>
      );
    case 'returnToVoiceRoom':
      return (
        <button id={id} type="button" onClick={returnToVoice}>
          Voltar à sala de voz
        </button>
      );
  }
}
