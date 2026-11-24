'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createCommunity,
  DEFAULT_AUTO_AWAY_MS,
} = require('../src/lib/community/controller.ts');

function createHarness(initial = {}) {
  let time = 1_000_000;
  let nextTimerId = 1;
  const scheduled = new Map();
  function schedule(callback, delay) {
    const id = nextTimerId++;
    scheduled.set(id, { callback, at: time + delay });
    return () => scheduled.delete(id);
  }
  function advance(ms) {
    const target = time + ms;
    while (true) {
      let earliestId = null;
      let earliest = null;
      for (const [id, entry] of scheduled) {
        if (entry.at <= target && (!earliest || entry.at < earliest.at)) {
          earliestId = id;
          earliest = entry;
        }
      }
      if (!earliest) break;
      scheduled.delete(earliestId);
      time = earliest.at;
      earliest.callback();
    }
    time = target;
  }

  let identity =
    initial.identity !== undefined
      ? initial.identity
      : {
          key: 'account:10000000-0000-4000-8000-000000000001',
          accountId: '10000000-0000-4000-8000-000000000001',
          manageRoles: false,
        };
  let connected = true;
  let unmutedInCall = !!initial.unmutedInCall;
  const store = new Map(initial.savedStatus ? [['presenceStatus', initial.savedStatus]] : []);
  const identityListeners = new Set();
  const networkListeners = new Set();
  const prefListeners = new Set();
  const voiceListeners = new Set();
  const interactionListeners = new Set();
  const sentStatuses = [];
  const desktopSynced = [];

  const preferences = {
    get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
    set: (key, value) => {
      store.set(key, value);
      for (const fn of prefListeners) fn(key);
    },
  };
  const network = {
    getSnapshot: () => ({ connected }),
    subscribe: (fn) => {
      networkListeners.add(fn);
      return () => networkListeners.delete(fn);
    },
    onMessage: () => () => {},
    requestPresence: () => {},
    setPresenceStatus: (status) => sentStatuses.push(status),
  };

  const community = createCommunity({
    network,
    getIdentity: () => identity,
    subscribeIdentity: (fn) => {
      identityListeners.add(fn);
      return () => identityListeners.delete(fn);
    },
    authenticate: async () => true,
    preferences,
    subscribePreferences: (fn) => {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
    syncDesktopStatus: (accountId, status) => desktopSynced.push({ accountId, status }),
    isVoiceActiveUnmuted: () => unmutedInCall,
    subscribeVoiceState: (fn) => {
      voiceListeners.add(fn);
      return () => voiceListeners.delete(fn);
    },
    subscribeInteraction: (fn) => {
      interactionListeners.add(fn);
      return () => interactionListeners.delete(fn);
    },
    now: () => time,
    schedule,
  });

  return {
    community,
    store,
    sentStatuses,
    desktopSynced,
    scheduled,
    advance,
    interact() {
      for (const fn of interactionListeners) fn();
    },
    setVoiceUnmuted(value) {
      unmutedInCall = value;
      for (const fn of voiceListeners) fn();
    },
    setIdentity(next) {
      identity = next;
      for (const fn of identityListeners) fn();
    },
    setConnected(next) {
      connected = next;
      for (const fn of networkListeners) fn();
    },
  };
}

test('auto-away transitions online user to away after 10 minutes without interaction when out of call and returns to online on click without persisting away', async () => {
  assert.equal(DEFAULT_AUTO_AWAY_MS, 10 * 60 * 1000);
  const h = createHarness();
  try {
    h.community.start();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    h.sentStatuses.length = 0;
    h.desktopSynced.length = 0;

    // 9m59s: still online
    h.advance(9 * 60 * 1000 + 59_000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    assert.deepEqual(h.sentStatuses, []);

    // +1s = 10m00s: becomes auto-away without overwriting saved preference or desktop status
    h.advance(1_000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'away');
    assert.deepEqual(h.sentStatuses, ['away']);
    assert.equal(h.store.get('presenceStatus'), undefined);
    assert.deepEqual(h.desktopSynced, []);

    // Clicking inside the app restores online immediately and notifies server
    h.interact();
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    assert.deepEqual(h.sentStatuses, ['away', 'online']);

    // Activity at 5 minutes resets the 10-minute window
    h.advance(5 * 60 * 1000);
    h.interact();
    h.advance(6 * 60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    h.advance(4 * 60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'away');
  } finally {
    h.community.dispose();
  }
});

test('unmuted user in call never goes auto-away; muting starts a fresh 10-minute countdown and unmuting restores online', async () => {
  const h = createHarness({ unmutedInCall: true });
  try {
    h.community.start();
    await new Promise((r) => setTimeout(r, 10));
    h.sentStatuses.length = 0;

    // 30 minutes unmuted in call without clicking the app -> stays online
    h.advance(30 * 60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    assert.deepEqual(h.sentStatuses, []);

    // Muting in call starts a fresh 10-minute countdown (does NOT go away immediately)
    h.setVoiceUnmuted(false);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    h.advance(9 * 60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');

    // At 10 minutes muted without interaction -> auto-away
    h.advance(60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'away');
    assert.deepEqual(h.sentStatuses, ['away']);

    // Unmuting in call returns to online automatically
    h.setVoiceUnmuted(true);
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');
    assert.deepEqual(h.sentStatuses, ['away', 'online']);
  } finally {
    h.community.dispose();
  }
});

test('interactions and voice changes never overwrite manual DND or manual Away', async () => {
  const hDnd = createHarness({ savedStatus: 'dnd' });
  const hAway = createHarness({ savedStatus: 'away' });
  try {
    hDnd.community.start();
    hAway.community.start();
    await new Promise((r) => setTimeout(r, 10));

    hDnd.advance(15 * 60 * 1000);
    hDnd.interact();
    hDnd.setVoiceUnmuted(true);
    assert.equal(hDnd.community.getSnapshot().presenceStatus, 'dnd');

    hAway.advance(15 * 60 * 1000);
    hAway.interact();
    hAway.setVoiceUnmuted(true);
    assert.equal(hAway.community.getSnapshot().presenceStatus, 'away');

    // Setting manual 'away' while currently auto-away prevents subsequent clicks from restoring online
    const hAuto = createHarness();
    try {
      hAuto.community.start();
      await new Promise((r) => setTimeout(r, 10));
      hAuto.advance(10 * 60 * 1000);
      assert.equal(hAuto.community.getSnapshot().presenceStatus, 'away');

      hAuto.community.setPresenceStatus('away');
      assert.equal(hAuto.store.get('presenceStatus'), 'away');
      hAuto.interact();
      assert.equal(hAuto.community.getSnapshot().presenceStatus, 'away');

      hAuto.community.setPresenceStatus('dnd');
      hAuto.interact();
      assert.equal(hAuto.community.getSnapshot().presenceStatus, 'dnd');
    } finally {
      hAuto.community.dispose();
    }
  } finally {
    hDnd.community.dispose();
    hAway.community.dispose();
  }
});

test('reconnect preserves auto-away while account switch and dispose clear idle timers', async () => {
  const h = createHarness();
  try {
    h.community.start();
    await new Promise((r) => setTimeout(r, 10));

    h.advance(10 * 60 * 1000);
    assert.equal(h.community.getSnapshot().presenceStatus, 'away');

    // Reconnect re-sends current effective status ('away') without dropping auto-away
    h.sentStatuses.length = 0;
    h.setConnected(false);
    h.setConnected(true);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(h.community.getSnapshot().presenceStatus, 'away');
    assert.equal(h.sentStatuses.at(-1), 'away');

    // Account switch resets auto-away and restarts fresh window for new account
    h.setIdentity({
      key: 'account:10000000-0000-4000-8000-000000000002',
      accountId: '10000000-0000-4000-8000-000000000002',
      manageRoles: false,
    });
    assert.equal(h.community.getSnapshot().presenceStatus, 'online');

    // Dispose clears pending idle timers
    h.community.dispose();
    assert.equal(h.scheduled.size, 0);
  } finally {
    h.community.dispose();
  }
});
