'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/profiles/editor.ts'),
  import('../src/lib/profiles/protocol.ts'),
  import('../src/lib/profiles/editor-validation.ts'),
]);
const [alice, bob, avatar, cover, background] = [1, 2, 3, 4, 5].map(
  (n) => '22000000-0000-4000-8000-' + String(n).padStart(12, '0'),
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const file = (name = 'media.gif') => new File(['GIF89a'], name, { type: 'image/gif' });
const credit = Object.freeze({
  title: 'Animation',
  author: 'Artist',
  license: 'Ver no GIPHY',
  source: 'https://giphy.com/gifs/animation-abc123',
  license_url: '',
});

async function setup(t) {
  const [{ createProfileEditor }, { readMemberProfile }] = await modules;
  let account = { id: alice, nickname: 'Alice', avatar_preset: 'crown', avatar_file_id: avatar };
  const profile = (id = account.id, patch = {}) =>
    readMemberProfile({
      id,
      nickname: id === alice ? 'Alice' : 'Bob',
      avatar_preset: 'crown',
      avatar_file_id: avatar,
      created_at: '2026-10-01T12:00:00Z',
      personalization: {},
      ...patch,
    });
  let read = async (id) => profile(id),
    format = async (value) => value;
  let upload = async () => ({ id: cover }),
    write = async () => {};
  const identities = new Set(),
    requests = [],
    uploads = [],
    writes = [],
    created = [],
    revoked = [],
    changes = [];
  let onChange = 0,
    drafts = 0;
  const editor = createProfileEditor({
    getAccount: () => account,
    profiles: {
      readProfile: (...args) => {
        requests.push(args);
        return read(...args);
      },
    },
    files: {
      upload: (...args) => {
        uploads.push(args);
        return upload(...args);
      },
    },
    updateProfile: (value) => {
      writes.push(value);
      return write(value);
    },
    subscribeIdentity: (listener) => {
      identities.add(listener);
      return () => identities.delete(listener);
    },
    formatPhoto: (...args) => format(...args),
    createObjectURL: (value) => {
      const url = 'blob:fixture-' + (created.length + 1);
      created.push({ value, url });
      return url;
    },
    revokeObjectURL: (url) => revoked.push(url),
    onChange: () => onChange++,
    onDraftChange: () => drafts++,
  });
  const off = editor.subscribe(() => changes.push(editor.getSnapshot()));
  t.after(() => {
    off();
    editor.dispose();
  });
  return {
    editor,
    profile,
    requests,
    uploads,
    writes,
    created,
    revoked,
    changes,
    read(value) {
      read = value;
    },
    format(value) {
      format = value;
    },
    upload(value) {
      upload = value;
    },
    write(value) {
      write = value;
    },
    identity(id) {
      account = id
        ? {
            id,
            nickname: id === alice ? 'Alice' : 'Bob',
            avatar_preset: 'crown',
            avatar_file_id: avatar,
          }
        : null;
      [...identities].forEach((listener) => listener());
    },
    listeners: () => identities.size,
    notifications: () => ({ onChange, drafts }),
  };
}

test('loading owns one account, exposes an immutable draft and protects all persisted profile media', async (t) => {
  const h = await setup(t),
    pending = deferred();
  h.read(() => pending.promise);
  const loading = h.editor.load();
  assert.equal(h.editor.getSnapshot().loading, true);
  assert.equal(h.editor.getSnapshot().loaded, false);
  pending.resolve(
    h.profile(alice, {
      personalization: {
        bio: 'About',
        cover_file_id: cover,
        background_file_id: background,
        links: [{ label: 'Code', url: 'https://github.com/example' }],
      },
    }),
  );
  await loading;
  const state = h.editor.getSnapshot();
  assert.equal(state.nickname, 'Alice');
  assert.equal(state.loading, false);
  assert.equal(state.loaded, true);
  assert.equal(state.draft.bio, 'About');
  assert.deepEqual(h.editor.getProtectedFileIds(), [avatar, cover, background]);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.draft));
  assert.ok(Object.isFrozen(state.links));
});

