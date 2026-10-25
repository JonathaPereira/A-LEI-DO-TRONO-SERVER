'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'account entry is a standalone screen with a bounded form at desktop and phone sizes',
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
      await expect(page.getByRole('complementary', { name: 'Canais e conversas' })).toBeHidden();
      const dialog = page.locator('#portalScreen > div');
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
      await fixture.call('signup', {
        email: 'community-only@example.test',
        nickname: 'Só Comunidade',
        password,
      });
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
      await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
      const mini = page.getByRole('dialog', { name: 'Meu perfil', exact: true });
      await expect(mini).toBeVisible();
      await expect(mini.getByRole('button', { name: 'Editar perfil', exact: true })).toBeVisible();
      await page.screenshot({ path: 'artifacts/frontend-reset/auth-regression/account-card.png' });
      await page.keyboard.press('Escape');
      await expect(mini).toBeHidden();
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
      await expect(page.locator('[data-person]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Comunidade', exact: true }).click();
      await expect(page.locator('[data-person]')).toContainText(['Só Comunidade']);
      await page.getByRole('button', { name: 'Amigos', exact: true }).click();
      await expect(page.locator('[data-person]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Pessoas da Corte', exact: true }),
      ).not.toHaveAttribute('data-active', 'true');
      await expect(page.locator('[data-channel][data-active="true"]')).toHaveCount(0);
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
      const avatarId = '23000000-0000-4000-8000-000000000001';
      await context.route('**/files/' + avatarId + '/url', (route) =>
        route.fulfill({
          json: { url: origin + '/assets/azul/box-cover.webp', expiresAt: Date.now() + 3600000 },
        }),
      );
      await context.route('**/social/snapshot', async (route) => {
        const response = await route.fetch();
        const snapshot = await response.json();
        snapshot.threads = Array.from({ length: 24 }, (_, index) => ({
          peerId: '23000000-0000-4000-8000-' + String(index + 2).padStart(12, '0'),
          name: 'Conversa ' + (index + 1),
          avatar_file_id: avatarId,
          unread: index % 3,
          last: {
            id: '24000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
            senderId: account,
            text: 'Mensagem de teste',
            ts: '2026-10-25T12:00:00Z',
            roomId: null,
          },
        }));
        return route.fulfill({ response, json: snapshot });
      });
      await page.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
      const sidebar = page.getByRole('complementary', { name: 'Canais e conversas' });
      const firstDm = sidebar.getByRole('button', { name: /Conversa 1$/ });
      await expect(firstDm.locator('img')).toBeVisible();
      assert(
        await firstDm
          .locator('img')
          .evaluate(
            (el) => Math.abs(el.parentElement.clientWidth - el.parentElement.clientHeight) <= 1,
          ),
        'DM avatars remain round instead of stretching across the row',
      );
      const group = sidebar.getByRole('group', { name: 'Mensagens diretas', exact: true });
      await expect(group.locator('[data-direct-peer]')).toHaveCount(6);
      await group
        .getByRole('button', { name: 'Mostrar todas as conversas (24)', exact: true })
        .click();
      await expect(group.locator('[data-direct-peer]')).toHaveCount(24);
      await group.getByRole('button', { name: 'Mostrar menos', exact: true }).click();
      await expect(group.locator('[data-direct-peer]')).toHaveCount(6);
      await group.getByText('Mensagens diretas', { exact: true }).click();
      await expect(firstDm).toBeHidden();
      await group.getByText('Mensagens diretas', { exact: true }).click();
      await firstDm.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'artifacts/frontend-reset/auth-regression/direct-group.png' });
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
