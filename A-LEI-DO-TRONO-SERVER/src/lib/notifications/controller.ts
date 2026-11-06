import type { ChannelNotice } from '../../types/channels';
import type {
  NotificationChannel,
  NotificationMode,
  NotificationPayload,
  NotificationsSnapshot,
  ScopedNotificationTarget,
} from '../../types/notifications';
import {
  notificationTargetId,
  readNotificationEvent,
  readNotificationFlags,
  readNotificationRequest,
  readNotificationTarget,
} from './protocol.ts';

export interface NotificationsOptions {
  getAccountId(): string | null;
  preferences: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: unknown): void;
  };
  channels: {
    getSnapshot(): { readonly channels: readonly NotificationChannel[] };
    subscribe(listener: () => void): () => void;
  };
  network: { onMessage(listener: (message: unknown) => void): () => void };
  getCurrentRoom(): string | null;
  isChannelVisible(id: string): boolean;
  isForeground(): boolean;
  desktop: boolean;
  desktopNotify?(payload: NotificationPayload): Promise<unknown> | unknown;
  showBrowserNotification?(payload: NotificationPayload, onClick: () => void): void;
  getPermission(): NotificationPermission | 'unsupported';
  requestPermission(): Promise<NotificationPermission>;
  navigate(target: ScopedNotificationTarget): Promise<unknown> | unknown;
  scheduleRead(callback: () => void): () => void;
  subscribeIdentity(listener: () => void): () => void;
  subscribePreferences(listener: (key: string) => void): () => void;
  subscribeAttention(listener: () => void): () => void;
  subscribeNotificationClick(listener: (target: unknown) => void): () => void;
  onNoticesChanged(): void;
  warn?(error: unknown): void;
}

export const EMPTY_NOTIFICATIONS: NotificationsSnapshot = Object.freeze({
  mode: 'mentions',
  channels: Object.freeze([]),
  selectedChannelId: '',
  selectedMuted: false,
  permissionStatus: '',
  permissionPending: false,
  desktop: false,
  windowsEnabled: true,
  windowsStatus: '',
  notices: Object.freeze({}),
});

