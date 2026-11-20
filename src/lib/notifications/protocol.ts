import type {
  NotificationFlags,
  NotificationRequest,
  NotificationTarget,
} from '../../types/notifications';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function readNotificationTarget(value: unknown): NotificationTarget | null {
  if (
    !record(value) ||
    !id(value.id) ||
    typeof value.type !== 'string' ||
    !['channel', 'direct', 'friends'].includes(value.type) ||
    (value.accountId !== undefined && !id(value.accountId))
  )
    return null;
  return Object.freeze({
    type: value.type as NotificationTarget['type'],
    id: value.id,
    ...(value.accountId === undefined ? {} : { accountId: value.accountId as string }),
  });
}

export function notificationTargetId(value: unknown): string | null {
  return record(value) && id(value.id) ? value.id : null;
}

export function readNotificationFlags(value: unknown): NotificationFlags | null {
  if (!record(value)) return null;
  for (const key of ['mention', 'direct', 'request'])
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return null;
  return Object.freeze({
    mention: value.mention === true,
    direct: value.direct === true,
    request: value.request === true,
  });
}

export function readNotificationRequest(value: unknown): NotificationRequest | null {
  if (
    !record(value) ||
    !id(value.key) ||
    typeof value.title !== 'string' ||
    (value.body !== undefined && typeof value.body !== 'string')
  )
    return null;
  const target = readNotificationTarget(value.target),
    flags = readNotificationFlags(value);
  if (!target || !flags) return null;
  return Object.freeze({
    key: value.key,
    title: value.title,
    body: (value.body as string | undefined) ?? '',
    target,
    ...flags,
  });
}

export type NotificationEvent =
  | {
      readonly type: 'chat-notice';
      readonly id: string;
      readonly roomId: string;
      readonly roomName: string;
      readonly name: string;
      readonly text: string;
      readonly mentioned: boolean;
    }
  | { readonly type: 'joined-room' | 'joined-text-channel'; readonly roomId: string };

/** This domain accepts only validated notification and read events from the shared socket. */
export function readNotificationEvent(value: unknown): NotificationEvent | null {
  if (!record(value)) return null;
  if (value.type === 'joined-room' || value.type === 'joined-text-channel') {
    if (!record(value.room) || !id(value.room.id)) return null;
    return Object.freeze({ type: value.type, roomId: value.room.id });
  }
  if (
    value.type !== 'chat-notice' ||
    !id(value.id) ||
    !id(value.roomId) ||
    typeof value.roomName !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.mentioned !== 'boolean'
  )
    return null;
  return Object.freeze({
    type: value.type,
    id: value.id,
    roomId: value.roomId,
    roomName: value.roomName,
    name: value.name,
    text: value.text,
    mentioned: value.mentioned,
  });
}
