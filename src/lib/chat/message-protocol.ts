import type { ChatAttachment, ChatMessage } from '../../types/domain';
import type { SocketMessage } from '../../types/socket';

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(): never {
  throw Object.assign(new Error('Mensagem de chat inválida.'), { code: 'INVALID_RESPONSE' });
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value) return fail();
  return value;
}
export function revision(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail();
  return value;
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return fail();
  return value;
}
export function readChatMessage(value: unknown, roomId: string): ChatMessage {
  if (
    !record(value) ||
    identifier(value.roomId) !== roomId ||
    typeof value.text !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.senderId !== 'string' ||
    typeof value.ts !== 'number' ||
    !Number.isFinite(value.ts) ||
    !Number.isFinite(new Date(value.ts).getTime()) ||
    typeof value.seat !== 'number' ||
    !Number.isInteger(value.seat) ||
    (value.accountId !== null && typeof value.accountId !== 'string')
  )
    return fail();
  let attachment: ChatAttachment | null = null;
  if (value.attachment != null) {
    const file = value.attachment;
    if (
      !record(file) ||
      typeof file.name !== 'string' ||
      typeof file.mime !== 'string' ||
      typeof file.bytes !== 'number' ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      (file.deleted !== undefined && typeof file.deleted !== 'boolean') ||
      (file.roomId != null && typeof file.roomId !== 'string')
    )
      return fail();
    attachment = Object.freeze({
      id: identifier(file.id),
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
      ownerId: optionalString(file.ownerId),
      kind: optionalString(file.kind),
      roomId: file.roomId as string | null | undefined,
      createdAt: optionalString(file.createdAt),
      deleted: file.deleted as boolean | undefined,
    });
  }
  if (value.avatar_file_id != null && typeof value.avatar_file_id !== 'string') return fail();
  return Object.freeze({
    id: identifier(value.id),
    roomId,
    name: value.name,
    text: value.text,
    senderId: value.senderId,
    seat: value.seat,
    accountId: value.accountId,
    ts: value.ts,
    avatar_preset: optionalString(value.avatar_preset),
    avatar_file_id: value.avatar_file_id as string | null | undefined,
    attachment,
  });
}

export function readHistory(message: SocketMessage) {
  const roomId = identifier(message.roomId);
  if (
    !Array.isArray(message.messages) ||
    typeof message.hasMore !== 'boolean' ||
    (message.older !== undefined && typeof message.older !== 'boolean') ||
    (message.before != null && typeof message.before !== 'string')
  )
    return fail();
  return {
    roomId,
    messages: message.messages.map((value) => readChatMessage(value, roomId)),
    before: message.before == null ? null : identifier(message.before),
    hasMore: message.hasMore,
    older: message.older === true,
    revision: revision(message.revision),
  };
}
