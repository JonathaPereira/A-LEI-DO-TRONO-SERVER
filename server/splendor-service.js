'use strict';
const Bots = require('../src/lib/games/bot-names.ts');
const crypto = require('node:crypto'),
  Rules = require('../src/lib/games/splendor-rules.ts');
const failure = (code, message) => Object.assign(Error(message), { code });
function createSplendorService({
  auth,
  send,
  wss,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  botDelay = 3800,
  disconnectDelay = 90000,
} = {}) {
  const rooms = new Map(),
    membership = new Map(),
    timers = new Set(),
    rates = new Map();
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    configured = !!(auth.configured && key);
  let ready = false;
  function later(fn, ms) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timer.unref?.();
    timers.add(timer);
    return timer;
  }
  function cancel(timer) {
    clearTimeout(timer);
    timers.delete(timer);
  }
  async function rpc(name, body) {
    if (!configured)
      throw failure(
        'SPLENDOR_RANKING_UNAVAILABLE',
        'Recordes temporariamente indisponíveis. Você pode continuar jogando.',
      );
    try {
      const res = await fetchImpl(url + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          apikey: key,
          ...(!String(key).startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw Error();
      const data = await res.json();
      if (name === 'splendor_record_match' && data?.saved !== true) throw Error();
      if (
        name === 'splendor_top_five' &&
        (!Array.isArray(data) ||
          data.length > 5 ||
          data.some(
            (r) =>
              typeof r.playerId !== 'string' ||
              typeof r.name !== 'string' ||
              !Number.isInteger(r.score) ||
              r.score < 0 ||
              r.score > 200 ||
              !Number.isInteger(r.cards) ||
              r.cards < 0 ||
              r.cards > 90 ||
              !['online', 'bots'].includes(r.mode) ||
              !Number.isFinite(Date.parse(r.date)),
          ))
      )
        throw Error();
      ready = true;
      return data;
    } catch {
      ready = false;
      throw failure(
        'SPLENDOR_RANKING_UNAVAILABLE',
        'Não foi possível acessar os recordes. Tente novamente mais tarde.',
      );
    }
  }
  const valid = (ws) => ws.account && ws.account.expiresAt > now();
  function view(room, viewerId) {
    return {
      id: room.id,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        online: !!p.ws,
        forfeited: !!p.forfeited,
      })),
      state: room.state ? Rules.publicState(room.state, viewerId) : null,
      recordStatus: room.recordStatus || null,
    };
  }
  function publish(room) {
    for (const p of room.players)
      if (p.ws && valid(p.ws) && p.ws.account.id === p.id)
        send(p.ws, { type: 'splendor-state', room: view(room, p.id) });
  }
  function list(ws) {
    send(ws, {
      type: 'splendor-rooms',
      rooms: [...rooms.values()]
        .filter((r) => !r.state && r.players.length < r.maxPlayers)
        .map((r) => ({
          id: r.id,
          name: r.players[0]?.name || 'Mesa',
          players: r.players.length,
          maxPlayers: r.maxPlayers,
        })),
      resumeId: membership.get(ws.account?.id) || null,
    });
  }
  function lists() {
    for (const ws of wss.clients) if (valid(ws) && ws.splendorWatching) list(ws);
  }
  function remove(room) {
    cancel(room.botTimer);
    cancel(room.retryTimer);
    for (const p of room.players) {
      cancel(p.offlineTimer);
      if (membership.get(p.id) === room.id) membership.delete(p.id);
    }
    rooms.delete(room.id);
  }
  async function persist(room) {
    if (room.recordStatus === 'saved' || room.saving) return;
    const players = room.state.players
      .filter((p) => !p.bot && !room.players.find((x) => x.id === p.id)?.forfeited)
      .map((p) => ({ id: p.id, score: p.score, cards: p.cards.length }));
    if (!players.length) {
      room.recordStatus = 'unranked';
      publish(room);
      if (!room.players.some((p) => p.ws)) {
        remove(room);
        lists();
      }
      return;
    }
    room.saving = true;
    room.recordStatus = 'saving';
    publish(room);
    try {
      await rpc('splendor_record_match', {
        p_match: room.matchId,
        p_rounds: room.state.round,
        p_mode: room.usedBots ? 'bots' : 'online',
        p_players: players,
      });
      room.recordStatus = 'saved';
      cancel(room.retryTimer);
    } catch {
      room.recordStatus = 'pending';
      room.retryTimer = later(() => void persist(room), 30000);
    } finally {
      room.saving = false;
      publish(room);
      if (room.recordStatus === 'saved' && !room.players.some((p) => p.ws)) {
        remove(room);
        lists();
      }
    }
  }
  function schedule(room) {
    cancel(room.botTimer);
    if (!room.state || room.state.phase === 'finished') return;
    const player = room.players[room.state.turn];
    if (!player.bot) return;
    room.botTimer = later(() => {
      if (!rooms.has(room.id) || room.state.phase === 'finished') return;
      applyMove(room, player.id, Rules.botMove(room.state));
    }, botDelay);
  }
  function applyMove(room, id, input) {
    room.state = Rules.move(room.state, id, input);
    room.updatedAt = now();
    publish(room);
    if (room.state.phase === 'finished') void persist(room);
    else schedule(room);
  }
  function detach(ws, explicit = false) {
    const room = rooms.get(ws.splendorRoomId),
      p = room?.players.find((p) => p.id === ws.account?.id && p.ws === ws);
    ws.splendorRoomId = null;
    if (!p) return;
    p.ws = null;
    cancel(p.offlineTimer);
    function leave() {
      if (!rooms.has(room.id) || p.ws) return;
      membership.delete(p.id);
      if (room.state && room.state.phase !== 'finished') {
        p.bot = true;
        p.forfeited = true;
        p.name = Bots.next(room.players.filter((x) => x !== p));
        room.usedBots = true;
        Object.assign(
          room.state.players.find((x) => x.id === p.id),
          { forfeited: true, bot: true, name: p.name },
        );
      } else if (!room.state) {
        room.players = room.players.filter((x) => x !== p);
        if (room.hostId === p.id) room.hostId = room.players[0]?.id;
      }
      if (
        !room.players.some((x) => x.ws) &&
        (!room.state || room.recordStatus === 'saved' || room.recordStatus === 'unranked')
      )
        remove(room);
      else {
        publish(room);
        schedule(room);
      }
      lists();
    }
    if (explicit) leave();
    else {
      p.offlineTimer = later(leave, disconnectDelay);
      publish(room);
    }
  }
  function attach(ws, room) {
    const p = room.players.find((p) => p.id === ws.account.id);
    if (!p) throw failure('SPLENDOR_NOT_MEMBER', 'Você não participa desta mesa.');
    if (p.forfeited)
      throw failure('SPLENDOR_LEFT', 'Você saiu desta partida. Aguarde o fim e crie outra mesa.');
    cancel(p.offlineTimer);
    p.ws = ws;
    p.name = ws.account.nickname;
    ws.splendorRoomId = room.id;
    if (room.state) room.state.players.find((x) => x.id === p.id).name = p.name;
    membership.set(p.id, room.id);
    publish(room);
    lists();
  }
  function handle(ws, msg) {
    if (!valid(ws)) {
      send(ws, {
        type: 'splendor-error',
        requestId: msg.requestId,
        code: 'AUTH_REQUIRED',
        message: 'Entre na sua conta para jogar Splendor e guardar seus recordes.',
      });
      return;
    }
    try {
      let rate = rates.get(ws.account.id);
      if (!rate || rate.until < now()) {
        rate = { count: 0, until: now() + 10000 };
        rates.set(ws.account.id, rate);
      }
      if (++rate.count > 100) throw failure('SPLENDOR_RATE_LIMIT', 'Aguarde um instante.');
      ws.splendorWatching = true;
      const action = msg.action;
      if (action === 'list') {
        list(ws);
        return;
      }
      if (action === 'ranking') {
        void rpc('splendor_top_five', {})
          .then((rows) => send(ws, { type: 'splendor-ranking', rows, requestId: msg.requestId }))
          .catch((error) =>
            send(ws, {
              type: 'splendor-error',
              requestId: msg.requestId,
              code: error.code,
              message: error.message,
            }),
          );
        return;
      }
      if (action === 'create') {
        if (membership.has(ws.account.id))
          throw failure(
            'SPLENDOR_ALREADY_SEATED',
            'Retome ou saia da sua mesa antes de criar outra.',
          );
        if (rooms.size >= 100)
          throw failure(
            'SPLENDOR_BUSY',
            'Todas as mesas estão ocupadas. Tente novamente mais tarde.',
          );
        const maxPlayers = msg.maxPlayers;
        if (![2, 3, 4].includes(maxPlayers))
          throw failure('SPLENDOR_PLAYERS', 'Escolha 2, 3 ou 4 participantes.');
        const id = crypto.randomBytes(5).toString('hex').toUpperCase(),
          room = {
            id,
            hostId: ws.account.id,
            maxPlayers,
            players: [{ id: ws.account.id, name: ws.account.nickname, bot: false, ws: null }],
            state: null,
            updatedAt: now(),
          };
        rooms.set(id, room);
        attach(ws, room);
        return;
      }
      if (action === 'join' || action === 'resume') {
        const existing = membership.get(ws.account.id);
        if (existing && existing !== msg.roomId)
          throw failure('SPLENDOR_ALREADY_SEATED', 'Saia da sua mesa antes de entrar em outra.');
        const room = rooms.get(String(msg.roomId || ''));
        if (!room) throw failure('SPLENDOR_NOT_FOUND', 'Essa mesa não está mais disponível.');
        const p = room.players.find((p) => p.id === ws.account.id);
        if (!p) {
          if (room.state || room.players.length >= room.maxPlayers)
            throw failure('SPLENDOR_FULL', 'A mesa está cheia ou a partida já começou.');
          room.players.push({ id: ws.account.id, name: ws.account.nickname, bot: false, ws: null });
        } else if (p.ws && p.ws !== ws)
          throw failure('SPLENDOR_OTHER_SESSION', 'Essa conta já está jogando em outra sessão.');
        attach(ws, room);
        return;
      }
      const room = rooms.get(ws.splendorRoomId);
      if (!room || !room.players.some((p) => p.ws === ws))
        throw failure('SPLENDOR_NOT_MEMBER', 'Entre em uma mesa primeiro.');
      if (action === 'leave') {
        detach(ws, true);
        send(ws, { type: 'splendor-left' });
        return;
      }
      if (action === 'state') {
        publish(room);
        return;
      }
      if (action === 'start') {
        if (room.hostId !== ws.account.id || room.state)
          throw failure('SPLENDOR_FORBIDDEN', 'Somente quem criou a mesa pode iniciar.');
        if (room.players.some((p) => !p.ws))
          throw failure(
            'SPLENDOR_OFFLINE',
            'Aguarde os participantes reconectarem ou saírem da mesa.',
          );
        if (!msg.fillBots && room.players.length < 2)
          throw failure('SPLENDOR_PLAYERS', 'Convide outra pessoa ou complete a mesa com bots.');
        if (msg.fillBots)
          while (room.players.length < room.maxPlayers)
            room.players.push({
              id: 'bot-' + crypto.randomUUID(),
              name: Bots.next(room.players),
              bot: true,
              ws: null,
            });
        room.matchId = crypto.randomUUID();
        room.usedBots = room.players.some((p) => p.bot);
        room.state = Rules.create(room.players);
        room.updatedAt = now();
        publish(room);
        lists();
        schedule(room);
        return;
      }
      if (action === 'move') {
        if (!room.state || room.state.phase === 'finished')
          throw failure('SPLENDOR_NOT_PLAYING', 'Não há rodada em andamento.');
        if (msg.revision !== room.state.revision)
          throw failure('SPLENDOR_STALE', 'A mesa mudou. Confira a jogada e tente novamente.');
        applyMove(room, ws.account.id, msg.move);
        return;
      }
      if (action === 'retry-record' && room.state?.phase === 'finished') {
        void persist(room);
        return;
      }
      throw failure('SPLENDOR_ACTION', 'Opção inválida.');
    } catch (error) {
      send(ws, {
        type: 'splendor-error',
        requestId: msg.requestId,
        code: error.code || 'SPLENDOR_ERROR',
        message: error.message,
      });
    }
  }
  const cleanup = setInterval(() => {
    for (const room of rooms.values())
      if (
        now() - room.updatedAt > 6 * 3600000 &&
        room.recordStatus !== 'pending' &&
        room.recordStatus !== 'saving'
      ) {
        for (const p of room.players)
          if (p.ws)
            send(p.ws, { type: 'splendor-left', reason: 'Mesa encerrada por inatividade.' });
        remove(room);
      }
    for (const [id, r] of rates) if (r.until < now()) rates.delete(id);
  }, 60000);
  cleanup.unref?.();
  function updateAccount(account) {
    for (const room of rooms.values()) {
      const p = room.players.find((p) => p.id === account.id);
      if (!p || p.forfeited) continue;
      p.name = account.nickname;
      if (room.state) room.state.players.find((x) => x.id === p.id).name = p.name;
      publish(room);
    }
    lists();
  }
  return {
    handle,
    disconnect: detach,
    updateAccount,
    health: () => ({ configured, ready, persistent: configured }),
    stop() {
      clearInterval(cleanup);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
    rooms,
  };
}
module.exports = { createSplendorService };
