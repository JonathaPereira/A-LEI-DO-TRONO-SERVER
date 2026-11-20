'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const source = stripTypeScriptTypes(
  fs.readFileSync(require.resolve('../src/lib/auth/callback-boot.ts'), 'utf8'),
);
function fixture(href) {
  const target = new EventTarget(),
    replaced = [],
    notified = [];
  target.location = { href };
  target.history = {
    replaceState(value, title, path) {
      replaced.push(path);
      target.location.href = new URL(path, target.location.href).href;
    },
  };
  target.addEventListener('trono-auth-callback', () => notified.push(target.TronoAuthCallback));
  vm.runInNewContext(source, { window: target, URL, URLSearchParams, Event });
  return {
    target,
    replaced,
    notified,
    hash(url) {
      target.location.href = url;
      target.dispatchEvent(new Event('hashchange'));
    },
  };
}
test('token-hash recovery is captured before consumers and removes all one-use URL fields', () => {
  const f = fixture(
    'https://app.test/room?keep=1&token_hash=fixture-token&auth=recovery&error_description=private#fragment',
  );
  assert.equal(f.target.TronoAuthCallback.token_hash, 'fixture-token');
  assert.equal(f.target.TronoAuthCallback.type, 'recovery');
  assert.equal(f.target.location.href, 'https://app.test/room?keep=1');
  assert(Object.isFrozen(f.target.TronoAuthCallback));
  assert.equal(f.notified.length, 0);
});
test('implicit confirmation captures tokens and hash type without leaking them into the cleaned URL', () => {
  const f = fixture(
    'https://app.test/?keep=2#access_token=fixture-access&refresh_token=fixture-refresh&expires_at=123&type=recovery',
  );
  const callback = f.target.TronoAuthCallback;
  assert.equal(callback.access_token, 'fixture-access');
  assert.equal(callback.refresh_token, 'fixture-refresh');
  assert.equal(callback.hashType, 'recovery');
  assert.equal(callback.expires_at, '123');
  assert.equal(f.target.location.href, 'https://app.test/?keep=2');
});
test('normal query/hash navigation is untouched and errors are captured without retaining descriptions', () => {
  const ordinary = fixture('https://app.test/?keep=1#instructions');
  assert.equal(ordinary.target.TronoAuthCallback, undefined);
  assert.equal(ordinary.replaced.length, 0);
  const failure = fixture(
    'https://app.test/?error=expired&error_code=code&error_description=private',
  );
  assert.equal(failure.target.TronoAuthCallback.error, 'expired');
  assert.equal(failure.target.location.href, 'https://app.test/');
});
test('hash callback dispatches once after sanitizing and page disposal removes the listener and pending credentials', () => {
  const f = fixture('https://app.test/');
  f.hash('https://app.test/#access_token=first');
  assert.equal(f.notified.length, 1);
  assert.equal(f.target.location.href, 'https://app.test/');
  f.hash('https://app.test/#normal');
  assert.equal(f.notified.length, 1);
  f.target.dispatchEvent(new Event('pagehide'));
  assert.equal(f.target.TronoAuthCallback, undefined);
  f.hash('https://app.test/#access_token=second');
  assert.equal(f.notified.length, 1);
  assert.equal(f.target.TronoAuthCallback, undefined);
});
