import type { AccountRole } from '../src/types/domain';
export type MemberRole = Exclude<AccountRole, 'guest'>;

// This email is read only from Supabase's verified /auth/v1/user response.
export const CREATOR_EMAIL = 'jonathapereira.jj@gmail.com';
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function accountRole(user: unknown, profile: unknown = {}): MemberRole {
  if (!record(user)) return 'member';
  if (
    typeof user.email_confirmed_at === 'string' &&
    user.email_confirmed_at &&
    typeof user.email === 'string' &&
    user.email.trim().toLowerCase() === CREATOR_EMAIL
  )
    return 'creator';
  return record(profile) && profile.community_role === 'admin' ? 'admin' : 'member';
}
export function permissions(role: unknown) {
  return {
    moderateVoice: role === 'creator' || role === 'admin',
    manageChannels: role === 'creator' || role === 'admin',
    moderateFiles: role === 'creator' || role === 'admin',
    manageRoles: role === 'creator',
    viewEmails: role === 'creator',
    uploadSounds: role === 'creator' || role === 'admin' || role === 'member',
  };
}
