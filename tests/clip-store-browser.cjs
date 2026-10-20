'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');
const { transformSync } = require('next/dist/compiled/babel/core');

test(
  'typed clip storage preserves version-one blobs, metadata and directories; transactions and connections recover safely',
  { timeout: 30000 },
  async () => {
    const server = await new Promise((resolve) => {
      const server = express()
        .get('/storage-fixture', (_, res) =>
          res.send('<!doctype html><title>Storage fixture</title>'),
        )
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(server));
    });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--mute-audio'],
      });
      const context = await browser.newContext();
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      const page = await context.newPage(),
        origin = 'http://127.0.0.1:' + server.address().port;
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/storage-fixture');
      // Populate the exact old schema before loading any migrated application code.
      await page.evaluate(async () => {
        const opened = indexedDB.open('trono-local-clips', 1);
        opened.onupgradeneeded = () => {
          opened.result.createObjectStore('clips', { keyPath: 'id' }).createIndex('owner', 'owner');
          opened.result.createObjectStore('settings');
        };
        const db = await new Promise((resolve, reject) => {
          opened.onsuccess = () => resolve(opened.result);
          opened.onerror = () => reject(opened.error);
        });
        const directory = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('kept-clips', { create: true });
        const tx = db.transaction(['clips', 'settings'], 'readwrite');
        tx.objectStore('clips').put({
          id: 'kept',
          owner: 'alice',
          createdAt: 10,
          blob: new Blob(['existing-video'], { type: 'video/webm' }),
          state: 'pending',
          extra: { source: 'original' },
        });
        tx.objectStore('settings').put(directory, 'directory:alice');
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      });
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoClipStore);
      const kept = await page.evaluate(async () => {
        const clip = await window.TronoClipStore.get('kept'),
          directory = await window.TronoClipStore.directory('alice');
        return {
          text: await clip.blob.text(),
          mime: clip.blob.type,
          extra: clip.extra,
          folder: directory.name,
        };
      });
      assert.deepEqual(kept, {
        text: 'existing-video',
        mime: 'video/webm',
        extra: { source: 'original' },
        folder: 'kept-clips',
      });
      assert.deepEqual(
        await page.evaluate(async () => {
          const store = window.TronoClipStore;
          await Promise.all([
            store.put({ id: 'newer', owner: 'alice', createdAt: 30, blob: new Blob(['new']) }),
            store.put({ id: 'other', owner: 'bob', createdAt: 40, blob: new Blob(['other']) }),
          ]);
          return {
            alice: (await store.list('alice')).map((c) => c.id),
            bob: (await store.list('bob')).map((c) => c.id),
            none: await store.list('nobody'),
          };
        }),
        { alice: ['newer', 'kept'], bob: ['other'], none: [] },
      );
      assert.deepEqual(
        await page.evaluate(async () => {
          const store = window.TronoClipStore;
          let error;
          try {
            await store.put({ id: 'kept', owner: 'alice', createdAt: 999, bad: () => {} });
          } catch (e) {
            error = e.name;
          }
          await store.remove('newer');
          await store.setDirectory('bob', null);
          return {
            error,
            text: await (await store.get('kept')).blob.text(),
            alice: (await store.list('alice')).map((c) => c.id),
            bob: (await store.list('bob')).map((c) => c.id),
            folder: (await store.directory('alice')).name,
            cleared: await store.directory('bob'),
          };
        }),
        {
          error: 'DataCloneError',
          text: 'existing-video',
          alice: ['kept'],
          bob: ['other'],
          folder: 'kept-clips',
          cleared: null,
        },
      );
      await page.reload();
      await page.waitForFunction(() => window.TronoClipStore);
      assert.deepEqual(
        await page.evaluate(async () => ({
          text: await (await window.TronoClipStore.get('kept')).blob.text(),
          folder: (await window.TronoClipStore.directory('alice')).name,
        })),
        { text: 'existing-video', folder: 'kept-clips' },
      );

      // Compile this factory only in the test runner; no test loader ships in the renderer.
      const source = await fs.readFile(path.resolve('src/lib/clips/store.ts'), 'utf8');
      const compiled = transformSync(source, {
        filename: 'store.ts',
        babelrc: false,
        configFile: false,
        presets: [require.resolve('next/dist/compiled/babel/preset-typescript')],
        plugins: [require.resolve('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
      }).code;
      await page.evaluate(
        `(()=>{const module={exports:{}};const exports=module.exports;${compiled}\nwindow.__createClipStore=module.exports.createClipStore;})()`,
      );
      assert.deepEqual(
        await page.evaluate(async () => {
          let calls = 0,
            fail = true;
          const store = window.__createClipStore(() => {
            calls++;
            if (fail) {
              fail = false;
              throw new DOMException('Fixture denied', 'SecurityError');
            }
            return {
              open: (name, version) => {
                if (name !== 'trono-local-clips' || version !== 1) throw Error('Schema changed');
                return indexedDB.open('clip-store-lifecycle', version);
              },
            };
          });
          let failed;
          try {
            await store.list('alice');
          } catch (e) {
            failed = e.name;
          }
          await Promise.all([store.list('alice'), store.get('missing'), store.directory('alice')]);
          const opensAfterRetry = calls;
          store.dispose();
          store.dispose();
          let closed;
          try {
            await store.get('missing');
          } catch (e) {
            closed = e.name;
          }
          const late = window.__createClipStore(() => ({
            open: () => indexedDB.open('clip-store-late', 1),
          }));
          const pending = late.get('missing');
          late.dispose();
          let cancelled;
          try {
            await pending;
          } catch (e) {
            cancelled = e.name;
          }
          // Upgrading proves the disposed pending open did not retain a blocking connection.
          const request = indexedDB.open('clip-store-late', 2);
          await new Promise((resolve, reject) => {
            request.onsuccess = () => {
              request.result.close();
              resolve();
            };
            request.onerror = () => reject(request.error);
          });
          return { failed, opensAfterRetry, closed, cancelled };
        }),
        {
          failed: 'SecurityError',
          opensAfterRetry: 2,
          closed: 'AbortError',
          cancelled: 'AbortError',
        },
      );
      assert.deepEqual(
        await page.evaluate(async () => {
          let calls = 0;
          const store = window.__createClipStore(() => ({
            open: (_, version) => {
              calls++;
              return indexedDB.open('clip-store-version', version);
            },
          }));
          await store.list('alice');
          const upgrade = indexedDB.open('clip-store-version', 2);
          await new Promise((resolve, reject) => {
            upgrade.onsuccess = () => {
              upgrade.result.close();
              resolve();
            };
            upgrade.onerror = () => reject(upgrade.error);
          });
          let failure;
          try {
            await store.list('alice');
          } catch (e) {
            failure = e.name;
          }
          store.dispose();
          return { calls, failure };
        }),
        { calls: 2, failure: 'VersionError' },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
