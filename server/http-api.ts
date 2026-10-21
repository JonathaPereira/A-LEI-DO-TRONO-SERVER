import type { Express, Request, RequestHandler, Response, NextFunction } from 'express';
import type { AuthGateway, BackendAccount } from './auth-contract';

export type ApiRequest = Request<Record<string, string>, unknown, unknown>;
export interface AccountContext {
  readonly token: string;
  readonly account: BackendAccount;
  readonly signal: AbortSignal;
}
export const apiError = (code: string, message: string, status = 400) =>
  Object.assign(Error(message), { code, status });
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Shared HTTP boundary; domain handlers receive a verified account and opaque request data. */
export function installAccountApi({
  app,
  express,
  base,
  auth,
  signal,
  code,
  message,
}: {
  app: Express;
  express: Pick<typeof import('express'), 'json'>;
  base: string;
  auth: AuthGateway;
  signal: AbortSignal;
  code: string;
  message: string;
}) {
  const contexts = new WeakMap<ApiRequest, AccountContext>();
  const unavailable = () => apiError(code, message, 503);
  function respond(res: Response, error: unknown) {
    if (res.destroyed || res.writableEnded) return;
    let status = 503,
      text = message;
    if (
      object(error) &&
      typeof error.status === 'number' &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      status = error.status;
      if (typeof error.message === 'string') text = error.message;
    }
    res.status(status).json({
      error: {
        code: object(error) && typeof error.code === 'string' ? error.code : code,
        message: text,
      },
    });
  }
  const authenticate: RequestHandler<Record<string, string>, unknown, unknown> = async (
    req,
    res,
    next,
  ) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const origin = req.headers.origin;
    if (origin && !auth.allowedOrigins.has(origin)) {
      respond(res, apiError('ORIGIN_FORBIDDEN', 'Origem não autorizada.', 403));
      return;
    }
    if (origin) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.vary('Origin');
    }
    if (signal.aborted) {
      respond(res, unavailable());
      return;
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    const client = new AbortController(),
      current = AbortSignal.any([signal, client.signal]);
    const close = () => {
      if (!res.writableEnded) client.abort();
      cleanup();
    };
    const cleanup = () => {
      contexts.delete(req);
      res.removeListener('close', close);
      res.removeListener('finish', cleanup);
    };
    res.once('close', close);
    res.once('finish', cleanup);
    try {
      const token = auth.tokenFrom(req),
        account = await auth.identity(token, current);
      if (current.aborted) throw unavailable();
      contexts.set(req, { token, account, signal: current });
      next();
    } catch (error) {
      cleanup();
      respond(res, error);
    }
  };
  app.use(base, authenticate, express.json({ limit: '8kb' }));
  app.use(base, (error: unknown, _req: ApiRequest, res: Response, next: NextFunction) => {
    if (!error) return next();
    respond(res, apiError('INVALID_REQUEST', 'Dados inválidos.'));
  });
  return function route(
    method: 'get' | 'post' | 'delete',
    path: string,
    handler: (req: ApiRequest, identity: AccountContext) => unknown | Promise<unknown>,
  ) {
    app[method](base + path, async (req: ApiRequest, res: Response) => {
      try {
        const identity = contexts.get(req);
        if (!identity || identity.signal.aborted) throw unavailable();
        const value = await handler(req, identity);
        if (identity.signal.aborted) throw unavailable();
        if (!res.destroyed && !res.writableEnded) res.json(value);
      } catch (error) {
        respond(res, error);
      }
    });
  };
}
