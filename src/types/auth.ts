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
