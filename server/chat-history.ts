import type { ChannelType, ChatMessage } from '../src/types/domain';

/** SQL deliberately preserves older message metadata; only identity/channel fields are mandatory here. */
export interface StoredChatMessage extends Record<string, unknown> {
  id: string;
  roomId: string;
}
export interface HistoryRoom {
  id: string;
  kind: string;
  channelType?: ChannelType;
  chatHistory?: StoredChatMessage[];
}
interface Options {
  auth: { configured: boolean; required: boolean };
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () =>
  Object.assign(
    Error('Não foi possível salvar ou carregar as mensagens. Tente novamente em instantes.'),
    { code: 'CHAT_HISTORY_UNAVAILABLE' },
  );
export function createChatHistory({ auth, env = process.env, fetchImpl = fetch }: Options) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = !!(auth.configured && key),
    queues = new Map<string, Promise<unknown>>(),
    scope = new AbortController();
  let ready = false,
    closed = false;
  function serial<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(fail());
    const task = (queues.get(roomId) || Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (closed) throw fail();
        return fn();
      });
    queues.set(roomId, task);
    void task
      .finally(() => {
        if (queues.get(roomId) === task) queues.delete(roomId);
      })
      .catch(() => {});
    return task;
  }
  async function rpc(
    name: string,
    body: Record<string, unknown>,
    expectJSON = true,
  ): Promise<unknown> {
    if (!configured || closed || !key) throw fail();
    try {
      const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: key,
          ...(!String(key).startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([scope.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw fail();
      // PostgREST returns an empty HTTP 204 for SQL functions that return void.
      // A successful append is already committed; there is no JSON result to read.
      const result: unknown = expectJSON ? await response.json() : null;
      if (closed) throw fail();
      ready = true;
      return result;
    } catch {
      ready = false;
      throw fail();
    }
  }
  const persistent = (room: HistoryRoom) => room.kind === 'chat' && room.channelType !== 'voice';
  async function append(room: HistoryRoom, message: ChatMessage, accountId: string | null) {
    if (closed) throw fail();
    if (!persistent(room)) return;
    if (!configured && !auth.required) return; // Deliberate local/legacy mode only.
    if (!accountId) throw fail();
    await rpc(
      'chat_history_append',
      { p_id: message.id, p_room: room.id, p_sender: accountId, p_message: message },
      false,
    );
  }
  async function read(room: HistoryRoom, before: string | null = null) {
    if (closed) throw fail();
    if (!persistent(room))
      return { messages: [...(room.chatHistory || [])], hasMore: false, before: null };
    if (!configured && !auth.required)
      return { messages: [...(room.chatHistory || [])], hasMore: false, before: null };
    const rows = await rpc('chat_history_read', { p_room: room.id, p_before: before, p_limit: 50 });
    if (!Array.isArray(rows) || rows.length > 51) {
      ready = false;
      throw fail();
    }
    const seen = new Set<string>(),
      validated: StoredChatMessage[] = [];
    for (const row of rows) {
      const message: unknown = record(row) ? row.message : null;
      if (
        !record(message) ||
        typeof message.id !== 'string' ||
        !message.id ||
        message.roomId !== room.id ||
        seen.has(message.id)
      ) {
        ready = false;
        throw fail();
      }
      seen.add(message.id);
      validated.push({ ...message, id: message.id, roomId: room.id });
    }
    const hasMore = validated.length > 50,
      messages = validated.slice(0, 50).reverse();
    return { messages, hasMore, before: messages[0]?.id || null };
  }
  async function remove(room: HistoryRoom, id: string, actorId: string | null) {
    if (closed) throw fail();
    if (!persistent(room)) throw fail();
    if (!configured && !auth.required) return;
    if (!actorId) throw fail();
    await rpc('chat_history_delete', { p_actor: actorId, p_room: room.id, p_id: id });
  }
  async function clear(room: HistoryRoom, actorId: string | null) {
    if (closed) throw fail();
    if (!persistent(room)) throw fail();
    if (!configured && !auth.required) return;
    if (!actorId) throw fail();
    await rpc('chat_history_clear', { p_actor: actorId, p_room: room.id });
  }
  return {
    serial,
    append,
    read,
    remove,
    clear,
    health: () => ({ configured, ready, persistent: configured }),
    close() {
      if (closed) return;
      closed = true;
      ready = false;
      scope.abort();
      queues.clear();
    },
  };
}
