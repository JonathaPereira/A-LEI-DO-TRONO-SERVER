'use strict';
const { spawnSync } = require('node:child_process');

function runGodot(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    maxBuffer: 16 * 1024 * 1024,
    ...options,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const log = (result.stdout || '') + (result.stderr || '');
  if (result.error || result.status !== 0 || /SCRIPT ERROR|Parse Error|\bERROR:/i.test(log)) {
    const error = new Error(
      `Godot validation failed (status ${result.status}): ${result.error?.message || log.slice(-4000)}`,
    );
    error.status = result.status;
    throw error;
  }
  return log;
}

module.exports = { runGodot };
