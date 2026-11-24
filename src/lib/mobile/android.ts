import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AuthSessionData } from '../../types/auth';
import type { NotificationPayload } from '../../types/notifications';
import { APP_RELEASE_VERSION } from '../application/release-notes';
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
  getAppInfo(): Promise<{ version: string; versionCode: number }>;
  getUpdateState(): Promise<unknown>;
  checkUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  installUpdate(): Promise<unknown>;
  openUpdateDownload(): Promise<void>;
  addListener(
    event: 'notificationClick',
    listener: (event: { target?: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'updateState',
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeAndroid>('TronoAndroid');
export function initializeAndroid(target: Window) {
  if (target.TronoAndroid || Capacitor.getPlatform() !== 'android') return;
  let permission: NotificationPermission = 'default';
  let appVersion: string = APP_RELEASE_VERSION;
  const listeners = new Set<(target: unknown) => void>();
  const updateListeners = new Set<(state: unknown) => void>();
  const emit = (value: unknown) => {
    for (const listener of listeners) listener(value);
  };
  const emitUpdate = (value: unknown) => {
    for (const listener of updateListeners) listener(value);
  };
  const voice = createAndroidHost(native);
  const host = {
    ...voice,
    get version() {
      return appVersion;
    },
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
    getUpdateState: () => native.getUpdateState(),
    onUpdateState(listener: (value: unknown) => void) {
      updateListeners.add(listener);
      return () => {
        updateListeners.delete(listener);
      };
    },
    checkUpdates: () => native.checkUpdates(),
    downloadUpdate: () => native.downloadUpdate(),
    installUpdate: () => native.installUpdate(),
    openUpdateDownload: () => native.openUpdateDownload(),
  };
  target.TronoAndroid = host;
  target.document.documentElement.dataset.platform = 'android';
  void native
    .getAppInfo()
    .then((info) => {
      if (typeof info?.version === 'string' && info.version.trim())
        appVersion = info.version.trim();
    })
    .catch(() => {});
  void native
    .permissions()
    .then((value) => {
      permission = value.notifications;
      target.dispatchEvent(new Event('trono-android-permission'));
    })
    .catch(console.warn);
  void native.addListener('notificationClick', (value) => emit(value.target));
  void native.addListener('updateState', (value) => emitUpdate(value));
}
export type AndroidHost = ReturnType<typeof createAndroidHost> & {
  readonly version: string;
  minimize(): Promise<void>;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  notify(payload: NotificationPayload): Promise<void>;
  readSession(): Promise<AuthSessionData | null>;
  saveSession(value: AuthSessionData | null): Promise<void>;
  onNotificationClick(listener: (value: unknown) => void): () => void;
  setAccount(id: string | null, enabled: boolean, muted: readonly string[]): Promise<void>;
  pushRegistration(): Promise<{ configured: boolean; token?: string; deviceId: string }>;
  getUpdateState?(): Promise<unknown>;
  onUpdateState?(listener: (value: unknown) => void): () => void;
  checkUpdates?(): Promise<unknown>;
  downloadUpdate?(): Promise<unknown>;
  installUpdate?(): Promise<unknown>;
  openUpdateDownload?(): Promise<void>;
};
