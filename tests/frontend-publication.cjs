'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs
  .readFileSync('.github/workflows/frontend-publish.yml', 'utf8')
  .match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/)[1];
const sha = 'a'.repeat(40),
  tag = (id) => `desktop-v0.3.4-run-${id}-attempt-1`;
function execute(overrides = {}, manual = false) {
  const run = {
    id: 20,
    run_attempt: 1,
    head_sha: sha,
    head_branch: 'main',
    conclusion: 'success',
    event: 'push',
    head_repository: { full_name: 'owner/repo' },
    ...overrides,
  };
  const outputs = [],
    errors = [];
  const releases = [19, 20].map((id) => ({
    tag_name: tag(id),
    target_commitish: sha,
    body: '<!-- mn-desktop-build-v1 -->',
    assets: [
      'MN-Trono-Frontend-0.3.4.zip',
      'MN-Trono-0.3.4-Windows.exe',
      'SHA256SUMS-0.3.4.txt',
    ].map((name) => ({ name, state: 'uploaded' })),
  }));
  const context = {
    require(name) {
      if (name === './electron/package.json') return { version: '0.3.4' };
      if (name === 'node:fs') return { appendFileSync: (_, value) => outputs.push(value) };
      if (name === 'node:child_process')
        return {
          execFileSync(command, args) {
            if (command === 'git') return '';
            const path = args[1];
            if (path.includes('/branches/main'))
              return JSON.stringify({ commit: { sha: overrides.currentSha || sha } });
            if (path.includes('/actions/runs/'))
              return JSON.stringify({
                name: 'Windows full app',
                conclusion: 'success',
                head_sha: sha,
                run_attempt: 1,
              });
            return JSON.stringify(releases);
          },
        };
      throw Error(name);
    },
    process: {
      env: {
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_OUTPUT: 'output',
        AUTOMATIC_SOURCE: manual ? '' : JSON.stringify(run),
        REQUESTED_TAG: manual ? tag(19) : '',
      },
      exit: () => {},
    },
    console: { log() {}, error: (value) => errors.push(String(value)) },
    setTimeout() {
      throw Error('Unexpected retry');
    },
  };
  return Promise.resolve(vm.runInNewContext(source, context)).then(() => ({
    outputs: outputs.join(''),
    errors,
  }));
}
test('automatic publication selects only the exact successful main run and attempt', async () => {
  const r = await execute();
  assert.deepEqual(r.errors, []);
  assert.match(r.outputs, /run-20-attempt-1/);
  assert(!r.outputs.includes('run-19'));
});
test('automatic publication rejects failed, foreign, non-main and superseded builds', async () => {
  for (const input of [
    { conclusion: 'failure' },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { head_repository: { full_name: 'fork/repo' } },
    { currentSha: 'b'.repeat(40) },
  ]) {
    const r = await execute(input);
    assert.equal(r.outputs, '');
    assert(r.errors.length > 0, JSON.stringify(input));
  }
});
test('manual publication retains exact-tag selection', async () => {
  const r = await execute({}, true);
  assert.deepEqual(r.errors, []);
  assert.match(r.outputs, /run-19-attempt-1/);
});
