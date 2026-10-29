import type { IncomingHttpHeaders } from 'node:http';
import type { Express, Response, NextFunction } from 'express';
import type { ApiRequest } from './http-api';
import type { BackendAccount } from './auth-contract';
import { cleanProfile } from './profile-customization.ts';
import { passwordChecks, validPassword } from '../src/lib/auth/password.ts';
import { validNickname } from '../src/lib/auth/nickname.ts';
import { authError, authUnavailable, object, policyMessage } from './auth-errors.ts';
import { createAuthProvider } from './auth-provider.ts';
import {
  readVerifiedUser,
  readAccountProfile,
  readSessionClaims,
  readCredentials,
  verifiedAccount,
  publicAccount,
  validToken,
} from './auth-protocol.ts';
export { passwordChecks, validPassword, validNickname, policyMessage, authError };
interface AuthOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  onRevoke?: (event: { userId: string; sessionId?: string; all: boolean }) => void;
  onProfileChange?: (account: BackendAccount) => void;
}
function respond(res: Response, error: unknown) {
  if (res.destroyed || res.writableEnded) return;
  const safe =
    object(error) &&
    typeof error.status === 'number' &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599;
  res.status(safe ? (error.status as number) : 503).json({
    error: {
      code: object(error) && typeof error.code === 'string' ? error.code : 'AUTH_UNAVAILABLE',
      message:
        safe && typeof error.message === 'string'
          ? error.message
          : 'Não foi possível acessar sua conta agora.',
    },
  });
}
export function createAuth({
  env = process.env,
  fetchImpl = globalThis.fetch,
  onRevoke = () => {},
  onProfileChange = () => {},
}: AuthOptions = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '');
  let site: URL | null = null,
    origin: string | null = null;
  try {
    site = new URL(env.APP_URL || '');
    origin = site.origin;
  } catch {}
  const configured =
    Boolean(/^https:\/\/[^/]+$/.test(url) && key && site?.protocol === 'https:') ||
    Boolean(
      env.AUTH_TEST_LOCAL === 'true' &&
      /^http:\/\/127\.0\.0\.1:\d+$/.test(url) &&
      key &&
      site?.hostname === '127.0.0.1',
    );
  const required = env.AUTH_REQUIRED !== 'false'; // Default is closed. false is only for deliberate legacy rollout/tests.
  const allowedOrigins = new Set(
    [
      origin,
      'https://localhost', // Bundled Android origin; requests still require an authenticated account.
      ...String(env.AUTH_ALLOWED_ORIGINS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ].filter((value): value is string => !!value),
  );
  const rates = new Map<string, { count: number; until: number }>();
  const lifetime = new AbortController();
  const installed = new WeakSet<Express>();
  const provider = createAuthProvider({ url, key, configured, signal: lifetime.signal, fetchImpl });
  const { request: upstream, assertAvailable: assertConfigured } = provider;
  const rateCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rates) if (v.until <= now) rates.delete(k);
  }, 60_000);
  rateCleanup.unref();
  const health = () => ({ required, configured });
  function limit(req: ApiRequest, body: Record<string, unknown>, kind: string, max = 10) {
    const now = Date.now(),
      keys = [`${kind}:ip:${req.ip || req.socket.remoteAddress}`];
    if (['signup', 'recover'].includes(kind))
      keys.push(
        `${kind}:email:${String(body.email || '')
          .trim()
          .toLowerCase()}`,
      );
    for (const k of keys) {
      let r = rates.get(k);
      if (!r || r.until <= now) {
        r = { count: 0, until: now + 60_000 };
        rates.set(k, r);
      }
      r.count++;
      if (r.count > max)
        throw authError(
          'AUTH_RATE_LIMIT',
          'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
          429,
        );
    }
  }
  function tokenFrom(req: { headers: IncomingHttpHeaders }) {
    const m = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!m) throw authError('AUTH_REQUIRED', 'Entre na sua conta para continuar.', 401);
    return m[1];
  }
  async function identity(token: string, signal?: AbortSignal): Promise<BackendAccount> {
    if (!validToken(token))
      throw authError('AUTH_REQUIRED', 'Entre na sua conta para continuar.', 401);
    // Provider verification precedes all local token inspection.
    const user = readVerifiedUser(await upstream('/auth/v1/user', { token, signal }));
    const profile = readAccountProfile(
      await upstream('/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=*', {
        token,
        signal,
      }),
      user.id,
    );
    return verifiedAccount(user, profile, readSessionClaims(token, user.id));
  }
  async function sessionPayload(data: unknown, signal: AbortSignal) {
    const credentials = readCredentials(data),
      user = await identity(credentials.access_token, signal);
    return {
      session: { ...credentials, expires_at: Math.floor(user.expiresAt / 1000) },
      user: publicAccount(user),
    };
  }
  function emailFrom(body: Record<string, unknown>) {
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    if (email.length > 254 || !/^\S+@[^\s@]+\.[^\s@]+$/.test(email))
      throw authError('INVALID_EMAIL', 'Informe um e-mail válido.');
    return email;
  }
  function requirePassword(body: Record<string, unknown>) {
    if (typeof body?.password !== 'string' || !validPassword(body.password))
      throw authError(
        'WEAK_PASSWORD',
        Buffer.byteLength(String(body?.password || ''), 'utf8') > 72
          ? 'A senha deve ter no máximo 72 bytes. Evite uma senha tão longa.'
          : policyMessage,
      );
    return body.password;
  }
  function install(app: Express, express: Pick<typeof import('express'), 'json'>) {
    if (installed.has(app)) return;
    installed.add(app);
    app.use(
      '/auth',
      (req: ApiRequest, res: Response, next: NextFunction) => {
        res.set({
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        });
        const origin = req.headers.origin;
        if (origin && !allowedOrigins.has(origin)) {
          res
            .status(403)
            .json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origem não autorizada.' } });
          return;
        }
        if (origin) {
          res.set({
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          });
          res.vary('Origin');
        }
        if (lifetime.signal.aborted) {
          respond(res, authUnavailable());
          return;
        }
        if (req.method === 'OPTIONS') {
          res.sendStatus(204);
          return;
        }
        next();
      },
      express.json({ limit: '16kb' }),
    );
    function route(
      method: 'get' | 'post',
      path: string,
      fn: (req: ApiRequest, body: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>,
      kind = path,
      max = 10,
    ) {
      app[method]('/auth/' + path, async (req: ApiRequest, res: Response) => {
        const client = new AbortController(),
          signal = AbortSignal.any([lifetime.signal, client.signal]);
        const close = () => {
          if (!res.writableEnded) client.abort();
        };
        res.once('close', close);
        try {
          assertConfigured();
          const body = req.body === undefined ? {} : req.body;
          if (!object(body)) throw authError('INVALID_REQUEST', 'Dados inválidos.');
          limit(req, body, kind, max);
          const value = await fn(req, body, signal);
          if (!signal.aborted && !res.destroyed && !res.writableEnded) res.json(value);
          else if (lifetime.signal.aborted) respond(res, authUnavailable());
        } catch (error) {
          respond(res, error);
        } finally {
          res.removeListener('close', close);
        }
      });
    }
    route(
      'post',
      'signup',
      async (_req, body) => {
        const email = emailFrom(body),
          password = requirePassword(body),
          nickname = String(body.nickname || '')
            .trim()
            .normalize('NFKC');
        if (!validNickname(nickname))
          throw authError(
            'INVALID_NICKNAME',
            'Use um apelido de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.',
          );
        // Supabase confirmation remains required; no admin/service_role credential is used here.
        const data = await upstream(
          `/auth/v1/signup?redirect_to=${encodeURIComponent(site!.href)}`,
          { method: 'POST', body: { email, password, data: { nickname } } },
        );
        if (!object(data)) throw authUnavailable();
        if (data.access_token)
          throw authError(
            'EMAIL_CONFIRMATION_REQUIRED',
            'Confirmação de e-mail precisa estar habilitada para concluir o acesso.',
            503,
          );
        return {
          message:
            'Confira seu e-mail para confirmar o cadastro. Se já tiver uma conta, entre ou recupere sua senha.',
        };
      },
      'signup',
      5,
    );
    route('post', 'login', async (_req, body, signal) => {
      const email = emailFrom(body);
      if (typeof body.password !== 'string' || !body.password || body.password.length > 1024)
        throw authError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
      return sessionPayload(
        await upstream('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email, password: body.password },
          signal,
        }),
        signal,
      );
    });
    route(
      'post',
      'refresh',
      async (_req, body, signal) => {
        if (!validToken(body.refresh_token))
          throw authError('AUTH_REQUIRED', 'Entre novamente na sua conta.', 401);
        return sessionPayload(
          await upstream('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: body.refresh_token },
            signal,
          }),
          signal,
        );
      },
      'refresh',
      30,
    );
    route(
      'post',
      'recover',
      async (_req, body) => {
        const email = emailFrom(body),
          redirect = new URL(site!.href);
        redirect.searchParams.set('auth', 'recovery');
        try {
          await upstream(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.href)}`, {
            method: 'POST',
            body: { email },
          });
        } catch (e) {
          if (!object(e) || (e.status !== 401 && e.code !== 'INVALID_CREDENTIALS')) throw e;
        }
        return {
          message:
            'Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha.',
        };
      },
      'recover',
      5,
    );
    route('post', 'verify', async (_req, body) => {
      const { token_hash, type } = body;
      if (
        typeof token_hash !== 'string' ||
        !token_hash ||
        token_hash.length > 512 ||
        (type !== 'recovery' && type !== 'signup' && type !== 'email')
      )
        throw authError('RECOVERY_INVALID', 'Link inválido. Solicite um novo e-mail.', 401);
      const data = await upstream('/auth/v1/verify', {
        method: 'POST',
        body: { token_hash, type },
      });
      if (!object(data)) throw authUnavailable();
      if (type === 'recovery') {
        if (!validToken(data.access_token))
          throw authError('RECOVERY_INVALID', 'Este link expirou. Solicite outro link.', 401);
        return { recovery_token: data.access_token };
      }
      // Confirming a registration does not automatically keep a login session.
      if (validToken(data.access_token))
        await upstream('/auth/v1/logout?scope=local', {
          method: 'POST',
          token: data.access_token,
        }).catch(() => {});
      return { message: 'E-mail confirmado. Entre com sua senha.' };
    });
    route(
      'post',
      'reset',
      async (req, body, signal) => {
        const password = requirePassword(body),
          token = tokenFrom(req),
          account = await identity(token, signal);
        await upstream('/auth/v1/user', { method: 'PUT', token, body: { password } });
        onRevoke({ userId: account.id, all: true });
        await upstream('/auth/v1/logout?scope=global', { method: 'POST', token });
        return { message: 'Senha atualizada. Entre novamente com a nova senha.' };
      },
      'reset',
      5,
    );
    route(
      'get',
      'me',
      async (req, _body, signal) => ({
        user: publicAccount(await identity(tokenFrom(req), signal)),
      }),
      'me',
      60,
    );
    route(
      'post',
      'profile',
      async (req, body, signal) => {
        const token = tokenFrom(req),
          nickname = String(body.nickname || '')
            .trim()
            .normalize('NFKC');
        await identity(token, signal);
        if (!validNickname(nickname))
          throw authError(
            'INVALID_NICKNAME',
            'Use um apelido de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.',
          );
        const preset = String(body.avatar_preset || 'crown'),
          file = body.avatar_file_id || null;
        if (file && (typeof file !== 'string' || !/^[0-9a-f-]{36}$/i.test(file)))
          throw authError('INVALID_AVATAR', 'Foto inválida.');
        if (body.personalization !== undefined)
          await upstream('/rest/v1/rpc/save_member_profile', {
            method: 'POST',
            token,
            body: {
              p_nickname: nickname,
              p_preset: preset,
              p_file: file,
              p_data: cleanProfile(body.personalization),
            },
          });
        else
          await upstream('/rest/v1/rpc/update_chat_profile', {
            method: 'POST',
            token,
            body: { p_nickname: nickname, p_preset: preset, p_file: file },
          });
        const user = await identity(token, lifetime.signal);
        onProfileChange(user);
        return { user: publicAccount(user) };
      },
      'profile',
      15,
    );
    route('post', 'logout', async (req, _body, signal) => {
      const token = tokenFrom(req),
        account = await identity(token, signal);
      await upstream('/auth/v1/logout?scope=local', { method: 'POST', token });
      onRevoke({ userId: account.id, sessionId: account.sessionId, all: !account.sessionId });
      return { ok: true };
    });
    app.use('/auth', (err: unknown, _req: ApiRequest, res: Response, next: NextFunction) => {
      if (!err) return next();
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Dados inválidos.' } });
    });
  }
  return {
    stop() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      clearInterval(rateCleanup);
      rates.clear();
    },
    required,
    configured,
    health,
    identity,
    install,
    allowedOrigins,
    tokenFrom,
    request: (
      token: string,
      path: string,
      method: 'GET' | 'POST' = 'GET',
      body?: unknown,
      signal?: AbortSignal,
    ) => upstream(path, { token, method, body, signal }),
  };
}
