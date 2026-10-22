import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { createAppLayout, type AppLayout, type AppRoute } from '../../lib/navigation/app-layout';
import type { AvatarAppearance } from '../../types/domain';
import type { NetworkClient } from '../../lib/socket/client';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { CallToolbar } from '../../lib/voice/toolbar';
import type { CallStage } from '../../lib/voice/stage';
import { AppLayoutPanel, AppLayoutPicker, AppLayoutRail } from './app-layout-controls';

interface AppLayoutRuntime {
  TronoDesktop?: object;
  TronoDesktopShell?: { navigate(route: AppRoute): Promise<unknown> };
  TronoDesktopSettings?: { open(section: 'account'): void };
  TronoAppLayout?: AppLayout;
  TronoAuth: {
    user: ({ nickname?: string } & AvatarAppearance) | null;
    guest: { nickname: string } | null;
    ready: Promise<unknown>;
  };
  TronoPersonal: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: string): void;
  };
  TronoNetwork: NetworkClient;
  TronoCallNavigation: CallNavigation;
  TronoCallToolbar: CallToolbar;
  TronoCallStage: CallStage;
  TronoCallControlsLayout: { refresh(): void };
  TronoSocial: {
    readonly voiceJoined: boolean;
    readonly voiceJoining: boolean;
    readonly deafened: boolean;
    getLocalAudioTrack(): MediaStreamTrack | null;
    setChatHubMode(active: boolean): void;
    showForRoom(show: boolean): void;
  };
  TronoChatHub: {
    readonly channels: readonly { id: string }[];
    switchChannel(id: string): Promise<unknown>;
  };
  TronoPortal: {
    showOnly(id: string): void;
    openGame(requireIdentity: boolean): unknown;
    openVoice(): Promise<unknown>;
  };
  TronoGames: { openLibrary(): unknown };
  TronoProfile: { open(): unknown };
}
const screens = [
  'portalScreen',
  'setupScreen',
  'roomScreen',
  'gameScreen',
  'chatOnlyScreen',
  'gamesScreen',
  'azulScreen',
  'nexusScreen',
  'rogueliteScreen',
  'splendorScreen',
  'ticketToRideScreen',
  'loveLetterScreen',
] as const;
const gameScreens = ['setupScreen', 'roomScreen', 'gameScreen'] as const;
const installed = new WeakMap<Window, () => void>();

