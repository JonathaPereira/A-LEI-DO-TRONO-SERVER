'use strict';
const path = require('node:path'),
  fs = require('node:fs/promises'),
  express = require('express'),
  { chromium } = require('@playwright/test'),
  R = require('../src/lib/games/throne-rules.ts').throneRules;
(async () => {
  const frontend = path.resolve(__dirname, '../public'),
    server = express().use(express.static(frontend)).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.platform === 'linux'
        ? { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }
        : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1080, height: 900 } });
    await page.goto('http://127.0.0.1:' + server.address().port + '/manual/index.html');
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: path.join(frontend, `manual/A_Lei_do_Trono_Manual_v${R.version}.pdf`),
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;text-align:center;color:#b6a577;font:9px Georgia">A Lei do Trono · Manual da Corte ${R.version} · <span class="pageNumber"></span></div>`,
    });
    await fs.mkdir(path.resolve(__dirname, '../artifacts/court'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/court/manual.png') });
    console.log('PDF temático atualizado: ' + R.version);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