/** Owns account-scoped unread counts and policy; browser UI and notification APIs are ports. */
export function createNotifications(options: NotificationsOptions) {
  const {
    preferences,
    channels,
    network,
    warn = (error) => console.warn('[Notifications]', error),
  } = options;
  const counts = new Map<string, number>(),
    seen = new Set<string>(),
    listeners = new Set<() => void>(),
    subscriptions: (() => void)[] = [],
    pendingReads = new Set<() => void>();
  let state: NotificationsSnapshot = Object.freeze({
      ...EMPTY_NOTIFICATIONS,
      desktop: options.desktop,
    }),
    accountId = options.getAccountId(),
    generation = 0,
    started = false,
    disposed = false;

  function update(patch: Partial<NotificationsSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }

  function readMode(): NotificationMode {
    const value = preferences.get('notifications', 'mentions');
    return value === 'all' || value === 'off' ? value : 'mentions';
  }

  function readWindowsEnabled(): boolean {
    return preferences.get('windowsNotifications', true) !== false;
  }

  function muted(id: string): boolean {
    return !!id && preferences.get('mute:' + id, false) === true;
  }

  function getChannelState(id: string): ChannelNotice {
    return Object.freeze({ unread: counts.get(id) ?? 0, muted: muted(id) });
  }

  function render() {
    if (disposed) return;
    update({
      mode: readMode(),
      windowsEnabled: readWindowsEnabled(),
      selectedMuted: muted(state.selectedChannelId),
      notices: Object.freeze(
        Object.fromEntries(
          [...new Set([...state.channels.map((channel) => channel.id), ...counts.keys()])].map(
            (id) => [id, getChannelState(id)],
          ),
        ),
      ),
    });
    options.onNoticesChanged();
  }

  function cancelReads() {
    for (const cancel of pendingReads) cancel();
    pendingReads.clear();
  }

  function syncIdentity() {
    if (disposed) return;
    const next = options.getAccountId();
    if (accountId !== next) {
      accountId = next;
      generation++;
      counts.clear();
      seen.clear();
      cancelReads();
      update({ permissionPending: false, permissionStatus: '', windowsStatus: '' });
    }
    render();
  }

  function ensureIdentity() {
    if (accountId !== options.getAccountId()) syncIdentity();
  }

  function syncChannels() {
    if (disposed) return;
    const next = channels.getSnapshot().channels;
    // Notices refresh the catalog too. Comparing metadata prevents a feedback loop.
    if (
      next.length === state.channels.length &&
      next.every((channel, index) => {
        const current = state.channels[index];
        return current.id === channel.id && current.name === channel.name;
      })
    )
      return;
    const rows = Object.freeze(
      next.map((channel) => Object.freeze({ id: channel.id, name: channel.name })),
    );
    update({
      channels: rows,
      selectedChannelId: rows.some((channel) => channel.id === state.selectedChannelId)
        ? state.selectedChannelId
        : (rows[0]?.id ?? ''),
    });
    render();
  }

  function mute(id: string, value: boolean) {
    if (disposed || !id) return;
    preferences.set('mute:' + id, !!value);
    render();
  }

  function channelRead(id: string | null | undefined) {
    if (disposed || !id || !counts.delete(id)) return;
    render();
  }

  function allowed(target: unknown, flags: unknown = {}): boolean {
    if (disposed) return false;
    const id = notificationTargetId(target),
      policy = readNotificationFlags(flags);
    if (!options.getAccountId() || !id || !policy || muted(id) || readMode() === 'off')
      return false;
    return (
      policy.direct === true ||
      policy.request === true ||
      policy.mention === true ||
      readMode() === 'all'
    );
  }

  async function navigate(value: unknown): Promise<void> {
    if (disposed) return;
    const target = readNotificationTarget(value);
    if (!target || !target.accountId || target.accountId !== options.getAccountId()) return;
    try {
      await options.navigate(Object.freeze({ ...target, accountId: target.accountId }));
    } catch (error) {
      warn(error);
    }
  }

  async function notify(value: unknown): Promise<void> {
    if (disposed) return;
    ensureIdentity();
    const request = readNotificationRequest(value);
    if (!request || !accountId || !allowed(request.target, request)) return;
    const owner = accountId,
      expected = generation,
      payload: NotificationPayload = Object.freeze({
        key: owner + ':' + request.key,
        title: request.title,
        body: (request.body ?? '').slice(0, 220),
        target: Object.freeze({ ...request.target, accountId: owner }),
      });
    if (options.desktopNotify) {
      if (!readWindowsEnabled()) return;
      try {
        await options.desktopNotify(payload);
      } catch (error) {
        warn(error);
      }
      return;
    }
    if (options.isForeground() || options.getPermission() !== 'granted') return;
    try {
      options.showBrowserNotification?.(payload, () => {
        if (disposed || expected !== generation || owner !== options.getAccountId()) return;
        void navigate(payload.target);
      });
    } catch (error) {
      warn(error);
    }
  }

  function readCurrent() {
    if (disposed) return;
    ensureIdentity();
    const current = options.getCurrentRoom();
    if (current && options.isChannelVisible(current)) channelRead(current);
  }

  function onMessage(value: unknown) {
    if (disposed) return;
    ensureIdentity();
    const event = readNotificationEvent(value);
    if (!event) return;
    if (event.type === 'chat-notice') {
      if (!accountId || seen.has(event.id)) return;
      seen.add(event.id);
      if (seen.size > 500) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      if (!options.isChannelVisible(event.roomId))
        counts.set(event.roomId, (counts.get(event.roomId) ?? 0) + 1);
      render();
      void notify({
        key: event.id,
        title: event.mentioned ? 'Você foi mencionado · ' + event.roomName : event.roomName,
        body: event.name + ': ' + event.text,
        target: { type: 'channel', id: event.roomId },
        mention: event.mentioned,
      });
      return;
    }
    const expected = generation;
    let completed = false;
    let cancel = () => {};
    cancel = options.scheduleRead(() => {
      completed = true;
      pendingReads.delete(cancel);
      if (disposed || expected !== generation || accountId !== options.getAccountId()) return;
      if (options.isChannelVisible(event.roomId)) channelRead(event.roomId);
    });
    if (!completed) pendingReads.add(cancel);
  }

  async function requestPermission(): Promise<void> {
    ensureIdentity();
    if (
      disposed ||
      options.desktop ||
      state.permissionPending ||
      options.getPermission() === 'unsupported'
    )
      return;
    const expected = generation;
    update({ permissionPending: true, permissionStatus: '' });
    try {
      const answer = await options.requestPermission();
      if (disposed || expected !== generation || accountId !== options.getAccountId()) return;
      update({
        permissionPending: false,
        permissionStatus:
          answer === 'granted'
            ? 'Avisos ativados.'
            : 'Avisos não foram permitidos. Você pode revisar a permissão nas configurações do navegador.',
      });
    } catch (error) {
      if (disposed || expected !== generation || accountId !== options.getAccountId()) return;
      update({
        permissionPending: false,
        permissionStatus: 'Não foi possível solicitar a permissão de avisos.',
      });
      warn(error);
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      subscriptions.push(
        channels.subscribe(syncChannels),
        network.onMessage(onMessage),
        options.subscribeIdentity(syncIdentity),
        options.subscribePreferences((key) => {
          if (key === 'notifications' || key === 'windowsNotifications' || key.startsWith('mute:'))
            syncIdentity();
        }),
        options.subscribeAttention(readCurrent),
        options.subscribeNotificationClick((target) => void navigate(target)),
      );
      syncChannels();
      syncIdentity();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      cancelReads();
      for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
      listeners.clear();
      counts.clear();
      seen.clear();
    },
    setMode(value: unknown) {
      if (disposed || (value !== 'all' && value !== 'mentions' && value !== 'off')) return;
      preferences.set('notifications', value);
      render();
    },
    selectChannel(id: string) {
      if (disposed || !state.channels.some((channel) => channel.id === id)) return;
      update({ selectedChannelId: id, selectedMuted: muted(id) });
    },
    setSelectedMuted(value: boolean) {
      mute(state.selectedChannelId, value);
    },
    setWindowsEnabled(value: boolean) {
      if (disposed) return;
      preferences.set('windowsNotifications', !!value);
      render();
    },
    async testWindowsNotification(): Promise<void> {
      ensureIdentity();
      if (disposed || !options.desktopNotify) return;
      if (!accountId) {
        update({ windowsStatus: 'Entre na sua conta para testar.' });
        return;
      }
      if (!readWindowsEnabled()) {
        update({ windowsStatus: 'Ative Notificações do Windows para testar.' });
        return;
      }
      const owner = accountId,
        expected = generation;
      try {
        const raw = await options.desktopNotify({
          key: owner + ':preview:' + Date.now(),
          title: 'M&N · Notificações ativadas',
          body: 'As mensagens permitidas aparecerão aqui quando o Trono estiver em segundo plano.',
          preview: true,
          target: { type: 'friends', id: owner, accountId: owner },
        });
        if (disposed || expected !== generation || owner !== options.getAccountId()) return;
        const result =
          raw && typeof raw === 'object'
            ? (raw as { shown?: boolean; reason?: string })
            : undefined;
        update({
          windowsStatus: result?.shown
            ? 'Aviso enviado ao Windows. Se não apareceu, confira Não incomodar e as permissões de notificação do M&N.'
            : result?.reason === 'limited'
              ? 'Aguarde um minuto antes de testar novamente.'
              : 'O Windows não disponibilizou as notificações neste dispositivo.',
        });
      } catch (error) {
        if (disposed || expected !== generation || owner !== options.getAccountId()) return;
        update({ windowsStatus: 'Não foi possível enviar o aviso ao Windows.' });
        warn(error);
      }
    },
    requestPermission,
    notify,
    navigate,
    allowed,
    muted,
    mute,
    channelRead,
    render,
    getChannelState,
  };
}

export type NotificationsController = ReturnType<typeof createNotifications>;
