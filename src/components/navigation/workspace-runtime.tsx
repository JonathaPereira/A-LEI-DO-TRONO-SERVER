import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { CallStage } from '../../lib/voice/stage';
import { createCallWorkspace } from '../../lib/voice/workspace';
import { createWorkspaceLayout } from '../../lib/voice/workspace-layout';
import { WORKSPACE_CONTROLS, WorkspaceControlView } from './workspace-controls';

interface WorkspaceRuntime {
  TronoDesktop?: object;
  TronoCallNavigation: CallNavigation;
  TronoCallStage: CallStage;
  TronoAuth: { user: { id: string } | null; ready: Promise<unknown> };
  TronoPersonal: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: boolean): void;
  };
  TronoMessenger: { open(id: string): Promise<void>; openFriends(): Promise<void>; close(): void };
  TronoAppLayout: {
    navigate(area: string): Promise<void>;
    apply(layout: string, options: { save: boolean }): void;
  };
  TronoCallControlsLayout: { refresh(): void };
}
const installed = new WeakSet<Window>();
/** Mount controls before ready, then position surfaces after the remaining layout controllers. */
export function initializeCallWorkspace(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as WorkspaceRuntime,
    doc = target.document;
  const navigation = runtime.TronoCallNavigation,
    stage = runtime.TronoCallStage;
  const client = createCallWorkspace({
    events: target,
    read: () => ({
      active: navigation.getSnapshot().hub,
      layout: doc.body.dataset.appLayout === 'discord' ? 'discord' : 'original',
      roomName: stage.getSnapshot().roomName,
      directVisible: doc.getElementById('messengerPanel')?.hidden === false,
      drawerOpen: navigation.getSnapshot().drawerOpen,
      width: target.innerWidth,
    }),
    subscribeSource(listener) {
      const offNavigation = navigation.subscribe(listener),
        offStage = stage.subscribe(listener);
      return () => {
        offNavigation();
        offStage();
      };
    },
    accountId: () => runtime.TronoAuth.user?.id ?? null,
    readHeader: () => runtime.TronoPersonal.get('workspaceHeaderCollapsed', false),
    saveHeader: (collapsed) => runtime.TronoPersonal.set('workspaceHeaderCollapsed', collapsed),
    resize: () => target.dispatchEvent(new Event('resize')),
    authReady: runtime.TronoAuth.ready,
    openDirect: (id) => {
      void (id ? runtime.TronoMessenger.open(id) : runtime.TronoMessenger.openFriends());
    },
    openGames: () => {
      void runtime.TronoAppLayout.navigate('game');
    },
    applyLayout: (layout) => runtime.TronoAppLayout.apply(layout, { save: true }),
  });
  const layout = createWorkspaceLayout({
    document: doc,
    workspace: client,
    desktop: !!runtime.TronoDesktop,
    refreshControls: () => runtime.TronoCallControlsLayout.refresh(),
    closeDirect: () => runtime.TronoMessenger.close(),
  });
  client.start();
  flushSync(() => {
    for (const id of WORKSPACE_CONTROLS) {
      const host = doc.getElementById(
        id === 'areas'
          ? 'workspaceAreaTabs'
          : id === 'title'
            ? 'workspaceTitle'
            : 'workspace-control-' + id,
      );
      if (host) createRoot(host).render(<WorkspaceControlView id={id} client={client} />);
    }
  });
  target.addEventListener('trono:ready', () => layout.start(), { once: true });
}
