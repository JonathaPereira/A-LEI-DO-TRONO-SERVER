'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('parseChatLinks recognizes HTTP/HTTPS/www links, trims delimiters, and rejects unsafe schemes', async () => {
  const { parseChatLinks } = await import('../src/lib/chat/links.ts');

  const mixed = parseChatLinks(
    'Olha isso: (https://en.wikipedia.org/wiki/C_(programming_language)), www.youtube.com/watch?v=dQw4w9WgXcQ! e https://example.com/a?x=1&y=2.',
  );
  assert.deepEqual(mixed, [
    { kind: 'text', text: 'Olha isso: (' },
    {
      kind: 'link',
      text: 'https://en.wikipedia.org/wiki/C_(programming_language)',
      href: 'https://en.wikipedia.org/wiki/C_(programming_language)',
    },
    { kind: 'text', text: '), ' },
    {
      kind: 'link',
      text: 'www.youtube.com/watch?v=dQw4w9WgXcQ',
      href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    { kind: 'text', text: '! e ' },
    { kind: 'link', text: 'https://example.com/a?x=1&y=2', href: 'https://example.com/a?x=1&y=2' },
    { kind: 'text', text: '.' },
  ]);

  const unsafe = parseChatLinks(
    'javascript:alert(1) data:text/html,hi ftp://files.example.com user@www.example.com http://localhost:3000/sala',
  );
  assert.deepEqual(unsafe, [
    {
      kind: 'text',
      text: 'javascript:alert(1) data:text/html,hi ftp://files.example.com user@www.example.com ',
    },
    {
      kind: 'link',
      text: 'http://localhost:3000/sala',
      href: 'http://localhost:3000/sala',
    },
  ]);

  assert.deepEqual(parseChatLinks(''), []);
  assert.deepEqual(parseChatLinks('mensagem comum sem link'), [
    { kind: 'text', text: 'mensagem comum sem link' },
  ]);
});