test('failed loads keep editing unavailable and a later reload recovers', async (t) => {
  const h = await setup(t);
  h.read(async () => {
    throw new Error('Servidor indisponível');
  });
  await h.editor.load();
  assert.equal(h.editor.getSnapshot().loaded, false);
  assert.equal(h.editor.getSnapshot().error, true);
  assert.match(h.editor.getSnapshot().message, /indisponível/);
  await h.editor.save();
  assert.equal(h.writes.length, 0);
  h.read(async (id) => h.profile(id));
  await h.editor.load();
  assert.equal(h.editor.getSnapshot().loaded, true);
});

test('close/reset prevents a pending load from restoring a discarded editor', async (t) => {
  const h = await setup(t),
    pending = deferred();
  h.read(() => pending.promise);
  const loading = h.editor.load();
  h.editor.reset();
  pending.resolve(h.profile(alice, { personalization: { bio: 'Old data' } }));
  await loading;
  assert.equal(h.editor.getSnapshot().loaded, false);
  assert.notEqual(h.editor.getSnapshot().draft.bio, 'Old data');
});

test('account ABA changes invalidate both successful and failed operations from an earlier session', async (t) => {
  const h = await setup(t),
    pending = deferred();
  h.read(() => pending.promise);
  const loading = h.editor.load();
  h.identity(bob);
  h.identity(alice);
  pending.resolve(h.profile(alice, { personalization: { bio: 'Earlier Alice session' } }));
  await loading;
  assert.equal(h.editor.getSnapshot().loaded, false);
  assert.notEqual(h.editor.getSnapshot().draft.bio, 'Earlier Alice session');
  h.read(async (id) => h.profile(id));
  await h.editor.load();
  const formatted = deferred();
  h.format(() => formatted.promise);
  const picking = h.editor.pick(file(), 'cover');
  h.identity(bob);
  formatted.reject(new Error('Old conversion failure'));
  await picking.catch(() => {});
  assert.equal(h.editor.getSnapshot().error, false);
  assert.equal(h.created.length, 0);
});

test('the newest pick for each media slot wins even when an earlier conversion completes last', async (t) => {
  const h = await setup(t),
    older = deferred(),
    newer = deferred();
  await h.editor.load();
  const oldFile = file('old.gif'),
    newFile = file('new.gif');
  h.format((value) => (value === oldFile ? older.promise : newer.promise));
  const first = h.editor.pick(oldFile, 'cover');
  const second = h.editor.pick(newFile, 'cover', credit);
  newer.resolve(newFile);
  await second;
  older.resolve(oldFile);
  await first;
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].value, newFile);
  assert.equal(h.editor.getSnapshot().urls.cover, h.created[0].url);
  assert.deepEqual(h.editor.getSnapshot().draft.media_credits.cover, credit);
});

test('a preset or media removal invalidates pending conversions and clears only that slot and its credit', async (t) => {
  const h = await setup(t),
    pending = deferred();
  await h.editor.load();
  await h.editor.pick(file(), 'cover', credit);
  await h.editor.pick(file(), 'avatar', credit);
  h.editor.selectPreset('crown');
  assert.equal(h.editor.getSnapshot().avatarFileId, null);
  assert.equal(h.editor.getSnapshot().urls.avatar, undefined);
  assert.equal(h.editor.getSnapshot().draft.media_credits.avatar, undefined);
  assert.deepEqual(h.editor.getSnapshot().draft.media_credits.cover, credit);
  h.format(() => pending.promise);
  const picking = h.editor.pick(file(), 'cover');
  h.editor.removeMedia('cover');
  pending.resolve(file());
  await picking;
  assert.equal(h.editor.getSnapshot().urls.cover, undefined);
  assert.equal(h.editor.getSnapshot().draft.cover_file_id, null);
  assert.equal(h.editor.getSnapshot().draft.media_credits.cover, undefined);
});

