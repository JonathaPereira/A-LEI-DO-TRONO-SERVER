// Test-only local guest backend for the real Electron protocol renderer.
'use strict';
const { expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
async function enterNativeGuest({ app, page, port, nickname = 'Convidado nativo' }) {
  const fixture = await startFixture({ port, allowedOrigins: ['https://a-lei-do-trono.surge.sh'] });
  try {
    await page.waitForLoadState('load');
    await app.evaluate(({ net }, base) => {
      const original = net.fetch.bind(net);
      global.__nativeGuestFetch = net.fetch;
      net.fetch = async (input, options) => {
        const response = await original(input, options);
        if (
          typeof input === 'string' &&
          input.startsWith('file:') &&
          input.includes('/_next/') &&
          input.endsWith('.js')
        ) {
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('content-type', 'application/javascript');
          return new Response(
            'window.TRONO_BACKEND_URL=' + JSON.stringify(base) + ';\n' + (await response.text()),
            { status: response.status, headers },
          );
        }
        return response;
      };
    }, fixture.base);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.getByRole('button', { name: 'Jogar como convidado', exact: true }).click();
      await page.locator('#guestNickname').fill(nickname);
      await page.getByRole('button', { name: 'Escolher um jogo', exact: true }).click();
      await expect(page.locator('#gamesScreen')).toBeVisible();
    } finally {
      await app.evaluate(({ net }) => {
        net.fetch = global.__nativeGuestFetch;
        delete global.__nativeGuestFetch;
      });
    }
    return fixture;
  } catch (error) {
    await fixture.stop();
    throw error;
  }
}
module.exports = { enterNativeGuest };
