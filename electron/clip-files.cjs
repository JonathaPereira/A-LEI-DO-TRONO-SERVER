'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
function clipBytes(value) {
  if (!(value instanceof ArrayBuffer) || value.byteLength < 4 || value.byteLength > 270 * 1048576)
    throw Error('Arquivo de clipe inválido.');
  const bytes = Buffer.from(value);
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    throw Error('Formato de clipe inválido.');
  return bytes;
}
async function writeClip(target, bytes, { overwrite = false } = {}) {
  const temp = path.join(path.dirname(target), '.mn-clip-' + crypto.randomUUID() + '.tmp');
  try {
    const handle = await fs.open(temp, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // A failed write leaves the existing destination intact. Folder exports
    // never overwrite; a save-dialog export can replace only the chosen file.
    if (overwrite) await fs.rename(temp, target);
    else await fs.link(temp, target);
  } finally {
    await fs.unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
module.exports = { clipBytes, writeClip };
