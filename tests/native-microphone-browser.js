'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  express = require('express'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
test(
  'native microphone preserves quiet PCM without stacking an expander or RNNoise',
  { timeout: 45000 },
  async () => {
    const server = await new Promise((resolve) => {
        const s = express()
          .use(express.static(path.resolve(__dirname, '../out')))
          .listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10893, appOrigin: origin });
    let browser;
    try {
      const email = 'native-mic@example.test';
      await fixture.call('signup', { email, nickname: 'Microfone', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });
      const context = await browser.newContext();
      await context.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('mnDesktopNoiseMode', 'native');
          localStorage.setItem('tronoNoiseSuppression', '1');
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          window.TronoDesktop = {
            version: '0.2.7',
            clipsSuspended: true,
            readSession: async () => null,
            saveSession: async () => {},
            onCapture: () => {},
            onCaptureCancel: () => {},
            onApplicationAudio: () => {},
            getWindowState: async () => ({ fullscreen: false }),
            onWindowState: () => {},
            onUpdateState: () => {},
            getUpdateState: async () => ({ status: 'idle' }),
            configureClips: async () => ({ suspended: true }),
          };
          window.__captureCount = 0;
          navigator.mediaDevices.getUserMedia = async (options) => {
            window.__captureCount++;
            window.__captureOptions = options;
            const ctx = new AudioContext({ sampleRate: 48000 });
            await ctx.resume();
            const osc = ctx.createOscillator(),
              gain = ctx.createGain(),
              out = ctx.createMediaStreamDestination();
            osc.frequency.value = 440;
            gain.gain.value = 0.0004;
            osc.connect(gain);
            gain.connect(out);
            osc.start();
            const track = out.stream.getAudioTracks()[0],
              settings = track.getSettings.bind(track);
            track.getSettings = () => ({ ...settings(), noiseSuppression: true });
            window.__rawMicrophone = out.stream;
            window.__toneContext = ctx;
            return out.stream;
          };
        },
        { base: fixture.base, data },
      );
      const page = await context.newPage();
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => {
        window.__extraFilters = [];
        for (const [name, api] of [
          ['light', window.TronoLightNoise],
          ['rnnoise', window.TronoNoise],
        ]) {
          const create = api.create;
          api.create = (...args) => {
            window.__extraFilters.push(name);
            return create(...args);
          };
        }
      });
      await page.getByRole('button', { name: 'Entrar na voz de Geral', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      const measure = () =>
        page.evaluate(async () => {
          const ctx = new AudioContext({ sampleRate: 48000 });
          await ctx.resume();
          const code = `class Check extends AudioWorkletProcessor{constructor(){super();this.frames=0;this.raw=0;this.out=0;this.count=0;this.sent=false;}process(inputs){const a=inputs[0]?.[0],b=inputs[1]?.[0];if(!a||!b)return true;for(let i=0;i<a.length;i++){this.frames++;if(this.frames>sampleRate){this.raw+=a[i]*a[i];this.out+=b[i]*b[i];this.count++;}}if(this.frames>=sampleRate*3&&!this.sent){this.sent=true;this.port.postMessage({raw:Math.sqrt(this.raw/this.count),out:Math.sqrt(this.out/this.count)});}return true;}}registerProcessor('mic-check',Check);`;
          const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          const meter = new AudioWorkletNode(ctx, 'mic-check', { numberOfInputs: 2 }),
            raw = ctx.createMediaStreamSource(window.__rawMicrophone),
            out = ctx.createMediaStreamSource(
              new MediaStream([window.TronoSocial.getLocalAudioTrack()]),
            ),
            mute = ctx.createGain();
          mute.gain.value = 0;
          raw.connect(meter, 0, 0);
          out.connect(meter, 0, 1);
          meter.connect(mute);
          mute.connect(ctx.destination);
          const pcm = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('No microphone PCM')), 7000);
            meter.port.onmessage = (e) => {
              clearTimeout(timer);
              resolve(e.data);
            };
          });
          raw.disconnect();
          out.disconnect();
          meter.disconnect();
          meter.port.close();
          await ctx.close();
          return {
            pcm,
            mode: window.TronoSocial.noiseState.mode,
            extra: window.__extraFilters,
            capture: window.__captureOptions,
          };
        });
      const measured = await measure();
      assert(
        await page.evaluate(
          () =>
            window.TronoSocial.getLocalAudioTrack() === window.__rawMicrophone.getAudioTracks()[0],
        ),
      );
      console.log('Native microphone PCM:', JSON.stringify(measured));
      assert.equal(measured.mode, 'native');
      assert.deepEqual(measured.extra, []);
      assert.equal(measured.capture.audio.noiseSuppression, true);
      assert(measured.pcm.raw > 0.0002);
      assert(measured.pcm.out / measured.pcm.raw > 0.95, 'Quiet voice must not be gated'); // The existing limiter adds a little makeup gain; quiet PCM must remain present and bounded.
      assert(measured.pcm.out / measured.pcm.raw < 1.5);
      await page.evaluate(() => window.TronoCallSettings.open('audio'));
      const gain = async (value) => {
        await page.locator('#micGainSlider').evaluate((n, value) => {
          n.value = String(value);
          n.dispatchEvent(new Event('input', { bubbles: true }));
        }, value);
      };
      await gain(180);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.TronoSocial.getLocalAudioTrack() ===
              window.__rawMicrophone.getAudioTracks()[0],
          ),
        )
        .toBe(false);
      const amplified = await measure();
      assert(amplified.pcm.out / amplified.pcm.raw > 1.6);
      assert(amplified.pcm.out / amplified.pcm.raw < 2.6);
      await gain(0);
      assert.equal(
        await page.evaluate(() => window.__rawMicrophone.getAudioTracks()[0].enabled),
        false,
      );
      assert.equal(
        await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
        false,
      );
      await gain(180);
      await page.evaluate(() => window.TronoCallToolbar.activate('muteMicBtn'));
      await gain(100);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.TronoSocial.getLocalAudioTrack() ===
              window.__rawMicrophone.getAudioTracks()[0],
          ),
        )
        .toBe(true);
      assert.equal(
        await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
        false,
      );
      await page.evaluate(() => window.TronoCallToolbar.activate('muteMicBtn'));
      assert.equal(
        await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
        true,
      );
      assert.equal(await page.evaluate(() => window.__captureCount), 1);
      await page.evaluate(async () => {
        await window.TronoSocial.leaveVoice();
        await window.__toneContext.close();
      });
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
