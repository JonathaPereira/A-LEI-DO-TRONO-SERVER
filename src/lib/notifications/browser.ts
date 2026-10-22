import { createNotifications } from './controller';
import type { NotificationsController } from './controller';
import type { NotificationPayload, ScopedNotificationTarget } from '../../types/notifications';
import type { ChannelsController } from '../channels/catalog';
import type { NetworkClient } from '../socket/client';

interface NotificationsRuntime extends Window {
  TronoAuth: { user: { id: string } | null };
  TronoPersonal: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: unknown): void;
  };
  TronoChannels: ChannelsController;
  TronoNetwork: NetworkClient;
  TronoMessenger: {
    open(id: string): void;
    joinChannel(id: string, options: { showText: boolean }): Promise<unknown>;
    openFriends(): void;
  };
  TronoDesktop?: {
    notify?(payload: NotificationPayload): Promise<unknown>;
    onNotificationClick?(listener: (value: unknown) => void): (() => void) | void;
  };
  TronoNotifications?: NotificationsController;
  Notification?: typeof Notification;
}

/** DOM visibility and host delivery adapt to the same notification owner on web and desktop. */
export function initializeNotifications(target: Window): NotificationsController {
  const runtime = target as NotificationsRuntime;
  if (runtime.TronoNotifications) return runtime.TronoNotifications;
  const document = target.document;
  const listen = (types: string[], listener: EventListener) => {
    for (const type of types) target.addEventListener(type, listener);
    return () => {
      for (const type of types) target.removeEventListener(type, listener);
    };
  };
  const foreground = () => document.hasFocus() && document.visibilityState === 'visible';
  const client = createNotifications({
    getAccountId: () => runtime.TronoAuth.user?.id ?? null,
    preferences: runtime.TronoPersonal,
    channels: runtime.TronoChannels,
    network: runtime.TronoNetwork,
    getCurrentRoom: () => runtime.TronoNetwork.currentRoom,
    isForeground: foreground,
    isChannelVisible: (id) =>
      foreground() &&
      runtime.TronoNetwork.currentRoom === id &&
      !document.getElementById('courtChatForm')?.closest('[hidden]') &&
      !!document.getElementById('courtChatInput')?.getClientRects().length,
    desktop: !!runtime.TronoDesktop,
    desktopNotify: runtime.TronoDesktop?.notify
      ? (payload) => runtime.TronoDesktop!.notify!(payload)
      : undefined,
    showBrowserNotification(payload, onClick) {
      const Constructor = runtime.Notification;
      if (!Constructor) return;
      const notice = new Constructor(payload.title, {
        body: payload.body,
        tag: payload.key,
        icon: 'assets/throne.png',
      });
      notice.onclick = () => {
        target.focus();
        onClick();
        notice.close();
      };
    },
    getPermission: () => runtime.Notification?.permission ?? 'unsupported',
    requestPermission: () => runtime.Notification?.requestPermission() ?? Promise.resolve('denied'),
    navigate: async (destination: ScopedNotificationTarget) => {
      if (destination.type === 'direct') runtime.TronoMessenger.open(destination.id);
      else if (destination.type === 'channel')
        await runtime.TronoMessenger.joinChannel(destination.id, { showText: true });
      else runtime.TronoMessenger.openFriends();
    },
    scheduleRead(callback) {
      const frame = target.requestAnimationFrame(callback);
      return () => target.cancelAnimationFrame(frame);
    },
    subscribeIdentity: (listener) => listen(['trono-auth-change'], listener),
    subscribePreferences: (listener) =>
      listen(['trono-personal-change'], (event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail: unknown = event.detail;
        if (
          detail &&
          typeof detail === 'object' &&
          'key' in detail &&
          typeof detail.key === 'string'
        )
          listener(detail.key);
      }),
    subscribeAttention: (listener) => listen(['focus', 'pointerdown'], listener),
    subscribeNotificationClick: (listener) =>
      runtime.TronoDesktop?.onNotificationClick?.(listener) ?? (() => {}),
    onNoticesChanged: () => target.dispatchEvent(new Event('trono-channel-notifications-change')),
  });
  runtime.TronoNotifications = client;
  target.addEventListener('trono:ready', client.start, { once: true });
  return client;
}
