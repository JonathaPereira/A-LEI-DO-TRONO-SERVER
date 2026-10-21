import type { IncomingHttpHeaders } from 'node:http';
import type { MemberRole } from './roles';

/** Identity returned by the authoritative provider adapter, never by request metadata. */
export interface BackendAccount {
  id: string;
  nickname: string;
  role: MemberRole;
  expiresAt: number;
  email?: string;
  avatar_preset?: string;
  avatar_file_id?: string | null;
  sessionId?: string;
}
export interface AuthGateway {
  readonly configured: boolean;
  readonly allowedOrigins: ReadonlySet<string>;
  tokenFrom(request: { headers: IncomingHttpHeaders }): string;
  identity(token: string, signal?: AbortSignal): Promise<BackendAccount>;
  request(
    token: string,
    path: string,
    method?: 'GET' | 'POST',
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
