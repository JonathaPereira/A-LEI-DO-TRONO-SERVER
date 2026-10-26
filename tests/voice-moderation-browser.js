'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  express = require('express'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
test(
  'staff call controls enforce mute, media blocking and kick without leaving text/game membership',
  { timeout: 60000 },
  async () => {
    const server = await new Promise((resolve) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      f = await startFixture({ port: 10873, appOrigin: origin });
    let browser;
    const errors = [];
    try {
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(email, name, role) {
        await f.call('signup', { email, nickname: name, password: 'Senha12!' });
        await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
        if (role) f.users.get(email).community_role = role;
        const data = (await f.call('login', { email, password: 'Senha12!' })).data,
          ctx = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            permissions: ['microphone', 'camera'],
          });
        await ctx.route('**/*', (r) =>
          new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
        );
        await ctx.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoNoiseSuppression', '0');
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
          },
          { base: f.base, data },
        );
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(origin);
        await p.waitForFunction(() => window.TronoAuth?.ready);
        await p.evaluate(() => window.TronoAuth.ready);
        await p.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
        await expect.poll(() => p.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        return p;
      }
      const admin = await client('mod@example.test', 'Moderador', 'admin'),
        member = await client('target@example.test', 'Participante');
      await expect(admin.locator('#voiceRoster .voice-person')).toHaveCount(2);
      const id = await member.evaluate(() => window.TronoNetwork.clientId);
      await admin.evaluate(() => window.TronoCallNavigation.showCall());
      await member.evaluate(() => window.TronoCallNavigation.showCall());
      const action = async (name) => {
        await admin.getByRole('button', { name: 'Opções de Participante', exact: true }).click();
        await admin.getByRole('button', { name, exact: true }).click();
      };
      await action('Silenciar microfone no servidor');
      await expect
        .poll(() => member.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled))
        .toBe(false);
      await expect(member.locator('[data-control=muteMicBtn]')).toBeDisabled();
      await member.evaluate(() => window.TronoNetwork.setVoiceState(true, false, true, true));
      await expect
        .poll(() =>
          admin.evaluate(
            (id) =>
              window.TronoCallStage.getSnapshot().participants.find((p) => p.id === id)
                ?.serverMuted,
            id,
          ),
        )
        .toBe(true);
      await action('Liberar microfone no servidor');
      await expect(member.locator('[data-control=muteMicBtn]')).toBeEnabled();
      assert.equal(
        await member.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
        false,
      );
      await member.locator('[data-control=muteMicBtn]').click();
      await expect
        .poll(() => member.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled))
        .toBe(true);
      await action('Bloquear mídia no servidor');
      await expect(member.locator('[data-control=cameraBtn]')).toBeDisabled();
      await expect(member.locator('[data-control=screenShareBtn]')).toBeDisabled();
      assert(await member.evaluate(() => window.TronoSocial.voiceJoined));
      await action('Liberar mídia no servidor');
      await expect(member.locator('[data-control=cameraBtn]')).toBeEnabled();
      const room = await member.evaluate(() => window.TronoNetwork.primaryRoom);
      admin.once('dialog', (d) => d.accept());
      await action('Desconectar da sala');
      await expect.poll(() => member.evaluate(() => window.TronoSocial.voiceJoined)).toBe(false);
      assert.equal(await member.evaluate(() => window.TronoNetwork.primaryRoom), room);
      await member.evaluate(() => window.TronoSocial.joinVoice());
      assert.equal(await member.evaluate(() => window.TronoSocial.voiceJoined), false);
      assert(await admin.evaluate(() => window.TronoSocial.voiceJoined));
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await f.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
