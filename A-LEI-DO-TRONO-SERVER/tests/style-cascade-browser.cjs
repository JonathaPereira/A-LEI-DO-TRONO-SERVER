'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

function readStyle(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^@import\s+['"]([^'"]+)['"];\s*$/gm, (_line, relative) =>
      readStyle(path.resolve(path.dirname(file), relative)),
    );
}
const normalizeAssets = (css) => css.replace(/url\((['"]?)assets\//g, 'url($1/assets/');
const reference = process.env.MN_CSS_REFERENCE
  ? JSON.parse(fs.readFileSync(process.env.MN_CSS_REFERENCE, 'utf8'))
      .sheets.map((sheet) => normalizeAssets(sheet.css))
      .join('\n')
  : readStyle(path.resolve(__dirname, '../src/app/globals.css')) +
    '\n' +
    readStyle(path.resolve(__dirname, '../src/styles/index.css'));

const exportedHTML = fs.readFileSync(path.resolve(__dirname, '../out/index.html'), 'utf8');
const compiled = [...exportedHTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((match) => fs.readFileSync(path.resolve(__dirname, '../out', '.' + match[1]), 'utf8'))
  .join('\n');
/** Freeze one DOM snapshot in an isolated frame. No app scripts, media or nested game can run in it. */
async function compare(page, label) {
  const result = await page.evaluate(
    async ({ reference, compiled }) => {
      const body = document.createElement('body');
      body.append(document.getElementById('gameSurface').cloneNode(true));
      const frame = document.createElement('iframe');
      frame.style.cssText =
        'position:fixed;left:-100000px;top:0;border:0;pointer-events:none;width:' +
        innerWidth +
        'px;height:' +
        innerHeight +
        'px';
      document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument,
          win = frame.contentWindow;
        doc.open();
        doc.write('<!doctype html><html><head></head><body></body></html>');
        doc.close();
        for (const attr of document.documentElement.attributes)
          doc.documentElement.setAttribute(attr.name, attr.value);
        const base = doc.createElement('base');
        base.href = document.baseURI;
        doc.head.appendChild(base);
        body.querySelectorAll('script,link,style').forEach((node) => node.remove());
        body.querySelectorAll('iframe').forEach((node) => {
          node.removeAttribute('srcdoc');
          node.src = 'about:blank';
          node.setAttribute('sandbox', '');
        });
        body.querySelectorAll('audio,video').forEach((node) => {
          node.removeAttribute('autoplay');
          node.removeAttribute('src');
          node.preload = 'none';
        });
        doc.body.replaceWith(body);
        const source = doc.createElement('style'),
          stable = doc.createElement('style');
        const selector = ':is(#__css_cascade_probe,*)'.repeat(16);
        stable.textContent =
          selector +
          ',' +
          selector +
          '::before,' +
          selector +
          '::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
        doc.head.append(source, stable);
        // Restore modal top-layer semantics that cloneNode cannot copy.
        for (const original of document.querySelectorAll('dialog:modal')) {
          const clone = doc.getElementById(original.id);
          if (clone) {
            clone.open = false;
            clone.showModal();
          }
        }
        const nodes = [doc.body, ...doc.body.querySelectorAll('*')],
          properties = [...win.getComputedStyle(doc.body)].filter((name) => !name.startsWith('--'));
        const normalize = (value, property) => {
          if (property.startsWith('background-position'))
            value = value.replace(
              /(^|[\s,])0(?:px|%)(?=$|[\s,])/g,
              (_match, prefix) => prefix + '0',
            );
          try {
            return value.includes('data:') ? decodeURIComponent(value) : value;
          } catch {
            return value;
          }
        };
        async function capture(css) {
          source.textContent = css;
          doc.body.getBoundingClientRect();
          await doc.fonts.ready;
          return nodes.map((node) => {
            const style = win.getComputedStyle(node);
            return properties.map((prop) => normalize(style.getPropertyValue(prop), prop));
          });
        }
        const sheet = new win.CSSStyleSheet();
        sheet.replaceSync(compiled);
        const moduleRules = (rules) =>
          [...rules]
            .map((rule) => {
              if (rule.selectorText)
                return /\.[a-zA-Z0-9-]+_[a-zA-Z]/.test(rule.selectorText) ? rule.cssText : '';
              if (rule.cssRules) {
                const children = moduleRules(rule.cssRules);
                return children
                  ? rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + children + '}'
                  : '';
              }
              return '';
            })
            .join('\n');
        // Only raw game styles are under comparison. Shared redesigned media components
        // retain their compiled module sheets in both captures.
        const expected = await capture(reference + '\n' + moduleRules(sheet.cssRules)),
          actual = await capture(compiled),
          differences = [];
        for (let index = 0; index < nodes.length; index++)
          for (let prop = 0; prop < properties.length; prop++)
            if (actual[index][prop] !== expected[index][prop] && differences.length < 30)
              differences.push({
                node:
                  nodes[index].tagName +
                  '#' +
                  nodes[index].id +
                  '.' +
                  String(nodes[index].className).slice(0, 90),
                property: properties[prop],
                actual: actual[index][prop],
                expected: expected[index][prop],
              });
        return { nodes: nodes.length, properties: properties.length, differences };
      } finally {
        frame.remove();
      }
    },
    { reference, compiled },
  );
  assert.deepEqual(result.differences, [], label);
  return result.nodes * result.properties;
}

test(
  'Next compiled CSS preserves the protected game cascade across desktop and portrait',
  { timeout: 120000 },
  async () => {
    const server = await new Promise((resolve) => {
      const host = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(host));
    });
    const origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 11961, appOrigin: origin });
    let browser;
    const errors = [];
    let comparisons = 0,
      states = 0;
    try {
      await fixture.call('signup', {
        email: 'css@example.test',
        nickname: 'CSS Reference',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (
        await fixture.call('login', { email: 'css@example.test', password: 'Senha12!' })
      ).data;
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
        viewport: { width: 1440, height: 900 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('mnDesktopNoiseMode', 'native');
          window.TronoDesktop = {
            version: '0.13.0-alpha',
            clipsSuspended: true,
            readSession: async () => null,
            saveSession: async () => {},
            getMediaPermissions: async () => ['audio', 'video'],
            onCapture: () => {},
            onCaptureCancel: () => {},
            getWindowState: async () => ({ fullscreen: false }),
            onWindowState: () => {},
            onUpdateState: () => {},
            getUpdateState: async () => ({ status: 'idle' }),
            onApplicationAudio: () => {},
            configureClips: async () => ({ suspended: true }),
          };
        },
        { base: fixture.base, data },
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => window.TronoPortal.openGame(true));
      await expect(page.locator('#setupScreen')).toBeVisible();
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1280, height: 720 },
        { width: 1024, height: 768 },
        { width: 480, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        comparisons += await compare(page, 'game surface ' + viewport.width);
        states++;
      }
      assert.deepEqual(errors, []);
      assert.equal(states, 4);
      console.log('CSS cascade checks:', { states, comparisons });
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
