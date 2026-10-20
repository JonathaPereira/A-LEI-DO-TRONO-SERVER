import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  createCommunityNavigation,
  type CommunityNavigation,
} from '../../lib/navigation/community-navigation';
import { primaryScreens, type Portal } from '../../lib/navigation/portal';
import type { NetworkClient } from '../../lib/socket/client';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { VoiceRuntime } from '../../lib/voice/runtime';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneNavigation } from '../../lib/games/throne-navigation';
import { CommunityNavigationContents } from './community-navigation';
interface Runtime extends Window {
  TronoNetwork: NetworkClient;
  TronoChannels: ChannelsController;
  TronoCallNavigation: CallNavigation;
  TronoSocial: VoiceRuntime;
  TronoAuth: { user: { id: string } | null; ready: Promise<unknown>; open(mode: 'login'): void };
  TronoPortal: Portal;
  TronoAudio: { ensureAudio(): Promise<unknown> };
  TronoThroneLobby: ThroneLobby;
  TronoThroneBoard: ThroneNavigation;
  TronoCommunityAdmin?: { refresh(): Promise<unknown> };
  TronoMessenger: { joinChannel(id: string, options: { showText: boolean }): Promise<unknown> };
  TronoStorage?: Storage;
  TronoDesktop?: object;
  TronoCommunityNavigation?: CommunityNavigation;
  TronoChatHub?: {
    enter: CommunityNavigation['enter'];
    leave: CommunityNavigation['leave'];
    switchChannel: CommunityNavigation['switchChannel'];
    openChannelText(id: string): void;
    readonly channels: ReturnType<ChannelsController['getSnapshot']>['channels'];
  };
}
const installed = new WeakMap<Window, () => void>();
export function initializeCommunityNavigation(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const storage = runtime.TronoStorage ?? target.localStorage;
  const get = (id: string) => doc.getElementById(id)!;
  const input = (id: string) => doc.getElementById(id) as HTMLInputElement | null;
  let disposed = false;
  const controller = createCommunityNavigation({
    network: runtime.TronoNetwork,
    channels: runtime.TronoChannels,
    navigation: runtime.TronoCallNavigation,
    voice: runtime.TronoSocial,
    storage,
    session: target.sessionStorage,
    desktop: !!runtime.TronoDesktop,
    accountId: () => runtime.TronoAuth.user?.id ?? null,
    screen: () =>
      primaryScreens.find((id) => {
        const node = get(id);
        return node && !node.classList.contains('hidden');
      }) ?? null,
    name: () => input('portalIdentity')?.value || input('playerIdentity')?.value || '',
    openLogin: () => runtime.TronoAuth.open('login'),
    validateIdentity: () => runtime.TronoPortal.validateIdentity(),
    refreshPermissions: () => runtime.TronoCommunityAdmin?.refresh() ?? Promise.resolve(),
    ensureAudio: () => runtime.TronoAudio.ensureAudio(),
    showCommunity: () => {
      runtime.TronoPortal.showOnly('chatOnlyScreen');
      doc.body.classList.add('chat-only-active');
    },
    showPortal: () => runtime.TronoPortal.showPortal(),
    focusIdentity: () => input('portalIdentity')?.focus(),
    clearLobby: () => {
      runtime.TronoThroneLobby.clear();
      runtime.TronoThroneBoard.clearLobbyMode();
    },
    subscribeSource(fn) {
      const observer = new MutationObserver(fn);
      for (const id of primaryScreens)
        if (get(id)) observer.observe(get(id), { attributes: true, attributeFilter: ['class'] });
      const release = runtime.TronoCallNavigation.subscribe(fn);
      target.addEventListener('trono-auth-change', fn);
      return () => {
        observer.disconnect();
        release();
        target.removeEventListener('trono-auth-change', fn);
      };
    },
    schedule(fn, ms) {
      const timer = target.setTimeout(fn, ms);
      return () => target.clearTimeout(timer);
    },
    notify: (message, ms) => runtime.TronoThroneBoard.notify(message, ms),
    warn: (error) => console.warn('[CommunityNavigation]', error),
  });
  runtime.TronoCommunityNavigation = controller;
  const facade = {
    enter: controller.enter,
    leave: controller.leave,
    switchChannel: controller.switchChannel,
    openChannelText(id: string) {
      void runtime.TronoMessenger.joinChannel(id, { showText: true }).catch((error) =>
        runtime.TronoThroneBoard.notify(
          error instanceof Error ? error.message : 'Não foi possível abrir as mensagens.',
          2200,
        ),
      );
    },
    get channels() {
      return runtime.TronoChannels.getSnapshot().channels;
    },
  };
  runtime.TronoChatHub = facade;
  const host = doc.createElement('div');
  host.id = 'communityNavigationHost';
  host.style.display = 'contents';
  doc.body.append(host);
  const root = createRoot(host);
  const hosts = {
    status: get('chatOnlyStatus'),
    count: get('chatOnlyCount'),
    room: get('chatOnlyRoomName'),
    title: get('communityChatTitle'),
    enter: get('communityEnterHost'),
    back: get('communityBackHost'),
  };
  flushSync(() =>
    root.render(<CommunityNavigationContents controller={controller} hosts={hosts} />),
  );
  const sync = () =>
    get('channelFilesBtn').classList.toggle('hidden', !controller.getSnapshot().filesAvailable);
  const release = controller.subscribe(sync);
  sync();
  controller.start();
  const ready = async () => {
    await runtime.TronoAuth.ready;
    if (disposed) return;
    await controller.restore();
    if (disposed) return;
    try {
      const saved = storage.getItem('tronoPlayerName');
      if (saved !== null && input('playerIdentity')) input('playerIdentity')!.value = saved;
    } catch {
      /* Optional persistence. */
    }
    const online = await runtime.TronoNetwork.connect();
    if (!disposed && online) runtime.TronoNetwork.requestRooms();
  };
  const onReady = () => {
    void ready().catch((error) => console.warn('[CommunityNavigation]', error));
  };
  target.addEventListener('trono:ready', onReady, { once: true });
  const dispose = () => {
    disposed = true;
    target.removeEventListener('trono:ready', onReady);
    release();
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    if (runtime.TronoChatHub === facade) delete runtime.TronoChatHub;
    if (runtime.TronoCommunityNavigation === controller) delete runtime.TronoCommunityNavigation;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
