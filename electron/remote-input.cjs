'use strict';
const path = require('node:path'),
  fs = require('node:fs'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process');
const KEYS = {
  Escape: 27,
  Tab: 9,
  Backspace: 8,
  Enter: 13,
  Space: 32,
  ShiftLeft: 160,
  ShiftRight: 161,
  ControlLeft: 162,
  ControlRight: 163,
  AltLeft: 164,
  AltRight: 165,
  MetaLeft: 91,
  MetaRight: 92,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  Insert: 45,
  Delete: 46,
  CapsLock: 20,
  Minus: 189,
  Equal: 187,
  BracketLeft: 219,
  BracketRight: 221,
  Backslash: 220,
  Semicolon: 186,
  Quote: 222,
  Backquote: 192,
  Comma: 188,
  Period: 190,
  Slash: 191,
};
for (let i = 0; i < 26; i++) KEYS['Key' + String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i < 10; i++) KEYS['Digit' + i] = 48 + i;
for (let i = 1; i <= 12; i++) KEYS['F' + i] = 111 + i;
class RemoteInput {
  constructor({
    app,
    publish = () => {},
    displays,
    point,
    launch = spawn,
    platform = process.platform,
    exists = fs.existsSync,
    now = Date.now,
  }) {
    Object.assign(this, { publish, displays, point, launch, platform, now });
    this.executable = app.isPackaged
      ? path.join(process.resourcesPath, 'native/MN-Remote-Input.exe')
      : path.resolve(__dirname, '../artifacts/native-audio/Release/MN-Remote-Input.exe');
    this.available = platform === 'win32' && exists(this.executable);
    this.displayId = null;
    this.job = null;
  }
  select(displayId) {
    this.stop();
    if (!this.displays().some((d) => String(d.id) === String(displayId)))
      throw Error('Escolha um monitor inteiro para compartilhar o PC.');
    this.displayId = String(displayId);
  }
  async gamepadAvailable() {
    if (!this.available) return false;
    return new Promise((resolve) => {
      const child = this.launch(this.executable, ['--probe'], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 4000);
      child.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  }
  async start({ mode = 'desktop' } = {}) {
    if (!['desktop', 'gamepad'].includes(mode)) throw Error('Modo de controle inválido.');
    if (!this.available || !this.displayId)
      throw Error(
        'Compartilhamento de PC requer o aplicativo Windows atualizado e um monitor selecionado.',
      );
    this.stop();
    const token = crypto.randomUUID(),
      child = this.launch(this.executable, mode === 'gamepad' ? ['--gamepad'] : [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
      job = {
        child,
        token,
        mode,
        last: this.now(),
        count: 0,
        until: this.now() + 1000,
        closed: false,
      };
    this.job = job;
    return new Promise((resolve, reject) => {
      let ready = false,
        output = '';
      const fail = () => {
        if (!ready) reject(Error('Não foi possível iniciar o controle do PC.'));
        if (this.job === job) this.stop();
      };
      job.timeout = setTimeout(fail, 5000);
      child.once('error', fail);
      child.stdin.on('error', fail);
      child.stderr.on('data', (chunk) => {
        if (!ready) reject(Error(chunk.toString().slice(0, 260)));
        fail();
      });
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 1024) return fail();
        const readyLine = /^READY(?: (desktop|gamepad) (\d+))?\n/m.exec(output.replace(/\r/g, ''));
        if (readyLine && !ready) {
          ready = true;
          clearTimeout(job.timeout);
          job.timer = setInterval(() => {
            if (
              this.now() - job.last > 4500 ||
              !this.displays().some((d) => String(d.id) === this.displayId)
            )
              this.stop();
          }, 500);
          job.timer.unref?.();
          resolve({
            token,
            mode,
            gamepadIndex: readyLine[1] === 'gamepad' ? Number(readyLine[2]) : null,
          });
        }
      });
      child.once('close', () => {
        if (!ready) reject(Error('O controle do PC não iniciou.'));
        if (this.job === job) {
          this.job = null;
          clearInterval(job.timer);
          clearTimeout(job.timeout);
          this.publish({ type: 'stopped' });
        }
      });
    });
  }
  input(token, event) {
    const job = this.job;
    if (!job || job.token !== token || job.closed || !event || typeof event !== 'object')
      return false;
    const display = this.displays().find((d) => String(d.id) === this.displayId);
    if (!display) {
      this.stop();
      return false;
    }
    if (this.now() > job.until) {
      job.until = this.now() + 1000;
      job.count = 0;
    }
    if (++job.count > 250) return false;
    let line;
    if (event.type === 'pulse') line = 'p';
    else if (event.type === 'release') line = 'r';
    else if (
      event.type === 'gamepad' &&
      job.mode === 'gamepad' &&
      Array.isArray(event.state) &&
      event.state.length === 7 &&
      event.state.every(Number.isInteger) &&
      event.state[0] >= 0 &&
      event.state[0] <= 65535 &&
      !(event.state[0] & ~0xf3ff) &&
      event.state.slice(1, 3).every((v) => v >= 0 && v <= 255) &&
      event.state.slice(3).every((v) => v >= -32768 && v <= 32767)
    )
      line = 'g ' + event.state.join(' ');
    else if (job.mode === 'gamepad') return false;
    else if (
      event.type === 'move' &&
      Number.isFinite(event.x) &&
      Number.isFinite(event.y) &&
      event.x >= 0 &&
      event.x <= 1 &&
      event.y >= 0 &&
      event.y <= 1
    ) {
      const b = display.bounds,
        p = this.point({
          x: Math.round(b.x + event.x * Math.max(0, b.width - 1)),
          y: Math.round(b.y + event.y * Math.max(0, b.height - 1)),
        });
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      line = `m ${Math.round(p.x)} ${Math.round(p.y)}`;
    } else if (
      event.type === 'button' &&
      Number.isInteger(event.button) &&
      event.button >= 0 &&
      event.button <= 2 &&
      typeof event.down === 'boolean'
    )
      line = `b ${event.button} ${event.down ? 1 : 0}`;
    else if (
      event.type === 'key' &&
      Object.hasOwn(KEYS, event.code) &&
      typeof event.down === 'boolean'
    )
      line = `k ${KEYS[event.code]} ${event.down ? 1 : 0}`;
    else if (event.type === 'wheel' && Number.isFinite(event.delta))
      line = `w ${Math.max(-1200, Math.min(1200, Math.round(event.delta)))}`;
    else return false;
    job.last = this.now();
    if (job.child.stdin.writableLength > 8192) {
      this.stop();
      return false;
    }
    job.child.stdin.write(line + '\n');
    return true;
  }
  stop() {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.closed = true;
    clearTimeout(job.timeout);
    clearInterval(job.timer);
    try {
      job.child.stdin.end('r\nq\n');
    } catch {}
    const timer = setTimeout(() => job.child.kill(), 1500);
    timer.unref?.();
    job.child.once('close', () => clearTimeout(timer));
    this.publish({ type: 'stopped' });
  }
  reset() {
    this.stop();
    this.displayId = null;
  }
}
module.exports = { RemoteInput, KEYS };
