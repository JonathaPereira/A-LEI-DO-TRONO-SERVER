'use strict';
const Bots = require('../src/lib/games/bot-names.ts');
const crypto = require('node:crypto'),
  Rules = require('../src/lib/games/love-letter-rules.ts');
const failure = (code, message) => Object.assign(Error(message), { code: 'LOVE_LETTER_' + code });
function createLoveLetterService({
  wss,
  send,
  now = Date.now,
  createRandom = () => Math.random,
  botDelay = 4200,
  disconnectDelay = 90000,
} = {}) {
  const rooms = new Map(),
    membership = new Map(),
    rates = new Map(),
    timers = new Set();
  const valid = (ws) => !!ws.account && ws.account.expiresAt > now();
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    timers.add(t);
    return t;
  }
  function cancel(t) {
    clearTimeout(t);
    timers.delete(t);
  }
  function view(room, id) {
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
        avatar_preset: p.avatar_preset || null,
        avatar_file_id: p.avatar_file_id || null,
      })),
      state: room.state ? Rules.publicState(room.state, id) : null,
    };
  }
  function publish(room) {
    for (const p of room.players)
      if (p.ws && valid(p.ws) && p.ws.account.id === p.id)
        send(p.ws, { type: 'love-letter-state', room: view(room, p.id) });
  }
  function list(ws) {
    send(ws, {
      type: 'love-letter-rooms',
      rooms: [...rooms.values()]
        .filter((r) => !r.state && r.players.length < r.maxPlayers)
        .map((r) => ({
          id: r.id,
          name: r.players[0]?.name || 'Mesa',
          players: r.players.length,
          maxPlayers: r.maxPlayers,
        })),
      resumeId: membership.get(ws.account.id) || null,
    });
  }
  function lists() {
    for (const ws of wss.clients) if (valid(ws) && ws.loveLetterWatching) list(ws);
  }
  function remove(room) {
    cancel(room.botTimer);
    for (const p of room.players) {
      cancel(p.offlineTimer);
      if (membership.get(p.id) === room.id) membership.delete(p.id);
    }
    rooms.delete(room.id);
  }
  function schedule(room) {
    cancel(room.botTimer);
    const s = room.state;
    if (!s || !['action', 'chancellor'].includes(s.phase) || !room.players[s.turn].bot) return;
    room.botTimer = later(() => {
      if (!rooms.has(room.id)) return;
      apply(
        room,
        s.players[s.turn].id,
        Rules.botMove(Rules.publicState(room.state, s.players[s.turn].id), room.random),
      );
    }, botDelay);
  }
  function apply(room, id, move) {
    room.state = Rules.move(room.state, id, move);
    room.updatedAt = now();
    publish(room);
    schedule(room);
  }
  function detach(ws, explicit = false) {
    const room = rooms.get(ws.loveLetterRoomId),
      p = room?.players.find((p) => p.id === ws.account?.id && p.ws === ws);
    ws.loveLetterRoomId = null;
    if (!p) return;
    p.ws = null;
    cancel(p.offlineTimer);
    const leave = () => {
      if (!rooms.has(room.id) || p.ws) return;
      membership.delete(p.id);
      if (room.state) {
        p.bot = true;
        p.forfeited = true;
        p.name = Bots.next(room.players.filter((x) => x !== p));
        Object.assign(
          room.state.players.find((x) => x.id === p.id),
          { bot: true, forfeited: true, name: p.name },
        );
      } else room.players = room.players.filter((x) => x !== p);
      if (room.hostId === p.id)
        room.hostId = room.players.find((x) => x.ws)?.id || room.players.find((x) => !x.bot)?.id;
      if (!room.players.some((x) => x.ws || (x.offlineTimer && membership.has(x.id)))) remove(room);
      else {
        publish(room);
        schedule(room);
      }
      lists();
    };
    if (explicit) leave();
    else {
      p.offlineTimer = later(leave, disconnectDelay);
      publish(room);
    }
  }
  function attach(ws, room) {
    const p = room.players.find((p) => p.id === ws.account.id);
    if (p.forfeited) throw failure('LEFT', 'Você saiu desta partida. Entre em uma nova mesa.');
    if (p.ws && p.ws !== ws)
      throw failure('OTHER_SESSION', 'Sua conta já está nesta mesa em outra sessão.');
    cancel(p.offlineTimer);
    p.offlineTimer = null;
    p.ws = ws;
    p.name = ws.account.nickname;
    p.avatar_preset = ws.account.avatar_preset;
    p.avatar_file_id = ws.account.avatar_file_id;
    ws.loveLetterRoomId = room.id;
    membership.set(p.id, room.id);
    if (room.state) room.state.players.find((x) => x.id === p.id).name = p.name;
    publish(room);
    lists();
  }
  function handle(ws, msg) {
    if (!valid(ws)) {
      send(ws, {
        type: 'love-letter-error',
        code: 'AUTH_REQUIRED',
        message: 'Entre em uma conta confirmada para jogar Love Letter.',
      });
      return;
    }
    try {
      let rate = rates.get(ws.account.id);
      if (!rate || rate.until < now()) {
        rate = { count: 0, until: now() + 10000 };
        rates.set(ws.account.id, rate);
      }
      if (++rate.count > 100) throw failure('RATE_LIMIT', 'Aguarde um instante.');
      ws.loveLetterWatching = true;
      if (msg.action === 'list') {
        list(ws);
        return;
      }
      if (msg.action === 'create') {
        if (membership.has(ws.account.id))
          throw failure('ALREADY_SEATED', 'Retome ou saia da sua mesa antes de criar outra.');
        if (rooms.size >= 100) throw failure('BUSY', 'Mesas ocupadas. Tente novamente mais tarde.');
        if (!Number.isInteger(msg.maxPlayers) || !Rules.targetScore(msg.maxPlayers))
          throw failure('PLAYERS', 'Escolha de 2 a 6 participantes.');
        const room = {
          id: crypto.randomBytes(5).toString('hex').toUpperCase(),
          hostId: ws.account.id,
          maxPlayers: msg.maxPlayers,
          players: [{ id: ws.account.id, name: ws.account.nickname, ws: null, bot: false }],
          state: null,
          updatedAt: now(),
          random: createRandom(),
        };
        rooms.set(room.id, room);
        attach(ws, room);
        return;
      }
      if (['join', 'resume'].includes(msg.action)) {
        const existing = membership.get(ws.account.id);
        if (existing && existing !== msg.roomId)
          throw failure('ALREADY_SEATED', 'Saia da mesa atual antes de entrar em outra.');
        const room = rooms.get(String(msg.roomId || ''));
        if (!room) throw failure('NOT_FOUND', 'Esta mesa não está mais disponível.');
        if (!room.players.some((p) => p.id === ws.account.id)) {
          if (room.state || room.players.length >= room.maxPlayers)
            throw failure('FULL', 'Esta mesa está cheia ou já começou.');
          room.players.push({ id: ws.account.id, name: ws.account.nickname, ws: null, bot: false });
        }
        attach(ws, room);
        return;
      }
      const room = rooms.get(ws.loveLetterRoomId);
      if (!room || !room.players.some((p) => p.ws === ws))
        throw failure('NOT_MEMBER', 'Entre em uma mesa primeiro.');
      if (msg.action === 'leave') {
        detach(ws, true);
        send(ws, { type: 'love-letter-left' });
        return;
      }
      if (msg.action === 'state') {
        publish(room);
        return;
      }
      if (msg.action === 'start') {
        if (room.hostId !== ws.account.id || room.state)
          throw failure('FORBIDDEN', 'Somente o anfitrião pode iniciar.');
        if (room.players.some((p) => !p.ws))
          throw failure('OFFLINE', 'Aguarde os participantes reconectarem.');
        if (msg.fillBots)
          while (room.players.length < room.maxPlayers)
            room.players.push({
              id: 'bot-' + crypto.randomUUID(),
              name: Bots.next(room.players),
              bot: true,
              ws: null,
            });
        if (room.players.length < 2)
          throw failure('PLAYERS', 'Convide outra pessoa ou complete com bots.');
        room.state = Rules.create(room.players, room.random);
        room.updatedAt = now();
        publish(room);
        lists();
        schedule(room);
        return;
      }
      if (msg.action === 'next-round') {
        if (room.hostId !== ws.account.id)
          throw failure('FORBIDDEN', 'O anfitrião inicia a próxima rodada.');
        room.state = Rules.nextRound(room.state, room.random);
        room.updatedAt = now();
        publish(room);
        schedule(room);
        return;
      }
      if (msg.action === 'move') {
        if (!room.state) throw failure('NOT_PLAYING', 'A partida ainda não começou.');
        if (msg.revision !== room.state.revision)
          throw failure('STALE', 'A mesa mudou. Confira sua jogada.');
        apply(room, ws.account.id, msg.move);
        return;
      }
      throw failure('ACTION', 'Opção inválida.');
    } catch (e) {
      send(ws, {
        type: 'love-letter-error',
        requestId: msg.requestId,
        code: e.code || 'LOVE_LETTER_ERROR',
        message: e.message,
      });
    }
  }
  const cleanup = setInterval(() => {
    for (const r of rooms.values())
      if (now() - r.updatedAt > 6 * 3600000) {
        for (const p of r.players)
          if (p.ws)
            send(p.ws, { type: 'love-letter-left', reason: 'Mesa encerrada por inatividade.' });
        remove(r);
      }
    for (const [id, r] of rates) if (r.until < now()) rates.delete(id);
  }, 60000);
  cleanup.unref?.();
  return {
    handle,
    disconnect: detach,
    updateAccount(account) {
      for (const r of rooms.values()) {
        const p = r.players.find((p) => p.id === account.id);
        if (!p || p.forfeited) continue;
        p.name = account.nickname;
        p.avatar_preset = account.avatar_preset;
        p.avatar_file_id = account.avatar_file_id;
        if (r.state) r.state.players.find((p) => p.id === account.id).name = p.name;
        publish(r);
      }
      lists();
    },
    health: () => ({ available: true, rooms: rooms.size }),
    rooms,
    stop() {
      clearInterval(cleanup);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
module.exports = { createLoveLetterService };
