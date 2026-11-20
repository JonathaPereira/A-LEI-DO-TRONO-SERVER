import type { ChannelNotice } from './channels';

export type NotificationMode = 'mentions' | 'all' | 'off';

export interface NotificationTarget {
  readonly type: 'channel' | 'direct' | 'friends';
  readonly id: string;
  readonly accountId?: string;
}

export interface ScopedNotificationTarget extends NotificationTarget {
  readonly accountId: string;
}

export interface NotificationFlags {
  readonly mention?: boolean;
  readonly direct?: boolean;
  readonly request?: boolean;
}

export interface NotificationRequest extends NotificationFlags {
  readonly key: string;
  readonly title: string;
  readonly body?: string;
  readonly target: NotificationTarget;
}

export interface NotificationPayload {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly preview?: boolean;
  readonly target: ScopedNotificationTarget;
}

export interface NotificationChannel {
  readonly id: string;
  readonly name: string;
}

export interface NotificationsSnapshot {
  readonly mode: NotificationMode;
  readonly channels: readonly NotificationChannel[];
  readonly selectedChannelId: string;
  readonly selectedMuted: boolean;
  readonly permissionStatus: string;
  readonly permissionPending: boolean;
  readonly desktop: boolean;
  readonly windowsEnabled: boolean;
  readonly windowsStatus: string;
  readonly notices: Readonly<Record<string, ChannelNotice>>;
}
