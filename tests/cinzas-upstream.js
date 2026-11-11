'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const cases = [
  'check-game.cjs',
  'check-exploration.cjs',
  'check-combat-review.cjs',
  'check-balance-matrix.cjs',
  'check-regressions.cjs',
  'check-controller.cjs',
  'check-ui.cjs',
  'check-v5.cjs',
  'check-audio.cjs',
  'check-campaign.cjs',
].map((name) => ({ name, env: {} }));
cases.push({
  name: 'check-ui.cjs',
  label: 'terminal frame resolution',
  env: { CINZAS_TERMINAL_FRAME_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'conductor tactical feedback',
  env: { CINZAS_CONDUCTOR_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'short attack tap',
  env: { CINZAS_ATTACK_EDGE_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'slow-frame milestone',
  env: { CINZAS_SUBSTEP_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'unreadable storage',
  env: { CINZAS_CORRUPT_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'terminal pending saves',
  env: { CINZAS_TERMINAL_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'import during active attempt',
  env: { CINZAS_IMPORT_ACTIVE_TEST: '1' },
});
cases.push({
  name: 'check-ui.cjs',
  label: 'region practice',
  env: { CINZAS_PRACTICE_TEST: '1' },
});
for (const { name, label, env } of cases)
  test('Cinzas upstream ' + (label || name), { timeout: 45000 }, () => {
    const result = spawnSync(process.execPath, [name], {
      cwd: path.join(__dirname, 'cinzas'),
      encoding: 'utf8',
      timeout: 40000,
      env: { ...process.env, ...env },
    });
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
    assert.match(result.stdout, /PASS|passed|checks|OK/i);
  });
