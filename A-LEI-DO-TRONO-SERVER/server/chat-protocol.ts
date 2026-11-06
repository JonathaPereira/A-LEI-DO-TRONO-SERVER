import { object } from './http-api.ts';
import { roomId } from './channel-protocol.ts';

export const messageId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function readChatInput(value: unknown) {
  if (!object(value) || (value.text !== undefined && typeof value.text !== 'string')) return null;
  if (value.attachmentId != null && !messageId(value.attachmentId)) return null;
  if (value.roomId !== undefined && !roomId(value.roomId)) return null;
  return {
    text: (typeof value.text === 'string' ? value.text : '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 300),
    attachmentId: value.attachmentId == null ? null : (value.attachmentId as string),
    roomId: value.roomId as string | undefined,
  };
}
export function readHistoryInput(value: unknown) {
  if (!object(value) || !roomId(value.roomId) || (value.before != null && !messageId(value.before)))
    return null;
  return { roomId: value.roomId, before: value.before == null ? null : (value.before as string) };
}
export function readModerationInput(value: unknown) {
  if (
    !object(value) ||
    (value.type !== 'chat-history-clear' && value.type !== 'chat-message-delete') ||
    !roomId(value.roomId)
  )
    return null;
  if (value.requestId !== undefined && typeof value.requestId !== 'string') return null;
  return {
    action: value.type === 'chat-history-clear' ? ('clear' as const) : ('delete' as const),
    roomId: value.roomId,
    requestId: typeof value.requestId === 'string' ? value.requestId.slice(0, 80) : '',
    id: value.type === 'chat-message-delete' && typeof value.id === 'string' ? value.id : undefined,
  };
}
