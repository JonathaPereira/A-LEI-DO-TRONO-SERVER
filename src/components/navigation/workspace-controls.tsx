'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import type { CallWorkspace } from '../../lib/voice/workspace';
import { Avatar } from '../profiles/avatar';
import { DirectProfileBanner } from '../profiles/decorations';

export const WORKSPACE_CONTROLS = [
  'header',
  'sidebar',
  'shade',
  'layout',
  'areas',
  'direct',
  'title',
] as const;
export type WorkspaceControl = (typeof WORKSPACE_CONTROLS)[number];
export function WorkspaceHost({ id }: { id: Exclude<WorkspaceControl, 'areas' | 'title'> }) {
  return <span id={'workspace-control-' + id} style={{ display: 'contents' }} />;
}
export function WorkspaceIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export function WorkspaceControlView({
  id,
  client,
}: {
  id: WorkspaceControl;
  client: CallWorkspace;
}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  switch (id) {
    case 'title':
      return state.layout === 'discord' ? state.roomName.trim() || 'Comunidade M&N' : 'M&N';
    case 'header': {
      const label = state.headerCollapsed ? 'Mostrar barra superior' : 'Ocultar barra superior';
      return (
        <button
          id="workspaceHeaderToggle"
          type="button"
          aria-controls="workspaceHeader"
          aria-expanded={!state.headerCollapsed}
          aria-label={label}
          title={label}
          onClick={client.toggleHeader}
        >
          <WorkspaceIcon>
            <path d="m6 14 6-6 6 6" />
          </WorkspaceIcon>
        </button>
      );
    }
    case 'sidebar':
      return (
        <button
          id="workspaceSidebarBtn"
          type="button"
          title="Canais"
          aria-label="Abrir canais"
          aria-expanded={state.sidebarOpen}
          onClick={client.toggleSidebar}
        >
          <WorkspaceIcon>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </WorkspaceIcon>
        </button>
      );
    case 'shade':
      return (
        <button
          id="workspaceSidebarShade"
          type="button"
          hidden={!state.sidebarOpen}
          aria-label="Fechar canais"
          onClick={client.closeSidebar}
        />
      );
    case 'layout': {
      const label = state.layout === 'discord' ? 'Discord' : 'Original';
      return (
        <button
          id="workspaceLayoutToggle"
          className="chat-header-action"
          type="button"
          title="Alternar entre Original e Discord"
          aria-label={'Layout ' + label + ' · trocar'}
          onClick={client.switchLayout}
        >
          {label}
        </button>
      );
    }
    case 'areas':
      return (
        <>
          <button type="button" className="active" data-workspace-area="call">
            <WorkspaceIcon>
              <path d="M4 10v4h4l5 4V6l-5 4zM17 8a6 6 0 0 1 0 8" />
            </WorkspaceIcon>
            Call
          </button>
          <button type="button" data-workspace-area="games" onClick={client.openGames}>
            <WorkspaceIcon>
              <rect x="3" y="6" width="18" height="13" rx="4" />
              <path d="M7 10v5m-2-2h4m7-2h.01m2 4h.01" />
            </WorkspaceIcon>
            Jogos
          </button>
        </>
      );
    case 'direct':
      return (
        <>
          <button id="workspaceDirectOpen" type="button" onClick={() => client.openDirect()}>
            <WorkspaceIcon>
              <path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z" />
            </WorkspaceIcon>
            <span>Mensagens diretas</span>
            <b id="workspaceDirectCount" hidden={!state.unread}>
              {state.unread}
            </b>
          </button>
          <div id="workspaceDirectList">
            {state.people.map((person) => (
              <button
                key={person.id}
                type="button"
                className="workspace-direct-person"
                data-direct-profile={person.id}
                onClick={() => client.openDirect(person.id)}
              >
                <DirectProfileBanner accountId={person.id} />
                <Avatar className="community-avatar" person={person} />
                <span className="workspace-direct-name">{person.name}</span>
                {!!person.unread && <b>{person.unread}</b>}
              </button>
            ))}
          </div>
        </>
      );
  }
}
