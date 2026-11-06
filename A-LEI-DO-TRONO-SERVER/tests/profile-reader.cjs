'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/profiles/protocol.ts'),
  import('../src/lib/profiles/client.ts'),
  import('../src/lib/profiles/viewer.ts'),
]);
const ids = ['alice', 'bob', 'carol', 'image'].map(
  (_, index) => '10000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
);
const [alice, bob, carol, image] = ids;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const person = (id = bob, patch = {}) => ({
  id,
  nickname: id === alice ? 'Alice' : id === bob ? 'Bob' : 'Carol',
  avatar_preset: 'crown',
  avatar_file_id: null,
  created_at: '2026-10-01T12:00:00Z',
  personalization: {},
  ...patch,
});
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function setup(t, role = 'member') {
  const [, { createProfiles }, { createProfileViewer }] = await modules;
  let account = { id: alice, role, permissions: {} },
    token = async () => 'access-token';
  let request = async (path) => response({ profile: person(path.split('/').at(-1)) });
  const identities = new Set(),
    messages = new Set(),
    profiles = new Set();
  const requests = [],
    opened = [],
    changes = [];
  const subscribe = (set) => (listener) => {
    set.add(listener);
    return () => set.delete(listener);
  };
  const client = createProfiles({
    backendHttp: 'https://backend.test',
    getAccount: () => account,
    getAccessToken: () => token(),
    fetch: (url, init) => {
      const path = url.slice('https://backend.test/community/'.length);
      requests.push({ path, init });
      return request(path, init);
    },
    subscribeIdentity: subscribe(identities),
    subscribeMessages: subscribe(messages),
    subscribeProfileChange: subscribe(profiles),
  });
  const viewer = createProfileViewer({ client, openMessage: (id) => opened.push(id) });
  const off = viewer.subscribe(() => changes.push(viewer.getSnapshot()));
  t.after(() => {
    off();
    viewer.dispose();
    client.dispose();
  });
  return {
    client,
    viewer,
    requests,
    opened,
    changes,
    request(value) {
      request = value;
    },
    token(value) {
      token = value;
    },
    identity(id, role = 'member', permissions = {}) {
      account = id ? { id, role, permissions } : null;
      [...identities].forEach((listener) => listener());
    },
    update(id = bob) {
      [...messages].forEach((listener) =>
        listener({ type: 'member-profile-updated', accountId: id }),
      );
    },
    profileChange() {
      [...profiles].forEach((listener) => listener());
    },
    listeners: () => [identities.size, messages.size, profiles.size],
  };
}

test('untrusted public profiles discard credentials and normalize bounded appearance values', async () => {
  const [{ readMemberProfile }] = await modules;
  const profile = readMemberProfile(
    person(bob, {
      email: 'private@example.test',
      access_token: 'secret',
      avatar_file_id: 'forged',
      personalization: {
        handle: '@bob_games',
        bio: '  Hello\u0000 world  ',
        tags: ['Games', 'Games', null, 'Music'],
        accent: 'url(javascript:alert(1))',
        darkness: -20,
        blur: 999,
        opacity: '99',
        cover_position: Infinity,
        cover_zoom: 155.4,
        background_file_id: image,
      },
    }),
  );
  assert.equal(profile.avatar_file_id, null);
  assert.equal(profile.personalization.handle, 'bob_games');
  assert.equal(profile.personalization.bio, 'Hello world');
  assert.deepEqual(profile.personalization.tags, ['Games', 'Music']);
  assert.equal(profile.personalization.accent, '#7865ff');
  assert.equal(profile.personalization.darkness, 0);
  assert.equal(profile.personalization.blur, 20);
  assert.equal(profile.personalization.opacity, 90);
  assert.equal(profile.personalization.cover_position, 50);
  assert.equal(profile.personalization.cover_zoom, 155);
  assert.equal(profile.personalization.background_file_id, image);
  assert.ok(!JSON.stringify(profile).includes('private@example.test'));
  assert.ok(!JSON.stringify(profile).includes('secret'));
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.personalization));
  assert.ok(Object.isFrozen(profile.personalization.tags));
});

test('profile links never expose executable, credentialed, malformed or insecure addresses', async () => {
  const [{ readProfilePersonalization }] = await modules;
  const result = readProfilePersonalization({
    links: [
      { label: 'Code', url: 'https://github.com/example' },
      { label: 'Executable', url: 'javascript:alert(1)' },
      { label: 'Credentials', url: 'https://name:secret@example.test' },
      { label: 'HTTP', url: 'http://example.test' },
      { label: 'Spaces', url: 'https://example.test/a b' },
      { label: 'Data', url: 'data:text/html,<script>bad</script>' },
      null,
      { label: '', url: 'https://example.test/' },
    ],
  });
  assert.deepEqual(result.links, [
    { label: 'Code', url: 'https://github.com/example' },
    { label: 'example.test', url: 'https://example.test/' },
  ]);
});

