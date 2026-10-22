import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { FilesClient } from '../../lib/files/client';
import type { NetworkClient } from '../../lib/socket/client';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { CommunityController } from '../../lib/community/controller';
import type { NotificationsController } from '../../lib/notifications/controller';
import { createSocialClient } from '../../lib/messenger/client';
import { createMessenger } from '../../lib/messenger/controller';
import { directPeople, directUnread } from '../../lib/messenger/selectors';
import {
  MessengerPanelContents,
  MessengerToggleContents,
  MessengerNotices,
} from './messenger-views';

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
  const roots: ReturnType<typeof createRoot>[] = [],
    hosts: HTMLElement[] = [],
    cleanup: (() => void)[] = [];
  let toggle: HTMLButtonElement,
    panel: HTMLElement,
    previous = controller.getSnapshot();
  function placeToggle() {
    if (!toggle || canceled) return;
    const visible = (el: HTMLElement | null) =>
      el && el.getClientRects().length && target.getComputedStyle(el).visibility !== 'hidden';
    const rail = ['desktopRail', 'webLayoutRail'].map((id) => doc.getElementById(id)).find(visible);
    toggle.classList.remove(
      'messenger-rail-button',
      'messenger-sidebar-button',
      'messenger-inline-button',
      'messenger-home-button',
    );
    if (rail) {
      const before =
        rail.querySelector(
          '[data-desktop-route="community"],[data-web-route="community"],[data-layout-route="community"]',
        ) ?? rail.querySelector('#soundboardToggle');
      if (toggle.parentElement !== rail || toggle.nextSibling !== before)
        rail.insertBefore(toggle, before);
      toggle.classList.add('messenger-rail-button');
    } else {
      const community = !doc.getElementById('chatOnlyScreen')?.classList.contains('hidden');
      const side = community
          ? [...doc.querySelectorAll<HTMLElement>('.mn-sidebar-heading,.mn-sidebar')].find(visible)
          : null,
        strip = community ? doc.querySelector<HTMLElement>('.mn-sidebar-scroll') : null;
      const host = side || (visible(strip) ? strip : null) || doc.body;
      if (toggle.parentElement !== host) {
        if (host === strip) host.prepend(toggle);
        else host.append(toggle);
      }
      toggle.classList.add(
        side
          ? 'messenger-sidebar-button'
          : host === strip
            ? 'messenger-inline-button'
            : 'messenger-home-button',
      );
    }
  }
  let layoutFrame = 0;
  const layout = () => {
    if (!layoutFrame)
      layoutFrame = target.requestAnimationFrame(() => {
        layoutFrame = 0;
        placeToggle();
      });
  };
  function sync() {
    const state = controller.getSnapshot(),
      unread = directUnread(state);
    toggle.hidden = !state.accountId;
    toggle.classList.toggle('has-unread', !!unread);
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.setAttribute('aria-label', 'Amigos' + (unread ? ` · ${unread} avisos não lidos` : ''));
    panel.hidden = !state.open;
    panel.classList.toggle('has-peer', !!state.peerId);
    if (
      previous.accountId !== state.accountId ||
      previous.friends !== state.friends ||
      previous.threads !== state.threads ||
      previous.members !== state.members
    )
      target.dispatchEvent(
        new CustomEvent('trono-direct-change', {
          detail: { accountId: state.accountId, people: directPeople(state), unread },
        }),
      );
    previous = state;
  }
  const attention = () => {
    if (doc.visibilityState === 'visible') controller.attention();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') controller.close();
  };
  const telemetry = (event: Event) => {
    if ((event as CustomEvent<{ open: boolean }>).detail?.open) controller.close();
  };
  function bind() {
    if (bound || canceled) return;
    bound = true;
    toggle = doc.createElement('button');
    toggle.id = 'messengerToggle';
    toggle.className = 'messenger-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'messengerPanel');
    toggle.title = 'Amigos e mensagens privadas';
    panel = doc.createElement('aside');
    panel.id = 'messengerPanel';
    panel.className = 'messenger-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Amigos e conversas privadas');
    const notices = doc.createElement('div');
    notices.id = 'messengerNotices';
    notices.className = 'messenger-notices';
    notices.setAttribute('aria-live', 'polite');
    notices.setAttribute('aria-relevant', 'additions');
    hosts.push(toggle, panel, notices);
    doc.body.append(toggle, panel, notices);
    flushSync(() => {
      const buttonRoot = createRoot(toggle),
        panelRoot = createRoot(panel),
        noticeRoot = createRoot(notices);
      roots.push(buttonRoot, panelRoot, noticeRoot);
      buttonRoot.render(<MessengerToggleContents controller={controller} />);
      panelRoot.render(
        <MessengerPanelContents
          controller={controller}
          channels={runtime.TronoChannels}
          notifications={runtime.TronoNotifications}
          joinChannel={joinChannel}
          defaultChannel={() =>
            runtime.TronoNetwork.primaryRoom ?? runtime.TronoNetwork.currentRoom
          }
        />,
      );
      noticeRoot.render(<MessengerNotices controller={controller} />);
    });
    const click = () => {
      if (controller.getSnapshot().open) controller.close();
      else void controller.open();
    };
    toggle.addEventListener('click', click);
    cleanup.push(() => toggle.removeEventListener('click', click));
    const screens = new MutationObserver(layout);
    for (const id of [
      'portalScreen',
      'setupScreen',
      'roomScreen',
      'chatOnlyScreen',
      'gameScreen',
    ]) {
      const screen = doc.getElementById(id);
      if (screen) screens.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }
    cleanup.push(() => screens.disconnect(), controller.subscribe(sync));
    let navigationEpoch = runtime.TronoFiles.getSnapshot().epoch;
    cleanup.push(
      runtime.TronoFiles.subscribe(() => {
        const next = runtime.TronoFiles.getSnapshot().epoch;
        if (next === navigationEpoch) return;
        navigationEpoch = next;
        navigation++;
        target.cancelAnimationFrame(frame);
        for (const remove of pendingNavigation) remove();
        pendingNavigation.clear();
      }),
    );
    target.addEventListener('trono-layout-change', layout);
    target.addEventListener('resize', layout);
    target.addEventListener('focus', attention);
    target.addEventListener('trono-telemetry-change', telemetry);
    doc.addEventListener('visibilitychange', attention);
    doc.addEventListener('keydown', keydown);
    controller.start();
    sync();
    placeToggle();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    canceled = true;
    navigation++;
    target.cancelAnimationFrame(frame);
    target.cancelAnimationFrame(layoutFrame);
    for (const remove of pendingNavigation) remove();
    pendingNavigation.clear();
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('trono-layout-change', layout);
    target.removeEventListener('resize', layout);
    target.removeEventListener('focus', attention);
    target.removeEventListener('trono-telemetry-change', telemetry);
    doc.removeEventListener('visibilitychange', attention);
    doc.removeEventListener('keydown', keydown);
    cleanup.forEach((remove) => remove());
    controller.dispose();
    client.dispose();
    flushSync(() => roots.forEach((root) => root.unmount()));
    hosts.forEach((host) => host.remove());
    if (runtime.TronoMessenger === facade) delete runtime.TronoMessenger;
    if (runtime.TronoDirectMessages === controller) delete runtime.TronoDirectMessages;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
