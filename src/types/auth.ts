/** One-use link credentials captured before other assets load; consumed by the account owner. */
export interface AuthCallback {
  readonly token_hash: string | null;
  readonly type: string;
  readonly access_token: string | null;
  readonly refresh_token: string | null;
  readonly expires_at: string | null;
  readonly hashType: string | null;
  readonly error: string | null;
}

export interface AuthSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: number;
}
export interface AuthAccount {
  readonly id: string;
  readonly nickname: string;
  readonly email: string;
  readonly role: 'member' | 'admin' | 'creator';
  readonly permissions: Readonly<Record<string, boolean>>;
  readonly avatar_preset: string;
  readonly avatar_file_id: string | null;
}
export interface AuthSessionData {
  readonly session: AuthSession;
  readonly user: AuthAccount;
}
