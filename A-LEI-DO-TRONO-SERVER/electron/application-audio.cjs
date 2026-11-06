'use strict';
const { spawn } = require('node:child_process'),
  crypto = require('node:crypto'),
  { nativeHelperPath } = require('./native-helper.cjs'),
  os = require('node:os'),
  fs = require('node:fs');
function audioCapability(app) {
  const executable = nativeHelperPath(app);
  return {
    available:
      process.platform === 'win32' &&
      Number(os.release().split('.')[2]) >= 20348 &&
      fs.existsSync(executable),
    executable,
  };
}
class ApplicationAudio {
  constructor(app, publish) {
    this.capability = audioCapability(app);
    this.publish = publish;
    this.jobs = new Map();
  }
  async start(source) {
    const match = /^window:(\d+):\d+$/.exec(source);
    if (!match || !this.capability.available)
      throw Error('Áudio por aplicativo requer Windows 11 ou Windows build 20348 ou superior.');
    if (this.jobs.size >= 2) throw Error('Encerre uma captura de áudio antes de iniciar outra.');
    const id = crypto.randomUUID(),
      child = spawn(
        this.capability.executable,
        ['--window', match[1], '--exclude-pid', String(process.pid)],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    const job = { child, credits: 6, ready: false, closed: false };
    this.jobs.set(id, job);
    return new Promise((resolve, reject) => {
      let bytes = Buffer.alloc(0),
        log = '',
        settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(
            Error(
              'Não foi possível capturar o áudio desse aplicativo. Escolha outra janela ou capture sem áudio.',
            ),
          );
        }
        this.stop(id);
      };
      const timer = setTimeout(fail, 20000);
      job.timer = timer;
      child.on('error', fail);
      child.stdin.on('error', () => {});
      child.stderr.on('data', (chunk) => {
        log += chunk.toString();
        if (log.length > 8192) return fail();
        let end;
        while ((end = log.indexOf('\n')) !== -1) {
          const line = log.slice(0, end);
          log = log.slice(end + 1);
          try {
            const data = JSON.parse(line);
            if (
              data.type === 'ready' &&
              !settled &&
              data.sampleRate === 44100 &&
              data.channels === 2
            ) {
              settled = true;
              job.ready = true;
              clearTimeout(timer);
              resolve({ id, sampleRate: data.sampleRate, channels: data.channels });
            } else if (data.type === 'error') fail();
          } catch {
            fail();
          }
        }
      });
      child.stdout.on('data', (chunk) => {
        bytes = Buffer.concat([bytes, chunk]);
        if (bytes.length > 2 * 1024 * 1024) return fail();
        while (bytes.length >= 4) {
          const size = bytes.readUInt32LE();
          if (size > 1024 * 1024 || size % 4) return fail();
          if (bytes.length < size + 4) break;
          if (job.ready && job.credits > 0 && !job.closed) {
            job.credits--;
            this.publish({
              type: 'chunk',
              id,
              bytes: Uint8Array.from(bytes.subarray(4, size + 4)),
            });
          }
          bytes = bytes.subarray(size + 4);
        }
      });
      child.once('close', () => {
        clearTimeout(timer);
        this.jobs.delete(id);
        if (!settled) {
          settled = true;
          reject(Error('A captura de áudio por aplicativo não iniciou.'));
        }
        if (job.ready && !job.closed) this.publish({ type: 'ended', id });
      });
    });
  }
  ack(id) {
    const job = this.jobs.get(id);
    if (job) job.credits = Math.min(6, job.credits + 1);
  }
  stop(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.closed = true;
    clearTimeout(job.timer);
    job.child.stdin.end('q');
    const timer = setTimeout(() => job.child.kill(), 2000);
    timer.unref();
    job.child.once('close', () => clearTimeout(timer));
    this.jobs.delete(id);
  }
  stopAll() {
    for (const id of this.jobs.keys()) this.stop(id);
  }
}
module.exports = { ApplicationAudio, audioCapability };