test('media credits admit known provider pages only and sanitize optional license links', async () => {
  const [{ readProfilePersonalization }] = await modules;
  const credit = (source) => ({
    title: 'Reaction',
    author: 'Artist',
    license: 'Source',
    source,
    license_url: 'javascript:bad()',
  });
  for (const source of [
    'https://giphy.com.evil.test/gifs/reaction-abc',
    'https://giphy.com/search/cats',
    'https://giphy.com:444/gifs/reaction-abc',
    'javascript:bad()',
  ]) {
    assert.deepEqual(
      readProfilePersonalization({ media_credits: { avatar: credit(source) } }).media_credits,
      {},
    );
  }
  const result = readProfilePersonalization({
    media_credits: {
      avatar: credit('https://giphy.com/gifs/reaction-abc'),
      cover: credit('https://commons.wikimedia.org/wiki/File:Example.gif'),
      forged: credit('https://giphy.com/gifs/reaction-abc'),
    },
  });
  assert.deepEqual(Object.keys(result.media_credits), ['avatar', 'cover']);
  assert.equal(result.media_credits.avatar.license_url, '');
  assert.ok(Object.isFrozen(result.media_credits.avatar));
});

test('malformed profile identities and account directory envelopes fail before reaching a view', async () => {
  const [{ readMemberProfile, readRegisteredAccountsPage }] = await modules;
  for (const value of [null, [], {}, person('not-a-uuid'), person(bob, { nickname: '' })])
    assert.throws(() => readMemberProfile(value));
  const page = {
    accounts: [{ id: bob, nickname: 'Bob', email: 'bob@example.test', confirmed: true }],
    hasMore: false,
    nextOffset: 1,
  };
  assert.equal(readRegisteredAccountsPage(page).accounts[0].email, 'bob@example.test');
  for (const patch of [
    { hasMore: 'true' },
    { nextOffset: NaN },
    { nextOffset: -1 },
    { accounts: [{ id: bob, nickname: 'Bob', email: null, confirmed: true }] },
  ])
    assert.throws(() => readRegisteredAccountsPage({ ...page, ...patch }));
});

test('the reader authenticates requests and refuses profiles with a different identity', async (t) => {
  const h = await setup(t);
  const profile = await h.client.readProfile(bob);
  assert.equal(profile.id, bob);
  assert.equal(h.requests[0].path, 'profiles/' + bob);
  assert.equal(h.requests[0].init.headers.Authorization, 'Bearer access-token');
  assert.equal(h.requests[0].init.cache, 'no-store');
  h.request(async () => response({ profile: person(carol) }));
  await assert.rejects(h.client.readProfile(bob));
});

test('missing accounts, missing tokens and invalid targets cannot issue public-profile requests', async (t) => {
  const h = await setup(t);
  await assert.rejects(h.client.readProfile('not-an-id'));
  h.identity(null);
  await assert.rejects(h.client.readProfile(bob));
  h.identity(alice);
  h.token(async () => null);
  await assert.rejects(h.client.readProfile(bob));
  assert.equal(h.requests.length, 0);
});

test('account ABA while obtaining credentials does not send an old request', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.token(() => held.promise);
  const pending = h.client.readProfile(bob);
  h.identity(carol);
  h.identity(alice);
  held.resolve('old-token');
  await assert.rejects(pending);
  assert.equal(h.requests.length, 0);
});

test('account ABA after fetch invalidates the public profile response', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const pending = h.client.readProfile(bob);
  await tick();
  h.identity(carol);
  h.identity(alice);
  held.resolve(response({ profile: person(bob) }));
  await assert.rejects(pending);
});

test('only the creator can request private account pages and role changes invalidate pending pages', async (t) => {
  const h = await setup(t);
  await assert.rejects(h.client.readAccounts());
  h.identity(alice, 'admin');
  await assert.rejects(h.client.readAccounts());
  assert.equal(h.requests.length, 0);
  h.identity(alice, 'creator');
  const held = deferred();
  h.request(() => held.promise);
  const pending = h.client.readAccounts(50);
  await tick();
  assert.equal(h.requests.at(-1).path, 'registered-accounts?offset=50');
  h.identity(alice, 'member');
  held.resolve(
    response({
      accounts: [{ id: bob, nickname: 'Bob', email: 'private@example.test', confirmed: true }],
      hasMore: false,
      nextOffset: 51,
    }),
  );
  await assert.rejects(pending);
});

test('closing a directory cancels its pending token before sending private requests', async (t) => {
  const h = await setup(t, 'creator'),
    token = deferred(),
    controller = new AbortController();
  h.token(() => token.promise);
  const pending = h.client.readAccounts(0, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending);
  token.resolve('late-token');
  await tick();
  assert.equal(h.requests.length, 0);
});

test('creator permission revocation hides account data even if the account and role stay the same', async (t) => {
  const h = await setup(t, 'creator'),
    held = deferred();
  h.request(() => held.promise);
  const pending = h.client.readAccounts();
  await tick();
  h.identity(alice, 'creator', { viewEmails: false });
  held.resolve(response({ accounts: [], hasMore: false, nextOffset: 0 }));
  await assert.rejects(pending);
  await assert.rejects(h.client.readAccounts());
  assert.equal(h.requests.length, 1);
});

