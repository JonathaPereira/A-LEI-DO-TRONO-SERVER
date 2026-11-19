import fs from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const executablePath =
  process.env.CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/google-chrome');

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    headless: true,
    reducedMotion: 'reduce',
    launchOptions: {
      executablePath,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
      ],
    },
  },
});
