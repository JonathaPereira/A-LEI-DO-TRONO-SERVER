import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { createDesktopShell } from '../../lib/desktop/shell';
import { createDesktopEffectsLayout } from '../../lib/desktop/effects-layout';
import type { CallToolbar } from '../../lib/voice/toolbar';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { NetworkClient } from '../../lib/socket/client';
import {
  DesktopCallInfo,
  DesktopEffectsLabel,
  DesktopRail,
  DesktopSidebarShade,
  DesktopTopbar,
} from './shell-controls';
import { initializeDesktopUpdates } from './update-runtime';

interface DesktopRuntime {
  TronoDesktop?: {
    getWindowState(): Promise<unknown>;
    onWindowState(listener: (state: unknown) => void): (() => void) | void;
    toggleFullscreen(): Promise<unknown>;
  };
  TronoDesktopShell?: { navigate(route: unknown): Promise<unknown> };
  TronoAuth: { user: object | null; guest: object | null };
  TronoCallToolbar: CallToolbar;
  TronoCallNavigation: CallNavigation;
  TronoNetwork: NetworkClient;
  TronoSocial: {
    readonly voiceJoined: boolean;
    setChatHubMode(active: boolean): void;
    showForRoom(show: boolean): void;
  };
  TronoChatHub: { readonly channels: readonly { id: string }[] };
  TronoPortal: {
    showOnly(id: string): void;
    openGame(requireIdentity: boolean): unknown;
    openVoice(): Promise<unknown>;
  };
  TronoGames: { openLibrary(): unknown };
  TronoDesktopSettings: { open(section?: 'account'): void };
  TronoCallControlsLayout: { refresh(): void };
}
const screens = [
  'portalScreen',
  'setupScreen',
  'roomScreen',
  'chatOnlyScreen',
  'gameScreen',
  'gamesScreen',
  'azulScreen',
  'rogueliteScreen',
  'splendorScreen',
  'loveLetterScreen',
] as const;
const installed = new WeakMap<Window, () => void>();

