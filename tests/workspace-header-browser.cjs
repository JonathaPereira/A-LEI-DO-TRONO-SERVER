'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'a saved collapsed header can be restored after reloading the community',
  { timeout: 30000 },
  async () => {
    const server = await new Promise((resolve) => {
      const server = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(server));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    const errors = [];
    try {
      fixture = await startFixture({ port: 10966, appOrigin: origin });
      const email = 'workspace-header@example.test',
        password = 'Senha12!';
      await fixture.call('signup', { email, password, nickname: 'Cabeçalho' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (await fixture.call('login', { email, password })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
        },
        { base: fixture.base, data },
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('#openVoicePortalBtn').click();
      await expect(page.locator('#callWorkspace')).toBeVisible();
      await page.evaluate(() => window.TronoAppLayout.apply('discord'));
      await page.locator('#workspaceHeaderToggle').click();
      await expect(page.locator('#workspaceHeader')).toBeHidden();
      await page.reload();
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => window.TronoAppLayout.navigate('community'));
      await expect(page.locator('#workspaceHeader')).toBeHidden();
      try {
        await page.locator('#workspaceHeaderToggle').click({ timeout: 2500 });
      } catch (error) {
        await fs.writeFile(
          'artifacts/workspace-header-reload.json',
          JSON.stringify(
            await page.evaluate(() => {
              const button = document.getElementById('workspaceHeaderToggle');
              const parents = [];
              for (let node = button; node; node = node.parentElement)
                parents.push({
                  id: node.id,
                  tag: node.tagName,
                  hidden: node.hidden,
                  inert: node.inert,
                  display: getComputedStyle(node).display,
                  visibility: getComputedStyle(node).visibility,
                });
              return {
                body: document.body.className,
                parents,
                account: !!window.TronoAuth.user,
                hub: window.TronoCallNavigation?.getSnapshot().hub,
              };
            }),
            null,
            2,
          ),
        );
        throw error;
      }
      await expect(page.locator('#workspaceHeader')).toBeVisible();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
