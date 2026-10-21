'use strict';
const crypto = require('crypto');
const https = require('https');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { permissions } = require('./roles.ts');
const { validateSound, MAX_BYTES: SOUND_BYTES } = require('./soundboard.ts');
const LIMITS = { file: 10_000_000, video: 100_000_000, avatar: 10_000_000, total: 8_000_000_000 };
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
const error = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
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
function storageResponseError(status, body) {
  const candidate = String(body).match(/<Code>\s*([A-Za-z]+)\s*<\/Code>/)?.[1];
  const providerCode = R2_CODES.has(candidate) ? candidate : 'UnknownError';
  const e = error(
    'STORAGE_UNAVAILABLE',
    `Não foi possível salvar no armazenamento (R2: HTTP ${status}, ${providerCode}).`,
    503,
  );
  e.storageResponse = true;
  // Never log the XML, URL, headers, object key or credentials.
  console.warn('[R2 upload]', JSON.stringify({ status, code: providerCode }));
  return e;
}
const enc = (s) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const mac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
function signedUrl(env, method, key, query = {}, now = new Date()) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path = `/${enc(env.R2_BUCKET)}/${key.split('/').map(enc).join('/')}`;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''),
    day = date.slice(0, 8),
    scope = `${day}/auto/s3/aws4_request`;
  const params = {
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
function detectMime(b) {
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
async function peek(req) {
  const iterator = req[Symbol.asyncIterator](),
    chunks = [];
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
async function drainRejectedUpload(req) {
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
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    void drained.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
function r2Adapter(env) {
  return {
    async put(key, body, size, mime, name) {
      const url = signedUrl(env, 'PUT', key);
      let request;
      const response = new Promise((resolve, reject) => {
        request = https.request(
          url,
          {
            method: 'PUT',
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
              res.statusCode >= 200 && res.statusCode < 300
                ? resolve()
                : reject(storageResponseError(res.statusCode, captured.toString('utf8'))),
            );
          },
        );
        request.on('error', reject);
        request.setTimeout(300_000, () =>
          request.destroy(error('UPLOAD_TIMEOUT', 'Envio demorou demais. Tente novamente.', 408)),
        );
      });
      // Observe both promises immediately: either side may fail before the other.
      const settled = await Promise.allSettled([pipeline(body, request), response]);
      // A rejected response may also break the writable stream. Keep the R2 reason.
      const failed =
        settled.find((r) => r.status === 'rejected' && r.reason?.storageResponse) ||
        settled.find((r) => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
    async remove(key) {
      const res = await fetch(signedUrl(env, 'DELETE', key), {
        method: 'DELETE',
        signal: AbortSignal.timeout(20_000),
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
function createFiles({
  auth,
  env = process.env,
  membership = () => false,
  canAttach = membership,
  onDeleted = () => {},
  fetchImpl = fetch,
  adapter,
} = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = !!(
    auth.configured &&
    key &&
    /^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID || '') &&
    /^[a-z0-9][a-z0-9.-]{1,62}$/.test(env.R2_BUCKET || '') &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY
  );
  const r2 = adapter || r2Adapter(env),
    active = new Map();
  let cleaning = false;
  async function db(path, method = 'GET', body) {
    let res;
    try {
      res = await fetchImpl(`${url}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: key,
          ...(!String(key).startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw error('STORAGE_UNAVAILABLE', 'Não foi possível acessar o armazenamento.', 503);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = String(data?.message || '');
      const reason = [
        'STORAGE_FULL',
        'FILE_TOO_LARGE',
        'UPLOAD_BUSY',
        'AVATAR_IN_USE',
        'FRIEND_REQUIRED',
        'INVALID_ATTACHMENT',
      ].find((c) => msg.includes(c));
      const copy = {
        STORAGE_FULL: 'Armazenamento de 8 GB cheio. Exclua anexos para liberar espaço.',
        FILE_TOO_LARGE: 'Arquivo acima do limite permitido.',
        UPLOAD_BUSY: 'Aguarde os envios em andamento.',
        AVATAR_IN_USE: 'Troque seu ícone antes de excluir essa foto.',
        FRIEND_REQUIRED: 'Adicione esta pessoa aos amigos antes de enviar anexos.',
        INVALID_ATTACHMENT: 'Esse anexo não está disponível nesta conversa.',
      };
      throw error(
        reason || 'STORAGE_UNAVAILABLE',
        copy[reason] || 'Armazenamento indisponível. Confira a configuração e a atualização SQL.',
        reason === 'FRIEND_REQUIRED' ? 403 : reason ? 409 : 503,
      );
    }
    return data;
  }
  const publicFile = (r) => ({
    id: r.id,
    name: r.name,
    bytes: Number(r.bytes),
    mime: r.mime,
    kind: r.kind,
    roomId: r.room_id,
    ownerId: r.owner_id,
    createdAt: r.created_at,
    ...(r.kind === 'direct' ? { peerId: r.direct_peer_id } : {}),
    ...(r.kind === 'soundboard' ? { durationMs: r.duration_ms } : {}),
  });
  const first = (data) => (Array.isArray(data) ? data[0] : data);
  async function lookup(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id || ''))
      throw error('FILE_NOT_FOUND', 'Arquivo não encontrado.', 404);
    return first(await db(`chat_files?id=eq.${id}&limit=1`));
  }
  async function remove(row) {
    const marked = first(
      await db('rpc/mark_chat_file_deleting', 'POST', { p_id: row.id, p_owner: row.owner_id }),
    );
    if (!marked?.id) throw error('FILE_BUSY', 'Esse arquivo está sendo enviado. Aguarde.', 409);
    await r2.remove(row.object_key); // Never free the reservation before R2 confirms deletion.
    await db(`chat_files?id=eq.${row.id}`, 'DELETE');
    onDeleted(row);
  }
  async function cleanup() {
    if (!configured || cleaning) return;
    cleaning = true;
    try {
      const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
      const rows = await db(
        `chat_files?or=(state.eq.deleting,and(state.eq.pending,created_at.lt.${encodeURIComponent(cutoff)}))&limit=20`,
      );
      for (const row of rows || [])
        if (!active.has(row.owner_id)) await remove(row).catch(() => {});
    } catch {
    } finally {
      cleaning = false;
    }
  }
  const timer = setInterval(() => void cleanup(), 5 * 60_000);
  timer.unref();
  async function attachment(id, owner, roomId) {
    const row = await lookup(id);
    if (
      !row ||
      row.state !== 'ready' ||
      row.kind !== 'chat' ||
      row.owner_id !== owner ||
      row.room_id !== roomId
    )
      throw error('INVALID_ATTACHMENT', 'Esse anexo não está disponível neste canal.');
    return publicFile(row);
  }
  async function directAttachment(id, owner, peerId) {
    const row = await lookup(id);
    if (
      !row ||
      row.state !== 'ready' ||
      row.kind !== 'direct' ||
      row.owner_id !== owner ||
      row.direct_peer_id !== peerId
    )
      throw error('INVALID_ATTACHMENT', 'Esse anexo não está disponível nesta conversa.');
    return publicFile(row);
  }
  async function directTarget(req, peerId) {
    if (!/^[a-f0-9-]{36}$/i.test(peerId || '') || peerId === req.account.id)
      throw error('INVALID_TARGET', 'Escolha um amigo para enviar o anexo.');
    await auth.request(auth.tokenFrom(req), '/rest/v1/rpc/social_attachment_target', 'POST', {
      p_peer: peerId,
    });
  }
  async function sound(id) {
    if (!configured)
      throw error('STORAGE_UNCONFIGURED', 'Efeitos sonoros ainda não foram ativados.', 503);
    const row = await lookup(id);
    if (!row || row.state !== 'ready' || row.kind !== 'soundboard')
      throw error('FILE_NOT_FOUND', 'Efeito sonoro não encontrado.', 404);
    return publicFile(row);
  }
  function install(app) {
    app.use('/files', async (req, res, next) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      const origin = req.headers.origin;
      if (origin && !auth.allowedOrigins.has(origin))
        return res
          .status(403)
          .json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origem não autorizada.' } });
      if (origin) {
        res.set({
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type, X-File-Name, X-File-Kind, X-Room-Id, X-Peer-Id',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        });
        res.vary('Origin');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      try {
        req.account = await auth.identity(auth.tokenFrom(req));
        next();
      } catch (e) {
        res.status(e.status || 503).json({ error: { code: e.code, message: e.message } });
      }
    });
    function route(method, path, fn) {
      app[method](`/files${path}`, async (req, res) => {
        try {
          if (!configured)
            throw error(
              'STORAGE_UNCONFIGURED',
              'Anexos ainda não foram ativados no servidor.',
              503,
            );
          res.json(await fn(req));
        } catch (e) {
          if (!res.destroyed) {
            // Rejected uploads may still have a body in flight. Drain it and retire
            // this connection so the next API call cannot reuse a half-read upload.
            if (method === 'post') {
              await drainRejectedUpload(req);
              res.set('Connection', 'close');
            }
            if (!res.destroyed)
              res.status(e.status || 503).json({
                error: {
                  code: e.code || 'STORAGE_UNAVAILABLE',
                  message: e.status ? e.message : 'Não foi possível concluir o envio.',
                },
              });
          }
        }
      });
    }
    route('get', '/status', async () => ({
      configured: true,
      used: Number(await db('rpc/chat_storage_usage', 'POST', {})),
      limits: LIMITS,
    }));
    route('get', '/mine', async (req) => {
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = await db(
        `chat_files?owner_id=eq.${req.account.id}&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/soundboard', async (req) => {
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = await db(
        `chat_files?kind=eq.soundboard&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/channel/:roomId', async (req) => {
      if (!membership(req.account.id, req.params.roomId))
        throw error('NOT_IN_ROOM', 'Entre no canal para ver seus anexos.', 403);
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = await db(
        `chat_files?kind=eq.chat&room_id=eq.${encodeURIComponent(req.params.roomId)}&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/:id/url', async (req) => {
      const row = await lookup(req.params.id);
      if (!row || row.state !== 'ready')
        throw error('FILE_NOT_FOUND', 'Arquivo excluído ou indisponível.', 404);
      if (
        row.kind === 'direct' &&
        !(await db('rpc/direct_file_access', 'POST', { p_file: row.id, p_account: req.account.id }))
      )
        throw error('FILE_FORBIDDEN', 'Este anexo pertence a uma conversa privada.', 403);
      if (
        row.kind === 'chat' &&
        row.owner_id !== req.account.id &&
        !membership(req.account.id, row.room_id)
      )
        throw error('FILE_FORBIDDEN', 'Entre no canal desse anexo para acessá-lo.', 403);
      return { url: r2.url(row, req.query.download === '1'), expiresAt: Date.now() + 300000 };
    });
    route('delete', '/:id', async (req) => {
      const row = await lookup(req.params.id);
      if (
        !row ||
        (row.owner_id !== req.account.id &&
          (row.kind === 'direct' || !permissions(req.account.role).moderateFiles))
      )
        throw error('FILE_FORBIDDEN', 'Você só pode excluir seus próprios arquivos.', 403);
      if (row.state === 'pending' && Date.now() - Date.parse(row.created_at) < 20 * 60_000)
        throw error('FILE_BUSY', 'Envio ainda reservado. Aguarde a limpeza automática.', 409);
      await remove(row);
      return { ok: true };
    });
    route('post', '/upload', async (req) => {
      const owner = req.account.id,
        size = Number(req.headers['content-length']),
        kind = req.headers['x-file-kind'] || 'chat',
        roomId = kind === 'chat' ? String(req.headers['x-room-id'] || '') : null,
        peerId = kind === 'direct' ? String(req.headers['x-peer-id'] || '') : null;
      if (!['avatar', 'chat', 'soundboard', 'direct'].includes(kind))
        throw error('INVALID_FILE_KIND', 'Tipo de arquivo inválido.');
      if (!Number.isSafeInteger(size) || size <= 0)
        throw error('FILE_SIZE_REQUIRED', 'Informe um arquivo com tamanho válido.', 411);
      if (
        size >
        (kind === 'soundboard' ? SOUND_BYTES : kind === 'avatar' ? LIMITS.avatar : LIMITS.video)
      )
        throw error('FILE_TOO_LARGE', 'Arquivo acima do limite permitido.', 413);
      if (kind === 'chat' && !canAttach(owner, roomId))
        throw error('NOT_IN_ROOM', 'Entre em um canal de texto para anexar arquivos.', 403);
      if (kind === 'direct') await directTarget(req, peerId);
      if (active.size >= 4 || (active.get(owner) || 0) >= 2)
        throw error('UPLOAD_BUSY', 'Aguarde os envios em andamento.', 429);
      let name;
      try {
        name = decodeURIComponent(req.headers['x-file-name'] || 'arquivo');
      } catch {
        throw error('INVALID_FILENAME', 'Nome de arquivo inválido.');
      }
      name =
        [...name.replace(/[\\/\x00-\x1f\x7f]/g, '_')].slice(0, 140).join('').trim() || 'arquivo';
      active.set(owner, (active.get(owner) || 0) + 1);
      let row,
        deadline,
        putFinished = false;
      try {
        deadline = setTimeout(() => req.destroy(), 300_000);
        deadline.unref();
        let prefix, body, durationMs;
        if (kind === 'soundboard') {
          const chunks = [];
          let received = 0;
          for await (const chunk of req) {
            received += chunk.length;
            if (received > size || received > SOUND_BYTES)
              throw error('FILE_TOO_LARGE', 'Efeito sonoro acima do limite.', 413);
            chunks.push(chunk);
          }
          if (received !== size) throw error('UPLOAD_INCOMPLETE', 'Envio incompleto.');
          const buffer = Buffer.concat(chunks),
            verified = validateSound(buffer);
          prefix = buffer;
          durationMs = verified.durationMs;
          body = Readable.from([buffer]);
        } else ({ prefix, body } = await peek(req));
        const mime = detectMime(prefix),
          isVideo = ['video/mp4', 'video/webm'].includes(mime);
        if (size > (kind === 'avatar' ? LIMITS.avatar : isVideo ? LIMITS.video : LIMITS.file))
          throw error('FILE_TOO_LARGE', 'Limite: 10 MB por arquivo e 100 MB por vídeo MP4.', 413);
        if (
          kind === 'avatar' &&
          !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)
        )
          throw error('INVALID_AVATAR', 'Escolha uma imagem PNG, JPG, WebP ou GIF.');
        const id = crypto.randomUUID(),
          objectKey = `${kind}/${owner}/${id}`;
        row = first(
          await db(
            kind === 'direct' ? 'rpc/reserve_direct_file' : 'rpc/reserve_chat_file',
            'POST',
            {
              p_id: id,
              p_owner: owner,
              p_key: objectKey,
              p_name: name,
              p_bytes: size,
              p_mime: mime,
              ...(kind === 'direct' ? { p_peer: peerId } : { p_kind: kind, p_room: roomId }),
            },
          ),
        );
        let received = 0;
        const counted = Readable.from(
          (async function* () {
            for await (const chunk of body) {
              received += chunk.length;
              if (received > size)
                throw error('FILE_TOO_LARGE', 'Arquivo ultrapassou o tamanho declarado.', 413);
              yield chunk;
            }
            if (received !== size)
              throw error('UPLOAD_INCOMPLETE', 'Envio incompleto. Tente novamente.');
          })(),
        );
        await r2.put(objectKey, counted, size, mime, name);
        putFinished = true;
        if (kind === 'chat' && !canAttach(owner, roomId))
          throw error('NOT_IN_ROOM', 'O canal foi fechado durante o envio.', 409);
        if (kind === 'direct') await directTarget(req, peerId);
        await db(`chat_files?id=eq.${id}&state=eq.pending`, 'PATCH', {
          state: 'ready',
          ...(durationMs ? { duration_ms: durationMs } : {}),
        });
        return { file: publicFile({ ...row, state: 'ready', duration_ms: durationMs }) };
      } catch (e) {
        if (row) {
          if (putFinished) await remove(row).catch(() => {});
          else {
            await r2
              .remove(row.object_key)
              .catch(
                () => {},
              ); /* Keep uncertain PUT reservations until the delayed cleanup confirms deletion again. */
          }
        }
        throw e;
      } finally {
        clearTimeout(deadline);
        const count = (active.get(owner) || 1) - 1;
        if (count) active.set(owner, count);
        else active.delete(owner);
      }
    });
  }
  return {
    install,
    attachment,
    directAttachment,
    sound,
    health: () => ({
      configured,
      limits: LIMITS,
      soundboard: { maxSeconds: 15, maxBytes: SOUND_BYTES },
    }),
    cleanup,
    db,
  };
}
module.exports = { createFiles, signedUrl, detectMime, LIMITS, r2Adapter };
