'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCommunity: createServerCommunity } = require('../server/community.ts');
const { readPresenceStatus } = require('../server/socket-protocol.ts');
const { createCommunity: createClientCommunity } = require('../src/lib/community/controller.ts');
const { createNotifications } = require('../src/lib/notifications/controller.ts');
const {
  createNotifications: createElectronNotifications,
  notificationPayload,
  buildWindowsToastXml,
} = require('../electron/notifications.cjs');
const {
  APP_RELEASE_VERSION,
  shouldShowReleaseNotes,
  markReleaseNotesSeen,
} = require('../src/lib/application/release-notes.ts');

function createServerFixture() {
  const account = {
    clientId: 'sock-1',
    readyState: 1,
    account: {
      id: '10000000-0000-4000-8000-000000000001',
      nickname: 'Alice',
      role: 'member',
      expiresAt: Date.now() + 120_000,
    },
  };
  const peer = {
    clientId: 'sock-2',
    readyState: 1,
    account: {
      id: '10000000-0000-4000-8000-000000000002',
      nickname: 'Bruno',
      role: 'member',
      expiresAt: Date.now() + 120_000,
    },
  };
  const guest = {
    clientId: 'sock-guest',
    readyState: 1,
    guest: {
      id: 'guest-1',
      nickname: 'Visitante',
      guest: true,
      expiresAt: Date.now() + 120_000,
    },
  };
  const clients = new Set([account, peer, guest]);
  const events = [];
  const service = createServerCommunity({
    wss: { clients },
    rooms: new Map(),
    send: (connection, message) => events.push({ connection, message }),
    auth: { configured: false },
  });
  return { service, account, peer, guest, clients, events };
}

test('server validates presenceStatus transitions, broadcasts changes, preserves across reconnect, and blocks guests', () => {
  assert.equal(readPresenceStatus('online'), 'online');
  assert.equal(readPresenceStatus('away'), 'away');
  assert.equal(readPresenceStatus('dnd'), 'dnd');
  for (const invalid of [null, undefined, '', 'invisible', 'offline', 123, {}]) {
    assert.equal(readPresenceStatus(invalid), null);
  }

  const f = createServerFixture();
  try {
    const initial = f.service.snapshot(f.peer).members.find((m) => m.id === f.account.account.id);
    assert.equal(initial.presenceStatus, 'online');

    // Guest cannot update status
    assert.equal(f.service.updatePresenceStatus(f.guest, 'dnd').ok, false);
    assert.equal(f.service.updatePresenceStatus(f.guest, 'dnd').code, 'AUTH_REQUIRED');

    // Invalid status rejected
    assert.equal(f.service.updatePresenceStatus(f.account, 'busy').code, 'INVALID_PRESENCE_STATUS');

    // Valid change to 'away' broadcasts to peers
    f.events.length = 0;
    assert.deepEqual(f.service.updatePresenceStatus(f.account, 'away'), {
      ok: true,
      status: 'away',
    });
    assert.ok(f.events.length >= 2);
    const peerBroadcast = f.events.find((e) => e.connection === f.peer);
    assert.equal(
      peerBroadcast.message.members.find((m) => m.id === f.account.account.id).presenceStatus,
      'away',
    );

    // Setting same status does not spam broadcast
    f.events.length = 0;
    assert.deepEqual(f.service.updatePresenceStatus(f.account, 'away'), {
      ok: true,
      status: 'away',
    });
    assert.equal(f.events.length, 0);

    // Changing to 'dnd' persists across a reconnecting socket of the same account
    assert.deepEqual(f.service.updatePresenceStatus(f.account, 'dnd'), { ok: true, status: 'dnd' });
    f.clients.delete(f.account);
    const reconnected = {
      clientId: 'sock-1-reconnected',
      readyState: 1,
      account: { ...f.account.account },
    };
    f.clients.add(reconnected);
    f.service.note(reconnected);
    assert.equal(reconnected.presenceStatus, 'dnd');
    const afterReconnect = f.service
      .snapshot(f.peer)
      .members.find((m) => m.id === f.account.account.id);
    assert.equal(afterReconnect.presenceStatus, 'dnd');
  } finally {
    f.service.stop();
  }
});

