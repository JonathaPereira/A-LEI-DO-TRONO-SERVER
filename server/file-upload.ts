import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { LIMITS } from './files-contract.ts';
export function detectMime(b: Buffer) {
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString())) return 'image/gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE')
    return 'audio/wav';
  if (
    b.length >= 8 &&
    b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
    b.includes(Buffer.from('webm'))
  )
    return 'video/webm';
  if (b.length >= 16 && b.subarray(4, 8).toString() === 'ftyp') {
    const brands = b.subarray(8, Math.min(b.length, 64)).toString('ascii');
    if (/isom|iso[2-9]|mp4[12]|avc1|M4V |dash/.test(brands)) return 'video/mp4';
  }
  // Other files are downloadable without an executable inline preview.
  return 'application/octet-stream';
}
export async function peek(req: IncomingMessage) {
  const iterator = req[Symbol.asyncIterator](),
    chunks: Buffer[] = [];
  let bytes = 0;
  while (bytes < 64) {
    const next = await iterator.next();
    if (next.done) break;
    chunks.push(next.value);
    bytes += next.value.length;
  }
  const prefix = Buffer.concat(chunks);
  async function* body() {
    yield prefix;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }
  return { prefix, body: Readable.from(body()) };
}
export async function drainRejectedUpload(req: IncomingMessage) {
  const length = Number(req.headers['content-length']);
  if (req.destroyed || req.readableEnded || !Number.isSafeInteger(length) || length > LIMITS.video)
    return;
  // An async iterator used to inspect the header keeps the request in readable
  // mode, where resume() alone cannot drain it. Finish reading bounded uploads
  // before closing; otherwise Windows can reset even the error response.
  const drained = (async () => {
    try {
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        /* discard */
      }
    } catch {}
  })();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2000);
    void drained.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
