'use strict';

async function firstSizedWindow(app, size) {
  const page = await app.firstWindow();
  const window = await app.browserWindow(page);
  try {
    await window.evaluate((window, size) => window.setContentSize(size.width, size.height), size);
  } finally {
    await window.dispose();
  }
  return page;
}

module.exports = { firstSizedWindow };
