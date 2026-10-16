'use strict';
// Test-only: inject the fixture URL into the local file response before the
// Next bootstrap executes. Electron custom protocols bypass the
// Playwright routing/init-script hooks; no production test flag is introduced.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
async function exerciseSplendor({ app, page, frontend, screenshot, onPhase = () => {} }) {
  const step = async (name, run, timeout = 15000) => {
    onPhase('Splendor: ' + name);
    let timer;
    try {
      return await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Native Splendor timeout: ' + name)), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  onPhase('Splendor: start local fixture');
  const fixture = await startFixture({
    port: 10844,
    loveLetterSeed: 1,
    allowedOrigins: ['https://a-lei-do-trono.surge.sh'],
  });
  try {
    const email = 'installed-splendor@example.test';
    await fixture.call('signup', { email, nickname: 'Mercador instalado', password: 'Senha12!' });
    await fixture.call('verify', { token_hash: [...fixture.links.keys()].at(-1), type: 'signup' });
    const login = await fixture.call('login', { email, password: 'Senha12!' });
    assert.equal(login.status, 200, 'Native fixture login must succeed before browser injection');
    const data = login.data;
    await fs.access(path.join(frontend, '_next'));
    await app.evaluate(({ net }, base) => {
      const original = net.fetch.bind(net);
      global.__mnSplendorTestFetch = net.fetch;
      net.fetch = async (input, options) => {
        const response = await original(input, options);
        if (
          typeof input === 'string' &&
          input.startsWith('file:') &&
          input.includes('/_next/') &&
          input.endsWith('.js')
        ) {
          const source =
              'window.TRONO_BACKEND_URL=' + JSON.stringify(base) + ';\n' + (await response.text()),
            headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('content-type', 'application/javascript');
          return new Response(source, { status: response.status, headers });
        }
        return response;
      };
    }, fixture.base);
    await page.evaluate((data) => {
      sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
      localStorage.setItem('tronoMusicEnabled', '0');
      localStorage.setItem('tronoSfxEnabled', '0');
    }, data);
    await step('reload local document', () => page.reload({ waitUntil: 'domcontentloaded' }), 25000);
    await step('load local controllers', () => page.waitForFunction(() => window.TronoAuth?.ready));
    await step('restore local test session', () => page.evaluate(() => window.TronoAuth.ready));
    if (!(await page.evaluate(() => !!window.TronoAuth.user)))
      throw Error(
        'Installed fixture session ' +
          JSON.stringify(
            await page.evaluate(() => ({
              backend: window.TronoNetwork.BACKEND_HTTP,
              hasSession: !!sessionStorage.getItem('mn-auth-session-v1'),
              message: document.querySelector('#authMessage')?.textContent,
            })),
          ),
      );
    onPhase('Splendor: open native game');
    await page.locator('[data-desktop-route=game]').click();
    await page.locator('#playSplendor').click();
    await page.locator('#splendorPlayerCount').selectOption('4');
    await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
    await expect(page.locator('.sp-seats')).toBeVisible();
    await page.getByRole('button', { name: 'Completar com bots e começar' }).click();
    await expect(page.locator('.sp-market-row')).toHaveCount(3);
    await expect(page.locator('.sp-market .sp-card')).toHaveCount(12);
    await expect(page.locator('.sp-noble')).toHaveCount(5);
    await expect(page.locator('.sp-player')).toHaveCount(4);
    await expect(page.locator('[data-token="0"]')).toBeEnabled({ timeout: 18000 });
    const before = await page.evaluate(() => window.TronoSplendor.room.state.revision);
    for (const color of [0, 1, 2]) await page.locator('[data-token="' + color + '"]').click();
    await page.locator('#splendorTake').click();
    await expect
      .poll(() => page.evaluate(() => window.TronoSplendor.room.state.revision))
      .toBeGreaterThan(before);
    if (screenshot) await page.screenshot({ path: screenshot });
    onPhase('native Love Letter session');
    await require('./desktop-love-letter-flow').exerciseLoveLetter({
      page,
      screenshot: screenshot?.replace('splendor', 'love-letter'),
    });
  } finally {
    await step(
      'restore protocol',
      () =>
        app.evaluate(({ net }) => {
          if (global.__mnSplendorTestFetch) {
            net.fetch = global.__mnSplendorTestFetch;
            delete global.__mnSplendorTestFetch;
          }
        }),
      3000,
    ).catch(() => {});
    await fixture.stop();
  }
}
module.exports = { exerciseSplendor };