/** Mount the desktop shell before settings/app-layout capture its stable containers. */
export function initializeDesktopShell(target: Window) {
  if (installed.has(target)) return installed.get(target)!;
  const runtime = target as unknown as DesktopRuntime,
    native = runtime.TronoDesktop;
  if (!native) return () => {};
  const doc = target.document,
    roots: Root[] = [],
    owned: HTMLElement[] = [],
    cleanup: (() => void)[] = [];
  const homes = new Map<HTMLElement, Comment>();
  let disposed = false;
  let restoreEffects: (() => void) | undefined;
  const get = (id: string) => doc.getElementById(id);
  const client = createDesktopShell({
    events: target,
    native,
    read: () => ({
      visibleScreen:
        screens.find((id) => {
          const node = get(id);
          return node && !node.classList.contains('hidden');
        }) ?? null,
      gameRoom: runtime.TronoNetwork.gameRoom,
      currentRoom: runtime.TronoNetwork.currentRoom,
      independentGameVoice: runtime.TronoNetwork.independentGameVoice,
      hasIdentity: !!(runtime.TronoAuth.user || runtime.TronoAuth.guest),
      joined: runtime.TronoSocial.voiceJoined,
      status: runtime.TronoCallToolbar.getSnapshot().status.text,
    }),
    subscribeSource(listener) {
      const off = [
        runtime.TronoNetwork.subscribe(listener),
        runtime.TronoCallToolbar.subscribe(listener),
        runtime.TronoCallNavigation.subscribe(listener),
      ];
      const observer = new MutationObserver(listener);
      for (const id of screens) {
        const node = get(id);
        if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
      }
      return () => {
        observer.disconnect();
        for (const remove of off) remove();
      };
    },
    hasChannel: (id) => runtime.TronoChatHub.channels.some((channel) => channel.id === id),
    showScreen: (id) => runtime.TronoPortal.showOnly(id),
    showCommunity() {
      runtime.TronoSocial.setChatHubMode(true);
      runtime.TronoSocial.showForRoom(true);
    },
    openLibrary: () => runtime.TronoGames.openLibrary(),
    openGame: (requireIdentity) => runtime.TronoPortal.openGame(requireIdentity),
    openVoice: () => runtime.TronoPortal.openVoice(),
    requestRooms: () => runtime.TronoNetwork.requestRooms(),
    openSettings: (section) => runtime.TronoDesktopSettings.open(section),
    confirmLeave: () =>
      target.confirm(
        'O servidor precisa ser atualizado para manter jogo e voz juntos. Sair da mesa?',
      ),
  });
  const facade = { navigate: client.navigate };
  runtime.TronoDesktopShell = facade;
  function borrow(node: HTMLElement | null, host: HTMLElement) {
    if (!node) return;
    if (!homes.has(node)) {
      const marker = doc.createComment('desktop-shell:' + node.id);
      node.before(marker);
      homes.set(node, marker);
    }
    host.append(node);
  }
  function surface(tag: string, id: string, label?: string) {
    const node = doc.createElement(tag);
    node.id = id;
    if (label) node.setAttribute('aria-label', label);
    doc.body.append(node);
    owned.push(node);
    return node;
  }
  function mount(host: HTMLElement, content: ReactNode) {
    const root = createRoot(host);
    roots.push(root);
    root.render(content);
  }
  function syncContainers() {
    const state = client.getSnapshot();
    doc.body.classList.toggle('desktop-channels-open', state.channelsOpen);
    if (doc.body.dataset.desktopView !== state.view) doc.body.dataset.desktopView = state.view;
  }
  function closeChannelsOnClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('[data-chat-channel]'))
      client.closeChannels();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') client.closeChannels();
  }
  function portalClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>(
      '#openVoicePortalBtn,#voicePortalCard,#openGamePortalBtn,#gamePortalCard,#backFromChatOnlyBtn,#portalBrandBtn,.portal-nav-btn,[data-open-clips]',
    );
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const view = button.matches('[data-open-clips]')
      ? 'clips'
      : button.matches('#openVoicePortalBtn,#voicePortalCard') ||
          button.dataset.portalTarget === 'voice'
        ? 'community'
        : button.matches('#openGamePortalBtn,#gamePortalCard') ||
            button.dataset.portalTarget === 'game'
          ? 'game'
          : 'home';
    void client.navigate(view);
  }
  function bind() {
    if (disposed) return;
    doc.body.classList.add('desktop-app');
    const rail = surface('nav', 'desktopRail', 'Áreas do aplicativo'),
      topbar = surface('header', 'desktopTopBar', 'Ferramentas da comunidade'),
      dock = surface('footer', 'desktopCallDock', 'Controles da chamada'),
      shade = surface('span', 'desktopSidebarShadeHost');
    shade.style.display = 'contents';
    const effects = get('soundboardToggle');
    if (effects) {
      const previous = { classes: effects.className, content: [...effects.childNodes] };
      effects.dataset.desktopContent = 'react';
      effects.dataset.workspaceLabel = 'Efeitos';
      effects.classList.remove('soundboard-toggle');
      effects.classList.add('desktop-effects-button');
      effects.setAttribute('aria-label', 'Efeitos de áudio');
      effects.title = 'Efeitos de áudio';
      restoreEffects = () => {
        delete effects.dataset.desktopContent;
        effects.className = previous.classes;
        effects.replaceChildren(...previous.content);
      };
    }
    flushSync(() => {
      mount(rail, <DesktopRail client={client} />);
      mount(topbar, <DesktopTopbar client={client} />);
      mount(dock, <DesktopCallInfo client={client} />);
      mount(shade, <DesktopSidebarShade client={client} />);
      if (effects) mount(effects, <DesktopEffectsLabel />);
    });
    // These hosts remain direct children: the shared placer inserts People before diagnostics.
    borrow(get('voiceDiagnosticsLauncher'), topbar);
    borrow(get('telemetryPanel'), doc.body);
    const people = get('communityToggle');
    if (people) {
      people.title = 'Ver pessoas online ou minimizar a lista';
      people.setAttribute('aria-controls', 'communityPanel');
    }
    const clips = get('clipsDialog'),
      clipControl = doc.querySelector<HTMLElement>('.call-control-clips');
    if (clips) clips.hidden = true;
    if (clipControl) clipControl.hidden = true;
    cleanup.push(
      initializeDesktopUpdates(target),
      createDesktopEffectsLayout(target),
      client.subscribe(syncContainers),
    );
    doc.addEventListener('click', portalClick, true);
    doc.addEventListener('click', closeChannelsOnClick);
    doc.addEventListener('keydown', keydown);
    client.start();
    syncContainers();
    runtime.TronoCallControlsLayout.refresh();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    doc.removeEventListener('click', portalClick, true);
    doc.removeEventListener('click', closeChannelsOnClick);
    doc.removeEventListener('keydown', keydown);
    client.dispose();
    for (const remove of cleanup.reverse()) remove();
    // The toolbar and People belong to other roots and must outlive this shell.
    for (const host of owned)
      for (const node of [...host.children])
        if (node.matches('.call-toolbar,#communityToggle,#soundboardToggle')) doc.body.append(node);
    for (const [node, marker] of homes) {
      if (marker.isConnected) marker.after(node);
      marker.remove();
    }
    const updateHost = get('desktopUpdateCheckHost'),
      rail = owned.find((host) => host.id === 'desktopRail');
    if (updateHost && rail) rail.append(updateHost);
    flushSync(() => {
      for (const root of roots) root.unmount();
    });
    restoreEffects?.();
    for (const host of owned) host.remove();
    doc.body.classList.remove('desktop-app', 'desktop-channels-open');
    delete doc.body.dataset.desktopView;
    if (runtime.TronoDesktopShell === facade) delete runtime.TronoDesktopShell;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
