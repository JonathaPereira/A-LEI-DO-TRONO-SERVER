import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { Express, Response, NextFunction } from 'express';
import type { AuthGateway } from './auth-contract';
import type { ApiRequest, AccountContext } from './http-api';
import { object } from './http-api.ts';
import { permissions } from './roles.ts';
import { validateSound, MAX_BYTES as SOUND_BYTES } from './soundboard.ts';
import {
  fileError as error,
  storageUnavailable,
  LIMITS,
  type StoredFile,
  type ObjectStorage,
} from './files-contract.ts';
import {
  uuid,
  readSingleFile,
  readFilePage,
  readStorageUsage,
  publicFile,
} from './files-protocol.ts';
import { createStorageDatabase } from './storage-database.ts';
import { r2Adapter } from './storage-r2.ts';
import { detectMime, peek, drainRejectedUpload } from './file-upload.ts';
export { signedUrl, r2Adapter } from './storage-r2.ts';
export { detectMime, LIMITS };
interface FilesOptions {
  auth: AuthGateway;
  env?: NodeJS.ProcessEnv;
  membership?: (account: string, room: string) => boolean;
  canAttach?: (account: string, room: string) => boolean;
  onDeleted?: (row: StoredFile) => void;
  fetchImpl?: typeof fetch;
  adapter?: ObjectStorage;
}
function header(req: ApiRequest, name: string): string {
  const value = req.headers[name];
  if (value === undefined) return '';
  if (typeof value !== 'string') throw error('INVALID_REQUEST', 'Dados inválidos.');
  return value;
}
function respond(res: Response, e: unknown) {
  if (res.destroyed || res.writableEnded) return;
  const safe =
    object(e) &&
    typeof e.status === 'number' &&
    Number.isInteger(e.status) &&
    e.status >= 400 &&
    e.status <= 599;
  res.status(safe ? (e.status as number) : 503).json({
    error: {
      code: object(e) && typeof e.code === 'string' ? e.code : 'STORAGE_UNAVAILABLE',
      message:
        safe && typeof e.message === 'string' ? e.message : 'Não foi possível concluir o envio.',
    },
  });
}
export function createFiles({
  auth,
  env = process.env,
  membership = () => false,
  canAttach = membership,
  onDeleted = () => {},
  fetchImpl = fetch,
  adapter,
}: FilesOptions) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const configured = !!(
    auth.configured &&
    key &&
    /^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID || '') &&
    /^[a-z0-9][a-z0-9.-]{1,62}$/.test(env.R2_BUCKET || '') &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY
  );
  const r2 = adapter || r2Adapter(env),
    active = new Map<string, number>();
  const lifetime = new AbortController();
  const contexts = new WeakMap<ApiRequest, AccountContext>();
  const installed = new WeakSet<Express>();
  const uploads = new Map<ApiRequest, NodeJS.Timeout>();
  const db = createStorageDatabase({ url, key, fetchImpl, signal: lifetime.signal });
  function available() {
    if (lifetime.signal.aborted) throw storageUnavailable();
  }
  function context(req: ApiRequest) {
    const value = contexts.get(req);
    if (!value) throw storageUnavailable();
    return value;
  }
  let cleaning = false;
  async function lookup(id: string, signal?: AbortSignal) {
    if (!uuid(id)) throw error('FILE_NOT_FOUND', 'Arquivo não encontrado.', 404);
    const row = readSingleFile(
      await db(`chat_files?id=eq.${id}&limit=1`, 'GET', undefined, signal),
    );
    if (row && row.id !== id) throw storageUnavailable();
    return row;
  }
  async function remove(row: StoredFile) {
    const marked = readSingleFile(
      await db('rpc/mark_chat_file_deleting', 'POST', { p_id: row.id, p_owner: row.owner_id }),
    );
    if (!marked?.id) throw error('FILE_BUSY', 'Esse arquivo está sendo enviado. Aguarde.', 409);
    if (
      marked.id !== row.id ||
      marked.owner_id !== row.owner_id ||
      marked.object_key !== row.object_key ||
      marked.state !== 'deleting'
    )
      throw storageUnavailable();
    await r2.remove(row.object_key, lifetime.signal);
    available(); // Never free the reservation before R2 confirms deletion.
    await db(`chat_files?id=eq.${row.id}`, 'DELETE');
    onDeleted(row);
  }
  async function cleanup() {
    if (!configured || cleaning || lifetime.signal.aborted) return;
    cleaning = true;
    try {
      const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
      const rows = readFilePage(
        await db(
          `chat_files?or=(state.eq.deleting,and(state.eq.pending,created_at.lt.${encodeURIComponent(cutoff)}))&limit=20`,
        ),
        20,
        (row) =>
          row.state === 'deleting' ||
          (row.state === 'pending' && Date.parse(row.created_at) < Date.parse(cutoff)),
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
  async function attachment(id: string, owner: string, roomId: string, signal?: AbortSignal) {
    const row = await lookup(id, signal);
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
  async function directAttachment(id: string, owner: string, peerId: string, signal?: AbortSignal) {
    const row = await lookup(id, signal);
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
  async function directTarget(identity: AccountContext, peerId: string | null) {
    if (!uuid(peerId) || peerId === identity.account.id)
      throw error('INVALID_TARGET', 'Escolha um amigo para enviar o anexo.');
    await auth.request(
      identity.token,
      '/rest/v1/rpc/social_attachment_target',
      'POST',
      { p_peer: peerId },
      identity.signal,
    );
  }
  async function directAccess(row: StoredFile, identity: AccountContext) {
    const allowed = await db(
      'rpc/direct_file_access',
      'POST',
      { p_file: row.id, p_account: identity.account.id },
      identity.signal,
    );
    if (typeof allowed !== 'boolean') throw storageUnavailable();
    return allowed;
  }
  async function sound(id: string, signal?: AbortSignal) {
    if (!configured)
      throw error('STORAGE_UNCONFIGURED', 'Efeitos sonoros ainda não foram ativados.', 503);
    const row = await lookup(id, signal);
    if (!row || row.state !== 'ready' || row.kind !== 'soundboard')
      throw error('FILE_NOT_FOUND', 'Efeito sonoro não encontrado.', 404);
    return publicFile(row);
  }
  function install(app: Express) {
    if (installed.has(app)) return;
    installed.add(app);
    app.use('/files', async (req: ApiRequest, res: Response, next: NextFunction) => {
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
      if (lifetime.signal.aborted) {
        respond(res, storageUnavailable());
        return;
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      const client = new AbortController(),
        signal = AbortSignal.any([lifetime.signal, client.signal]);
      const cleanup = () => {
        contexts.delete(req);
        res.removeListener('finish', cleanup);
        res.removeListener('close', close);
      };
      const close = () => {
        if (!res.writableEnded) client.abort();
        cleanup();
      };
      res.once('finish', cleanup);
      res.once('close', close);
      try {
        const token = auth.tokenFrom(req),
          account = await auth.identity(token, signal);
        if (signal.aborted) throw storageUnavailable();
        contexts.set(req, { token, account, signal });
        next();
      } catch (e) {
        cleanup();
        respond(res, e);
      }
    });
    function route(
      method: 'get' | 'post' | 'delete',
      path: string,
      fn: (req: ApiRequest) => Promise<unknown>,
    ) {
      app[method](`/files${path}`, async (req: ApiRequest, res: Response) => {
        try {
          available();
          if (!configured)
            throw error(
              'STORAGE_UNCONFIGURED',
              'Anexos ainda não foram ativados no servidor.',
              503,
            );
          const value = await fn(req);
          available();
          if (!res.destroyed && !res.writableEnded) res.json(value);
        } catch (e) {
          if (!res.destroyed) {
            // Rejected uploads may still have a body in flight. Drain it and retire
            // this connection so the next API call cannot reuse a half-read upload.
            if (method === 'post') {
              await drainRejectedUpload(req);
              res.set('Connection', 'close');
            }
            respond(res, e);
          }
        }
      });
    }
    route('get', '/status', async (req) => ({
      configured: true,
      used: readStorageUsage(await db('rpc/chat_storage_usage', 'POST', {}, context(req).signal)),
      limits: LIMITS,
    }));
    route('get', '/mine', async (req) => {
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = readFilePage(
        await db(
          `chat_files?owner_id=eq.${context(req).account.id}&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
          'GET',
          undefined,
          context(req).signal,
        ),
        200,
        (row) => row.owner_id === context(req).account.id && row.state === 'ready',
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/soundboard', async (req) => {
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = readFilePage(
        await db(
          `chat_files?kind=eq.soundboard&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
          'GET',
          undefined,
          context(req).signal,
        ),
        200,
        (row) => row.kind === 'soundboard' && row.state === 'ready',
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/channel/:roomId', async (req) => {
      if (!membership(context(req).account.id, req.params.roomId))
        throw error('NOT_IN_ROOM', 'Entre no canal para ver seus anexos.', 403);
      const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query.offset) || 0)));
      const rows = readFilePage(
        await db(
          `chat_files?kind=eq.chat&room_id=eq.${encodeURIComponent(req.params.roomId)}&state=eq.ready&order=created_at.desc,id.desc&limit=200&offset=${offset}`,
          'GET',
          undefined,
          context(req).signal,
        ),
        200,
        (row) => row.kind === 'chat' && row.room_id === req.params.roomId && row.state === 'ready',
      );
      return {
        files: rows.map(publicFile),
        hasMore: rows.length === 200,
        nextOffset: offset + rows.length,
      };
    });
    route('get', '/:id/url', async (req) => {
      const row = await lookup(req.params.id, context(req).signal);
      if (!row || row.state !== 'ready')
        throw error('FILE_NOT_FOUND', 'Arquivo excluído ou indisponível.', 404);
      if (row.kind === 'direct' && !(await directAccess(row, context(req))))
        throw error('FILE_FORBIDDEN', 'Este anexo pertence a uma conversa privada.', 403);
      if (
        row.kind === 'chat' &&
        row.owner_id !== context(req).account.id &&
        !membership(context(req).account.id, row.room_id || '')
      )
        throw error('FILE_FORBIDDEN', 'Entre no canal desse anexo para acessá-lo.', 403);
      return { url: r2.url(row, req.query.download === '1'), expiresAt: Date.now() + 300000 };
    });
    route('delete', '/:id', async (req) => {
      const row = await lookup(req.params.id, context(req).signal);
      if (
        !row ||
        (row.owner_id !== context(req).account.id &&
          (row.kind === 'direct' || !permissions(context(req).account.role).moderateFiles))
      )
        throw error('FILE_FORBIDDEN', 'Você só pode excluir seus próprios arquivos.', 403);
      if (row.state === 'pending' && Date.now() - Date.parse(row.created_at) < 20 * 60_000)
        throw error('FILE_BUSY', 'Envio ainda reservado. Aguarde a limpeza automática.', 409);
      await remove(row);
      return { ok: true };
    });
    route('post', '/upload', async (req) => {
      const identity = context(req),
        owner = identity.account.id,
        size = Number(req.headers['content-length']),
        kind = header(req, 'x-file-kind') || 'chat',
        roomId = kind === 'chat' ? String(req.headers['x-room-id'] || '') : null,
        peerId = kind === 'direct' ? String(req.headers['x-peer-id'] || '') : null;
      if (kind !== 'avatar' && kind !== 'chat' && kind !== 'soundboard' && kind !== 'direct')
        throw error('INVALID_FILE_KIND', 'Tipo de arquivo inválido.');
      if (!Number.isSafeInteger(size) || size <= 0)
        throw error('FILE_SIZE_REQUIRED', 'Informe um arquivo com tamanho válido.', 411);
      if (
        size >
        (kind === 'soundboard' ? SOUND_BYTES : kind === 'avatar' ? LIMITS.avatar : LIMITS.video)
      )
        throw error('FILE_TOO_LARGE', 'Arquivo acima do limite permitido.', 413);
      if (kind === 'chat' && !canAttach(owner, roomId || ''))
        throw error('NOT_IN_ROOM', 'Entre em um canal de texto para anexar arquivos.', 403);
      if (kind === 'direct') await directTarget(identity, peerId);
      if (active.size >= 4 || (active.get(owner) || 0) >= 2)
        throw error('UPLOAD_BUSY', 'Aguarde os envios em andamento.', 429);
      let name;
      try {
        name = decodeURIComponent(header(req, 'x-file-name') || 'arquivo');
      } catch {
        throw error('INVALID_FILENAME', 'Nome de arquivo inválido.');
      }
      name =
        [...name.replace(/[\\/\x00-\x1f\x7f]/g, '_')].slice(0, 140).join('').trim() || 'arquivo';
      active.set(owner, (active.get(owner) || 0) + 1);
      let row: StoredFile | null = null,
        deadline: NodeJS.Timeout | undefined,
        putFinished = false;
      try {
        deadline = setTimeout(() => req.destroy(), 300_000);
        deadline.unref();
        uploads.set(req, deadline);
        let prefix: Buffer, body: Readable, durationMs: number | undefined;
        if (kind === 'soundboard') {
          const chunks: Buffer[] = [];
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
        const reserved = readSingleFile(
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
        if (
          !reserved ||
          reserved.id !== id ||
          reserved.owner_id !== owner ||
          reserved.object_key !== objectKey ||
          reserved.bytes !== size ||
          reserved.name !== name ||
          reserved.kind !== kind ||
          reserved.mime !== mime ||
          reserved.room_id !== roomId ||
          reserved.direct_peer_id !== peerId ||
          reserved.state !== 'pending'
        )
          throw storageUnavailable();
        row = reserved;
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
        await r2.put(objectKey, counted, size, mime, name, identity.signal);
        available();
        if (identity.signal.aborted) throw storageUnavailable();
        putFinished = true;
        if (kind === 'chat' && !canAttach(owner, roomId || ''))
          throw error('NOT_IN_ROOM', 'O canal foi fechado durante o envio.', 409);
        if (kind === 'direct') await directTarget(identity, peerId);
        const committed = readSingleFile(
          await db(`chat_files?id=eq.${id}&state=eq.pending`, 'PATCH', {
            state: 'ready',
            ...(durationMs ? { duration_ms: durationMs } : {}),
          }),
        );
        if (
          !committed ||
          committed.id !== id ||
          committed.owner_id !== owner ||
          committed.object_key !== objectKey ||
          committed.bytes !== size ||
          committed.mime !== mime ||
          committed.name !== name ||
          (kind === 'soundboard' && committed.duration_ms !== durationMs) ||
          committed.state !== 'ready' ||
          committed.kind !== kind ||
          committed.room_id !== roomId ||
          committed.direct_peer_id !== peerId
        )
          throw storageUnavailable();
        return { file: publicFile(committed) };
      } catch (e) {
        if (row) {
          if (putFinished) await remove(row).catch(() => {});
          else {
            await r2
              .remove(row.object_key, lifetime.signal)
              .catch(
                () => {},
              ); /* Keep uncertain PUT reservations until the delayed cleanup confirms deletion again. */
          }
        }
        throw e;
      } finally {
        clearTimeout(deadline);
        uploads.delete(req);
        const count = (active.get(owner) || 1) - 1;
        if (count) active.set(owner, count);
        else active.delete(owner);
      }
    });
  }
  return {
    stop() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      clearInterval(timer);
      for (const [req, deadline] of uploads) {
        clearTimeout(deadline);
        req.destroy();
      }
      uploads.clear();
      active.clear();
    },
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