/** Install the facade during script loading; mount before later ready listeners position its slots. */
export function initializeAppLayout(target: Window) {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as unknown as AppLayoutRuntime,
    doc = target.document,
    roots: Root[] = [],
    ownedHosts: HTMLElement[] = [];
  let disposed = false;
  const visible = (id: string) => {
    const node = doc.getElementById(id);
    return !!node && !node.classList.contains('hidden');
  };
  const client = createAppLayout({
    read: () => {
      const membership = runtime.TronoNetwork.getSnapshot(),
        call = runtime.TronoSocial;
      return {
        user: runtime.TronoAuth.user,
        guestNickname: runtime.TronoAuth.guest?.nickname ?? null,
        connected: membership.connected,
        currentRoom: membership.currentRoom,
        gameRoom: membership.gameRoom,
        callGeneration: runtime.TronoCallStage.getSnapshot().generation,
        joined: call.voiceJoined,
        joining: call.voiceJoining,
        deafened: call.deafened,
        microphoneEnabled: !!call.getLocalAudioTrack()?.enabled,
        voiceRoom: runtime.TronoCallNavigation.getSnapshot().voiceRoom,
        voiceStatus: runtime.TronoCallToolbar.getSnapshot().status,
        communityVisible: doc.body.classList.contains('chat-only-active'),
        homeVisible: visible('portalScreen'),
        visibleGame: gameScreens.find(visible) ?? null,
      };
    },
    readPreference: () => runtime.TronoPersonal.get('appLayout', 'original'),
    authReady: runtime.TronoAuth.ready,
    events: target,
    subscribeSource(listener) {
      const off = [
        runtime.TronoNetwork.subscribe(listener),
        runtime.TronoCallNavigation.subscribe(listener),
        runtime.TronoCallToolbar.subscribe(listener),
      ];
      // Screen visibility still belongs to the game/portal controllers.
      const observer = new MutationObserver(listener);
      observer.observe(doc.body, {
        attributes: true,
        attributeFilter: ['class', 'data-desktop-view'],
      });
      for (const id of screens) {
        const node = doc.getElementById(id);
        if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
      }
      return () => {
        observer.disconnect();
        for (const release of off) release();
      };
    },
    writeLayout(layout, save) {
      doc.body.dataset.appLayout = layout;
      runtime.TronoCallControlsLayout.refresh();
      if (save) runtime.TronoPersonal.set('appLayout', layout);
    },
    layoutChanged(layout) {
      target.dispatchEvent(new CustomEvent('trono-layout-change', { detail: { layout } }));
      target.dispatchEvent(new Event('resize'));
    },
    desktopNavigate: () =>
      runtime.TronoDesktopShell ? (route) => runtime.TronoDesktopShell!.navigate(route) : undefined,
    showScreen: (id) => runtime.TronoPortal.showOnly(id),
    openLibrary: () => runtime.TronoGames.openLibrary(),
    openGame: (requireIdentity) => runtime.TronoPortal.openGame(requireIdentity),
    requestRooms: () => runtime.TronoNetwork.requestRooms(),
    hasChannel: (id) => runtime.TronoChatHub.channels.some((channel) => channel.id === id),
    showCommunity() {
      runtime.TronoSocial.setChatHubMode(true);
      runtime.TronoSocial.showForRoom(true);
    },
    openVoice: () => runtime.TronoPortal.openVoice(),
    switchChannel: (id) => runtime.TronoChatHub.switchChannel(id),
    openProfile: () =>
      runtime.TronoDesktopSettings
        ? runtime.TronoDesktopSettings.open('account')
        : runtime.TronoProfile.open(),
  });
  runtime.TronoAppLayout = client;
  function syncContainers() {
    const state = client.getSnapshot();
    doc.body.dataset.layoutView = state.area;
    const panel = doc.getElementById('layoutVoicePanel');
    if (panel) panel.dataset.state = state.connectionState;
  }
  const offProjection = client.subscribe(syncContainers);
  const home = () => {
    void client.navigate('home');
  };
  function bind() {
    if (disposed) return;
    const panel = doc.createElement('section');
    panel.id = 'layoutVoicePanel';
    panel.setAttribute('aria-label', 'Sua chamada e seu perfil');
    doc.body.append(panel);
    ownedHosts.push(panel);
    flushSync(() => {
      const panelRoot = createRoot(panel);
      roots.push(panelRoot);
      panelRoot.render(<AppLayoutPanel client={client} />);
      if (!runtime.TronoDesktop) {
        const rail = doc.createElement('nav');
        rail.id = 'webLayoutRail';
        rail.setAttribute('aria-label', 'Áreas M&N');
        doc.body.append(rail);
        ownedHosts.push(rail);
        const railRoot = createRoot(rail);
        roots.push(railRoot);
        railRoot.render(<AppLayoutRail client={client} />);
      }
      const picker = doc.getElementById('appLayoutPickerHost');
      if (picker) {
        const pickerRoot = createRoot(picker);
        roots.push(pickerRoot);
        pickerRoot.render(<AppLayoutPicker client={client} />);
      }
    });
    doc.getElementById('channelHomeBtn')?.addEventListener('click', home);
    client.start();
    syncContainers();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    doc.getElementById('channelHomeBtn')?.removeEventListener('click', home);
    offProjection();
    client.dispose();
    // Borrowed control hosts must survive unmounting this shell.
    for (const id of ['layoutConnectionControls', 'layoutUserControls', 'layoutCallActions']) {
      const host = doc.getElementById(id);
      if (host) while (host.firstChild) doc.body.append(host.firstChild);
    }
    const rail = ownedHosts.find((host) => host.id === 'webLayoutRail');
    if (rail) {
      for (const node of [...rail.children])
        if (!node.hasAttribute('data-layout-route')) doc.body.append(node);
    }
    flushSync(() => {
      for (const root of roots) root.unmount();
    });
    for (const host of ownedHosts) host.remove();
    if (runtime.TronoAppLayout === client) delete runtime.TronoAppLayout;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
