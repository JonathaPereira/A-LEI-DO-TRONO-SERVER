import type { FilesClient } from '../../lib/files/client';
import type { NetworkClient } from '../../lib/socket/client';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { CommunityController } from '../../lib/community/controller';
import type { NotificationsController } from '../../lib/notifications/controller';
import { createSocialClient } from '../../lib/messenger/client';
import { createMessenger } from '../../lib/messenger/controller';
import { directPeople } from '../../lib/messenger/selectors';

interface MessengerRuntime extends Window {
  TronoAuth: {
    readonly user: { id: string; nickname: string } | null;
    open(mode: 'login'): void;
    getAccessToken(): Promise<string | null>;
  };
  TronoFiles: FilesClient;
  TronoNetwork: NetworkClient;
  TronoChannels: ChannelsController;
  TronoCommunity: CommunityController;
  TronoNotifications: NotificationsController;
  TronoSocial: { toggleTelemetry(open: boolean): void; toggleTextChat(open: boolean): void };
  TronoChatHub: {
    enter(options: { channelId: string }): Promise<unknown>;
    switchChannel(id: string): Promise<unknown>;
  };
  TronoPortal: { showOnly(id: string): void };
  TronoCallNavigation?: { showChat(): void };
  TronoMessenger?: {
    open: ReturnType<typeof createMessenger>['open'];
    openFriends: ReturnType<typeof createMessenger>['openFriends'];
    close: () => void;
    joinChannel: (id: string, options?: { showText?: boolean }) => Promise<void>;
  };
  TronoDirectMessages?: ReturnType<typeof createMessenger>;
}
const installed = new WeakMap<Window, () => void>();
export function initializeMessenger(target: Window): () => void {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as MessengerRuntime,
    doc = target.document;
  const client = createSocialClient({
    identity: runtime.TronoFiles,
    backendHttp: runtime.TronoNetwork.BACKEND_HTTP,
    getAccessToken: () => runtime.TronoAuth.getAccessToken(),
    fetch: (input, options) => target.fetch(input, options),
  });
  const controller = createMessenger({
    client,
    files: runtime.TronoFiles,
    network: runtime.TronoNetwork,
    community: runtime.TronoCommunity,
    channels: runtime.TronoChannels,
    notifications: runtime.TronoNotifications,
    foreground: () => doc.hasFocus() && doc.visibilityState === 'visible',
    openLogin: () => runtime.TronoAuth.open('login'),
    beforeOpen() {
      runtime.TronoCallNavigation?.showChat();
      runtime.TronoPortal.showOnly('chatOnlyScreen');
      runtime.TronoSocial.toggleTelemetry(false);
      if (doc.body.classList.contains('chat-only-active'))
        runtime.TronoSocial.toggleTextChat(false);
    },
    warn: (error) => console.warn('[Messenger]', error),
  });
  runtime.TronoDirectMessages = controller;
  let navigation = 0,
    canceled = false,
    frame = 0,
    bound = false;
  const pendingNavigation = new Set<() => void>();
  async function joinChannel(id: string, { showText = false }: { showText?: boolean } = {}) {
    const channel = runtime.TronoChannels.get(id),
      scope = runtime.TronoFiles.getSnapshot().epoch,
      operation = ++navigation;
    for (const remove of pendingNavigation) remove();
    pendingNavigation.clear();
    if (!channel) {
      controller.report('Esse canal não está disponível.');
      return;
    }
    const current = () =>
      !canceled && operation === navigation && runtime.TronoFiles.getSnapshot().epoch === scope;
    const community = doc.body.classList.contains('chat-only-active');
    if (
      !community &&
      !runtime.TronoNetwork.independentGameVoice &&
      runtime.TronoNetwork.primaryRoom?.startsWith('sala-') &&
      !target.confirm('Entrar neste canal sairá da sala do jogo. Continuar?')
    )
      return;
    if (showText) {
      let remove: () => void = () => {},
        timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer);
        remove();
        pendingNavigation.delete(cleanup);
      };
      const show = () => {
        cleanup();
        frame = target.requestAnimationFrame(() => {
          if (current()) runtime.TronoSocial.toggleTextChat(true);
        });
      };
      remove = runtime.TronoNetwork.onMessage((event) => {
        const room = event.room as { id?: string } | undefined;
        if (
          current() &&
          ['joined-room', 'joined-text-channel'].includes(event.type) &&
          room?.id === id
        )
          show();
      });
      timer = setTimeout(cleanup, 18000);
      pendingNavigation.add(cleanup);
      if (runtime.TronoNetwork.currentRoom === id) show();
    }
    try {
      if (community) {
        if (showText && channel.type !== 'voice')
          await runtime.TronoNetwork.joinTextChannel(id, runtime.TronoAuth.user?.nickname);
        else await runtime.TronoChatHub.switchChannel(id);
        if (current()) runtime.TronoPortal.showOnly('chatOnlyScreen');
      } else await runtime.TronoChatHub.enter({ channelId: id });
      if (current()) {
        controller.close();
        runtime.TronoNotifications.channelRead(id);
      }
    } catch (error) {
      for (const remove of pendingNavigation) remove();
      throw error;
    }
  }
  const facade = {
    open: controller.open,
    openFriends: controller.openFriends,
    close: controller.close,
    joinChannel,
  };
  runtime.TronoMessenger = facade;
  const release = controller.subscribe(() =>
    target.dispatchEvent(
      new CustomEvent('trono-direct-change', {
        detail: {
          accountId: controller.getSnapshot().accountId,
          people: directPeople(controller.getSnapshot()),
        },
      }),
    ),
  );
  const bind = () => {
    if (!bound && !canceled) {
      bound = true;
      controller.start();
    }
  };
  const attention = () => {
    if (doc.visibilityState === 'visible') controller.attention();
  };
  target.addEventListener('trono:ready', bind, { once: true });
  target.addEventListener('focus', attention);
  doc.addEventListener('visibilitychange', attention);
  const dispose = () => {
    canceled = true;
    navigation++;
    target.cancelAnimationFrame(frame);
    for (const remove of pendingNavigation) remove();
    pendingNavigation.clear();
    release();
    controller.dispose();
    client.dispose();
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('focus', attention);
    doc.removeEventListener('visibilitychange', attention);
    if (runtime.TronoMessenger === facade) delete runtime.TronoMessenger;
    if (runtime.TronoDirectMessages === controller) delete runtime.TronoDirectMessages;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
