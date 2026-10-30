import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AuthSessionData } from '../../types/auth';
import type { NotificationPayload } from '../../types/notifications';
import { createAndroidHost } from './android-host';

interface NativeAndroid {
  prepareVoice(options: { lease: string }): Promise<void>;
  endVoice(options: { lease: string }): Promise<void>;
  permissions(): Promise<{ notifications: NotificationPermission }>;
  requestNotifications(): Promise<{ notifications: NotificationPermission }>;
  notify(options: NotificationPayload): Promise<void>;
  readSession(): Promise<{ value: AuthSessionData | null }>;
  saveSession(options: { value: AuthSessionData | null }): Promise<void>;
  setAccount(options: {
    accountId: string | null;
    enabled: boolean;
    muted: readonly string[];
  }): Promise<void>;
  pushRegistration(): Promise<{ configured: boolean; token?: string; deviceId: string }>;
  minimize(): Promise<void>;
  consumeNotification(): Promise<{ target?: unknown }>;
  addListener(
    event: 'notificationClick',
    listener: (event: { target?: unknown }) => void,
  ): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeAndroid>('TronoAndroid');
export function initializeAndroid(target: Window) {
  if (target.TronoAndroid || Capacitor.getPlatform() !== 'android') return;
  let permission: NotificationPermission = 'default';
  const listeners = new Set<(target: unknown) => void>();
  const emit = (value: unknown) => {
    for (const listener of listeners) listener(value);
  };
  const voice = createAndroidHost(native);
  const host = {
    ...voice,
    minimize: () => native.minimize(),
    getPermission: () => permission,
    async requestPermission() {
      permission = (await native.requestNotifications()).notifications;
      target.dispatchEvent(new Event('trono-android-permission'));
      return permission;
    },
    async notify(payload: NotificationPayload) {
      await native.notify(payload);
    },
    async readSession() {
      return (await native.readSession()).value;
    },
    saveSession: (value: AuthSessionData | null) => native.saveSession({ value }),
    onNotificationClick(listener: (value: unknown) => void) {
      listeners.add(listener);
      const authentication = (target as Window & { TronoAuth?: { ready: Promise<void> } })
        .TronoAuth;
      void (authentication?.ready ?? Promise.resolve())
        .then(() => native.consumeNotification())
        .then((value) => {
          if (value.target) emit(value.target);
        });
      return () => {
        listeners.delete(listener);
      };
    },
    setAccount: (accountId: string | null, enabled: boolean, muted: readonly string[]) =>
      native.setAccount({ accountId, enabled, muted }),
    pushRegistration: () => native.pushRegistration(),
  };
  target.TronoAndroid = host;
  target.document.documentElement.dataset.platform = 'android';
  void native
    .permissions()
    .then((value) => {
      permission = value.notifications;
      target.dispatchEvent(new Event('trono-android-permission'));
    })
    .catch(console.warn);
  void native.addListener('notificationClick', (value) => emit(value.target));
}
export type AndroidHost = ReturnType<typeof createAndroidHost> & {
  minimize(): Promise<void>;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  notify(payload: NotificationPayload): Promise<void>;
  readSession(): Promise<AuthSessionData | null>;
  saveSession(value: AuthSessionData | null): Promise<void>;
  onNotificationClick(listener: (value: unknown) => void): () => void;
  setAccount(id: string | null, enabled: boolean, muted: readonly string[]): Promise<void>;
  pushRegistration(): Promise<{ configured: boolean; token?: string; deviceId: string }>;
};
