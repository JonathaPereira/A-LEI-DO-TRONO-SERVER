import type { BackendAccount } from './auth-contract';
import { accountRole, permissions } from './roles.ts';
import { object, authError, authUnavailable } from './auth-errors.ts';
import { validNickname } from '../src/lib/auth/nickname.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 12_000 && !/\s/.test(value);

/** Read only the provider's verified response, never user_metadata or client claims. */
export function readVerifiedUser(value: unknown) {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !uuid.test(value.id) ||
    (value.is_anonymous !== undefined && typeof value.is_anonymous !== 'boolean')
  )
    throw authUnavailable();
  if (
    value.is_anonymous ||
    typeof value.email_confirmed_at !== 'string' ||
    !value.email_confirmed_at
  )
    throw authError('EMAIL_NOT_CONFIRMED', 'Confirme seu e-mail antes de entrar.', 403);
  if (
    typeof value.email !== 'string' ||
    !value.email ||
    value.email.length > 254 ||
    !Number.isFinite(Date.parse(value.email_confirmed_at))
  )
    throw authUnavailable();
  return { id: value.id, email: value.email, email_confirmed_at: value.email_confirmed_at };
}
export function readAccountProfile(value: unknown, id: string) {
  const unavailable = () =>
    authError(
      'PROFILE_UNAVAILABLE',
      'Não foi possível carregar seu perfil. Tente novamente mais tarde.',
      503,
    );
  // The ID-filtered private query returns precisely one profile. No partial/fallback page is trusted.
  if (!Array.isArray(value) || value.length !== 1) throw unavailable();
  const profile: unknown = value[0];
  if (
    !object(profile) ||
    profile.id !== id ||
    !validNickname(profile.nickname) ||
    (profile.community_role != null &&
      profile.community_role !== 'admin' &&
      profile.community_role !== 'member') ||
    (profile.avatar_preset != null &&
      (typeof profile.avatar_preset !== 'string' || profile.avatar_preset.length > 64)) ||
    (profile.avatar_file_id != null &&
      (typeof profile.avatar_file_id !== 'string' || !uuid.test(profile.avatar_file_id)))
  )
    throw unavailable();
  return {
    nickname: profile.nickname,
    community_role: profile.community_role,
    avatar_preset: (typeof profile.avatar_preset === 'string' && profile.avatar_preset) || 'crown',
    avatar_file_id: typeof profile.avatar_file_id === 'string' ? profile.avatar_file_id : null,
  };
}
/** Call only AFTER the hosted provider has verified this token. These fields schedule local expiry. */
export function readSessionClaims(token: string, id: string, now = Date.now()) {
  const invalid = () => authError('AUTH_EXPIRED', 'Sua sessão expirou. Entre novamente.', 401);
  let value: unknown;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) throw invalid();
    value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (
    !object(value) ||
    typeof value.exp !== 'number' ||
    !Number.isSafeInteger(value.exp) ||
    !Number.isSafeInteger(value.exp * 1000) ||
    value.exp * 1000 <= now ||
    (value.sub !== undefined && value.sub !== id) ||
    (value.session_id !== undefined &&
      (typeof value.session_id !== 'string' || !uuid.test(value.session_id)))
  )
    throw invalid();
  return {
    expiresAt: value.exp * 1000,
    sessionId: typeof value.session_id === 'string' ? value.session_id : undefined,
  };
}
export function readCredentials(value: unknown) {
  if (!object(value) || !validToken(value.access_token) || !validToken(value.refresh_token))
    throw authError('AUTH_UNAVAILABLE', 'Não foi possível iniciar a sessão.', 503);
  return { access_token: value.access_token, refresh_token: value.refresh_token };
}
export function verifiedAccount(
  user: ReturnType<typeof readVerifiedUser>,
  profile: ReturnType<typeof readAccountProfile>,
  claims: ReturnType<typeof readSessionClaims>,
): BackendAccount {
  return {
    id: user.id,
    email: user.email,
    nickname: profile.nickname,
    avatar_preset: profile.avatar_preset,
    avatar_file_id: profile.avatar_file_id,
    role: accountRole(user, profile),
    ...claims,
  };
}
export function publicAccount(user: BackendAccount) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    permissions: permissions(user.role),
    avatar_preset: user.avatar_preset,
    avatar_file_id: user.avatar_file_id,
  };
}
