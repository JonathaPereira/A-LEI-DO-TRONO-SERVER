'use strict';

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const next = require.resolve('next/dist/bin/next');
const origin = 'http://127.0.0.1:3000';
const children = new Set();
let stopping = false;

function launch(script, args) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.add(child);
  child.once('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once('exit', (code) => {
    children.delete(child);
    stop(code ?? 1);
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else child.kill();
  }
}

async function main() {
  // A fixed origin keeps desktop permissions and local auth configuration predictable.
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    throw new Error(
      'A porta 3000 está ocupada. Encerre o servidor existente antes de iniciar desktop:dev.',
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A porta')) throw error;
  }
  require('./prepare-renderer.cjs');
  launch(next, ['dev', '--hostname', '127.0.0.1', '--port', '3000']);
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        console.log(
          'Desktop com atualização ao salvar. Backend esperado em http://127.0.0.1:10000.',
        );
        launch(path.join(__dirname, 'start-desktop.cjs'), ['--desktop-dev-url=' + origin]);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!stopping) throw new Error('Next.js não ficou pronto a tempo.');
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
void main().catch((error) => {
  console.error(error.message);
  stop(1);
});
