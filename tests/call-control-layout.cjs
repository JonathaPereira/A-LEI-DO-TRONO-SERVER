'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  { stripTypeScriptTypes } = require('node:module');
const { chromium } = require('@playwright/test');

test(
  'control placement retains borrowed nodes and tracks and releases observers before a new installation',
  { timeout: 30000 },
  async () => {
    const source = stripTypeScriptTypes(
      fs.readFileSync('src/lib/voice/control-layout.ts', 'utf8'),
    ).replace('export function', 'function');
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--mute-audio'],
    });
    try {
      for (const desktop of [false, true]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.setContent(
          `<div id="socialPanel"><div class="call-toolbar"><span data-call-control-host><button id="joinVoiceBtn">Voz</button></span>${['muteMicBtn', 'deafenVoiceBtn', 'cameraBtn', 'screenShareBtn', 'voiceSettingsBtn', 'soundboardToggle'].map((id) => '<button id="' + id + '">Controle</button>').join('')}</div></div><button id="communityToggle">Pessoas</button><div id="voiceSettingsPanel"></div><div id="desktopCallDock"></div><div id="desktopRail"><button data-desktop-route="clips"></button></div><div id="webLayoutRail"></div><div id="desktopTopBar"><button id="voiceDiagnosticsLauncher"></button></div><div id="callWorkspace"></div><div id="callFocusDock"></div><div id="layoutConnectionControls"></div><div id="layoutUserControls"></div><div id="layoutCallActions"></div><div class="chat-only-top-actions"></div>`,
        );
        await page.evaluate(
          ({ source, desktop }) => {
            window.TronoDesktop = desktop ? {} : undefined;
            const NativeObserver = MutationObserver,
              active = new Set();
            window.__activeObservers = active;
            window.MutationObserver = class extends NativeObserver {
              constructor(...args) {
                super(...args);
                this.owned = window.__bindingLayout === true;
              }
              observe(...args) {
                if (this.owned) active.add(this);
                return super.observe(...args);
              }
              disconnect() {
                active.delete(this);
                super.disconnect();
              }
            };
            window.__initializeLayout = new Function(
              source + '; return initializeCallControlLayout;',
            )();
            window.__borrowedButton = document.getElementById('joinVoiceBtn');
            window.__clicks = 0;
            window.__borrowedButton.addEventListener('click', () => window.__clicks++);
            const canvas = document.createElement('canvas');
            window.__borrowedTrack = canvas.captureStream(30).getVideoTracks()[0];
            window.__disposeLayout = window.__initializeLayout(window);
            window.__sameInstallation =
              window.__initializeLayout(window) === window.__disposeLayout;
            window.__bindingLayout = true;
            dispatchEvent(new Event('trono:ready'));
            dispatchEvent(new Event('trono:ready'));
            window.__bindingLayout = false;
          },
          { source, desktop },
        );
        assert.equal(await page.evaluate(() => window.__sameInstallation), true);
        assert.equal(await page.evaluate(() => window.__activeObservers.size), 7);
        await page.evaluate(() => {
          document.body.dataset.appLayout = 'discord';
          document.body.classList.add('chat-only-active');
        });
        await page.waitForFunction(
          () =>
            document.getElementById('joinVoiceBtn').closest('[data-call-control-host]')
              .parentElement.id === 'layoutConnectionControls',
        );
        await page.setViewportSize({ width: 900, height: 700 });
        await page.waitForFunction(
          () =>
            document.getElementById('joinVoiceBtn').closest('[data-call-control-host]')
              .parentElement.id === 'callFocusDock',
        );
        const result = await page.evaluate(() => {
          window.__disposeLayout();
          window.__disposeLayout();
          const button = document.getElementById('joinVoiceBtn');
          button.click();
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
          let markers = 0;
          while (walker.nextNode()) markers++;
          const value = {
            same: button === window.__borrowedButton,
            host: button.closest('[data-call-control-host]').parentElement.className,
            track: window.__borrowedTrack.readyState,
            clicks: window.__clicks,
            observers: window.__activeObservers.size,
            markers,
            facade: typeof window.TronoCallControlsLayout,
          };
          window.__disposeLayout = window.__initializeLayout(window);
          window.__bindingLayout = true;
          dispatchEvent(new Event('trono:ready'));
          window.__bindingLayout = false;
          value.reinstalled = window.__activeObservers.size;
          window.__disposeLayout();
          window.__borrowedTrack.stop();
          return value;
        });
        assert.deepEqual(result, {
          same: true,
          host: 'call-toolbar',
          track: 'live',
          clicks: 1,
          observers: 0,
          markers: 0,
          facade: 'undefined',
          reinstalled: 7,
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  },
);
