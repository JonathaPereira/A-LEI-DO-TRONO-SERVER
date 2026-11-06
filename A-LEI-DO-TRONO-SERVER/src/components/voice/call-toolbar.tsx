'use client';
import { useSyncExternalStore } from 'react';
import type { CallControlId, CallToolbar } from '../../lib/voice/toolbar';

const useToolbar = (client: CallToolbar) =>
  useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
function ControlIcon({ id }: { id: CallControlId }) {
  return (
    <span className="workspace-control-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {id === 'joinVoiceBtn' ? (
          <path d="M3 12c5-5 13-5 18 0l-1 5-4-1v-4M3 12l1 5 4-1v-4" />
        ) : id === 'muteMicBtn' ? (
          <>
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
          </>
        ) : id === 'deafenVoiceBtn' ? (
          <path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zM17 13h4v8h-4z" />
        ) : id === 'cameraBtn' ? (
          <>
            <rect x="2" y="5" width="14" height="14" rx="3" />
            <path d="m16 10 6-4v12l-6-4" />
          </>
        ) : id === 'screenShareBtn' ? (
          <>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 22h8m-4-5v5m-3-12 3-3 3 3m-3-3v7" />
          </>
        ) : (
          <>
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="3" />
            <circle cx="15" cy="17" r="3" />
          </>
        )}
      </svg>
    </span>
  );
}
export function CallControl({ client, id }: { client: CallToolbar; id: CallControlId }) {
  const snapshot = useToolbar(client),
    button = snapshot.buttons[id];
  const action = ['joinVoiceBtn', 'cameraBtn', 'screenShareBtn'].includes(id);
  return (
    <button
      id={id}
      type="button"
      className={
        'royal-btn call-action' +
        (id === 'joinVoiceBtn'
          ? ' primary'
          : id === 'screenShareBtn'
            ? ' screen-share-btn'
            : id === 'voiceSettingsBtn'
              ? ' settings-btn'
              : '') +
        (button.active ? ' ' + button.activeClass : '') +
        (id === 'joinVoiceBtn' && snapshot.joining ? ' call-joining' : '')
      }
      disabled={button.disabled}
      title={button.title}
      aria-label={button.label}
      aria-pressed={id === 'voiceSettingsBtn' || id === 'joinVoiceBtn' ? undefined : button.active}
      aria-expanded={id === 'voiceSettingsBtn' ? button.active : undefined}
      data-call-action={action ? (button.active ? 'stop' : 'start') : undefined}
      data-workspace-label={button.short}
      onClick={() => void client.activate(id)}
    >
      {button.workspace && <ControlIcon id={id} />}
      <span className="call-icon">{button.glyph}</span>
      <span>{button.label}</span>
    </button>
  );
}
export function CallStatus({ client }: { client: CallToolbar }) {
  const snapshot = useToolbar(client);
  return (
    <>
      <span id="voiceStatus" role="status" aria-live="polite" data-kind={snapshot.status.kind}>
        {snapshot.status.text}
      </span>
      <button
        id="resumeAudioBtn"
        className={'royal-btn' + (snapshot.blocked ? '' : ' hidden')}
        type="button"
        onClick={() => void client.resume()}
      >
        🔊 Liberar áudio
      </button>
    </>
  );
}
