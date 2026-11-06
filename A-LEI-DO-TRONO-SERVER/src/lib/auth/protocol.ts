import type { AuthAccount, AuthSession, AuthSessionData } from '../../types/auth';
import type { GuestIdentity } from '../../types/network';
import { isRecord, readAccount, readGuest } from '../socket/protocol.ts';

export function readAuthAccount(value: unknown): AuthAccount {
  const account = readAccount(value);
  if (
    !isRecord(value) ||
    typeof value.email !== 'string' ||
    (value.avatar_preset !== undefined && typeof value.avatar_preset !== 'string') ||
    (value.avatar_file_id != null && typeof value.avatar_file_id !== 'string')
  )
    throw Error('Dados da conta inválidos.');
  return Object.freeze({
    id: account.id,
    nickname: account.nickname,
    email: value.email,
    role: account.role,
    permissions: Object.freeze({ ...account.permissions }),
    avatar_preset: typeof value.avatar_preset === 'string' ? value.avatar_preset : 'crown',
    avatar_file_id: typeof value.avatar_file_id === 'string' ? value.avatar_file_id : null,
  });
}
export function readAuthSession(value: unknown): AuthSession {
  if (
    !isRecord(value) ||
    typeof value.access_token !== 'string' ||
    !value.access_token ||
    typeof value.refresh_token !== 'string' ||
    !value.refresh_token ||
    typeof value.expires_at !== 'number' ||
    !Number.isSafeInteger(value.expires_at) ||
    value.expires_at <= 0
  )
    throw Error('Dados da sessão inválidos.');
  return Object.freeze({
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_at: value.expires_at,
  });
}
export function readSessionData(value: unknown): AuthSessionData {
  if (!isRecord(value)) throw Error('Dados da sessão inválidos.');
  return Object.freeze({
    session: readAuthSession(value.session),
    user: readAuthAccount(value.user),
  });
}
export function readGuestIdentity(value: unknown): GuestIdentity {
  const guest = readGuest(value);
  return Object.freeze({
    id: guest.id,
    nickname: guest.nickname,
    ticket: guest.ticket,
    expiresAt: guest.expiresAt,
  });
}
