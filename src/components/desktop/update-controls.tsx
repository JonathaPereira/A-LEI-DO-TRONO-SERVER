'use client';

import { useSyncExternalStore } from 'react';
import { desktopUpdatePresentation, type DesktopUpdates } from '../../lib/desktop/updates';

export function DesktopUpdateCheck({ client }: { client: DesktopUpdates }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const view = desktopUpdatePresentation(snapshot);
  return (
    <button
      id="desktopUpdateCheck"
      type="button"
      className="desktop-version"
      title={view.title}
      aria-label={view.label + ' · Buscar versão mais recente'}
      disabled={snapshot.checking || snapshot.installing}
      onClick={() => void client.check()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1" />
      </svg>
      <span>{view.label}</span>
    </button>
  );
}

export function DesktopUpdateBanner({ client }: { client: DesktopUpdates }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const view = desktopUpdatePresentation(snapshot);
  return (
    <aside className="desktop-update-banner" hidden={!snapshot.visible} role="status">
      <span>{view.text}</span>
      <button
        type="button"
        hidden={!view.ready}
        disabled={snapshot.installing || snapshot.checking}
        onClick={() => void client.install()}
      >
        {view.restart}
      </button>
      <button
        type="button"
        hidden={!view.ready}
        disabled={snapshot.installing || snapshot.checking}
        onClick={() => void client.check()}
      >
        Buscar última versão
      </button>
      <button type="button" aria-label="Fechar aviso de atualização" onClick={client.close}>
        ×
      </button>
    </aside>
  );
}