test('client DND suppresses notifications, DM alerts, and voice notices while keeping silent unread counters', async () => {
  const store = new Map();
  const prefListeners = new Set();
  const preferences = {
    get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
    set: (key, value) => {
      store.set(key, value);
      for (const fn of prefListeners) fn(key);
    },
  };
  const sentStatuses = [];
  const msgListeners = new Set();
  const network = {
    getSnapshot: () => ({ connected: true }),
    subscribe: () => () => {},
    onMessage: (fn) => {
      msgListeners.add(fn);
      return () => msgListeners.delete(fn);
    },
    requestPresence: () => {},
    setPresenceStatus: (status) => sentStatuses.push(status),
  };

  const community = createClientCommunity({
    network,
    getIdentity: () => ({
      key: 'account:10000000-0000-4000-8000-000000000001',
      accountId: '10000000-0000-4000-8000-000000000001',
      manageRoles: false,
    }),
    subscribeIdentity: () => () => {},
    authenticate: async () => true,
    preferences,
    subscribePreferences: (fn) => {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
  });

  const desktopDeliveries = [];
  const notifications = createNotifications({
    getAccountId: () => '10000000-0000-4000-8000-000000000001',
    preferences,
    channels: {
      getSnapshot: () => ({ channels: [{ id: 'chat-geral', name: 'Geral' }] }),
      subscribe: () => () => {},
    },
    network,
    getCurrentRoom: () => null,
    isChannelVisible: () => false,
    isForeground: () => false,
    desktop: true,
    desktopNotify: (payload) => desktopDeliveries.push(payload),
    resolveFileUrl: async (fileId) => `https://cdn.example.test/files/${fileId}.png`,
    getPermission: () => 'granted',
    requestPermission: async () => 'granted',
    navigate: () => {},
    scheduleRead: () => () => {},
    subscribeIdentity: () => () => {},
    subscribePreferences: (fn) => {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
    subscribeAttention: () => () => {},
    subscribeNotificationClick: () => () => {},
    onNoticesChanged: () => {},
  });

  try {
    community.start();
    notifications.start();
    await new Promise((r) => setTimeout(r, 15));

    // Online: mentions and image messages deliver with resolved imageUrl
    preferences.set('notifications', 'all');
    for (const fn of msgListeners) {
      fn({
        type: 'chat-notice',
        id: 'msg-img-1',
        roomId: 'chat-geral',
        roomName: 'Geral',
        name: 'Bruno',
        text: 'Olha essa print',
        mentioned: false,
        attachment: { id: 'file-123', name: 'print.png', mime: 'image/png' },
      });
    }
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(desktopDeliveries.length, 1);
    assert.equal(desktopDeliveries[0].imageUrl, 'https://cdn.example.test/files/file-123.png');
    assert.equal(notifications.getChannelState('chat-geral').unread, 1);

    // Switch to DND: broadcasts status, blocks notifications & voice notice popups, keeps silent unread count
    community.setPresenceStatus('dnd');
    assert.equal(community.getSnapshot().presenceStatus, 'dnd');
    assert.equal(sentStatuses.at(-1), 'dnd');
    assert.equal(notifications.allowed({ type: 'direct', id: 'peer-1' }, { direct: true }), false);
    assert.equal(
      notifications.allowed({ type: 'channel', id: 'chat-geral' }, { mention: true }),
      false,
    );

    community.voiceNotice({ id: 'v1', kind: 'joined', name: 'Bruno' });
    assert.equal(community.getSnapshot().notices.length, 0);
    assert.equal(community.getSnapshot().activities.length, 1);

    for (const fn of msgListeners) {
      fn({
        type: 'chat-notice',
        id: 'msg-dnd-2',
        roomId: 'chat-geral',
        roomName: 'Geral',
        name: 'Bruno',
        text: '@Alice oi',
        mentioned: true,
      });
    }
    await new Promise((r) => setTimeout(r, 15));
    // No new desktop delivery during DND, but silent unread counter increased to 2
    assert.equal(desktopDeliveries.length, 1);
    assert.equal(notifications.getChannelState('chat-geral').unread, 2);
  } finally {
    notifications.dispose();
    community.dispose();
  }
});

test('Electron notifications support DND suppression and Windows Toast XML hero images with safe cleanup', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-notif-img-test-'));
  const created = [];
  let dnd = false;
  class FakeNotification extends EventEmitter {
    static isSupported() {
      return true;
    }
    constructor(options) {
      super();
      this.options = options;
      created.push(this);
    }
    show() {
      this.shown = true;
    }
    close() {
      this.emit('close');
    }
  }
  const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 1]);
  const notices = createElectronNotifications({
    Notification: FakeNotification,
    window: { isFocused: () => false, isVisible: () => true },
    activate: () => {},
    isDnd: () => dnd,
    platform: 'win32',
    cacheDir,
    fetchImage: async (url) => {
      if (url.includes('broken')) return { ok: false };
      return {
        ok: true,
        headers: {
          get: (name) =>
            name.toLowerCase() === 'content-type'
              ? 'image/png'
              : name.toLowerCase() === 'content-length'
                ? String(pngBytes.length)
                : null,
        },
        arrayBuffer: async () => pngBytes,
      };
    },
  });

  const target = {
    type: 'direct',
    id: '10000000-0000-4000-8000-000000000001',
    accountId: '10000000-0000-4000-8000-000000000002',
  };

  try {
    // Rejects non-https / credentialed image URLs
    assert.throws(() =>
      notificationPayload({
        key: 'bad-1',
        title: 'T',
        body: 'B',
        imageUrl: 'http://insecure.example/a.png',
        target,
      }),
    );
    assert.throws(() =>
      notificationPayload({
        key: 'bad-2',
        title: 'T',
        body: 'B',
        imageUrl: 'https://user:pass@cdn.example/a.png',
        target,
      }),
    );

    // Valid image URL renders Windows Toast XML with hero image
    const res = await notices.notify({
      key: 'img-ok',
      title: 'Bruno <Admin>',
      body: 'Enviou uma foto',
      imageUrl: 'https://cdn.example.test/photo.png',
      target,
    });
    assert.equal(res.shown, true);
    assert.equal(res.hasImage, true);
    assert.equal(created.length, 1);
    assert.match(
      created[0].options.toastXml,
      /<image placement="hero" src="file:\/\/\/.+\.png"\/>/,
    );
    assert.match(created[0].options.toastXml, /Bruno &lt;Admin&gt;/);

    // Broken image falls back cleanly to standard Notification without losing message
    const fallback = await notices.notify({
      key: 'img-broken',
      title: 'Bruno',
      body: 'Enviou uma foto',
      imageUrl: 'https://cdn.example.test/broken.png',
      target,
    });
    assert.equal(fallback.shown, true);
    assert.equal(fallback.hasImage, false);
    assert.equal(created[1].options.title, 'Bruno');
    assert.equal(created[1].options.toastXml, undefined);

    // DND suppresses normal notifications, allows preview
    dnd = true;
    const blocked = notices.notify({
      key: 'dnd-1',
      title: 'Bruno',
      body: 'Oi',
      target,
    });
    assert.equal(blocked.shown, false);
    assert.equal(blocked.reason, 'dnd');
    const preview = notices.notify({
      key: 'dnd-preview',
      title: 'Teste',
      body: 'Preview',
      preview: true,
      target,
    });
    assert.equal(preview.shown, true);

    assert.match(
      buildWindowsToastXml({ title: 'A & B', body: 'C', imagePath: '/tmp/test.png' }),
      /A &amp; B/,
    );
  } finally {
    notices.dispose();
    await new Promise((r) => setTimeout(r, 20));
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('release notes appear only on the first open of a new version', () => {
  const backing = new Map();
  const storage = {
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => backing.set(k, String(v)),
  };
  assert.equal(shouldShowReleaseNotes(storage, APP_RELEASE_VERSION), true);
  markReleaseNotesSeen(storage, APP_RELEASE_VERSION);
  assert.equal(shouldShowReleaseNotes(storage, APP_RELEASE_VERSION), false);
  // Future version triggers again once
  assert.equal(shouldShowReleaseNotes(storage, '2.2.0'), true);
});
