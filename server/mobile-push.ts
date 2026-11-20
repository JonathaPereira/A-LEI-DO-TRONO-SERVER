import { createHash, createSign } from 'node:crypto';
import type { Express } from 'express';
import type { AuthGateway } from './auth-contract';
import { installAccountApi, apiError, object } from './http-api.ts';

interface Target {
  accountId: string;
  type: 'direct' | 'friends';
  id: string;
  key: string;
}
interface PushDevice {
  id: string;
  token: string;
}
type Database = (
  path: string,
  method?: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal,
) => Promise<unknown>;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const unavailable = () =>
  apiError('PUSH_UNCONFIGURED', 'Notificações push ainda não foram configuradas.', 503);

/** FCM credentials remain exclusively on the backend; notifications carry no message content. */
export function createFcmSender({
  env = process.env,
  fetchImpl = fetch,
}: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}) {
  let credentials: { project_id: string; client_email: string; private_key: string } | null = null;
  try {
    const value: unknown = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || 'null');
    if (
      object(value) &&
      typeof value.project_id === 'string' &&
      /^[a-z0-9-]{5,64}$/.test(value.project_id) &&
      typeof value.client_email === 'string' &&
      typeof value.private_key === 'string'
    )
      credentials = {
        project_id: value.project_id,
        client_email: value.client_email,
        private_key: value.private_key,
      };
  } catch {
    /* The optional provider fails closed until configured. */
  }
  let access: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;
  async function authenticate(signal: AbortSignal): Promise<string> {
    if (!credentials) throw unavailable();
    if (access && access.until > Date.now()) return access.token;
    if (pending) return pending;
    const config = credentials;
    pending = (async () => {
      const issued = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: config.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 })}`;
      const signature = createSign('RSA-SHA256')
        .update(input)
        .sign(config.private_key, 'base64url');
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${input}.${signature}`,
        }),
        signal,
      });
      const raw: unknown = await response.json();
      if (!response.ok || !object(raw) || typeof raw.access_token !== 'string') throw unavailable();
      access = { token: raw.access_token, until: Date.now() + 3300000 };
      return raw.access_token;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  return {
    configured: !!credentials,
    async send(token: string, target: Target, signal: AbortSignal): Promise<'sent' | 'expired'> {
      if (!credentials) throw unavailable();
      const bearer = await authenticate(signal);
      const response = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: { token, data: target, android: { priority: 'HIGH', ttl: '86400s' } },
          }),
          signal,
        },
      );
      if (response.ok) return 'sent';
      if (response.status === 401) access = null;
      const raw: unknown = await response.json().catch(() => null);
      if (
        object(raw) &&
        object(raw.error) &&
        Array.isArray(raw.error.details) &&
        raw.error.details.some((value) => object(value) && value.errorCode === 'UNREGISTERED')
      )
        return 'expired';
      throw unavailable();
    },
  };
}

/** Account-scoped native device registration and delivery, independent of voice/media ownership. */
export function createMobilePush({
  auth,
  db,
  sender = createFcmSender(),
}: {
  auth: AuthGateway;
  db: Database | null;
  sender?: ReturnType<typeof createFcmSender>;
}) {
  const scope = new AbortController();
  let sent = 0,
    failed = 0;
  const configured = !!db && sender.configured;
  const rates = new Map<string, { count: number; until: number }>();
  return {
    install(app: Express, express: Pick<typeof import('express'), 'json'>) {
      const route = installAccountApi({
        app,
        express,
        base: '/mobile-push',
        auth,
        signal: scope.signal,
        code: 'PUSH_UNAVAILABLE',
        message: 'Não foi possível atualizar os avisos.',
        bodyLimit: '4kb',
      });
      route('post', '/register', async (req, context) => {
        if (!configured || !db) throw unavailable();
        const raw = req.body;
        if (
          !object(raw) ||
          !uuid(raw.deviceId) ||
          typeof raw.token !== 'string' ||
          raw.token.length < 20 ||
          raw.token.length > 4096 ||
          !/^[\w:-]+$/.test(raw.token) ||
          typeof raw.enabled !== 'boolean'
        )
          throw apiError('INVALID_DEVICE', 'Registro de aparelho inválido.');
        const now = Date.now();
        let rate = rates.get(context.account.id);
        if (!rate || rate.until < now) {
          rate = { count: 0, until: now + 60000 };
          rates.set(context.account.id, rate);
        }
        if (++rate.count > 30)
          throw apiError('PUSH_RATE_LIMIT', 'Aguarde antes de atualizar os avisos.', 429);
        for (const [key, value] of rates) if (value.until < now) rates.delete(key);
        await db(
          'rpc/register_mobile_push',
          'POST',
          {
            p_id: createHash('sha256').update(raw.token).digest('hex'),
            p_account: context.account.id,
            p_device: raw.deviceId,
            p_token: raw.token,
            p_enabled: raw.enabled,
          },
          context.signal,
        );
        return { ok: true };
      });
      route('post', '/unregister', async (req, context) => {
        if (!db || !object(req.body) || !uuid(req.body.deviceId))
          throw apiError('INVALID_DEVICE', 'Registro de aparelho inválido.');
        await db(
          `mobile_push_devices?account_id=eq.${context.account.id}&device_id=eq.${req.body.deviceId}`,
          'DELETE',
          undefined,
          context.signal,
        );
        return { ok: true };
      });
    },
    async deliver(accountId: string, type: Target['type'], id: string, key: string) {
      if (!configured || !db || scope.signal.aborted || !uuid(accountId) || !uuid(id)) return;
      const signal = AbortSignal.any([scope.signal, AbortSignal.timeout(15000)]);
      try {
        const rows = await db(
          `mobile_push_devices?account_id=eq.${accountId}&enabled=eq.true&updated_at=gt.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}&select=id,token&limit=20`,
          'GET',
          undefined,
          signal,
        );
        if (!Array.isArray(rows)) return;
        for (const row of rows as PushDevice[]) {
          if (
            !object(row) ||
            typeof row.token !== 'string' ||
            typeof row.id !== 'string' ||
            !/^[a-f0-9]{64}$/.test(row.id)
          )
            continue;
          const result = await sender.send(
            row.token,
            { accountId, type, id, key: accountId + ':' + key },
            signal,
          );
          if (result === 'expired')
            await db(
              `mobile_push_devices?id=eq.${row.id}&token=eq.${encodeURIComponent(row.token)}`,
              'DELETE',
              undefined,
              signal,
            );
          else sent++;
        }
      } catch {
        failed++; /* Push failure must never fail a committed message. */
      }
    },
    health: () => ({ configured, sent, failed }),
    stop() {
      scope.abort();
      rates.clear();
    },
  };
}