test('object URLs are revoked exactly once on replacement, removal, account changes and disposal', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  await h.editor.pick(file('a.gif'), 'cover');
  await h.editor.pick(file('b.gif'), 'cover');
  await h.editor.pick(file('c.gif'), 'avatar');
  h.editor.removeMedia('cover');
  h.identity(bob);
  await h.editor.load();
  await h.editor.pick(file('d.gif'), 'background');
  h.editor.dispose();
  h.editor.dispose();
  assert.deepEqual([...h.revoked].sort(), h.created.map((entry) => entry.url).sort());
  assert.equal(new Set(h.revoked).size, h.revoked.length);
  assert.equal(h.listeners(), 0);
});

test('invalid raw links stay editable in a tolerant preview and strict save refuses transport', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  h.editor.setLink(0, 'url', 'https://example.test/has spaces');
  h.editor.setField('bio', 'Still editing');
  assert.equal(h.editor.getSnapshot().links[0].url, 'https://example.test/has spaces');
  assert.equal(h.editor.getSnapshot().draft.bio, 'Still editing');
  await h.editor.save();
  assert.equal(h.editor.getSnapshot().error, true);
  assert.equal(h.writes.length, 0);
  assert.equal(h.uploads.length, 0);
  h.editor.setLink(0, 'url', 'youtube.com/@example');
  h.editor.setField('emoji', '👨‍👩‍👧‍👦');
  await h.editor.save();
  assert.deepEqual(h.writes[0].personalization.links, [
    { label: 'YouTube', url: 'https://youtube.com/@example' },
  ]);
  assert.equal(h.writes[0].personalization.emoji, '👨‍👩‍👧‍👦');
});

test('eight raw link rows are the limit and removing one permits another', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  for (let n = 0; n < 20; n++) h.editor.addLink();
  assert.equal(h.editor.getSnapshot().links.length, 8);
  h.editor.removeLink(7);
  h.editor.addLink();
  assert.equal(h.editor.getSnapshot().links.length, 8);
});

test('strict profile links reject executable URLs, credentials, whitespace and missing addresses', async () => {
  const [, , { normalizeProfileLinks, normalizeProfileUrl }] = await modules;
  for (const url of [
    'javascript:alert(1)',
    'data:text/plain,bad',
    'https://name:secret@example.test',
    'https://example.test/a b',
    'localhost',
  ]) {
    assert.throws(() => normalizeProfileUrl(url));
    assert.deepEqual(normalizeProfileLinks([{ label: 'Unsafe', url }], { strict: false }), []);
  }
  assert.throws(() => normalizeProfileLinks([{ label: 'Missing', url: '' }]));
  assert.throws(() => normalizeProfileLinks([{ label: 'x'.repeat(33), url: 'example.test' }]));
  assert.throws(() =>
    normalizeProfileLinks(Array.from({ length: 9 }, () => ({ label: '', url: '' }))),
  );
  assert.equal(normalizeProfileUrl('http://twitch.tv/example'), 'https://twitch.tv/example');
});

test('status accepts one complete emoji grapheme and rejects text or multiple emoji', async () => {
  const [, , { validateProfileEmoji }] = await modules;
  for (const emoji of ['👨‍👩‍👧‍👦', '🏳️‍🌈', '🇧🇷', '1️⃣', ''])
    assert.equal(validateProfileEmoji(emoji), emoji);
  for (const value of ['🎮🎧', 'status', 'a🎧']) assert.throws(() => validateProfileEmoji(value));
});

test('interest validation permits twelve tags and rejects too many or oversized tags before saving', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  for (const tags of [Array.from({ length: 13 }, (_, n) => 'Tag ' + n).join(','), 'x'.repeat(25)]) {
    h.editor.setTags(tags);
    await h.editor.save();
    assert.equal(h.editor.getSnapshot().error, true);
    assert.equal(h.writes.length, 0);
  }
  h.editor.setTags(Array.from({ length: 12 }, (_, n) => 'Tag ' + n).join(', '));
  await h.editor.save();
  assert.equal(h.writes[0].personalization.tags.length, 12);
});

