import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../../apps/server/src/app.ts';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const EMAIL = 'android-native@example.test';

function createJwtToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      session_id: SESSION_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.android-fixture-sig`;
}

const supabaseStub = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'POST' && url === '/auth/v1/token') {
    const token = createJwtToken();
    res.end(
      JSON.stringify({
        access_token: token,
        refresh_token: 'android-fixture-refresh-token',
      }),
    );
    return;
  }

  if (req.method === 'GET' && url === '/auth/v1/user') {
    res.end(
      JSON.stringify({
        id: USER_ID,
        email: EMAIL,
        email_confirmed_at: new Date().toISOString(),
        is_anonymous: false,
      }),
    );
    return;
  }

  if (req.method === 'GET' && url === '/rest/v1/profiles') {
    res.end(
      JSON.stringify([
        {
          id: USER_ID,
          nickname: 'Android Teste',
          community_role: 'member',
          avatar_preset: 'crown',
          avatar_file_id: null,
        },
      ]),
    );
    return;
  }

  if (req.method === 'POST' && url === '/auth/v1/logout') {
    res.end(JSON.stringify({}));
    return;
  }

  if (url.startsWith('/rest/v1/')) {
    res.end(JSON.stringify([]));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

async function main() {
  await new Promise<void>((resolve, reject) => {
    supabaseStub.once('error', reject);
    supabaseStub.listen(0, '127.0.0.1', () => {
      supabaseStub.removeListener('error', reject);
      resolve();
    });
  });

  const stubPort = (supabaseStub.address() as AddressInfo).port;
  const backend = createApplication({
    authEnv: {
      ...process.env,
      AUTH_TEST_LOCAL: 'true',
      SUPABASE_URL: `http://127.0.0.1:${stubPort}`,
      SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
      APP_URL: 'http://127.0.0.1:10000',
      AUTH_ALLOWED_ORIGINS: 'https://localhost,https://a-lei-do-trono.surge.sh',
    },
  });

  await new Promise<void>((resolve, reject) => {
    backend.server.once('error', reject);
    backend.server.listen(10000, '127.0.0.1', () => {
      backend.server.removeListener('error', reject);
      resolve();
    });
  });

  console.log('Android fixture ready');

  const shutdown = async () => {
    await backend.close();
    await new Promise<void>((resolve) => supabaseStub.close(() => resolve()));
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
