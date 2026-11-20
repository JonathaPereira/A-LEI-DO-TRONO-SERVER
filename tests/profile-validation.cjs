'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanProfile } = require('../server/profile-customization.ts');
const validation = require('../src/lib/profiles/validation.ts');
const editor = require('../src/lib/profiles/editor-validation.ts');

test('profile editor and HTTP writes use the same normalizers without mutating input', () => {
  const links = Object.freeze([
    Object.freeze({ label: '', url: 'youtube.com/@jogador' }),
    Object.freeze({ label: ' Ao vivo ', url: 'http://twitch.tv/jogador' }),
    Object.freeze({ label: '', url: '' }),
  ]);
  const input = Object.freeze({
    links,
    emoji: ' 👨‍👩‍👧‍👦 ',
    tags: Object.freeze([' Jogos ', 'Jogos', 'Música']),
    cover_zoom: 150.4,
  });
  const saved = cleanProfile(input);
  assert.strictEqual(editor.normalizeProfileLinks, validation.normalizeProfileLinks);
  assert.strictEqual(editor.normalizeProfileUrl, validation.normalizeProfileUrl);
  assert.strictEqual(editor.validateProfileEmoji, validation.validateProfileEmoji);
  assert.deepEqual(saved.links, editor.normalizeProfileLinks(links));
  assert.equal(saved.emoji, editor.validateProfileEmoji(input.emoji));
  assert.deepEqual(saved.tags, ['Jogos', 'Música']);
  assert.equal(saved.cover_zoom, 150);
  assert.equal(links[1].url, 'http://twitch.tv/jogador');
  assert.equal(saved.links[0].label, 'YouTube');
  assert.equal(saved.links[1].url, 'https://twitch.tv/jogador');
  assert.equal(saved.accent, '#7865ff');
  assert.equal(saved.opacity, 90);
});

test('untrusted profile bodies preserve INVALID_PROFILE errors at the HTTP boundary', () => {
  for (const body of [
    null, [], 'profile', { links: {} }, { tags: [null] }, { bio: 42 },
    { links: [{ url: 'https://user:secret@example.test' }] },
    { links: [{ url: 'javascript:alert(1)' }] }, { emoji: '🎮🎧' },
    { darkness: Infinity }, { cover_file_id: {} }, { accent: '#fff' },
    { status: 'bad\u0000text' }, { media_credits: null },
  ]) {
    assert.throws(() => cleanProfile(body), (error) =>
      error instanceof Error && error.code === 'INVALID_PROFILE' && error.status === 400,
    );
  }
});

test('profile media credits restrict hosts, retain attribution and do not borrow caller objects', () => {
  const original = {
    cover: {
      source: 'http://giphy.com/gifs/animation-abc123',
      title: 'Animation', author: 'Artist', license: 'Ver no GIPHY',
      license_url: 'https://giphy.com/terms',
    },
  };
  const credits = validation.normalizeProfileMediaCredits(original);
  assert.equal(credits.cover.source, 'https://giphy.com/gifs/animation-abc123');
  assert.equal(credits.cover.author, 'Artist');
  original.cover.author = 'Changed';
  assert.equal(credits.cover.author, 'Artist');
  assert(Object.isFrozen(credits.cover));
  assert.deepEqual(validation.normalizeProfileMediaCredits(), {});
  for (const source of [
    'https://giphy.com.evil.test/gifs/id', 'https://giphy.com:444/gifs/id',
    'https://giphy.com/search/id', 'https://user:password@giphy.com/gifs/id',
    'https://commons.wikimedia.org.evil.test/wiki/File:Animation.gif',
  ]) assert.throws(() => cleanProfile({ media_credits: { cover: { source } } }), { code: 'INVALID_PROFILE' });
  assert.throws(() => cleanProfile({ media_credits: { unknown: original.cover } }), { code: 'INVALID_PROFILE' });
});

test('tolerant link normalization drops invalid rows but still bounds the whole collection', () => {
  assert.deepEqual(validation.normalizeProfileLinks([
    { url: 'javascript:alert(1)' }, { label: 'Missing address' },
    { url: 'github.com/jogador' }, null,
  ], { strict: false }), [{ label: 'GitHub', url: 'https://github.com/jogador' }]);
  assert.throws(() => validation.normalizeProfileLinks(Array(9).fill({}), { strict: false }));
  assert.throws(() => validation.normalizeProfileLinks(null, { strict: false }));
});
