'use strict';
const fail = () =>
  Object.assign(
    Error('Não foi possível salvar ou carregar as mensagens. Tente novamente em instantes.'),
    { code: 'CHAT_HISTORY_UNAVAILABLE' },
  );
function createChatHistory({ auth, env = process.env, fetchImpl = fetch } = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = !!(auth.configured && key),
    queues = new Map();
  let ready = false;
  function serial(roomId, fn) {
    const task = (queues.get(roomId) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(roomId, task);
    void task
      .finally(() => {
        if (queues.get(roomId) === task) queues.delete(roomId);
      })
      .catch(() => {});
    return task;
  }
  async function rpc(name, body, expectJSON = true) {
    if (!configured) throw fail();
    try {
      const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: key,
          ...(!String(key).startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw fail();
      // PostgREST returns an empty HTTP 204 for SQL functions that return void.
      // A successful append is already committed; there is no JSON result to read.
      const result = expectJSON ? await response.json() : null;
      ready = true;
      return result;
    } catch {
      ready = false;
      throw fail();
    }
  }
  const persistent = (room) => room.kind === 'chat' && room.channelType !== 'voice';
  async function append(room, message, accountId) {
    if (!persistent(room)) return;
    if (!configured && !auth.required) return; // Deliberate local/legacy mode only.
    if (!accountId) throw fail();
    await rpc(
      'chat_history_append',
      { p_id: message.id, p_room: room.id, p_sender: accountId, p_message: message },
      false,
    );
  }
  async function read(room, before = null) {
    if (!persistent(room))
      return { messages: [...(room.chatHistory || [])], hasMore: false, before: null };
    if (!configured && !auth.required)
      return { messages: [...(room.chatHistory || [])], hasMore: false, before: null };
    const rows = await rpc('chat_history_read', { p_room: room.id, p_before: before, p_limit: 50 });
    if (!Array.isArray(rows) || rows.some((r) => !r.message?.id || r.message.roomId !== room.id)) {
      ready = false;
      throw fail();
    }
    const hasMore = rows.length > 50,
      messages = rows
        .slice(0, 50)
        .map((r) => r.message)
        .reverse();
    return { messages, hasMore, before: messages[0]?.id || null };
  }
  async function remove(room, id, actorId) {
    if (!persistent(room)) throw fail();
    if (!configured && !auth.required) return;
    if (!actorId) throw fail();
    await rpc('chat_history_delete', { p_actor: actorId, p_room: room.id, p_id: id });
  }
  async function clear(room, actorId) {
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
  };
}
module.exports = { createChatHistory };
