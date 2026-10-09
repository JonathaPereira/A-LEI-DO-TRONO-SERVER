'use strict';

// This email is read only from Supabase's verified /auth/v1/user response.
const CREATOR_EMAIL = 'jonathapereira.jj@gmail.com';
function accountRole(user, profile = {}) {
  if (user.email_confirmed_at && String(user.email || '').trim().toLowerCase() === CREATOR_EMAIL) return 'creator';
  return profile.community_role === 'admin' ? 'admin' : 'member';
}
function permissions(role) {
  return {manageChannels: ['creator', 'admin'].includes(role), moderateFiles: ['creator', 'admin'].includes(role), manageRoles: role === 'creator', uploadSounds: ['creator', 'admin', 'member'].includes(role)};
}
module.exports = {CREATOR_EMAIL, accountRole, permissions};
