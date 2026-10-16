type VoiceControlState = import('../../types/domain').VoiceControlState;
type CallControlWindow = Window & {
  TronoSocial: VoiceControlState;
  TronoDesktop?: object;
  TronoCallControlsLayout?: { refresh(): void };
};
const callControlWindow = window as unknown as CallControlWindow;

// Owns placement of the existing controls. Media and button actions stay with
// their original controllers; this module never clones nodes or opens devices.
callControlWindow.TronoCallControlsLayout = (() => {
  const $ = (id: string) => document.getElementById(id);
  const homes = new Map<HTMLElement, Comment>();
  const controls: Record<string, { label?: string; icon: string }> = {
    muteMicBtn: {
      label: 'Microfone',
      icon: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    },
    deafenVoiceBtn: {
      label: 'Áudio',
      icon: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zM17 13h4v8h-4z"/>',
    },
    cameraBtn: {
      label: 'Câmera',
      icon: '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',
    },
    screenShareBtn: {
      label: 'Tela',
      icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 22h8m-4-5v5m-3-12 3-3 3 3m-3-3v7"/>',
    },
    soundboardToggle: {
      label: 'Efeitos',
      icon: '<path d="M3 10v4m4-7v10m5-15v20m5-15v10m4-7v4"/>',
    },
    voiceSettingsBtn: {
      label: 'Ajustes',
      icon: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    },
    joinVoiceBtn: { icon: '<path d="M3 12c5-5 13-5 18 0l-1 5-4-1v-4M3 12l1 5 4-1v-4"/>' },
  };
  let toolbar: HTMLElement | null = null,
    ready = false;

  function remember(node: HTMLElement | null) {
    if (!node || homes.has(node)) return;
    const marker = document.createComment('call-control-home:' + (node.id || 'toolbar'));
    node.before(marker);
    homes.set(node, marker);
  }

  function restore(node: HTMLElement | null) {
    if (!node) return;
    const marker = homes.get(node);
    if (marker?.isConnected && marker.nextSibling !== node) marker.after(node);
  }

  function place(
    node: HTMLElement | null,
    host: HTMLElement | null,
    before: Element | null = null,
  ) {
    if (!node || !host) return;
    if (node.parentElement !== host || (before && node.nextSibling !== before))
      host.insertBefore(node, before);
  }

  function label(node: HTMLElement | null) {
    if (!node) return;
    const text =
      node.id === 'soundboardToggle'
        ? 'Efeitos de áudio'
        : node.lastElementChild?.textContent || '';
    node.setAttribute('aria-label', text);
    node.title = text;
  }

  function decorate(node: HTMLElement | null, definition: { label?: string; icon: string }) {
    if (!node) return;
    const workspace =
      document.body.classList.contains('chat-only-active') && node.closest('#callWorkspace');
    if (!workspace) node.querySelector('.workspace-control-icon')?.remove();
    else if (!node.querySelector('.workspace-control-icon')) {
      const icon = document.createElement('span');
      icon.className = 'workspace-control-icon';
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        definition.icon +
        '</svg>';
      node.prepend(icon);
    }
    const active =
      node.id === 'joinVoiceBtn'
        ? callControlWindow.TronoSocial.voiceJoined
        : node.id === 'cameraBtn'
          ? callControlWindow.TronoSocial.cameraOn
          : node.id === 'screenShareBtn'
            ? callControlWindow.TronoSocial.screenSharing
            : null;
    if (active !== null) node.dataset.callAction = active ? 'stop' : 'start';
    node.dataset.workspaceLabel =
      node.id === 'joinVoiceBtn'
        ? active
          ? 'Sair'
          : 'Conectar'
        : node.id === 'cameraBtn'
          ? active
            ? 'Desligar'
            : 'Câmera'
          : node.id === 'screenShareBtn'
            ? active
              ? 'Parar tela'
              : 'Tela'
            : definition.label || '';
  }

  function refresh() {
    if (!ready) return;
    const desktop = !!callControlWindow.TronoDesktop;
    const community = document.body.classList.contains('chat-only-active');
    const discord = document.body.dataset.appLayout === 'discord';
    const sidebar = community && discord && innerWidth >= 1100;
    const workspace = $('callWorkspace');
    if (workspace) workspace.dataset.controls = sidebar ? 'sidebar' : 'dock';

    if (desktop) place(toolbar, $('desktopCallDock'));
    if (!desktop) {
      if (discord) place($('voiceSettingsPanel'), document.body);
      else restore($('voiceSettingsPanel'));
    }

    // Original and narrow windows use the central dock; wide Discord uses its sidebar.
    for (const [id, definition] of Object.entries(controls)) {
      const node = $(id);
      if (community && !sidebar && $('callFocusDock')) {
        place(node, $('callFocusDock'));
        decorate(node, definition);
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
      decorate(node, definition);
      label(node);
    }

    const people = $('communityToggle');
    if (community) place(people, document.querySelector('.chat-only-top-actions'));
    else if (desktop) place(people, $('desktopTopBar'), $('telemetryOpenBtn'));
    else restore(people);
  }

  // Register before desktop-shell/app-layout so homes always describe the HTML,
  // rather than a temporary location chosen by whichever layout ran first.
  window.addEventListener('trono:ready', () => {
    toolbar = document.querySelector('#socialPanel .call-toolbar');
    for (const id of [...Object.keys(controls), 'communityToggle', 'voiceSettingsPanel'])
      remember($(id));
    for (const id of Object.keys(controls)) {
      const node = $(id);
      if (!node) continue;
      new MutationObserver(() => {
        decorate(node, controls[id]);
        label(node);
      }).observe(node, { childList: true, subtree: true, characterData: true });
    }
    ready = true;
    new MutationObserver(refresh).observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-app-layout'],
    });
    window.addEventListener('trono-call-change', refresh);
    window.addEventListener('resize', refresh);
    refresh();
  });

  return { refresh };
})();