test('partial upload failure retries only unfinished media and retains credits and successful IDs', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  await h.editor.pick(file('avatar.gif'), 'avatar', credit);
  await h.editor.pick(file('cover.gif'), 'cover', credit);
  let fail = true;
  h.upload(async (value, options) => {
    options.onProgress?.(42);
    if (value.name === 'cover.gif' && fail) throw new Error('Upload interrupted');
    return { id: value.name === 'avatar.gif' ? avatar : cover };
  });
  await h.editor.save();
  assert.equal(h.editor.getSnapshot().error, true);
  assert.deepEqual(h.editor.getSnapshot().pending, ['cover']);
  assert.equal(h.editor.getSnapshot().avatarFileId, avatar);
  assert.equal(h.writes.length, 0);
  assert.ok(h.changes.some((state) => /42%/.test(state.message)));
  fail = false;
  await h.editor.save();
  assert.deepEqual(
    h.uploads.map(([value]) => value.name),
    ['avatar.gif', 'cover.gif', 'cover.gif'],
  );
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].avatar_file_id, avatar);
  assert.equal(h.writes[0].personalization.cover_file_id, cover);
  assert.deepEqual(h.writes[0].personalization.media_credits, { avatar: credit, cover: credit });
  assert.equal(h.editor.getSnapshot().busy, false);
  assert.equal(h.editor.getSnapshot().error, false);
  assert.equal(h.notifications().onChange, 1);
});

test('a failed profile write reuses completed uploads when saving again', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  await h.editor.pick(file(), 'background');
  h.upload(async () => ({ id: background }));
  h.write(async () => {
    throw new Error('Profile write unavailable');
  });
  await h.editor.save();
  assert.equal(h.editor.getSnapshot().draft.background_file_id, background);
  assert.equal(h.editor.getSnapshot().error, true);
  h.write(async () => {});
  await h.editor.save();
  assert.equal(h.uploads.length, 1);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].personalization.background_file_id, background);
});

test('duplicate save requests share no extra uploads and discarded upload progress cannot touch a new editor', async (t) => {
  const h = await setup(t),
    pending = deferred();
  await h.editor.load();
  await h.editor.pick(file(), 'cover');
  let progress;
  h.upload((value, options) => {
    progress = options.onProgress;
    return pending.promise;
  });
  const saving = h.editor.save();
  await tick();
  await h.editor.save();
  assert.equal(h.uploads.length, 1);
  h.editor.reset();
  await h.editor.load();
  h.editor.setField('bio', 'New draft');
  const state = h.editor.getSnapshot();
  progress(99);
  pending.resolve({ id: cover });
  await saving;
  assert.equal(h.editor.getSnapshot(), state);
  assert.equal(h.writes.length, 0);
});

test('account changes during profile saving cannot publish old success or reset a new session busy state', async (t) => {
  const h = await setup(t),
    oldWrite = deferred(),
    nextWrite = deferred();
  await h.editor.load();
  h.write(() => oldWrite.promise);
  const oldSave = h.editor.save();
  await tick();
  h.identity(bob);
  await h.editor.load();
  h.write(() => nextWrite.promise);
  const newSave = h.editor.save();
  await tick();
  oldWrite.resolve();
  await oldSave;
  assert.equal(h.editor.getSnapshot().busy, true);
  assert.equal(h.notifications().onChange, 0);
  nextWrite.resolve();
  await newSave;
  assert.equal(h.editor.getSnapshot().busy, false);
  assert.equal(h.notifications().onChange, 1);
});

test('dispose invalidates pending picks without creating URLs or disposing shared transports', async (t) => {
  const h = await setup(t),
    pending = deferred();
  await h.editor.load();
  h.format(() => pending.promise);
  const picking = h.editor.pick(file(), 'avatar');
  h.editor.dispose();
  const state = h.editor.getSnapshot();
  pending.resolve(file());
  await picking;
  assert.equal(h.editor.getSnapshot(), state);
  assert.equal(h.created.length, 0);
  assert.equal(h.listeners(), 0);
  assert.equal(h.uploads.length, 0);
});

