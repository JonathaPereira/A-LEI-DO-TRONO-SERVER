'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  express = require('express'),
  WebSocket = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
async function peer(base, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws'),
    messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const wait = async (predicate) => {
    for (let n = 0; n < 500; n++) {
      const m = messages.findLast(predicate);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('Missing Similo peer packet');
  };
  const send = (m) => ws.send(JSON.stringify({ type: 'similo', ...m }));
  ws.send(JSON.stringify({ type: 'authenticate', access_token: token }));
  await wait((m) => m.type === 'auth-result' && m.ok);
  return { ws, messages, send, wait };
}
test(
  'Similo eight-person table keeps seven real votes inside the card and all voter names accessible',
  { timeout: 60000 },
  async () => {
    const server = await new Promise((resolve) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10872, appOrigin: origin, similoSeed: 1 }),
      peers = [];
    let browser, context;
    try {
      const users = [];
      for (let i = 0; i < 8; i++) {
        const email = `similo-crowd-${i}@example.test`;
        // Seed only the disposable account provider; login and socket authorization stay real.
        fixture.users.set(email, {
          id: require('node:crypto').randomUUID(),
          email,
          nickname: 'Pessoa ' + i,
          password: 'Senha12!',
          email_confirmed_at: new Date().toISOString(),
        });
        const login = await fixture.call('login', { email, password: 'Senha12!' });
        assert.equal(login.status, 200);
        users.push(login.data);
      }
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox'],
      });
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        reducedMotion: 'reduce',
      });
      await context.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === 'similo-mn.surge.sh')
          return route.fulfill({
            status: 200,
            contentType: 'image/webp',
            headers: { 'access-control-allow-origin': '*' },
            body: await fs.readFile(path.resolve('games/similo/art', u.pathname.slice(1))),
          });
        return u.hostname === '127.0.0.1' ? route.continue() : route.abort();
      });
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
        },
        { base: fixture.base, data: users[0] },
      );
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.setDefaultTimeout(8000);
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.locator('[data-game="similo"]').click();
      const screen = page.locator('#similoScreen');
      await screen.getByLabel('Vagas na mesa').selectOption('8');
      await screen.getByRole('button', { name: 'Criar mesa online' }).click();
      await expect(screen.getByRole('heading', { name: /Mesa [A-F0-9]+/ })).toBeVisible();
      const id = await page.evaluate(() => window.TronoSimilo.room.id);
      for (let i = 1; i < 8; i++) {
        const p = await peer(fixture.base, users[i].session.access_token);
        peers.push(p);
        p.send({ action: 'join', roomId: id });
        await p.wait((m) => m.type === 'similo-state');
      }
      await expect(screen.locator('strong').filter({ hasText: /^Pessoa 7$/ })).toBeVisible();
      await screen.getByRole('button', { name: 'Começar partida', exact: true }).click();
      await expect(screen.locator('[data-phase="clue"]')).toBeVisible();
      await screen
        .getByRole('button', { name: /Escolher pista/ })
        .first()
        .click();
      await screen.getByRole('button', { name: 'Jogar pista vertical', exact: true }).click();
      await expect(screen.locator('[data-phase="vote"]')).toBeVisible();
      const room = await page.evaluate(() => window.TronoSimilo.room),
        safe = room.state.board.find((id) => id !== room.state.secretId);
      let revision = room.revision;
      for (const p of peers) {
        p.send({
          action: 'move',
          revision,
          move: { kind: 'vote', selected: [safe], confirmed: true },
        });
        const ack = await p.wait((m) => m.type === 'similo-state' && m.room.revision > revision);
        revision = ack.room.revision;
      }
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Object.values(window.TronoSimilo.room.state.votes).filter((v) => v.confirmed).length,
          ),
        )
        .toBe(7);
      const card = screen.locator(`[data-testid="similo-board"] [data-card-id="${safe}"]`);
      for (const [width, height] of [
        [1280, 720],
        [1024, 768],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        if (width <= 1000) {
          const hide = page.getByRole('button', { name: 'Ocultar lista de membros', exact: true });
          if (await hide.isVisible()) await hide.click();
        }
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const geometry = await card.evaluate((n) => {
          const r = n.getBoundingClientRect(),
            caption = n.querySelector('strong').parentElement.getBoundingClientRect(),
            markers = [...n.querySelectorAll('[aria-label^="Voto de "],[aria-label^="Mais "]')];
          return {
            width: r.width,
            height: r.height,
            bottom: r.bottom,
            captionTop: caption.top,
            markers: markers.map((m) => ({
              top: m.getBoundingClientRect().top,
              bottom: m.getBoundingClientRect().bottom,
            })),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert(geometry.markers.length > 0);
        assert(
          geometry.markers.every((m) => m.bottom <= geometry.captionTop),
          'Vote markers must not cover the name or leave the card: ' + JSON.stringify(geometry),
        );
        assert(!geometry.overflow);
      }
      await expect(card.getByLabel(/^Mais 4 votos:/)).toBeVisible();
      for (const i of [4, 5, 6, 7])
        await expect(card.getByLabel(/^Mais 4 votos:/)).toHaveAttribute(
          'aria-label',
          new RegExp('Pessoa ' + i),
        );
      assert.deepEqual(errors, []);
      await fs.mkdir('artifacts/similo/screens', { recursive: true });
      await page.screenshot({ path: 'artifacts/similo/screens/eight-person-phone.png' });
    } finally {
      for (const p of peers) p.ws.terminate();
      await context?.close();
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
