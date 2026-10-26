'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const list = (...args) =>
  spawnSync(process.execPath, ['scripts/test.cjs', '--list', ...args], {
    cwd: root,
    encoding: 'utf8',
  });

test('test command selects only the requested public regression and rejects an empty selection', () => {
  const selected = list('--suite', 'core', '--filter', 'game-rules');
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(selected.stdout.trim().split(/\r?\n/), ['tests/game-rules.js']);
  const empty = list('--filter', 'a-test-that-does-not-exist');
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /Nenhum teste/);
});


test('parallel CI groups partition the complete browser suite without dropping or duplicating any test file', () => {
  const complete=list('--suite','browser');
  assert.equal(complete.status,0,complete.stderr);
  const files=complete.stdout.trim().split(/\r?\n/),groups=[];
  for(let index=1;index<=4;index++){
    const group=list('--suite','browser','--shard',`${index}/4`);
    assert.equal(group.status,0,group.stderr);
    const selected=group.stdout.trim().split(/\r?\n/);
    assert(selected.length>0 && selected.length<files.length);
    assert.equal(list('--suite','browser','--shard',`${index}/4`).stdout,group.stdout);
    groups.push(...selected);
  }
  assert.equal(new Set(groups).size,groups.length);
  assert.deepEqual(groups.sort(),files.sort());
  for(const invalid of ['0/4','5/4','1/0','1/1.5','oops'])
    assert.notEqual(list('--suite','browser','--shard',invalid).status,0,invalid);
});
