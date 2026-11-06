import type {
  DirectMessage,
  DirectPerson,
  DirectThread,
  Friend,
  SocialSnapshot,
} from '../../types/messenger';
import { record, readFile } from '../files/protocol.ts';

export function socialId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  )
    throw new Error('Conta ou mensagem inválida.');
  return value;
}
function unique<T extends { readonly id: string }>(rows: T[]): readonly T[] {
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error('Dados duplicados na conversa.');
  return Object.freeze(rows);
}
function person(value: unknown, thread = false): DirectPerson {
  if (
    !record(value) ||
    typeof value.name !== 'string' ||
    (value.avatar_preset != null && typeof value.avatar_preset !== 'string') ||
    (value.avatar_file_id != null && typeof value.avatar_file_id !== 'string')
  )
    throw new Error('Contato inválido.');
  return Object.freeze({
    id: socialId(thread ? value.peerId : value.id),
    name: value.name,
    avatar_preset: value.avatar_preset as string | undefined,
    avatar_file_id: value.avatar_file_id as string | null | undefined,
  });
}
export function readDirectMessage(value: unknown, owner: string, peer: string): DirectMessage {
  if (
    !record(value) ||
    typeof value.text !== 'string' ||
    typeof value.ts !== 'string' ||
    !Number.isFinite(Date.parse(value.ts)) ||
    (value.roomId !== null && typeof value.roomId !== 'string') ||
    typeof value.senderId !== 'string' ||
    ![owner, peer].includes(value.senderId)
  )
    throw new Error('Mensagem privada inválida.');
  const attachment = value.attachment == null ? undefined : readFile(value.attachment);
  if (
    attachment &&
    (attachment.kind !== 'direct' ||
      ![owner, peer].includes(attachment.ownerId ?? '') ||
      attachment.peerId !== (attachment.ownerId === owner ? peer : owner))
  )
    throw new Error('Anexo de outra conversa.');
  return Object.freeze({
    id: socialId(value.id),
    senderId: socialId(value.senderId),
    text: value.text,
    ts: value.ts,
    roomId: value.roomId as string | null,
    ...(attachment ? { attachment } : {}),
  });
}
export function readSocialSnapshot(value: unknown, owner: string): SocialSnapshot {
  if (!record(value) || !Array.isArray(value.friends) || !Array.isArray(value.threads))
    throw new Error('Lista de conversas inválida.');
  const friends = unique(
    value.friends.map((row: unknown): Friend => {
      const base = person(row);
      if (
        !record(row) ||
        typeof row.state !== 'string' ||
        !['pending', 'accepted'].includes(row.state) ||
        typeof row.incoming !== 'boolean' ||
        base.id === owner
      )
        throw new Error('Amizade inválida.');
      return Object.freeze({
        ...base,
        state: row.state as Friend['state'],
        incoming: row.incoming,
      });
    }),
  );
  const threads = unique(
    value.threads.map((row: unknown): DirectThread => {
      const base = person(row, true);
      if (
        !record(row) ||
        !Number.isSafeInteger(row.unread) ||
        (row.unread as number) < 0 ||
        base.id === owner
      )
        throw new Error('Conversa inválida.');
      return Object.freeze({
        ...base,
        peerId: base.id,
        unread: row.unread as number,
        last: readDirectMessage(row.last, owner, base.id),
      });
    }),
  );
  return Object.freeze({ friends, threads });
}
export function readDirectPage(value: unknown, owner: string, peer: string) {
  if (
    !record(value) ||
    !Array.isArray(value.messages) ||
    value.messages.length > 50 ||
    typeof value.hasMore !== 'boolean'
  )
    throw new Error('Histórico privado inválido.');
  return {
    messages: unique(value.messages.map((row) => readDirectMessage(row, owner, peer))),
    hasMore: value.hasMore,
  };
}
