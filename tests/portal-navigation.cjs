'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('createPortal does not kick an active player from games/library back to chat on same-user token refresh', async () => {
  const { createPortal } = await import('../src/lib/navigation/portal.ts');
  let identity = {
    user: { id: 'user-1', nickname: 'Jonatha', permissions: {} },
    guest: null,
  };
  let identityListener = () => {};
  let activeScreen = 'portalScreen';
  let openCommunityCalls = 0;

  const portal = createPortal({
    entry: 'community',
    connected: () => true,
    authReady: Promise.resolve(),
    identity: () => identity,
    subscribeIdentity(listener) {
      identityListener = listener;
      return () => {
        identityListener = () => {};
      };
    },
    subscribeMessages: () => () => {},
    checkName: async () => ({ available: true, message: 'OK' }),
    persistName: () => {},
    showScreen(id) {
      activeScreen = id;
    },
    openAuth: () => {},
    openLibrary: () => {},
    requestRooms: () => {},
    focusIdentity: () => {},
    ensureAudio: async () => {},
    enterCommunity: async (_validation, _current, show) => {
      openCommunityCalls++;
      show();
      return true;
    },
    communityVisible: () => activeScreen === 'chatOnlyScreen',
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  portal.start();
  await flush();
  assert.equal(openCommunityCalls, 1);
  assert.equal(activeScreen, 'chatOnlyScreen');

  // User opens the games library, then a specific game screen.
  portal.showOnly('gamesScreen');
  assert.equal(portal.getSnapshot().screen, 'gamesScreen');
  portal.showOnly('azulScreen');
  assert.equal(portal.getSnapshot().screen, 'azulScreen');

  // Background token refresh / focus wakeups emit a new user object with the same account id.
  identity = {
    user: { id: 'user-1', nickname: 'Jonatha', permissions: {} },
    guest: null,
  };
  identityListener();
  await flush();
  assert.equal(portal.getSnapshot().screen, 'azulScreen');
  assert.equal(activeScreen, 'azulScreen');
  assert.equal(openCommunityCalls, 1);

  // Returning to the library and getting another token refresh stays in the library.
  portal.showOnly('gamesScreen');
  identity = {
    user: { id: 'user-1', nickname: 'Jonatha2', permissions: {} },
    guest: null,
  };
  identityListener();
  await flush();
  assert.equal(portal.getSnapshot().screen, 'gamesScreen');
  assert.equal(portal.getSnapshot().name, 'Jonatha2');
  assert.equal(openCommunityCalls, 1);

  // Logging out transitions back to portalScreen; signing in with an account opens community again.
  identity = { user: null, guest: null };
  identityListener();
  await flush();
  assert.equal(portal.getSnapshot().screen, 'portalScreen');

  identity = {
    user: { id: 'user-2', nickname: 'Outro', permissions: {} },
    guest: null,
  };
  identityListener();
  await flush();
  assert.equal(openCommunityCalls, 2);
  assert.equal(portal.getSnapshot().screen, 'chatOnlyScreen');

  portal.dispose();
});