test('external GIF callbacks expire after another picker, reset, preset selection or account change', async (t) => {
  const h = await setup(t);
  await h.editor.load();
  const obsolete = h.editor.createMediaPicker('cover');
  const current = h.editor.createMediaPicker('cover');
  await obsolete(file('stale.gif'), credit);
  assert.equal(h.created.length, 0);
  await current(file('current.gif'), credit);
  assert.equal(h.created.length, 1);
  assert.deepEqual(h.editor.getSnapshot().draft.media_credits.cover, credit);
  const previousDraft = h.editor.createMediaPicker('cover');
  h.editor.reset();
  await h.editor.load();
  await previousDraft(file('previous-draft.gif'), credit);
  assert.equal(h.created.length, 1);
  const avatarPicker = h.editor.createMediaPicker('avatar');
  h.editor.selectPreset('crown');
  await avatarPicker(file(), credit);
  assert.equal(h.created.length, 1);
  const otherAccount = h.editor.createMediaPicker('background');
  h.identity(bob);
  await h.editor.load();
  await otherAccount(file(), credit);
  assert.equal(h.created.length, 1);
});

test('saving waits for an unfinished image conversion and uploads the prepared file on retry', async (t) => {
  const h = await setup(t),
    pending = deferred();
  await h.editor.load();
  h.format(() => pending.promise);
  const picking = h.editor.pick(file(), 'cover');
  await h.editor.save();
  assert.equal(h.uploads.length, 0);
  assert.equal(h.writes.length, 0);
  assert.match(h.editor.getSnapshot().message, /preparação/);
  pending.resolve(file());
  await picking;
  await h.editor.save();
  assert.equal(h.uploads.length, 1);
  assert.equal(h.writes.length, 1);
});

test('media preparation preserves GIF bytes, crops static avatars and always closes decoded bitmaps', async (t) => {
  const { formatProfilePhoto } = await import('../src/lib/profiles/media.ts');
  const previousBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previousBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousBitmap);
    else delete globalThis.createImageBitmap;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const bitmaps = [],
    draws = [];
  let dimensions = [800, 400],
    failBlob = false;
  globalThis.createImageBitmap = async () => {
    const bitmap = {
      width: dimensions[0],
      height: dimensions[1],
      closed: 0,
      close() {
        this.closed++;
      },
    };
    bitmaps.push(bitmap);
    return bitmap;
  };
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args) => draws.push(args) }),
      toBlob: (callback) => callback(failBlob ? null : new Blob(['PNG'], { type: 'image/png' })),
    }),
  };
  const animated = file();
  assert.equal(await formatProfilePhoto(animated), animated);
  const png = new File(['original pixels'], 'photo.png', { type: 'image/png' });
  assert.equal(await formatProfilePhoto(png, { avatar: false }), png);
  const cropped = await formatProfilePhoto(png);
  assert.equal(cropped.name, 'avatar.png');
  assert.equal(cropped.type, 'image/png');
  assert.deepEqual(draws[0].slice(1), [200, 0, 400, 400, 0, 0, 256, 256]);
  failBlob = true;
  await assert.rejects(formatProfilePhoto(png), /preparar/);
  dimensions = [10000, 5000];
  await assert.rejects(formatProfilePhoto(animated), /resolução/);
  for (const bitmap of bitmaps) assert.equal(bitmap.closed, 1);
  const count = bitmaps.length;
  await assert.rejects(
    formatProfilePhoto(new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })),
    /10 MB/,
  );
  await assert.rejects(
    formatProfilePhoto(new File([new Uint8Array(10_000_001)], 'large.png', { type: 'image/png' })),
    /10 MB/,
  );
  assert.equal(bitmaps.length, count);
});
