'use strict';

// UI authorization fixtures replace the read-only facade projection, never the
// session owner's immutable account. Server authorization has separate HTTP/WS tests.
async function presentAccount(page, patch) {
  await page.evaluate((value) => {
    const auth = window.TronoAuth;
    window.__authPresentationOriginal ??= Object.getOwnPropertyDescriptor(auth, 'user');
    const original = window.__authPresentationOriginal;
    Object.defineProperty(auth, 'user', {
      configurable: true,
      enumerable: true,
      get() {
        const user = original.get.call(auth);
        return user
          ? { ...user, ...value, permissions: { ...user.permissions, ...value.permissions } }
          : null;
      },
    });
    window.dispatchEvent(new Event('trono-role-change'));
  }, patch);
}
async function restoreAccount(page) {
  await page.evaluate(() => {
    if (!window.__authPresentationOriginal) return;
    Object.defineProperty(window.TronoAuth, 'user', window.__authPresentationOriginal);
    delete window.__authPresentationOriginal;
    window.dispatchEvent(new Event('trono-role-change'));
  });
}
module.exports = { presentAccount, restoreAccount };
