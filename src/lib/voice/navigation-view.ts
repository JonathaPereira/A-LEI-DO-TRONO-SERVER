import type { CallNavigation } from './navigation';

interface NavigationViewOptions {
  document: Document;
  window: Pick<Window, 'innerWidth' | 'addEventListener' | 'removeEventListener'>;
  navigation: CallNavigation;
  applyGeometry(): void;
  closeDiagnostics(): boolean;
  closeSettings(): void;
  openMosaic(): void;
}
/** Compatibility for outer surfaces still positioned by legacy layouts. Buttons are React-owned. */
export function createCallNavigationView(options: NavigationViewOptions) {
  const { document: doc, navigation: client, window: viewport } = options;
  const get = (id: string) => doc.getElementById(id);
  const cleanup: (() => void)[] = [];
  let lastHub: boolean | undefined,
    previousWide = viewport.innerWidth > 1000;
  let focusTimer: ReturnType<typeof setTimeout> | undefined,
    started = false,
    disposed = false;
  function clearFocus() {
    clearTimeout(focusTimer);
    focusTimer = undefined;
  }
  function render() {
    clearFocus();
    const s = client.getSnapshot(),
      panel = get('socialPanel');
    doc.body.classList.toggle('chat-only-active', s.hub);
    doc.body.classList.toggle('channel-text-active', s.hub && s.textRoom?.channelType === 'text');
    doc.body.classList.toggle('channel-voice-active', s.hub && s.textRoom?.channelType === 'voice');
    doc.body.classList.toggle('game-communication-open', s.gameCommunicationOpen);
    panel?.classList.toggle('hidden', !s.panelAvailable);
    panel?.classList.toggle('social-hidden', !s.panelOpen);
    panel?.classList.toggle('chat-drawer-open', s.hub && s.drawerOpen);
    const chat = panel?.querySelector<HTMLElement>('.court-chat-section');
    if (chat) {
      chat.hidden = s.hub && !s.drawerOpen;
      chat.setAttribute('aria-hidden', String(chat.hidden));
    }
    if (lastHub !== s.hub) {
      lastHub = s.hub;
      options.applyGeometry();
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Escape belongs to the foreground dialog/popover, not the settings behind it.
    if (doc.querySelector('dialog[open]:not(#desktopSettingsDialog), [popover]:popover-open'))
      return;
    if (options.closeDiagnostics()) return;
    const s = client.getSnapshot();
    if (s.hub && s.drawerOpen) client.toggleTextChat(false);
    else options.closeSettings();
  }
  function resize() {
    const wide = viewport.innerWidth > 1000,
      s = client.getSnapshot();
    if (s.hub && previousWide && !wide && s.textRoom?.channelType !== 'text')
      client.toggleTextChat(false);
    previousWide = wide;
  }
  function bind(id: string, action: () => void) {
    const el = get(id);
    if (!el) return;
    el.addEventListener('click', action);
    cleanup.push(() => el.removeEventListener('click', action));
  }
  return {
    focusComposer() {
      if (disposed) return;
      clearFocus();
      const room = client.getSnapshot().textRoom?.id;
      focusTimer = setTimeout(() => {
        const s = client.getSnapshot();
        if (!disposed && s.hub && s.drawerOpen && s.textRoom?.id === room)
          get('courtChatInput')?.focus();
      }, 80);
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(client.subscribe(render));
      bind('socialModeBtn', () => {
        if (!client.getSnapshot().hub) options.openMosaic();
      });
      doc.addEventListener('keydown', keydown);
      viewport.addEventListener('resize', resize);
      render();
    },
    dispose() {
      disposed = true;
      clearFocus();
      for (const remove of cleanup.splice(0)) remove();
      doc.removeEventListener('keydown', keydown);
      viewport.removeEventListener('resize', resize);
    },
  };
}
