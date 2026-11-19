import http from 'node:http';
import os from 'node:os';
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

const ALICE: TestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@trono.test',
  password: 'Password!123',
  nickname: 'Alice',
};

const BOB: TestUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bob@trono.test',
  password: 'Password!123',
  nickname: 'Bob',
};

const USERS = [ALICE, BOB];
const FAKE_FINGERPRINT =
  '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF';

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
        if (!user) return sendJson(400, { error: 'invalid_grant' });
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
        const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
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

function deriveAnswerSdpFromOffer(offerSdp: string): string {
  const lines = offerSdp.split(/\r?\n/).filter((l) => l.length > 0);
  const out: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith('a=ssrc:') ||
      line.startsWith('a=ssrc-group:') ||
      line.startsWith('a=msid:')
    ) {
      continue;
    }
    if (line === 'a=setup:actpass' || line === 'a=setup:passive') {
      out.push('a=setup:active');
      continue;
    }
    if (line === 'a=sendonly' || line === 'a=sendrecv') {
      out.push('a=recvonly');
      continue;
    }
    out.push(line);
  }
  return out.join('\r\n') + '\r\n';
}

interface RemoteMLine {
  mid: string;
  kind: 'audio' | 'video';
  streamId: string;
  trackId: string;
  ssrc: number;
  rtxSsrc: number;
}

