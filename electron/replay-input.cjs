'use strict';
// Private, timestamped Matroska input for FFmpeg: BGRA frames and float32 stereo.
// One stdin avoids extra inherited descriptors/named pipes on Windows.
const uint = (n) => {
  const out = [];
  do {
    out.unshift(n % 256);
    n = Math.floor(n / 256);
  } while (n);
  return Buffer.from(out);
};
function size(n) {
  for (let width = 1; width <= 7; width++) {
    if (n < 2 ** (width * 7) - 1) {
      const out = Buffer.alloc(width);
      let v = n;
      for (let i = width - 1; i >= 0; i--) {
        out[i] = v % 256;
        v = Math.floor(v / 256);
      }
      out[0] |= 1 << (8 - width);
      return out;
    }
  }
  throw Error('Input too large');
}
const element = (id, ...parts) => {
  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
  return Buffer.concat([uint(id), size(body.length), body]);
};
const num = (id, n) => element(id, uint(n));
const str = (id, s) => element(id, Buffer.from(s));
function replayPixelBytes({ width, height, pixelFormat = 'bgra' }) {
  return width * height * (pixelFormat === 'bgra' ? 4 : 1.5);
}
function replayHeader({ width, height, fps, audio, pixelFormat = 'bgra' }) {
  const bitmap = Buffer.alloc(40);
  bitmap.writeUInt32LE(40, 0);
  bitmap.writeInt32LE(width, 4);
  bitmap.writeInt32LE(pixelFormat === 'bgra' ? -height : height, 8);
  bitmap.writeUInt16LE(1, 12);
  bitmap.writeUInt16LE(pixelFormat === 'bgra' ? 32 : 12, 14);
  if (pixelFormat !== 'bgra') bitmap.write(pixelFormat === 'nv12' ? 'NV12' : 'I420', 16, 'ascii');
  bitmap.writeUInt32LE(replayPixelBytes({ width, height, pixelFormat }), 20);
  const video = element(
    0xae,
    num(0xd7, 1),
    num(0x73c5, 1),
    num(0x83, 1),
    num(0x23e383, Math.round(1e9 / fps)),
    str(0x86, 'V_MS/VFW/FOURCC'),
    element(0x63a2, bitmap),
    element(0xe0, num(0xb0, width), num(0xba, height)),
  );
  const rate = Buffer.alloc(8);
  rate.writeDoubleBE(48000);
  const sound = audio
    ? element(
        0xae,
        num(0xd7, 2),
        num(0x73c5, 2),
        num(0x83, 2),
        str(0x86, 'A_PCM/FLOAT/IEEE'),
        element(0xe1, element(0xb5, rate), num(0x9f, 2), num(0x6264, 32)),
      )
    : Buffer.alloc(0);
  return Buffer.concat([
    element(
      0x1a45dfa3,
      num(0x4286, 1),
      num(0x42f7, 1),
      num(0x42f2, 4),
      num(0x42f3, 8),
      str(0x4282, 'matroska'),
      num(0x4287, 4),
      num(0x4285, 2),
    ),
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    element(
      0x1549a966,
      num(0x2ad7b1, 1000000),
      str(0x4d80, 'Trono replay'),
      str(0x5741, 'Trono replay'),
    ),
    element(0x1654ae6b, video, sound),
  ]);
}
function replayPacket(track, ms, data) {
  return Buffer.concat(replayPacketParts(track, ms, data));
}
// Keep the full pixel payload borrowed: nested EBML concatenation copied it four times.
function replayPacketParts(track, ms, data) {
  const time = num(0xe7, Math.max(0, Math.round(ms))),
    block = Buffer.concat([
      uint(0xa3),
      size(4 + data.length),
      Buffer.from([0x80 | track, 0, 0, 0x80]),
    ]);
  return [
    Buffer.concat([uint(0x1f43b675), size(time.length + block.length + data.length), time, block]),
    data,
  ];
}
module.exports = { replayHeader, replayPacket, replayPacketParts, replayPixelBytes };
