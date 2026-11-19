'use strict';
// Only listed image/audio/data files may come from Surge. HTML and scripts
// always come from the installed bundle, never from this cache or the network.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const TYPES = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
};
function validateManifest(value) {
  if (
    value?.schema !== 1 ||
    value.id !== 'cinzas-do-abismo' ||
    !/^\d+\.\d+$/.test(value.version) ||
    !/^[a-f0-9]{20}$/.test(value.cacheKey) ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.length > 256
  )
    throw Error('Invalid game asset manifest');
  const seen = new Set();
  let total = 0;
  for (const f of value.files) {
    if (
      typeof f.path !== 'string' ||
      !/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(webp|png|mp3|json)$/.test(f.path) ||
      seen.has(f.path) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 1 ||
      f.bytes > 5 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      TYPES[path.extname(f.path)] !== f.type
    )
      throw Error('Invalid game asset');
    seen.add(f.path);
    total += f.bytes;
  }
  if (total !== value.bytes || total > 50 * 1024 * 1024) throw Error('Invalid game asset size');
  return value;
}
class GameAssets {
  constructor({ manifest, directory, fetchAsset, origin }) {
    this.manifest = validateManifest(manifest);
    this.entries = new Map(manifest.files.map((f) => [f.path, f]));
    this.directory = path.join(directory, 'cinzas-' + manifest.cacheKey);
    this.fetchAsset = fetchAsset;
    this.origin = new URL(origin).origin;
    this.pending = new Map();
    this.active = 0;
    this.queue = [];
  }
  has(relative) {
    return this.entries.has(relative);
  }
  async slot(fn) {
    if (this.active >= 2) await new Promise((resolve) => this.queue.push(resolve));
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
  async read(relative) {
    const entry = this.entries.get(relative);
    if (!entry) throw Error('Unknown game asset');
    if (!this.pending.has(relative))
      this.pending.set(
        relative,
        this.obtain(entry).finally(() => this.pending.delete(relative)),
      );
    return this.pending.get(relative);
  }
  async obtain(entry) {
    await fs.mkdir(this.directory, { recursive: true });
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Invalid game cache directory');
    const file = path.join(this.directory, entry.sha256 + path.extname(entry.path));
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes)
        throw Error('Invalid cached asset');
      const data = await fs.readFile(file);
      if (this.valid(entry, data)) return data;
    } catch (error) {
      if (!['ENOENT', 'Invalid cached asset'].includes(error.code || error.message)) throw error;
    }
    return this.slot(async () => {
      const url = this.origin + '/roguelite/' + entry.path;
      const response = await this.fetchAsset(url);
      if (!response.ok || (response.url && new URL(response.url).origin !== this.origin))
        throw Error('Game assets unavailable');
      const length = response.headers.get('content-length'),
        encoding = response.headers.get('content-encoding');
      if (length && (!encoding || encoding === 'identity') && Number(length) !== entry.bytes)
        throw Error('Invalid downloaded game asset size');
      const reader = response.body.getReader(),
        parts = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > entry.bytes) throw Error('Downloaded game asset too large');
          parts.push(Buffer.from(value));
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      const data = Buffer.concat(parts);
      if (!this.valid(entry, data)) throw Error('Game asset integrity check failed');
      const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      return data;
    });
  }
  valid(entry, data) {
    return (
      data.length === entry.bytes &&
      crypto.createHash('sha256').update(data).digest('hex') === entry.sha256
    );
  }
}
module.exports = { GameAssets, validateManifest };
