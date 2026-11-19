import fs from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const fallbackLinuxChrome = '/usr/bin/google-chrome';
const executablePath =
  process.env.CHROMIUM_EXECUTABLE_PATH ||
  (!fs.existsSync(chromium.executablePath()) &&
  process.platform === 'linux' &&
  fs.existsSync(fallbackLinuxChrome)
    ? fallbackLinuxChrome
    : undefined);

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
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
      ],
    },
  },
});
