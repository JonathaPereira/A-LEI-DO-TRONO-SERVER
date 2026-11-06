import { readSocialSnapshot, readDirectMessage, socialId } from '../src/lib/messenger/protocol.ts';
import { apiError } from './http-api.ts';

export const socialUnavailable = () =>
  apiError('SOCIAL_UNAVAILABLE', 'Conversas indisponíveis. Confira a migração SQL.', 503);
export function targetId(value: unknown) {
  try {
    return socialId(value);
  } catch {
    throw apiError('INVALID_TARGET', 'Conta ou mensagem inválida.');
  }
}
export function readSocial(value: unknown, owner: string) {
  try {
    return readSocialSnapshot(value, owner);
  } catch {
    throw socialUnavailable();
  }
}
export function readConversation(value: unknown, owner: string, peer: string) {
  try {
    if (!Array.isArray(value) || value.length > 51) throw socialUnavailable();
    const ids = new Set<string>();
    const messages = value.map((row) => {
      const message = readDirectMessage(row, owner, peer);
      if (ids.has(message.id)) throw socialUnavailable();
      ids.add(message.id);
      return message;
    });
    return { messages: messages.slice(-50), hasMore: messages.length > 50 };
  } catch {
    throw socialUnavailable();
  }
}
export function readCommittedMessage(
  value: unknown,
  owner: string,
  peer: string,
  expected: { id: string; roomId: string | null; attachmentId: string | null },
) {
  try {
    const message = readDirectMessage(value, owner, peer);
    if (
      message.id !== expected.id ||
      message.senderId !== owner ||
      message.roomId !== expected.roomId ||
      (message.attachment?.id ?? null) !== expected.attachmentId
    )
      throw socialUnavailable();
    return message;
  } catch {
    throw socialUnavailable();
  }
}
