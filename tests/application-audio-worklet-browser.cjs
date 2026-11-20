'use strict';

const { test } = require('node:test');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');
const { exerciseAudioWorklets } = require('./audio-worklets-flow.cjs');

test(
  'generated audio worklets preserve PCM and speech in the browser audio engine',
  { timeout: 30000 },
  async () => {
    const server = await new Promise((resolve) => {
      const listening = express()
        .get('/', (_, response) =>
          response.send('<!doctype html><title>Worklet regression</title>'),
        )
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
      });
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port);
      console.log(
        'Browser worklet measurements:',
        JSON.stringify(await exerciseAudioWorklets(page)),
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
