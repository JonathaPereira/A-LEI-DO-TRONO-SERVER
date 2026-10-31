'use strict';
// Retains complete fMP4 fragments, beginning at a video keyframe. H.264 is never
// passed through the WebM parser. Export is remuxed separately without re-encoding.
function boxes(data, from = 0, to = data.length) {
  const out = [];
  for (let p = from; p + 8 <= to;) {
    let length = data.readUInt32BE(p),
      header = 8;
    if (length === 1) {
      if (p + 16 > to) break;
      length = Number(data.readBigUInt64BE(p + 8));
      header = 16;
    }
    if (length < 8 || !Number.isSafeInteger(length)) throw Error('Invalid MP4 box');
    if (p + length > to) break;
    out.push({
      type: data.toString('ascii', p + 4, p + 8),
      start: p,
      body: p + header,
      end: p + length,
    });
    p += length;
  }
  return out;
}
const child = (data, box, name) => boxes(data, box.body, box.end).find((b) => b.type === name);
function tracks(data, moov) {
  const result = new Map();
  for (const trak of boxes(data, moov.body, moov.end).filter((b) => b.type === 'trak')) {
    const tkhd = child(data, trak, 'tkhd'),
      mdia = child(data, trak, 'mdia');
    if (!tkhd || !mdia) continue;
    const mdhd = child(data, mdia, 'mdhd'),
      hdlr = child(data, mdia, 'hdlr');
    if (!mdhd || !hdlr) continue;
    const id = data.readUInt32BE(tkhd.body + (data[tkhd.body] === 1 ? 20 : 12)),
      scale = data.readUInt32BE(mdhd.body + (data[mdhd.body] === 1 ? 20 : 12));
    if (!scale) throw Error('Invalid MP4 timescale');
    result.set(id, {
      scale,
      video: data.toString('ascii', hdlr.body + 8, hdlr.body + 12) === 'vide',
    });
  }
  return result;
}
function fragment(data, metadata) {
  let start = Infinity,
    end = 0,
    key = false;
  const root = boxes(data)[0];
  for (const traf of boxes(data, root.body, root.end).filter((b) => b.type === 'traf')) {
    const tfhd = child(data, traf, 'tfhd'),
      tfdt = child(data, traf, 'tfdt');
    if (!tfhd || !tfdt) throw Error('Missing MP4 timing');
    const flags = data.readUInt32BE(tfhd.body) & 0xffffff,
      id = data.readUInt32BE(tfhd.body + 4),
      track = metadata.get(id);
    if (!track) throw Error('Unknown MP4 track');
    let p = tfhd.body + 8;
    if (flags & 1) p += 8;
    if (flags & 2) p += 4;
    let duration = 0,
      defaultFlags = 0;
    if (flags & 8) {
      duration = data.readUInt32BE(p);
      p += 4;
    }
    if (flags & 16) p += 4;
    if (flags & 32) defaultFlags = data.readUInt32BE(p);
    const base =
      data[tfdt.body] === 1
        ? Number(data.readBigUInt64BE(tfdt.body + 4))
        : data.readUInt32BE(tfdt.body + 4);
    let total = 0;
    for (const trun of boxes(data, traf.body, traf.end).filter((b) => b.type === 'trun')) {
      const flags = data.readUInt32BE(trun.body) & 0xffffff,
        count = data.readUInt32BE(trun.body + 4);
      if (count > 100000) throw Error('Invalid MP4 samples');
      let q = trun.body + 8,
        first = defaultFlags;
      if (flags & 1) q += 4;
      if (flags & 4) {
        first = data.readUInt32BE(q);
        q += 4;
      }
      for (let i = 0; i < count; i++) {
        let d = duration,
          f = i === 0 ? first : defaultFlags;
        if (flags & 256) {
          d = data.readUInt32BE(q);
          q += 4;
        }
        if (flags & 512) q += 4;
        if (flags & 1024) {
          f = data.readUInt32BE(q);
          q += 4;
        }
        if (flags & 2048) q += 4;
        if (q > trun.end) throw Error('Invalid MP4 fragment');
        if (i === 0 && track.video && !(f & 0x10000)) key = true;
        total += d;
      }
    }
    start = Math.min(start, base / track.scale);
    end = Math.max(end, (base + total) / track.scale);
  }
  if (!Number.isFinite(start) || end < start) throw Error('Invalid MP4 timestamps');
  return { start, end, key };
}
class ReplayBuffer {
  constructor({ seconds = 30, maxBytes = 128 * 1048576 } = {}) {
    this.seconds = seconds;
    this.maxBytes = maxBytes;
    this.pending = Buffer.alloc(0);
    this.init = [];
    this.metadata = new Map();
    this.fragments = [];
    this.bytes = 0;
    this.moof = null;
  }
  append(chunk) {
    this.pending = Buffer.concat([this.pending, chunk]);
    let consumed = 0;
    for (const box of boxes(this.pending)) {
      if (box.end - box.start > this.maxBytes) throw Error('Replay fragment too large');
      const raw = Buffer.from(this.pending.subarray(box.start, box.end));
      if (box.type === 'ftyp') this.init = [raw];
      if (box.type === 'moov') {
        this.metadata = tracks(raw, boxes(raw)[0]);
        this.init.push(raw);
      }
      if (box.type === 'moof') this.moof = raw;
      if (box.type === 'mdat' && this.moof) {
        const data = Buffer.concat([this.moof, raw]),
          info = fragment(this.moof, this.metadata);
        this.fragments.push({ ...info, data });
        this.bytes += data.length;
        this.moof = null;
      }
      consumed = box.end;
    }
    this.pending = Buffer.from(this.pending.subarray(consumed));
    if (this.pending.length > this.maxBytes) throw Error('Replay input exceeded memory limit');
    this.prune();
    return this.status();
  }
  prune() {
    const end = this.fragments.at(-1)?.end ?? 0;
    let key = 0;
    this.fragments.forEach((f, i) => {
      if (f.key && f.start <= end - this.seconds) key = i;
    });
    if (key) {
      this.fragments.splice(0, key).forEach((f) => (this.bytes -= f.data.length));
    }
    while (this.bytes > this.maxBytes && this.fragments.length)
      this.bytes -= this.fragments.shift().data.length;
  }
  status() {
    const key = this.fragments.find((f) => f.key),
      end = Math.max(0, ...this.fragments.map((f) => f.end));
    return {
      ready: this.init.length === 2 && !!key,
      seconds: key ? Math.max(0, end - key.start) : 0,
      bytes: this.bytes,
    };
  }
  snapshot() {
    if (!this.status().ready) throw Error('Aguarde alguns segundos antes de clipar.');
    const end = Math.max(...this.fragments.map((f) => f.end));
    let index = this.fragments.findIndex((f) => f.key);
    this.fragments.forEach((f, i) => {
      if (f.key && f.start <= end - this.seconds) index = i;
    });
    const selected = this.fragments.slice(index);
    return {
      data: Buffer.concat([...this.init, ...selected.map((f) => f.data)]),
      duration: end - selected[0].start,
    };
  }
  clear() {
    this.pending = Buffer.alloc(0);
    this.fragments = [];
    this.bytes = 0;
    this.moof = null;
    this.init = [];
  }
}
module.exports = { ReplayBuffer };