test('private directory paging rejects invalid offsets and inconsistent cursors', async (t) => {
  const h = await setup(t, 'creator');
  for (const offset of [-1, NaN, 0.5, 1000001]) await assert.rejects(h.client.readAccounts(offset));
  assert.equal(h.requests.length, 0);
  h.request(async () => response({ accounts: [], hasMore: false, nextOffset: 12 }));
  await assert.rejects(h.client.readAccounts(50));
  h.request(async () => response({ accounts: [], hasMore: true, nextOffset: 50 }));
  await assert.rejects(h.client.readAccounts(50));
  h.request(async () =>
    response({
      accounts: [{ id: bob, nickname: 'Bob', email: 'bob@example.test', confirmed: true }],
      hasMore: false,
      nextOffset: 51,
    }),
  );
  assert.equal((await h.client.readAccounts(50)).accounts[0].email, 'bob@example.test');
});

test('anonymous and malformed viewer opens leave the dialog closed without issuing requests', async (t) => {
  const h = await setup(t);
  for (const value of [null, {}, { accountId: 'not-a-uuid' }, [], 42]) await h.viewer.open(value);
  h.identity(null);
  await h.viewer.open(bob);
  assert.equal(h.viewer.getSnapshot().open, false);
  assert.equal(h.requests.length, 0);
});

test('viewer loads a profile, expands without a request, and opens direct messages after closing', async (t) => {
  const h = await setup(t);
  await h.viewer.open({ accountId: bob });
  assert.equal(h.viewer.getSnapshot().profile.id, bob);
  assert.equal(h.viewer.getSnapshot().canMessage, true);
  h.viewer.expand();
  assert.equal(h.viewer.getSnapshot().full, true);
  assert.equal(h.requests.length, 1);
  h.viewer.message();
  assert.equal(h.viewer.getSnapshot().open, false);
  await tick();
  assert.deepEqual(h.opened, [bob]);
});

test('self profiles never offer a direct-message action', async (t) => {
  const h = await setup(t);
  await h.viewer.open(alice, { full: true });
  assert.equal(h.viewer.getSnapshot().full, true);
  assert.equal(h.viewer.getSnapshot().canMessage, false);
  h.viewer.message();
  assert.deepEqual(h.opened, []);
});

test('a response completed after close cannot repopulate or reopen the profile', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const pending = h.viewer.open(bob);
  await tick();
  assert.equal(h.viewer.getSnapshot().loading, true);
  h.viewer.close();
  held.resolve(response({ profile: person(bob) }));
  await pending;
  assert.equal(h.viewer.getSnapshot().open, false);
  assert.equal(h.viewer.getSnapshot().profile, null);
});

test('closing while credentials are pending cancels the view without waiting for token retrieval', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.token(() => held.promise);
  const pending = h.viewer.open(bob);
  await tick();
  h.viewer.close();
  await pending;
  assert.equal(h.viewer.getSnapshot().open, false);
  held.resolve('obsolete-token');
  await tick();
  assert.equal(h.requests.length, 0);
});

test('the latest target owns its result even if an earlier request fails afterwards', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const old = h.viewer.open(bob);
  await tick();
  h.request(async () => response({ profile: person(carol) }));
  await h.viewer.open({ id: carol });
  held.reject(new Error('Old request failed'));
  await old;
  assert.equal(h.viewer.getSnapshot().profile.id, carol);
  assert.equal(h.viewer.getSnapshot().message, '');
  assert.equal(h.viewer.getSnapshot().loading, false);
});

test('logout closes the viewer immediately and a late profile cannot reveal the old account view', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const pending = h.viewer.open(bob);
  await tick();
  h.identity(null);
  assert.equal(h.viewer.getSnapshot().open, false);
  held.resolve(response({ profile: person(bob) }));
  await pending;
  assert.equal(h.viewer.getSnapshot().profile, null);
  assert.equal(h.viewer.getSnapshot().canMessage, false);
});

test('profile updates refresh the visible target without reopening a closed dialog', async (t) => {
  const h = await setup(t);
  await h.viewer.open(bob);
  h.request(async () => response({ profile: person(bob, { nickname: 'Updated Bob' }) }));
  h.update();
  await tick();
  assert.equal(h.viewer.getSnapshot().profile.nickname, 'Updated Bob');
  h.viewer.close();
  const count = h.requests.length;
  h.update();
  await tick();
  assert.equal(h.viewer.getSnapshot().open, false);
  assert.equal(h.requests.length, count);
});

test('current server failures remain visible while dispose detaches identity and socket listeners', async (t) => {
  const h = await setup(t);
  h.request(async () => response({ error: { message: 'Perfil indisponível.' } }, 503));
  await h.viewer.open(bob);
  assert.equal(h.viewer.getSnapshot().loading, false);
  assert.match(h.viewer.getSnapshot().message, /Perfil indisponível/);
  h.viewer.dispose();
  h.client.dispose();
  assert.deepEqual(h.listeners(), [0, 0, 0]);
});
