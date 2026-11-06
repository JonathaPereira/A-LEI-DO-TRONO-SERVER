import crypto from 'node:crypto';
import https from 'node:https';
import type { ClientRequest } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { fileError as error, type ObjectStorage } from './files-contract.ts';
import { object } from './http-api.ts';
const PREVIEW_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'audio/wav',
]);
const R2_CODES = new Set([
  'Unauthorized',
  'AccessDenied',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredRequest',
  'RequestExpired',
  'RequestTimeTooSkewed',
  'NotEntitled',
  'InvalidBucketName',
  'NoSuchBucket',
  'MissingContentLength',
  'IncompleteBody',
  'EntityTooLarge',
  'MetadataTooLarge',
  'InternalError',
  'ServiceUnavailable',
  'TooManyRequests',
  'InvalidArgument',
  'InvalidRequest',
  'AuthorizationHeaderMalformed',
]);
function storageResponseError(status: number, body: string) {
  const candidate = String(body).match(/<Code>\s*([A-Za-z]+)\s*<\/Code>/)?.[1];
  const providerCode = candidate && R2_CODES.has(candidate) ? candidate : 'UnknownError';
  const e = error(
    'STORAGE_UNAVAILABLE',
    `Não foi possível salvar no armazenamento (R2: HTTP ${status}, ${providerCode}).`,
    503,
  );
  Object.assign(e, { storageResponse: true });
  // Never log the XML, URL, headers, object key or credentials.
  console.warn('[R2 upload]', JSON.stringify({ status, code: providerCode }));
  return e;
}
const enc = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const mac = (key: string | Buffer, s: string) =>
  crypto.createHmac('sha256', key).update(s).digest();
export function signedUrl(
  env: NodeJS.ProcessEnv,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  query: Record<string, string> = {},
  now = new Date(),
) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path = `/${enc(String(env.R2_BUCKET))}/${key.split('/').map(enc).join('/')}`;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
    day = date.slice(0, 8),
    scope = `${day}/auto/s3/aws4_request`;
  const params: Record<string, string> = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': '300',
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join('&');
  const canonical = [
    method,
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const signingKey = mac(
    mac(mac(mac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, day), 'auto'), 's3'),
    'aws4_request',
  );
  const sig = mac(signingKey, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`).toString(
    'hex',
  );
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}
export function r2Adapter(env: NodeJS.ProcessEnv): ObjectStorage {
  return {
    async put(key, body, size, mime, name, signal) {
      const url = signedUrl(env, 'PUT', key);
      let request!: ClientRequest;
      const response = new Promise<void>((resolve, reject) => {
        request = https.request(
          url,
          {
            method: 'PUT',
            signal,
            headers: {
              'Content-Length': String(size),
              'Content-Type': mime,
              'Content-Disposition': `${PREVIEW_MIMES.has(mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${enc(name)}`,
            },
          },
          (res) => {
            let captured = Buffer.alloc(0);
            res.on('data', (chunk) => {
              if (captured.length < 16384)
                captured = Buffer.concat([
                  captured,
                  Buffer.from(chunk).subarray(0, 16384 - captured.length),
                ]);
            });
            res.on('error', reject);
            res.on('aborted', () =>
              reject(
                error(
                  'STORAGE_UNAVAILABLE',
                  'A conexão com o R2 foi interrompida. Tente novamente.',
                  503,
                ),
              ),
            );
            res.on('end', () =>
              (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300
                ? resolve()
                : reject(storageResponseError(res.statusCode ?? 0, captured.toString('utf8'))),
            );
          },
        );
        request.on('error', reject);
        request.setTimeout(300_000, () =>
          request.destroy(error('UPLOAD_TIMEOUT', 'Envio demorou demais. Tente novamente.', 408)),
        );
      });
      // Observe both promises immediately: either side may fail before the other.
      const settled = await Promise.allSettled([pipeline(body, request, { signal }), response]);
      // A rejected response may also break the writable stream. Keep the R2 reason.
      const failed =
        settled.find(
          (r) => r.status === 'rejected' && object(r.reason) && r.reason.storageResponse,
        ) || settled.find((r) => r.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    },
    async remove(key, signal) {
      const res = await fetch(signedUrl(env, 'DELETE', key), {
        method: 'DELETE',
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
      });
      if (!res.ok && res.status !== 404)
        throw error('STORAGE_UNAVAILABLE', 'Não foi possível excluir agora.', 503);
    },
    url(row, download = false) {
      const inline = !download && PREVIEW_MIMES.has(row.mime);
      return signedUrl(env, 'GET', row.object_key, {
        'response-content-type': row.mime,
        'response-content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${enc(row.name)}`,
      });
    },
  };
}
