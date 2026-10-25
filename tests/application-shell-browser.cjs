'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'account modal keeps its form inside the dialog at desktop and phone sizes',
  { timeout: 30000 },
  async () => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11992, appOrigin: origin });
    let browser, page;
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
      }, fixture.base);
      page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Acesso à conta', exact: true });
      await expect(dialog).toBeVisible();
      await fs.mkdir('artifacts/frontend-reset/auth-regression', { recursive: true });
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        const geometry = await dialog.evaluate((n) => {
          const box = n.getBoundingClientRect(),
            input = n.querySelector('input[type=email]').getBoundingClientRect();
          return {
            width: box.width,
            left: box.left,
            right: box.right,
            clientWidth: n.clientWidth,
            scrollWidth: n.scrollWidth,
            inputLeft: input.left,
            inputRight: input.right,
          };
        });
        await page.screenshot({
          path: 'artifacts/frontend-reset/auth-regression/modal-' + width + '.png',
        });
        assert(geometry.width >= (width > 600 ? 400 : width - 48), JSON.stringify(geometry));
        assert(geometry.left >= 0 && geometry.right <= width, JSON.stringify(geometry));
        assert(geometry.scrollWidth <= geometry.clientWidth + 1, JSON.stringify(geometry));
        assert(
          geometry.inputLeft >= geometry.left + 12 && geometry.inputRight <= geometry.right - 12,
          JSON.stringify(geometry),
        );
      }
    } finally {
      if (page) {
        await fs.mkdir('artifacts/frontend-reset/auth-regression', { recursive: true });
        await page
          .screenshot({ path: 'artifacts/frontend-reset/auth-regression/current.png' })
          .catch(() => {});
      }
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  'leaving the Court returns to communication without asking a signed-in account to log in',
  { timeout: 30000 },
  async () => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11992, appOrigin: origin });
    let browser, page;
    try {
      const email = 'court-return@example.test',
        password = 'Senha12!';
      await fixture.call('signup', { email, nickname: 'Conta da Corte', password });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
      }, fixture.base);
      page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('E-mail', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      const account = await page.evaluate(() => window.TronoAuth.user.id);
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.locator('button[data-game="throne"]').click();
      await expect(page.locator('#setupScreen')).toBeVisible();
      await page.locator('#backFromLobbyBtn').click();
      assert.equal(
        await page.evaluate(() => window.TronoAuth.user?.id),
        account,
        'Leaving a game must keep the account',
      );
      await expect(page.locator('#portalScreen')).toBeHidden();
      await expect(page.getByRole('dialog', { name: 'Acesso à conta', exact: true })).toBeHidden();
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
    } finally {
      if (page)
        await page
          .screenshot({ path: 'artifacts/frontend-reset/auth-regression/court-return.png' })
          .catch(() => {});
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
