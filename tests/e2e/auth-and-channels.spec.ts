import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { test, expect } from '@playwright/test';
import { createApplication, type BackendApplication } from '../../apps/server/src/app.ts';

interface TestUser {
  id: string;
  email: string;
  password: string;
  nickname: string;
}

const USERS: TestUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@trono.test',
    password: 'Password!123',
    nickname: 'Alice',
  },
];

function makeJwt(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

async function startFakeSupabase(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const sendJson = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
        const body = rawBody ? (JSON.parse(rawBody) as { email?: string; password?: string }) : {};
        const user = USERS.find((u) => u.email === body.email && u.password === body.password);
        if (!user) {
          return sendJson(400, {
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
          });
        }
        return sendJson(200, {
          access_token: makeJwt(user.id),
          refresh_token: `refresh-${user.id}`,
        });
      }

      if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const claims = JSON.parse(
          Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'),
        ) as { sub?: string };
        const user = USERS.find((u) => u.id === claims.sub);
        if (!user) return sendJson(401, { error: 'invalid_token' });
        return sendJson(200, {
          id: user.id,
          email: user.email,
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          is_anonymous: false,
        });
      }

      if (req.method === 'GET' && url.pathname === '/rest/v1/profiles') {
        const idEq = url.searchParams.get('id') || '';
        const id = idEq.replace(/^eq\./, '');
        const user = USERS.find((u) => u.id === id);
        if (!user) return sendJson(200, []);
        return sendJson(200, [
          {
            id: user.id,
            nickname: user.nickname,
            community_role: 'member',
            avatar_preset: 'crown',
            avatar_file_id: null,
          },
        ]);
      }

      sendJson(404, { error: 'not_found' });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function startStaticWeb(): Promise<{ url: string; close: () => Promise<void> }> {
  const outDir = path.resolve(process.cwd(), 'apps/web/out');
  const app = express();
  app.use(express.static(outDir, { extensions: ['html'] }));
  app.use((_req, res) => {
    res.sendFile(path.join(outDir, 'index.html'));
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('E2E: Autenticação e Navegação de Canais', () => {
  let supabase: { url: string; close: () => Promise<void> };
  let web: { url: string; close: () => Promise<void> };
  let backend: BackendApplication;
  let backendUrl: string;

  test.beforeEach(async () => {
    supabase = await startFakeSupabase();
    web = await startStaticWeb();
    backend = createApplication({
      authEnv: {
        ...process.env,
        AUTH_REQUIRED: 'true',
        AUTH_TEST_LOCAL: 'true',
        APP_URL: web.url,
        AUTH_ALLOWED_ORIGINS: web.url,
        SUPABASE_URL: supabase.url,
        SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
      },
      sfuEnv: {
        CLOUDFLARE_REALTIME_ENABLED: 'true',
        CLOUDFLARE_REALTIME_APP_ID: 'app-e2e',
        CLOUDFLARE_REALTIME_API_TOKEN: 'tok-e2e',
      },
      sfuUsageFile: `/tmp/trono-e2e-auth-${Date.now()}.json`,
    });
    await new Promise<void>((resolve) => backend.server.listen(0, '127.0.0.1', resolve));
    const port = (backend.server.address() as AddressInfo).port;
    backendUrl = `http://127.0.0.1:${port}`;
  });

  test.afterEach(async () => {
    await backend?.close();
    await web?.close();
    await supabase?.close();
  });

  test('autentica conta no frontend estático e alterna canais da comunidade via WebSocket', async ({
    page,
  }) => {
    await page.addInitScript((url: string) => {
      (window as unknown as { TRONO_BACKEND_URL?: string }).TRONO_BACKEND_URL = url;
    }, backendUrl);

    await page.goto(web.url, { waitUntil: 'domcontentloaded' });

    await page.locator('#authEmail').fill(USERS[0].email);
    await page.locator('#authPassword').fill(USERS[0].password);
    await page.locator('#authSubmit').click();

    const welcome = page.locator('[data-welcome-intro]');
    if (await welcome.isVisible().catch(() => false)) {
      await welcome.click().catch(() => {});
    }

    const geralChannel = page.locator('[data-channel="chat-livre"]');
    const jogosChannel = page.locator('[data-channel="chat-jogos"]');
    const voiceChannel = page.locator('[data-voice-channel="chat-livre"]');

    await expect(geralChannel).toBeVisible();
    await expect(jogosChannel).toBeVisible();
    await expect(voiceChannel).toBeVisible();

    await jogosChannel.click();
    await expect(jogosChannel).toHaveAttribute('data-active', 'true');
    await expect(jogosChannel).toHaveAttribute('aria-current', 'page');

    await geralChannel.click();
    await expect(geralChannel).toHaveAttribute('data-active', 'true');
    await expect(geralChannel).toHaveAttribute('aria-current', 'page');
  });
});
