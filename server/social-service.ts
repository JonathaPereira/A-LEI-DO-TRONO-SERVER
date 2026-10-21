import type { Express } from 'express';
import type { AuthGateway, BackendAccount } from './auth-contract';
import type { SocketMessage } from '../src/types/socket';
import type { DirectMessage, SocialSnapshot } from '../src/types/messenger';
import { installAccountApi, apiError, object } from './http-api.ts';
import {
  readSocial,
  readConversation,
  readCommittedMessage,
  socialUnavailable,
  targetId,
} from './social-protocol.ts';

interface Connection {
  account?: Pick<BackendAccount, 'id' | 'expiresAt'> | null;
}
interface Room {
  id: string;
  kind: 'chat' | 'game';
}
interface Options {
  auth: AuthGateway;
  wss: { clients: Iterable<Connection> };
  send(connection: Connection, event: SocketMessage): void;
  rooms: ReadonlyMap<string, Room>;
  files?: {
    directAttachment(
      id: string,
      owner: string,
      peer: string,
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
  now?(): number;
}
const limits = { snapshot: 120, friend: 120, read: 120, 'mark-read': 120, send: 60 } as const;
type Action = keyof typeof limits;
type Result = SocialSnapshot | ReturnType<typeof readConversation> | DirectMessage | { ok: true };
function readAction(value: unknown): Action {
  if (typeof value !== 'string' || !Object.hasOwn(limits, value))
    throw apiError('INVALID_ACTION', 'Ação inválida.');
  return value as Action;
}

/** Persistent friend/conversation commands share the existing account and socket owners. */
export function createSocialService({ auth, wss, send, rooms, files, now = Date.now }: Options) {
  const rates = new Map<string, { count: number; until: number }>(),
    scope = new AbortController();
  let ready = false,
    closed = false,
    installed = false;
  const available = () => {
    if (closed) throw socialUnavailable();
  };
  function publish(accounts: readonly string[], event: SocketMessage) {
    if (closed) return;
    for (const connection of wss.clients)
      if (
        connection.account &&
        accounts.includes(connection.account.id) &&
        connection.account.expiresAt > now()
      )
        send(connection, event);
  }
  function limit(id: string, action: Action) {
    const key = id + ':' + action,
      stamp = now();
    let row = rates.get(key);
    if (!row || row.until < stamp) {
      row = { count: 0, until: stamp + 60000 };
      rates.set(key, row);
    }
    if (++row.count > limits[action])
      throw apiError('SOCIAL_RATE_LIMIT', 'Aguarde um instante antes de tentar novamente.', 429);
    if (rates.size > 2000) for (const [key, row] of rates) if (row.until < stamp) rates.delete(key);
  }
  async function operation(
    token: string,
    account: BackendAccount,
    rawAction: unknown,
    input: unknown = {},
    caller?: AbortSignal,
  ): Promise<Result> {
    available();
    const action = readAction(rawAction),
      payload = object(input) ? input : {};
    const reading = action === 'snapshot' || action === 'read',
      signal = caller ? AbortSignal.any([scope.signal, caller]) : scope.signal;
    signal.throwIfAborted();
    limit(account.id, action);
    let mutationStarted = false;
    const rpc = (name: string, body: Record<string, unknown>) => {
      if (!reading) mutationStarted = true;
      return auth.request(
        token,
        '/rest/v1/rpc/social_' + name,
        'POST',
        body,
        reading ? signal : scope.signal,
      );
    };
    try {
      let data: Result;
      if (action === 'snapshot') {
        const value = await rpc('snapshot', {});
        signal.throwIfAborted();
        data = readSocial(value, account.id);
      } else if (action === 'friend') {
        const peer = targetId(payload.peerId),
          intent = payload.action;
        if (
          intent !== 'request' &&
          intent !== 'accept' &&
          intent !== 'decline' &&
          intent !== 'remove'
        )
          throw apiError('INVALID_ACTION', 'Ação inválida.');
        await rpc('friend', { p_target: peer, p_action: intent });
        available();
        data = { ok: true };
        publish([account.id, peer], {
          type: 'social-changed',
          kind: 'friend',
          accountId: account.id,
          action: intent,
          name: account.nickname,
        });
      } else if (action === 'read') {
        const peer = targetId(payload.peerId);
        const value = await rpc('read', {
          p_peer: peer,
          p_before: payload.before ? targetId(payload.before) : null,
        });
        signal.throwIfAborted();
        data = readConversation(value, account.id, peer);
      } else if (action === 'mark-read') {
        await rpc('mark_read', {
          p_peer: targetId(payload.peerId),
          p_message: targetId(payload.messageId),
        });
        available();
        data = { ok: true };
        publish([account.id], { type: 'social-changed', kind: 'read' });
      } else {
        const peer = targetId(payload.peerId),
          id = targetId(payload.id),
          text = typeof payload.text === 'string' ? payload.text.trim() : '',
          attachmentId = payload.attachmentId ? targetId(payload.attachmentId) : null;
        const room = typeof payload.roomId === 'string' ? rooms.get(payload.roomId) : null;
        if (payload.roomId && (!room || room.kind !== 'chat'))
          throw apiError('CHANNEL_NOT_FOUND', 'Esse canal não existe mais.', 404);
        if (attachmentId && payload.roomId)
          throw apiError('INVALID_MESSAGE', 'Envie o anexo separado do convite.');
        if (!payload.roomId && ((!text && !attachmentId) || [...text].length > 2000))
          throw apiError('INVALID_MESSAGE', 'Escreva até 2000 caracteres ou escolha um anexo.');
        if (attachmentId) {
          if (!files) throw apiError('STORAGE_UNCONFIGURED', 'Anexos indisponíveis.', 503);
          await files.directAttachment(attachmentId, account.id, peer, signal);
          signal.throwIfAborted();
        }
        const value = attachmentId
          ? await rpc('send_attachment', {
              p_peer: peer,
              p_id: id,
              p_text: text,
              p_attachment: attachmentId,
            })
          : await rpc('send', { p_peer: peer, p_id: id, p_text: text, p_room: room?.id || null });
        available();
        data = readCommittedMessage(value, account.id, peer, {
          id,
          roomId: room?.id || null,
          attachmentId,
        });
        publish([account.id, peer], {
          type: 'direct-message',
          peerId: peer,
          senderName: account.nickname,
          message: data,
        });
      }
      available();
      ready = true;
      return data;
    } catch (error) {
      const cancelled = signal.aborted && !closed && (reading || !mutationStarted);
      if (!cancelled && (!object(error) || typeof error.status !== 'number' || error.status >= 500))
        ready = false;
      if (cancelled || (object(error) && typeof error.status === 'number')) throw error;
      throw socialUnavailable();
    }
  }
  function install(app: Express, express: Pick<typeof import('express'), 'json'>) {
    available();
    if (installed) return;
    installed = true;
    const route = installAccountApi({
      app,
      express,
      base: '/social',
      auth,
      signal: scope.signal,
      code: 'SOCIAL_UNAVAILABLE',
      message: 'Conversas indisponíveis. Confira a migração SQL.',
      bodyLimit: '12kb',
      methods: 'POST, OPTIONS',
      parseBodyBeforeAuth: true,
    });
    route('post', '/:action', (req, identity) =>
      operation(identity.token, identity.account, req.params.action, req.body, identity.signal),
    );
  }
  return {
    install,
    operation,
    health: () => ({ configured: auth.configured, ready, persistent: true }),
    stop() {
      if (closed) return;
      closed = true;
      ready = false;
      scope.abort();
      rates.clear();
    },
  };
}
