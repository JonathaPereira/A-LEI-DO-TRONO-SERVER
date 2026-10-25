'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const net = require('node:net');
const { _electron, expect } = require('@playwright/test');
const { exerciseManualRecording } = require('./manual-recording-flow.cjs');
const { startFixture } = require('./auth-fixture');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'real Electron cancels native sharing without losing voice and captures its controlled QA window',
  { timeout: 120000, skip: process.platform !== 'win32' },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-call-owner-'));
    let app,
      fixture,
      page,
      finished = false;
    const errors = [];
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) killTestApp(app);
      },
      { once: true },
    );
    try {
      // Other worktrees may run the same suite; never reuse their backend.
      const port = await new Promise((resolve, reject) => {
        const reservation = net.createServer();
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', () => {
          const available = reservation.address().port;
          reservation.close(() => resolve(available));
        });
      });
      fixture = await startFixture({
        port,
        allowedOrigins: ['https://a-lei-do-trono.surge.sh'],
      });
      const email = 'call-native@example.test',
        password = 'Native12!';
      await fixture.call('signup', { email, nickname: 'Corte QA', password });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      // Preauthorized media in this disposable profile. Production permission handlers remain installed.
      await fs.writeFile(
        path.join(directory, 'media-permissions.json'),
        JSON.stringify({ allowed: ['audio', 'video'] }),
      );
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve('electron'),
          '--user-data-dir=' + directory,
          '--mute-audio',
          '--use-fake-device-for-media-stream',
          '--desktop-api-test-origin=' + fixture.base,
        ],
        timeout: 30000,
      });
      page = await app.firstWindow();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('https://a-lei-do-trono-server.onrender.com/**', (route) => route.abort());
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoNoiseSuppression', '0');
      }, fixture.base);
      await page.waitForURL('https://a-lei-do-trono.surge.sh/');
      await page.waitForLoadState('load');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.getByRole('button', { name: 'Entrar na voz de Geral', exact: true }).click();
      const call = page.getByRole('region', { name: 'Chamada da Corte', exact: true });
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page.evaluate(() => {
        window.__nativeMic = window.TronoSocial.getLocalAudioTrack();
      });
      await call.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
      await page.locator('#screenOptionsConfirm').click();
      const picker = page.getByRole('dialog', { name: 'Escolher tela ou janela', exact: true });
      await expect(picker).toBeVisible();
      await picker.getByRole('tab', { name: 'Tela inteira', exact: true }).click();
      await expect(picker.locator('[data-source-kind="window"]')).toHaveCount(0);
      await picker.getByRole('tab', { name: 'Aplicativos', exact: true }).click();
      await expect(picker.locator('[data-source-kind="screen"]')).toHaveCount(0);
      assert(
        (await picker.locator('button[aria-pressed]').count()) > 0,
        'OS enumerates real native sources',
      );
      const geometry = await picker.evaluate((n) => ({
        client: n.clientWidth,
        scroll: n.scrollWidth,
        width: n.getBoundingClientRect().width,
      }));
      assert(
        geometry.width >= 600 && geometry.scroll <= geometry.client + 1,
        JSON.stringify(geometry),
      );
      await picker.getByRole('button', { name: 'Cancelar captura', exact: true }).click();
      await expect(picker).toBeHidden();
      assert.equal(
        await page.evaluate(
          () =>
            window.TronoSocial.voiceJoined &&
            !window.TronoSocial.screenSharing &&
            window.__nativeMic === window.TronoSocial.getLocalAudioTrack() &&
            window.__nativeMic.readyState === 'live',
        ),
        true,
      );
      // A separate native BrowserWindow is the only capture target selected by this test.
      const targetId = await app.evaluate(({ BrowserWindow }) => {
        const target = new BrowserWindow({
          width: 640,
          height: 420,
          show: true,
          title: 'Corte QA - captura controlada',
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        });
        void target.loadURL(
          'data:text/html,' +
            encodeURIComponent(
              '<!doctype html><title>Corte QA - captura controlada</title><body style="background:#182320;color:#d6b779;font:24px Georgia;padding:50px">Captura de teste da Corte</body>',
            ),
        );
        return target.id;
      });
      await call.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
      await page.locator('#shareAudio').uncheck();
      await page.locator('#screenOptionsConfirm').click();
      await expect(picker).toBeVisible();
      const source = picker.getByRole('button', {
        name: 'Corte QA - captura controlada',
        exact: true,
      });
      await expect(source).toBeVisible();
      await source.click();
      await picker.getByRole('tab', { name: 'Tela inteira', exact: true }).click();
      await expect(picker.locator('#desktopCaptureConfirm')).toBeDisabled();
      await picker.getByRole('tab', { name: 'Aplicativos', exact: true }).click();
      await expect(source).toHaveAttribute('aria-pressed', 'true');
      await picker.locator('#desktopCaptureConfirm').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const screen = call.getByRole('article', { name: 'Tela de Corte QA', exact: true });
      await expect
        .poll(() => screen.locator('video').evaluate((v) => !!v.srcObject && v.readyState >= 2))
        .toBe(true);
      await page.evaluate(() => {
        window.__nativeDisplay = window.TronoSocial.getLocalDisplayStream();
        window.__nativePlayer = document.querySelector('[data-call-screen] video');
      });
      const menu = page.getByRole('dialog', {
        name: 'Opções da transmissão de Corte QA',
        exact: true,
      });
      await screen
        .getByRole('button', { name: 'Opções da transmissão de Corte QA', exact: true })
        .click();
      await menu.getByRole('button', { name: 'Pausar prévia local', exact: true }).click();
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-call-screen] video').srcObject === null &&
            window.__nativeDisplay === window.TronoSocial.getLocalDisplayStream() &&
            window.__nativeDisplay.getTracks().every((t) => t.readyState === 'live'),
        ),
        true,
      );
      await menu.getByRole('button', { name: 'Mostrar prévia local', exact: true }).click();
      await expect
        .poll(() => screen.locator('video').evaluate((v) => !!v.srcObject && v.readyState >= 2))
        .toBe(true);
      await menu.getByRole('button', { name: 'Trocar tela ou janela', exact: true }).click();
      await expect(picker).toBeVisible();
      await page.mouse.click(8, 8);
      await expect(picker).toBeHidden();
      assert.equal(
        await page.evaluate(
          () =>
            window.__nativeDisplay === window.TronoSocial.getLocalDisplayStream() &&
            window.__nativeDisplay.getTracks().every((t) => t.readyState === 'live') &&
            window.__nativeMic.readyState === 'live',
        ),
        true,
      );
      await screen.getByRole('button', { name: 'Ampliar Corte QA', exact: true }).click();
      await screen
        .getByRole('button', { name: 'Opções da transmissão de Corte QA', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: 'Opções da transmissão de Corte QA', exact: true })
        .getByRole('button', { name: 'Tela cheia', exact: true })
        .click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      await expect(screen).toHaveAttribute('data-focused', 'true');
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
      await page.getByRole('button', { name: 'Ajustes rápidos da chamada', exact: true }).click();
      await page
        .getByRole('button', { name: 'Todas as configurações de áudio', exact: true })
        .click();
      const settings = page.getByRole('dialog', { name: 'Voz e vídeo', exact: true });
      await expect(settings).toBeVisible();
      await settings.getByRole('button', { name: 'Transmissão', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
      await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
      const account = page.getByRole('dialog', { name: 'Configurações da Corte', exact: true });
      await expect(page.locator('#profileNickname')).toHaveValue('Corte QA');
      await page.locator('#profile-bio').fill('Rascunho durante a transmissão');
      await account.locator('[data-settings-tab=files]').click();
      await expect(
        account.getByRole('button', { name: 'Ver meus arquivos', exact: true }),
      ).toBeVisible();
      await account.locator('[data-settings-tab=account]').click();
      await expect(page.locator('#profile-bio')).toHaveValue('Rascunho durante a transmissão');
      await account.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
      await expect(page.locator('#profile-bio')).toHaveValue('');
      await account.locator('[data-settings-tab=privacy]').click();
      await expect(
        account.getByRole('button', {
          name: 'Redefinir permissões de microfone e câmera',
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await page.locator('#soundboardToggle').click();
      await expect(page.locator('#soundboardDialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.TronoCallSettings.open('resources'));
      await page.getByRole('button', { name: 'Seus clipes', exact: true }).click();
      await expect(page.locator('#clipsDialog')).toContainText('suspenso');
      await page.keyboard.press('Escape');
      assert.equal(
        await page.evaluate(
          () =>
            window.__nativeDisplay === window.TronoSocial.getLocalDisplayStream() &&
            window.__nativeDisplay.getTracks().every((t) => t.readyState === 'live') &&
            window.__nativeMic.readyState === 'live' &&
            window.__nativePlayer === document.querySelector('[data-call-screen] video'),
        ),
        true,
      );
      // Native picker captures only the controlled BrowserWindow, never the user's desktop.
      const recording = exerciseManualRecording(page, { desktop: true }).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      await expect(picker).toBeVisible();
      await picker
        .getByRole('button', { name: 'Corte QA - captura controlada', exact: true })
        .click();
      await picker.locator('#desktopCaptureConfirm').click();
      const saved = await recording;
      if (saved.error) throw saved.error;
      assert(saved.result.bytes > 0 && saved.result.micPreserved && saved.result.sourcePreserved);
      await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
      await page.screenshot({ path: 'artifacts/frontend-reset/call-qa/electron-native-share.png' });
      await call.getByRole('button', { name: 'Parar tela', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !window.TronoSocial.screenSharing &&
              window.__nativeDisplay.getTracks().every((t) => t.readyState === 'ended'),
          ),
        )
        .toBe(true);
      assert.equal(
        await page.evaluate(
          () => window.TronoSocial.voiceJoined && window.__nativeMic.readyState === 'live',
        ),
        true,
      );
      await call.getByRole('button', { name: 'Sair da voz', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () => !window.TronoSocial.voiceJoined && window.__nativeMic.readyState === 'ended',
          ),
        )
        .toBe(true);
      await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), targetId);
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error('Native QA failure:', error);
      throw error;
    } finally {
      if (page) {
        await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
        await page
          .screenshot({ path: 'artifacts/frontend-reset/call-qa/electron-current.png' })
          .catch(() => {});
      }
      await closeTestApp(app);
      finished = true;
      await fixture?.stop();
      const owned = path.resolve(directory);
      if (
        path.dirname(owned) !== path.resolve(os.tmpdir()) ||
        !path.basename(owned).startsWith('mn-call-owner-')
      )
        throw Error('Refusing cleanup outside test profile');
      await fs.rm(owned, { recursive: true, force: true }).catch(() => {});
    }
  },
);
