type CallControlWindow = Window & {
  TronoDesktop?: object;
  TronoCallToolbar?: { refresh(): void };
  TronoCallControlsLayout?: { refresh(): void };
};
const installed = new WeakMap<Window, () => void>();

// Owns placement of the existing controls. Media and button actions stay with
// their original controllers; this module never clones nodes or opens devices.
export function initializeCallControlLayout(target: Window) {
  const previous = installed.get(target);
  if (previous) return previous;
  const callControlWindow = target as CallControlWindow,
    document = target.document;
  const observers: MutationObserver[] = [];
  let disposed = false;
  const $ = (id: string) => document.getElementById(id);
  const homes = new Map<HTMLElement, Comment>();
  const controls = [
    'joinVoiceBtn',
    'muteMicBtn',
    'deafenVoiceBtn',
    'cameraBtn',
    'screenShareBtn',
    'voiceSettingsBtn',
    'soundboardToggle',
  ] as const;
  const hostOf = (node: HTMLElement | null) =>
    node?.closest<HTMLElement>('[data-call-control-host]') || node;
  let toolbar: HTMLElement | null = null,
    ready = false;

  function remember(node: HTMLElement | null) {
    node = hostOf(node);
    if (!node || homes.has(node)) return;
    const marker = document.createComment('call-control-home:' + (node.id || 'toolbar'));
    node.before(marker);
    homes.set(node, marker);
  }

  function restore(node: HTMLElement | null) {
    node = hostOf(node);
    if (!node) return;
    const marker = homes.get(node);
    if (marker?.isConnected && marker.nextSibling !== node) marker.after(node);
  }

  function place(
    node: HTMLElement | null,
    host: HTMLElement | null,
    before: Element | null = null,
  ) {
    node = hostOf(node);
    if (!node || !host) return;
    if (node.parentElement !== host || (before && node.nextSibling !== before))
      host.insertBefore(node, before);
  }

  // Soundboard keeps a movable action bridge; the desktop shell owns its React label.
  function decorate(node: HTMLElement | null) {
    if (!node || node.id !== 'soundboardToggle') return;
    if (node.dataset.desktopContent === 'react') return;
    const workspace =
      document.body.classList.contains('chat-only-active') && node.closest('#callWorkspace');
    if (!workspace) node.querySelector('.workspace-control-icon')?.remove();
    else if (!node.querySelector('.workspace-control-icon')) {
      const icon = document.createElement('span');
      icon.className = 'workspace-control-icon';
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10v4m4-7v10m5-15v20m5-15v10m4-7v4"/></svg>';
      node.prepend(icon);
    }
    node.dataset.workspaceLabel = 'Efeitos';
    node.setAttribute('aria-label', 'Efeitos de áudio');
    node.title = 'Efeitos de áudio';
  }

  function refresh() {
    if (!ready) return;
    const desktop = !!callControlWindow.TronoDesktop;
    const community = document.body.classList.contains('chat-only-active');
    const discord = document.body.dataset.appLayout === 'discord';
    const sidebar = community && discord && target.innerWidth >= 1100;
    const workspace = $('callWorkspace');
    if (workspace) workspace.dataset.controls = sidebar ? 'sidebar' : 'dock';

    if (desktop) place(toolbar, $('desktopCallDock'));
    if (!desktop) {
      if (discord) place($('voiceSettingsPanel'), document.body);
      else restore($('voiceSettingsPanel'));
    }

    // Original and narrow windows use the central dock; wide Discord uses its sidebar.
    for (const id of controls) {
      const node = $(id);
      if (community && !sidebar && $('callFocusDock')) {
        place(node, $('callFocusDock'));
        decorate(node);
      } else if (id === 'soundboardToggle' && (desktop || sidebar)) {
        const rail = $(desktop ? 'desktopRail' : 'webLayoutRail');
        place(node, rail, rail?.querySelector('[data-desktop-route="clips"]'));
      } else if (discord && id !== 'soundboardToggle') {
        const host =
          id === 'joinVoiceBtn'
            ? 'layoutConnectionControls'
            : ['cameraBtn', 'screenShareBtn'].includes(id)
              ? 'layoutCallActions'
              : 'layoutUserControls';
        place(node, $(host));
      } else {
        restore(node);
      }
      decorate(node);
    }

    const people = $('communityToggle');
    if (community) place(people, document.querySelector('.chat-only-top-actions'));
    else if (desktop) place(people, $('desktopTopBar'), $('voiceDiagnosticsLauncher'));
    else restore(people);
    callControlWindow.TronoCallToolbar?.refresh();
  }

  // Register before desktop-shell/app-layout so homes always describe the HTML,
  // rather than a temporary location chosen by whichever layout ran first.
  const bind = () => {
    if (disposed || ready) return;
    toolbar = document.querySelector('#socialPanel .call-toolbar');
    for (const id of [...controls, 'communityToggle', 'voiceSettingsPanel']) remember($(id));
    for (const id of controls) {
      const node = $(id);
      if (!node || node.closest('[data-call-control-host]')) continue;
      const observer = new MutationObserver(() => {
        decorate(node);
      });
      observer.observe(node, { childList: true, subtree: true, characterData: true });
      observers.push(observer);
    }
    ready = true;
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-app-layout'],
    });
    observers.push(observer);
    target.addEventListener('trono-call-change', refresh);
    target.addEventListener('resize', refresh);
    refresh();
  };
  const facade = { refresh };
  callControlWindow.TronoCallControlsLayout = facade;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('trono-call-change', refresh);
    target.removeEventListener('resize', refresh);
    target.removeEventListener('pagehide', dispose);
    for (const observer of observers) observer.disconnect();
    observers.length = 0;
    for (const [node, marker] of homes) {
      if (marker.isConnected) marker.after(node);
      marker.remove();
    }
    homes.clear();
    toolbar = null;
    if (callControlWindow.TronoCallControlsLayout === facade)
      delete callControlWindow.TronoCallControlsLayout;
    if (installed.get(target) === dispose) installed.delete(target);
  };
  target.addEventListener('trono:ready', bind, { once: true });
  target.addEventListener('pagehide', dispose, { once: true });
  installed.set(target, dispose);
  return dispose;
}
