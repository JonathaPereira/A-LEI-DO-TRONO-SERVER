'use strict';

const crypto = require('node:crypto');

/** Authorize only the inline bootstrap emitted by this installed Next.js build. */
function contentSecurityPolicy(html = '') {
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source)
    .map(
      ([, , source]) =>
        "'sha256-" + crypto.createHash('sha256').update(source).digest('base64') + "'",
    );
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' " + hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https: wss: http://127.0.0.1:* ws://127.0.0.1:*",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
  ].join('; ');
}

module.exports = { contentSecurityPolicy };
