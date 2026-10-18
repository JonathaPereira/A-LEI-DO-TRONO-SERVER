import type { CallWorkspace } from './workspace';

interface WorkspaceLayoutOptions {
  document: Document;
  workspace: CallWorkspace;
  desktop: boolean;
  refreshControls(): void;
  closeDirect(): void;
}
/** Moves borrowed surfaces as complete nodes; never clones players or edits React children. */
export function createWorkspaceLayout(options: WorkspaceLayoutOptions) {
  const { document: doc, workspace } = options;
  const get = (id: string) => doc.getElementById(id);
  const homes = new Map<HTMLElement, Comment>();
  let mounted = false,
    arranging = false,
    disposed = false,
    started = false;
  let unsubscribe: (() => void) | undefined, observer: MutationObserver | undefined;
  function move(id: string, host: HTMLElement | null) {
    const node = get(id);
    if (!node || !host) return;
    if (!homes.has(node)) {
      const marker = doc.createComment('workspace:' + id);
      node.before(marker);
      homes.set(node, marker);
    }
    if (node.parentElement !== host) host.append(node);
  }
  function restore() {
    for (const [node, marker] of homes) if (marker.isConnected) marker.after(node);
  }
  function arrange() {
    if (arranging || disposed) return;
    arranging = true;
    try {
      const state = workspace.getSnapshot(),
        shell = get('callWorkspace'),
        header = get('workspaceHeader');
      if (!shell || !header) return;
      shell.classList.toggle('workspace-header-collapsed', state.headerCollapsed);
      shell.classList.toggle('workspace-sidebar-open', state.sidebarOpen);
      header.inert = state.headerCollapsed;
      if (state.active) {
        mounted = true;
        move('socialPanel', get('callWorkspaceMain'));
        move('messengerPanel', get('socialPanel'));
        move('layoutVoicePanel', get('callWorkspaceSidebar'));
        move('communityPanel', shell);
        move(options.desktop ? 'desktopRail' : 'webLayoutRail', shell);
        shell.dataset.messages = state.directVisible
          ? 'direct'
          : state.drawerOpen
            ? 'channel'
            : 'none';
      } else if (mounted) {
        mounted = false;
        restore();
      }
      const tabs = get('workspaceAreaTabs'),
        anchor =
          state.layout === 'discord'
            ? doc.querySelector('.mn-channel-sidebar .mn-sidebar-heading')
            : header.querySelector('.chat-app-brand');
      if (tabs && anchor && tabs.previousElementSibling !== anchor) anchor.after(tabs);
      const compact = mounted && state.layout === 'discord' && state.width < 760;
      get('desktopUpdateCheckHost')?.classList.toggle('workspace-update-compact', compact);
      if (mounted) move('desktopUpdateCheckHost', compact ? shell : get('desktopRail'));
      options.refreshControls();
    } finally {
      arranging = false;
    }
  }
  function click(event: MouseEvent) {
    if (!(event.target instanceof Element) || !event.target.closest('[data-chat-channel]')) return;
    workspace.closeSidebar();
    options.closeDirect();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') workspace.closeSidebar();
  }
  return {
    start() {
      if (started || disposed) return;
      started = true;
      const tools = get('workspaceToolsActions');
      for (const id of ['communityManageBtn', 'creatorAccountsBtn', 'backFromChatOnlyBtn']) {
        const node = get(id);
        if (node && tools) tools.append(node);
      }
      // Messenger still owns its panel visibility. Observe only that boundary.
      const direct = get('messengerPanel');
      if (direct) {
        observer = new MutationObserver(workspace.refresh);
        observer.observe(direct, { attributes: true, attributeFilter: ['hidden', 'class'] });
      }
      doc.addEventListener('click', click);
      doc.addEventListener('keydown', keydown);
      doc.body.dataset.callWorkspace = 'true';
      unsubscribe = workspace.subscribe(arrange);
      workspace.refresh();
      arrange();
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      observer?.disconnect();
      doc.removeEventListener('click', click);
      doc.removeEventListener('keydown', keydown);
      restore();
      for (const marker of homes.values()) marker.remove();
      homes.clear();
      delete doc.body.dataset.callWorkspace;
    },
  };
}