function buildRemoteOfferSdp(mLines: RemoteMLine[]): string {
  const mids = mLines.map((m) => m.mid).join(' ');
  const lines = [
    'v=0',
    'o=- 5550001 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mids}`,
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS *',
  ];

  for (const m of mLines) {
    if (m.kind === 'audio') {
      lines.push(
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=ice-ufrag:cfuser12',
        'a=ice-pwd:cfpassword12345678901234',
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${FAKE_FINGERPRINT}`,
        'a=setup:actpass',
        `a=mid:${m.mid}`,
        'a=sendonly',
        `a=msid:${m.streamId} ${m.trackId}`,
        'a=rtcp-mux',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10;useinbandfec=1',
        `a=ssrc:${m.ssrc} cname:cf-sfu`,
      );
    } else {
      lines.push(
        'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=ice-ufrag:cfuser12',
        'a=ice-pwd:cfpassword12345678901234',
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${FAKE_FINGERPRINT}`,
        'a=setup:actpass',
        `a=mid:${m.mid}`,
        'a=sendonly',
        `a=msid:${m.streamId} ${m.trackId}`,
        'a=rtcp-mux',
        'a=rtcp-rsize',
        'a=rtpmap:96 VP8/90000',
        'a=rtpmap:97 rtx/90000',
        'a=fmtp:97 apt=96',
        'a=rtcp-fb:96 goog-remb',
        'a=rtcp-fb:96 transport-cc',
        'a=rtcp-fb:96 ccm fir',
        'a=rtcp-fb:96 nack',
        'a=rtcp-fb:96 nack pli',
        `a=ssrc-group:FID ${m.ssrc} ${m.rtxSsrc}`,
        `a=ssrc:${m.ssrc} cname:cf-sfu`,
        `a=ssrc:${m.rtxSsrc} cname:cf-sfu`,
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

interface CfSession {
  id: string;
  localTracks: Map<string, { mid: string; trackName: string }>;
  remoteMLines: RemoteMLine[];
  nextMid: number;
  nextSsrc: number;
}

function createE2eCloudflareFetch() {
  const calls: Array<{ method: string; suffix: string; body: unknown }> = [];
  const sessions = new Map<string, CfSession>();
  let seq = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || 'GET').toUpperCase();
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined;
    const match = /\/v1\/apps\/[^/]+(\/.*)$/.exec(url);
    const suffix = match ? match[1] : url;
    calls.push({ method, suffix, body });

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (method === 'POST' && suffix === '/sessions/new') {
      const id = `cf-e2e-${++seq}`;
      sessions.set(id, {
        id,
        localTracks: new Map(),
        remoteMLines: [],
        nextMid: 0,
        nextSsrc: 1000,
      });
      return json({ sessionId: id });
    }

    const tracksNewMatch = /^\/sessions\/([^/]+)\/tracks\/new$/.exec(suffix);
    if (method === 'POST' && tracksNewMatch) {
      const sessionId = decodeURIComponent(tracksNewMatch[1]);
      const session = sessions.get(sessionId);
      if (!session) return json({ errorCode: 'not_found', errorDescription: 'Missing' }, 404);

      const reqTracks =
        (body?.tracks as Array<{
          location: 'local' | 'remote';
          mid?: string;
          trackName: string;
          sessionId?: string;
        }>) || [];
      const isRemote = reqTracks.some((t) => t.location === 'remote');

      if (!isRemote) {
        const offerSdp = String((body?.sessionDescription as { sdp?: string })?.sdp || '');
        const outTracks = reqTracks.map((t) => {
          const mid = String(t.mid ?? session.nextMid++);
          session.localTracks.set(mid, { mid, trackName: t.trackName });
          return { mid, trackName: t.trackName, location: 'local', status: 'active' };
        });
        return json({
          sessionDescription: { type: 'answer', sdp: deriveAnswerSdpFromOffer(offerSdp) },
          requiresImmediateRenegotiation: false,
          tracks: outTracks,
        });
      }

      const outTracks = reqTracks.map((t) => {
        const pubSession = t.sessionId ? sessions.get(t.sessionId) : undefined;
        const pubTrack = pubSession
          ? [...pubSession.localTracks.values()].find((item) => item.trackName === t.trackName)
          : undefined;
        if (!pubTrack) {
          return {
            trackName: t.trackName,
            sessionId: t.sessionId,
            errorCode: 'not_found_track_error',
            errorDescription: 'Track not found',
          };
        }
        const mid = String(session.nextMid++);
        const isAudio = t.trackName.startsWith('audio-') || t.trackName.startsWith('screen-audio-');
        const ssrc = session.nextSsrc++;
        const rtxSsrc = session.nextSsrc++;
        session.remoteMLines.push({
          mid,
          kind: isAudio ? 'audio' : 'video',
          streamId: `stream-${t.sessionId}`,
          trackId: `track-${t.trackName}`,
          ssrc,
          rtxSsrc,
        });
        return { mid, trackName: t.trackName, sessionId: t.sessionId, location: 'remote' };
      });
      return json({
        sessionDescription: { type: 'offer', sdp: buildRemoteOfferSdp(session.remoteMLines) },
        requiresImmediateRenegotiation: true,
        tracks: outTracks,
      });
    }

    if (method === 'PUT' && /^\/sessions\/[^/]+\/renegotiate$/.test(suffix)) {
      return json({});
    }

    if (method === 'PUT' && /^\/sessions\/[^/]+\/tracks\/update$/.test(suffix)) {
      return json({});
    }

    const closeMatch = /^\/sessions\/([^/]+)\/tracks\/close$/.exec(suffix);
    if (method === 'PUT' && closeMatch) {
      const sessionId = decodeURIComponent(closeMatch[1]);
      const session = sessions.get(sessionId);
      if (session) {
        const mids = (body?.tracks as Array<{ mid: string }>) || [];
        for (const item of mids) session.localTracks.delete(item.mid);
      }
      return json({ tracks: body?.tracks || [] });
    }

    return json({ errorCode: 'unhandled', errorDescription: `${method} ${suffix}` }, 404);
  };

  return { fetchImpl, calls, sessions };
}

test.describe('E2E: Voz e Transmissão de Tela com Cloudflare SFU', () => {
  let supabase: { url: string; close: () => Promise<void> };
  let web: { url: string; close: () => Promise<void> };
  let backend: BackendApplication;
  let backendUrl: string;
  let cf: ReturnType<typeof createE2eCloudflareFetch>;

  test.beforeEach(async () => {
    supabase = await startFakeSupabase();
    web = await startStaticWeb();
    cf = createE2eCloudflareFetch();
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
      sfuFetchImpl: cf.fetchImpl,
      sfuUsageFile: path.join(os.tmpdir(), `trono-e2e-voice-${Date.now()}.json`),
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

  test('publica tela + áudio atomicamente com keep-alive sink e transmite para espectador com sessões assimétricas', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext({ reducedMotion: 'reduce' });
    const bobCtx = await browser.newContext({ reducedMotion: 'reduce' });

    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      await alicePage.addInitScript((url: string) => {
        (window as unknown as { TRONO_BACKEND_URL?: string }).TRONO_BACKEND_URL = url;
        if (!navigator.mediaDevices) {
          Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
        }
        const fixture = { captures: [] as MediaStream[], cancelNext: false };
        Object.defineProperty(window, 'tronoScreenFixture', { value: fixture });
        navigator.mediaDevices.getDisplayMedia = async () => {
          if (fixture.cancelNext) {
            fixture.cancelNext = false;
            throw new DOMException('Seletor cancelado', 'NotAllowedError');
          }
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d');
          let hue = 0;
          const timer = window.setInterval(() => {
            if (!ctx) return;
            hue = (hue + 15) % 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 45%)`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }, 33);
          const stream = canvas.captureStream(30);
          const videoTrack = stream.getVideoTracks()[0];
          const origStop = videoTrack.stop.bind(videoTrack);
          videoTrack.stop = () => {
            window.clearInterval(timer);
            origStop();
          };

          const audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          const dst = audioCtx.createMediaStreamDestination();
          osc.frequency.value = 440;
          osc.connect(dst);
          osc.start();
          const audioTrack = dst.stream.getAudioTracks()[0];
          const origAudioStop = audioTrack.stop.bind(audioTrack);
          audioTrack.stop = () => {
            try {
              osc.stop();
              void audioCtx.close();
            } catch {}
            origAudioStop();
          };
          stream.addTrack(audioTrack);
          fixture.captures.push(stream);
          return stream;
        };
      }, backendUrl);

      await bobPage.addInitScript((url: string) => {
        (window as unknown as { TRONO_BACKEND_URL?: string }).TRONO_BACKEND_URL = url;
      }, backendUrl);

      const loginAndJoinVoice = async (page: typeof alicePage, user: TestUser) => {
        await page.goto(web.url, { waitUntil: 'domcontentloaded' });
        await page.locator('#authEmail').fill(user.email);
        await page.locator('#authPassword').fill(user.password);
        await page.locator('#authSubmit').click();

        const welcome = page.locator('[data-welcome-intro]');
        if (await welcome.isVisible().catch(() => false)) {
          await welcome.click().catch(() => {});
        }

        const voiceBtn = page.locator('[data-voice-channel="chat-livre"]');
        await expect(voiceBtn).toBeVisible();
        await voiceBtn.click();
        await expect(voiceBtn).toHaveAttribute('data-connected', 'true');
      };

      await loginAndJoinVoice(alicePage, ALICE);

      // Alice abre opções de tela e inicia compartilhamento com áudio
      const aliceShareBtn = alicePage.locator(
        'section[aria-label="Chamada da Corte"] [data-control="screenShareBtn"]',
      );
      await expect(aliceShareBtn).toBeVisible();
      await aliceShareBtn.click();

      const shareDialog = alicePage.locator('#screenOptionsDialog');
      await expect(shareDialog).toBeVisible();
      const shareAudioCheckbox = alicePage.locator('#shareAudio');
      if (!(await shareAudioCheckbox.isChecked())) {
        await shareAudioCheckbox.check();
      }
      await alicePage.locator('#screenOptionsConfirm').click();

      // 1. Keep-alive sink montado no DOM da Alice (2px x 2px, muted)
      const keepAlive = alicePage.locator('video[data-flx="voice.screen-share-keepalive"]');
      await expect(keepAlive).toBeAttached();
      const keepAliveBox = await keepAlive.evaluate((el) => {
        const video = el as HTMLVideoElement;
        return {
          width: video.style.width,
          height: video.style.height,
          muted: video.muted,
          hasStream: Boolean(video.srcObject),
        };
      });
      assertOrExpectKeepAlive(keepAliveBox);

      await expect
        .poll(() =>
          cf.calls.some(
            (call) =>
              call.suffix.endsWith('/tracks/new') &&
              publishedScreenKinds(call.body).includes('screen'),
          ),
        )
        .toBe(true);
      await loginAndJoinVoice(bobPage, BOB);

      // 2. Bob entra depois da publicação e escolhe assistir.
      const watchButton = bobPage
        .locator('[data-call-screen]')
        .getByRole('button', { name: 'Assistir transmissão' })
        .first();
      await expect(watchButton).toBeVisible();
      await watchButton.click();

      // Exige o offer/answer referente à tela, em vez da negociação inicial do microfone.
      await expect
        .poll(() =>
          cf.calls.some((call, index) => {
            if (!call.suffix.endsWith('/tracks/new')) return false;
            const body = call.body as { tracks?: Array<{ location: string; trackName: string }> };
            return (
              body.tracks?.some(
                (track) =>
                  track.location === 'remote' &&
                  track.trackName.startsWith('screen-') &&
                  !track.trackName.startsWith('screen-audio-'),
              ) &&
              cf.calls
                .slice(index + 1)
                .some((next) => next.suffix === call.suffix.replace('/tracks/new', '/renegotiate'))
            );
          }),
        )
        .toBe(true);

      // Verifica que houve publicação atômica de screen + screen-audio sem GET polling
      const getCalls = cf.calls.filter((c) => c.method === 'GET');
      expect(getCalls.length).toBe(0);

      const screenBatches = () =>
        cf.calls
          .filter((call) => call.suffix.endsWith('/tracks/new'))
          .map((call) => publishedScreenKinds(call.body))
          .filter((kinds) => kinds.length);
      expect(screenBatches()).toEqual([['screen', 'screen-audio']]);

      const switched = await alicePage.evaluate(async () => {
        const host = window as unknown as {
          tronoScreenFixture: { cancelNext: boolean; captures: MediaStream[] };
          TronoSocial: { switchScreenShare(): Promise<boolean> };
        };
        host.tronoScreenFixture.cancelNext = true;
        const cancelled = await host.TronoSocial.switchScreenShare();
        const wasStillLive = host.tronoScreenFixture.captures[0]
          .getTracks()
          .every((track) => track.readyState === 'live');
        const replaced = await host.TronoSocial.switchScreenShare();
        return {
          cancelled,
          wasStillLive,
          replaced,
          previousEnded: host.tronoScreenFixture.captures[0]
            .getTracks()
            .every((track) => track.readyState === 'ended'),
        };
      });
      expect(switched).toEqual({
        cancelled: false,
        wasStillLive: true,
        replaced: true,
        previousEnded: true,
      });
      expect(screenBatches()).toEqual([
        ['screen', 'screen-audio'],
        ['screen', 'screen-audio'],
      ]);

      const newSessions = cf.calls.filter((c) => c.suffix === '/sessions/new');
      // No máximo 1 publisher + 1 subscriber por participante ativo
      expect(newSessions.length).toBeLessThanOrEqual(4);

      // 3. Alice encerra o compartilhamento -> remove keep-alive sink e fecha tracks via /tracks/close
      const priorCloses = cf.calls.filter((call) => call.suffix.endsWith('/tracks/close')).length;
      await aliceShareBtn.click();
      await expect(keepAlive).toHaveCount(0);
      const released = await alicePage.evaluate(() => {
        const host = window as unknown as { tronoScreenFixture: { captures: MediaStream[] } };
        return host.tronoScreenFixture.captures.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        );
      });
      expect(released).toBe(true);
      await expect
        .poll(() => cf.calls.filter((c) => c.suffix.endsWith('/tracks/close')).length)
        .toBeGreaterThan(priorCloses);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });
});

function publishedScreenKinds(body: unknown): string[] {
  const tracks = (body as { tracks?: Array<{ location: string; trackName: string }> })?.tracks;
  return (tracks ?? []).flatMap((track) => {
    if (track.location !== 'local' || !track.trackName.startsWith('screen-')) return [];
    return [track.trackName.startsWith('screen-audio-') ? 'screen-audio' : 'screen'];
  });
}

function assertOrExpectKeepAlive(info: {
  width: string;
  height: string;
  muted: boolean;
  hasStream: boolean;
}) {
  expect(info.width).toBe('2px');
  expect(info.height).toBe('2px');
  expect(info.muted).toBe(true);
  expect(info.hasStream).toBe(true);
}
