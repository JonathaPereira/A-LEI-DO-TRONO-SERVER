'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { RealtimeSfuManager } = require('./realtime-sfu');
const { createAuth } = require('./auth');
const { createFiles } = require('./files');
const { createCommunity } = require('./community');
const { createChatHistory } = require('./chat-history');
const { createSocialService } = require('./social-service');
const { createAzulService } = require('./azul-service');
const { createSplendorService } = require('./splendor-service');
const { createLoveLetterService } = require('./love-letter-service');
const { createCommunityManagement } = require('./community-management');
const { permissions, CREATOR_EMAIL } = require('./roles');

function createRuntime({ scheduleDelay = (ms) => ms, chooseDecrees = null } = {}) {
  const scheduledTimers = new Set();

  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
  const accountAuth = createAuth({
    onRevoke: (event) => {
      for (const ws of wss.clients)
        if (
          ws.account?.id === event.userId &&
          (event.all || ws.account.sessionId === event.sessionId)
        ) {
          azulService.disconnect(ws);
          splendorService.disconnect(ws);
          loveLetterService.disconnect(ws);
          ws.account = null;
          leaveRoom(ws, 'auth-expired');
          send(ws, {
            type: 'error',
            code: 'AUTH_REQUIRED',
            message: 'Sua sessão foi encerrada. Entre novamente.',
          });
          ws.close(4001, 'Sessão encerrada');
        }
    },
    onProfileChange: (account) => {
      azulService.updateAccount(account);
      splendorService.updateAccount(account);
      loveLetterService.updateAccount(account);
      for (const ws of wss.clients)
        if (ws.account?.id === account.id) {
          ws.account = { ...ws.account, ...account };
          for (const id of new Set([ws.roomId, ws.textRoomId, ws.gameRoomId])) {
            const room = rooms.get(id),
              player = room?.players.get(ws.clientId);
            if (player) {
              player.name = account.nickname;
              player.avatar_preset = account.avatar_preset;
              player.avatar_file_id = account.avatar_file_id;
              if (room.game?.players[player.seat] && !room.game.players[player.seat].bot)
                room.game.players[player.seat].name = account.nickname;
              broadcastRoom(room);
              broadcastVoiceRoster(room);
              if (room.game) broadcastGameState(room);
            }
          }
        }
      for (const ws of wss.clients)
        if (ws.account?.expiresAt > Date.now())
          send(ws, { type: 'member-profile-updated', accountId: account.id });
      community.broadcast();
    },
  });
  accountAuth.install(app, express);
  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
    verifyClient: (info) =>
      !info.origin || !accountAuth.required || accountAuth.allowedOrigins.has(info.origin),
  });

  const VERSION = '0.13.0-alpha';
  const TURN_MS = 60_000;

  const SUITS = ['cetro', 'chave', 'lamina', 'mascara'];
  const Rules = require('../src/legacy/game-rules');
  const LAWS = Rules.lawOrder;
  const Bots = require('../src/legacy/bot-names');
  const BOT_NAMES = Bots.names;
  const DECREES = Rules.decrees;
  const decreeById = Object.fromEntries(DECREES.map((d) => [d.id, d]));

  const CHAT_ONLY_ROOM_ID = 'chat-livre';
  const CHAT_CHANNELS = [
    ['chat-livre', 'Geral', 'Conversa aberta'],
    ['chat-jogos', 'Jogos', 'Partidas e transmissões'],
    ['chat-conversa', 'Conversa', 'Papo em grupo'],
  ];
  const roomDefs = [
    ['sala-cetro', 'Sala do Cetro'],
    ['sala-chave', 'Sala da Chave'],
    ['sala-mascara', 'Sala da Máscara'],
  ];

  const rooms = new Map(
    roomDefs.map(([id, name]) => [
      id,
      {
        id,
        name,
        kind: 'game',
        max: 4,
        players: new Map(),
        createdAt: Date.now(),
        game: null,
        chatHistory: [],
        nextSeat: 0,
      },
    ]),
  );
  for (const [id, name, description] of CHAT_CHANNELS)
    rooms.set(id, {
      id,
      name,
      description,
      channelType: 'mixed',
      kind: 'chat',
      max: null,
      players: new Map(),
      createdAt: Date.now(),
      game: null,
      chatHistory: [],
      nextSeat: 0,
    });

  const realtimeSfu = new RealtimeSfuManager({
    rooms,
    send,
    broadcastVoiceRoster,
    chatOnlyRoomId: CHAT_ONLY_ROOM_ID,
    version: VERSION,
  });

  const rand = (n) => Math.floor(Math.random() * n);
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sanitizeName(value) {
    const raw = String(value ?? '')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    return [...raw].slice(0, 20).join('');
  }
  function nameKey(value) {
    return sanitizeName(value).normalize('NFKC').toLocaleLowerCase('pt-BR');
  }
  function nameOwner(name, excludeClientId = null) {
    const key = nameKey(name);
    if (!key) return null;
    for (const room of rooms.values())
      for (const p of room.players.values())
        if (p.id !== excludeClientId && nameKey(p.name) === key) return { room, player: p };
    return null;
  }
  function nameAvailability(name, excludeClientId = null) {
    const clean = sanitizeName(name);
    if (!clean)
      return {
        available: false,
        name: '',
        code: 'NAME_REQUIRED',
        message: 'Digite um nome para entrar.',
      };
    const owner = nameOwner(clean, excludeClientId);
    if (owner)
      return {
        available: false,
        name: clean,
        code: 'NAME_TAKEN',
        message: `Já há alguém usando “${clean}”. Escolha outro nome.`,
      };
    return { available: true, name: clean, code: null, message: 'Nome disponível.' };
  }
  function accountNameAvailability(ws, rawName) {
    const result = nameAvailability(
      ws.guest?.nickname || (accountAuth.required ? ws.account?.nickname : rawName),
      ws.clientId,
    );
    if (ws.guest && community.nameReserved(result.name))
      return {
        ...result,
        available: false,
        code: 'NAME_TAKEN',
        message: 'Esse apelido pertence a uma conta. Escolha outro nome.',
      };
    if (accountAuth.required && ws.account && result.code === 'NAME_TAKEN')
      result.message =
        'Sua conta já está em uma sala em outra aba ou aparelho. Saia dessa sala antes de entrar aqui.';
    return result;
  }
  function sanitizeChat(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 300);
  }
  function clampCardValue(value) {
    return Math.max(1, Math.min(12, Number(value) || 0));
  }
  function playValue(play) {
    return clampCardValue((play?.card?.value || 0) + (play?.modifier || 0));
  }
  function influenceLabel(play) {
    if (!play?.influenceAction || play.influenceAction === 'none') return '';
    if (play.influenceAction === 'sigilo') return 'Sigilo';
    return play.influenceAction === 'plus' ? 'Manobra +3' : 'Manobra -3';
  }

  function makeDeck() {
    let id = 0;
    const deck = [];
    for (const suit of SUITS)
      for (let value = 1; value <= 12; value++)
        deck.push({ id: `c${id++}`, suit, value, public: false, publicReason: null });
    return deck;
  }
  function sortHand(hand) {
    hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.value - b.value);
  }
  function nextFreeSeat(room) {
    if (room.kind === 'chat') return room.nextSeat++;
    const occupied = new Set([...room.players.values()].map((p) => p.seat));
    for (let seat = 0; seat < room.max; seat += 1) if (!occupied.has(seat)) return seat;
    return null;
  }
  function roomHostId(room) {
    if (room.kind !== 'game') return null;
    const sorted = [...room.players.values()].sort((a, b) => a.seat - b.seat);
    return sorted[0]?.id || null;
  }
  function publicPlayer(room, player) {
    // Estado detalhado de voz/câmera/tela é privado dos participantes da chamada.
    return {
      id: player.id,
      name: player.name,
      guest: !!player.guest,
      role: player.guest ? 'guest' : player.ws.account?.role || 'member',
      avatar_preset: player.avatar_preset || 'crown',
      avatar_file_id: player.avatar_file_id || null,
      seat: player.seat,
      ready: room.kind === 'game' && !!player.ready,
      host: room.kind === 'game' && player.id === roomHostId(room),
    };
  }
  function safeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      kind: room.kind,
      channelType: room.channelType || null,
      max: room.max,
      count: room.players.size,
      voiceActive: [...room.players.values()].some((p) => p.voiceJoined),
      gameActive: room.kind === 'game' && !!room.game && room.game.phase !== 'game-over',
      players: [...room.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map((p) => publicPlayer(room, p)),
    };
  }
  function privateVoiceRoster(room) {
    return [...room.players.values()]
      .filter((p) => p.voiceJoined)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        accountId: p.ws.account?.id || null,
        name: p.name,
        guest: !!p.guest,
        avatar_preset: p.avatar_preset || 'crown',
        avatar_file_id: p.avatar_file_id || null,
        seat: p.seat,
        muted: !!p.voiceMuted,
        deafened: !!p.voiceDeafened,
        camera: !!p.cameraOn,
        screen: !!p.screenOn,
        transport: p.mediaTransport || 'p2p',
        quality: p.transmissionQuality || 'balanced',
        screenFps: p.screenFps || 30,
      }));
  }
  function broadcastVoiceRoster(room) {
    const players = privateVoiceRoster(room);
    for (const p of room.players.values())
      if (p.voiceJoined) send(p.ws, { type: 'voice-roster', roomId: room.id, players });
  }

  function safeChatChannels(includePlayers = false) {
    return [...rooms.values()]
      .filter((r) => r.kind === 'chat')
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        type: r.channelType || 'mixed',
        count: r.players.size,
        voiceActive: [...r.players.values()].some((p) => p.voiceJoined),
        ...(includePlayers
          ? {
              players: [...r.players.values()].map((p) => ({
                ...publicPlayer(r, p),
                inVoice: !!p.voiceJoined,
              })),
            }
          : {}),
      }));
  }
  function broadcastChatChannels() {
    for (const ws of wss.clients)
      send(ws, {
        type: 'chat-channels',
        channels: safeChatChannels(!!ws.account && ws.account.expiresAt > Date.now()),
      });
  }
  function safeRooms() {
    return [...rooms.values()].filter((r) => r.kind === 'game').map(safeRoom);
  }
  function send(ws, payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }
  function broadcastAll(payload) {
    for (const client of wss.clients) send(client, payload);
  }
  function broadcastRooms() {
    broadcastAll({ type: 'rooms', rooms: safeRooms() });
    community.broadcast();
  }
  function roomHumanBySeat(room, seat) {
    return [...room.players.values()].find((p) => p.seat === seat) || null;
  }
  function playerSocketBySeat(room, seat) {
    return roomHumanBySeat(room, seat)?.ws || null;
  }
  function broadcastRoom(room) {
    const payload = { type: 'room-state', room: safeRoom(room) };
    for (const p of room.players.values()) send(p.ws, payload);
  }
  function sendToSeat(room, seat, payload) {
    const ws = playerSocketBySeat(room, seat);
    if (ws) send(ws, payload);
  }
  function broadcastGameEvent(room, payload) {
    for (const p of room.players.values()) send(p.ws, { type: 'game-event', ...payload });
  }
  function broadcastLog(room, message) {
    const g = room.game;
    if (g) {
      if (!Array.isArray(g.logHistory)) g.logHistory = [];
      g.logHistory.push({
        ts: Date.now(),
        round: g.round || 0,
        trick: g.trick || 0,
        message: String(message),
      });
      if (g.logHistory.length > 600) g.logHistory.splice(0, g.logHistory.length - 600);
    }
    broadcastGameEvent(room, { event: 'log', message });
  }
  function schedule(room, fn, ms = 450) {
    if (!room.game) return;
    const token = room.game.token;
    const timer = setTimeout(() => {
      scheduledTimers.delete(timer);
      if (room.game?.token === token) {
        try {
          fn();
        } catch (err) {
          console.error(err);
          broadcastGameEvent(room, { event: 'server-error', message: err.message });
        }
      }
    }, scheduleDelay(ms));
    scheduledTimers.add(timer);
  }

  // Text membership is independent of the primary voice/game room. Both use the
  // same authenticated socket; media signaling and SFU sessions stay in ws.roomId.
  function leaveTextRoom(ws) {
    const room = rooms.get(ws.textRoomId);
    ws.textRoomId = null;
    if (!room) return;
    if (ws.roomId !== room.id && ws.gameRoomId !== room.id) room.players.delete(ws.clientId);
    if (!room.players.size && room.kind !== 'chat') room.chatHistory = [];
    broadcastRoom(room);
    broadcastChatChannels();
  }
  function createRoomPlayer(ws, room, name, seat = nextFreeSeat(room)) {
    return {
      id: ws.clientId,
      name,
      guest: !!ws.guest,
      avatar_preset: ws.account?.avatar_preset || (ws.guest ? 'person' : 'crown'),
      avatar_file_id: ws.account?.avatar_file_id || null,
      seat,
      ready: false,
      joinedAt: Date.now(),
      ws,
      voiceJoined: false,
      voiceMuted: false,
      voiceDeafened: false,
      cameraOn: false,
      screenOn: false,
      mediaTransport: 'p2p',
      transmissionQuality: 'balanced',
      lastChatAt: 0,
    };
  }
  function joinTextRoom(ws, roomId, rawName) {
    const room = rooms.get(roomId);
    if (!room || room.kind !== 'chat' || room.channelType === 'voice') {
      send(ws, {
        type: 'error',
        code: 'TEXT_CHANNEL_REQUIRED',
        message: 'Escolha um canal com mensagens de texto.',
      });
      return;
    }
    const availability = accountNameAvailability(ws, rawName);
    if (!availability.available) {
      send(ws, { type: 'error', code: availability.code, message: availability.message });
      return;
    }
    if (ws.roomId === roomId && room.channelType !== 'text') {
      leaveTextRoom(ws);
      send(ws, { type: 'joined-text-channel', room: safeRoom(room), primaryRoomId: ws.roomId });
      void sendChatHistory(ws, room);
      return;
    }
    // Upgrade an older client's primary text membership without leaving voice.
    if (ws.roomId === roomId) ws.roomId = null;
    if (ws.textRoomId !== roomId) leaveTextRoom(ws);
    const player = room.players.get(ws.clientId) || createRoomPlayer(ws, room, availability.name);
    room.players.set(ws.clientId, player);
    ws.textRoomId = roomId;
    send(ws, { type: 'joined-text-channel', room: safeRoom(room), primaryRoomId: ws.roomId });
    void sendChatHistory(ws, room);
    broadcastRoom(room);
    broadcastChatChannels();
    community.broadcast();
  }
  function removeRoomPlayer(ws, room, reason) {
    if (!room) return;
    const leaving = room.players.get(ws.clientId);
    if (leaving?.voiceJoined)
      broadcastVoiceEvent(
        room,
        leaving,
        ['disconnect', 'auth-expired'].includes(reason) ? 'disconnected' : 'left',
        reason,
      );
    room.players.delete(ws.clientId);
    if (leaving) void realtimeSfu.cleanupClient(leaving.id, room.id);

    if (room.game && leaving) {
      const gp = room.game.players[leaving.seat];
      if (gp && !gp.bot) {
        gp.bot = true;
        gp.clientId = null;
        gp.name = Bots.next(room.game.players.filter((x) => x !== gp));
        broadcastGameEvent(room, {
          event: 'player-replaced-by-bot',
          seat: leaving.seat,
          name: leaving.name,
          botName: gp.name,
          reason,
        });
        broadcastLog(
          room,
          `<strong>${leaving.name}</strong> ${reason === 'disconnect' ? 'se desconectou' : 'deixou a sala'}. <strong>${gp.name}</strong> assumiu o assento.`,
        );
        broadcastGameState(room);
        if (room.game.turn === leaving.seat && room.game.phase === 'await-play') {
          clearTurnTimer(room.game);
          schedule(room, () => advanceTurn(room), 650);
        }
        if (
          room.game.pending &&
          (room.game.pending.waiting?.has(leaving.seat) || room.game.pending.seat === leaving.seat)
        ) {
          autoResolvePendingSeat(room, leaving.seat);
        }
      }
    }

    if (room.players.size === 0 && room.kind !== 'chat') room.chatHistory = [];
    resetVoiceModeIfEmpty(room);
    broadcastRoom(room);
    broadcastRooms();
    broadcastChatChannels();
    broadcastVoiceRoster(room);
    if (leaving) {
      for (const p of room.players.values())
        send(p.ws, {
          type: 'player-left',
          roomId: room.id,
          playerId: leaving.id,
          name: leaving.name,
          reason,
        });
    }
  }

  function gameRoomFor(ws) {
    return rooms.get(ws.independentGames ? ws.gameRoomId : ws.roomId);
  }
  function selectedChatId(ws) {
    return ws.textRoomId || ws.roomId || ws.gameRoomId;
  }
  function leaveGameRoom(ws, reason = 'leave') {
    const id =
      ws.gameRoomId ||
      (!ws.independentGames && rooms.get(ws.roomId)?.kind === 'game' ? ws.roomId : null);
    if (!id) return;
    ws.gameRoomId = null;
    if (ws.roomId === id) ws.roomId = null;
    removeRoomPlayer(ws, rooms.get(id), reason);
    send(ws, {
      type: 'left-game-room',
      roomId: id,
      primaryRoomId: ws.roomId,
      chatRoomId: selectedChatId(ws) || null,
    });
  }
  function leaveVoiceRoom(ws, reason = 'leave', keepText = true) {
    const room = rooms.get(ws.roomId);
    ws.roomId = null;
    if (!room) return;
    const p = room.players.get(ws.clientId);
    if (p && (ws.gameRoomId === room.id || (keepText && ws.textRoomId === room.id))) {
      if (p.voiceJoined) broadcastVoiceEvent(room, p, 'left', reason);
      p.voiceJoined = false;
      p.voiceMuted = false;
      p.voiceDeafened = false;
      p.cameraOn = false;
      p.screenOn = false;
      p.mediaTransport = 'p2p';
      void realtimeSfu.cleanupClient(p.id, room.id);
      resetVoiceModeIfEmpty(room);
      broadcastRoom(room);
      broadcastVoiceRoster(room);
      broadcastChatChannels();
      community.broadcast();
    } else removeRoomPlayer(ws, room, reason);
    send(ws, {
      type: 'left-voice-room',
      roomId: room.id,
      primaryRoomId: null,
      chatRoomId: selectedChatId(ws) || null,
    });
  }
  function leaveRoom(ws, reason = 'leave', keepText = false) {
    leaveGameRoom(ws, reason);
    if (!keepText) leaveTextRoom(ws);
    leaveVoiceRoom(ws, reason, keepText);
  }
  function joinGameRoom(ws, roomId, rawName) {
    const room = rooms.get(roomId),
      availability = accountNameAvailability(ws, rawName);
    if (!room || room.kind !== 'game') {
      send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Mesa inexistente.' });
      return;
    }
    if (!availability.available) {
      send(ws, { type: 'error', code: availability.code, message: availability.message });
      return;
    }
    if (ws.gameRoomId === room.id || (!ws.independentGames && ws.roomId === room.id)) {
      ws.independentGames = true;
      ws.gameRoomId = room.id;
      sendGameMembership(ws, room);
      return;
    }
    if (room.game && room.game.phase !== 'game-over') {
      send(ws, {
        type: 'error',
        code: 'GAME_IN_PROGRESS',
        message: 'Esta mesa já está em partida.',
      });
      return;
    }
    if (room.players.size >= room.max) {
      send(ws, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Mesa cheia. Sua chamada foi mantida.',
      });
      return;
    }
    leaveGameRoom(ws, 'switch-game');
    ws.independentGames = true;
    const player = createRoomPlayer(ws, room, availability.name);
    room.players.set(ws.clientId, player);
    ws.gameRoomId = room.id;
    if (!ws.roomId) ws.roomId = room.id;
    sendGameMembership(ws, room);
    broadcastRoom(room);
    broadcastRooms();
    broadcastChatChannels();
  }
  function sendGameMembership(ws, room) {
    const p = room.players.get(ws.clientId);
    if (!p) return;
    send(ws, {
      type: 'joined-game-room',
      room: safeRoom(room),
      me: publicPlayer(room, p),
      primaryRoomId: ws.roomId,
      chatRoomId: selectedChatId(ws),
    });
    void sendChatHistory(ws, room);
    if (room.game && room.game.phase !== 'game-over')
      send(ws, { type: 'game-state', state: privateGameState(room, p.seat) });
  }

  function joinRoom(ws, roomId, rawName) {
    if (ws.independentGames && rooms.get(roomId)?.kind === 'game')
      return joinGameRoom(ws, roomId, rawName);
    if (accountAuth.required) rawName = ws.guest?.nickname || ws.account?.nickname;
    const room = rooms.get(roomId);
    if (!room) {
      send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala inexistente.' });
      return;
    }
    if (ws.guest && room.kind !== 'game') {
      send(ws, {
        type: 'error',
        code: 'LOGIN_REQUIRED_CHAT',
        message:
          'O chat M&N exige uma conta. O convidado pode jogar e usar a voz somente nas salas do jogo.',
      });
      return;
    }
    const availability = accountNameAvailability(ws, rawName);
    if (!availability.available) {
      send(ws, {
        type: 'error',
        code: availability.code,
        message: availability.message,
        name: availability.name,
      });
      return;
    }
    if (room.kind === 'game' && room.game && room.game.phase !== 'game-over') {
      send(ws, {
        type: 'error',
        code: 'GAME_IN_PROGRESS',
        message: 'Esta sala já está em partida.',
      });
      return;
    }
    if (ws.roomId === roomId && room.players.has(ws.clientId)) {
      leaveTextRoom(ws);
      send(ws, {
        type: 'joined-room',
        room: safeRoom(room),
        me: publicPlayer(room, room.players.get(ws.clientId)),
      });
      void sendChatHistory(ws, room);
      return;
    }
    if (ws.independentGames) {
      leaveVoiceRoom(ws, 'switch-room');
      leaveTextRoom(ws);
    } else leaveRoom(ws, 'switch-room');
    if (room.kind === 'game' && room.players.size >= room.max) {
      send(ws, { type: 'error', code: 'ROOM_FULL', message: 'Sala cheia.' });
      return;
    }
    const seat = nextFreeSeat(room);
    if (seat === null) {
      send(ws, { type: 'error', code: 'NO_SEAT', message: 'Nenhum assento disponível.' });
      return;
    }
    const player = createRoomPlayer(ws, room, availability.name, seat);
    room.players.set(ws.clientId, player);
    ws.roomId = room.id;
    send(ws, { type: 'joined-room', room: safeRoom(room), me: publicPlayer(room, player) });
    void sendChatHistory(ws, room);
    broadcastRoom(room);
    broadcastRooms();
    broadcastChatChannels();
  }
  function setReady(ws, ready) {
    const room = gameRoomFor(ws),
      player = room?.players.get(ws.clientId);
    if (!room || !player) {
      send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
      return;
    }
    if (room.kind !== 'game') {
      send(ws, {
        type: 'error',
        code: 'CHAT_ONLY_ROOM',
        message: 'O Salão Livre é somente para conversa.',
      });
      return;
    }
    if (room.game && room.game.phase !== 'game-over') {
      send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'A partida já começou.' });
      return;
    }
    player.ready = !!ready;
    broadcastRoom(room);
    broadcastRooms();
  }

  async function handleChatMessage(ws, rawText, attachmentId, requestedRoomId) {
    const room = rooms.get(selectedChatId(ws)),
      player = room?.players.get(ws.clientId);
    if (!room || !player || (requestedRoomId !== undefined && requestedRoomId !== room.id)) {
      send(ws, {
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'Selecione novamente o canal para enviar a mensagem.',
      });
      return;
    }
    if (room.channelType === 'voice') {
      send(ws, {
        type: 'error',
        code: 'VOICE_CHANNEL',
        message: 'Use um canal de texto para enviar mensagens.',
      });
      return;
    }
    if (ws.guest && attachmentId) {
      send(ws, {
        type: 'error',
        code: 'LOGIN_REQUIRED_FILES',
        message: 'Entre em uma conta para enviar anexos.',
      });
      return;
    }
    const now = Date.now();
    if (now - (player.lastChatAt || 0) < 450) {
      send(ws, {
        type: 'error',
        code: 'CHAT_RATE',
        message: 'Aguarde um instante antes de enviar outra mensagem.',
      });
      return;
    }
    const text = sanitizeChat(rawText);
    if (!text && !attachmentId) return;
    player.lastChatAt = now;
    try {
      await chatHistory.serial(room.id, async () => {
        let attachment = null;
        if (attachmentId)
          attachment = await fileStorage.attachment(attachmentId, ws.account?.id, room.id);
        if (selectedChatId(ws) !== room.id || room.players.get(player.id) !== player) return;
        const message = {
          id: crypto.randomUUID(),
          roomId: room.id,
          senderId: player.id,
          seat: player.seat,
          name: player.name,
          accountId: ws.account?.id || null,
          avatar_preset: player.avatar_preset || 'crown',
          avatar_file_id: player.avatar_file_id || null,
          text,
          attachment,
          ts: now,
        };
        await chatHistory.append(room, message, ws.account?.id);
        if (rooms.get(room.id) !== room) return;
        if (!Array.isArray(room.chatHistory)) room.chatHistory = [];
        room.chatHistory.push(message);
        if (room.chatHistory.length > 100)
          room.chatHistory.splice(0, room.chatHistory.length - 100);
        room.chatRevision = (room.chatRevision || 0) + 1;
        for (const p of room.players.values())
          send(p.ws, { type: 'chat-message', message, revision: room.chatRevision });
        if (room.kind === 'chat')
          for (const receiver of wss.clients) {
            if (
              !receiver.account ||
              receiver.account.expiresAt <= Date.now() ||
              receiver.account.id === ws.account?.id
            )
              continue;
            const nickname = receiver.account.nickname.toLocaleLowerCase('pt-BR'),
              lower = text.toLocaleLowerCase('pt-BR');
            const start = lower.indexOf('@' + nickname),
              tail = start < 0 ? '' : lower.slice(start + nickname.length + 1);
            const mentioned = start >= 0 && (!tail || !/^\p{L}|^\p{N}|^_/u.test(tail));
            send(receiver, {
              type: 'chat-notice',
              id: message.id,
              roomId: room.id,
              roomName: room.name,
              name: player.name,
              text: text || 'Enviou um anexo',
              mentioned,
            });
          }
      });
    } catch (e) {
      send(ws, {
        type: 'error',
        code: e.code || 'CHAT_HISTORY_UNAVAILABLE',
        message: e.message,
        failedMessage: { roomId: room.id, text },
      });
    }
  }
  async function sendChatHistory(ws, room, before = null) {
    try {
      await chatHistory.serial(room.id, async () => {
        const history = await chatHistory.read(room, before);
        if (selectedChatId(ws) !== room.id || room.players.get(ws.clientId)?.ws !== ws) return;
        send(ws, {
          type: 'chat-history',
          roomId: room.id,
          ...history,
          revision: room.chatRevision || 0,
          older: !!before,
        });
      });
    } catch (e) {
      send(ws, {
        type: 'error',
        code: e.code || 'CHAT_HISTORY_UNAVAILABLE',
        message: e.message,
        roomId: room.id,
      });
    }
  }
  function requestChatHistory(ws, message) {
    const room = rooms.get(selectedChatId(ws));
    if (!room || room.id !== message.roomId || !room.players.has(ws.clientId)) return;
    if (message.before !== undefined && !/^[0-9a-f-]{36}$/i.test(message.before)) return;
    if (Date.now() - (ws.lastHistoryAt || 0) < 800) {
      send(ws, {
        type: 'error',
        code: 'CHAT_HISTORY_RATE',
        message: 'Aguarde um instante antes de carregar outra página.',
      });
      return;
    }
    ws.lastHistoryAt = Date.now();
    void sendChatHistory(ws, room, message.before || null);
  }
  // History reads, appends and moderation share the room queue. A reply that was
  // already loading therefore cannot restore a message after its deletion event.
  async function handleChatModeration(ws, message) {
    const action = message.type === 'chat-history-clear' ? 'clear' : 'delete',
      room = rooms.get(message.roomId);
    const result = {
      type: 'chat-moderation-result',
      requestId: String(message.requestId || '').slice(0, 80),
      action,
      roomId: message.roomId,
      id: message.id,
    };
    const reject = (code, text) =>
      send(ws, { ...result, ok: false, error: { code, message: text } });
    if (
      !ws.account ||
      ws.account.expiresAt <= Date.now() ||
      ws.account.role !== 'creator' ||
      String(ws.account.email || '')
        .trim()
        .toLowerCase() !== CREATOR_EMAIL
    ) {
      reject('FORBIDDEN', 'Somente o criador pode apagar mensagens do canal.');
      return;
    }
    if (
      !room ||
      room.kind !== 'chat' ||
      room.channelType === 'voice' ||
      selectedChatId(ws) !== room.id ||
      room.players.get(ws.clientId)?.ws !== ws
    ) {
      reject('NOT_IN_ROOM', 'Selecione um canal de texto para moderar suas mensagens.');
      return;
    }
    if (
      action === 'delete' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.id || '')
    ) {
      reject('INVALID_MESSAGE', 'Mensagem inválida.');
      return;
    }
    try {
      await chatHistory.serial(room.id, async () => {
        if (
          rooms.get(room.id) !== room ||
          selectedChatId(ws) !== room.id ||
          room.players.get(ws.clientId)?.ws !== ws
        ) {
          reject('NOT_IN_ROOM', 'O canal mudou. Selecione novamente antes de apagar.');
          return;
        }
        if (action === 'clear') await chatHistory.clear(room, ws.account.id);
        else await chatHistory.remove(room, message.id, ws.account.id);
        if (action === 'clear') room.chatHistory = [];
        else room.chatHistory = (room.chatHistory || []).filter((m) => m.id !== message.id);
        room.chatRevision = (room.chatRevision || 0) + 1;
        const update = {
          type: action === 'clear' ? 'chat-history-cleared' : 'chat-message-deleted',
          roomId: room.id,
          revision: room.chatRevision,
          ...(action === 'delete' ? { id: message.id } : {}),
        };
        for (const player of room.players.values()) send(player.ws, update);
        send(ws, { ...result, ok: true });
      });
    } catch (e) {
      reject(
        e.code || 'CHAT_HISTORY_UNAVAILABLE',
        'Não foi possível apagar as mensagens. Confira a atualização SQL e tente novamente.',
      );
    }
  }
  function resetVoiceModeIfEmpty(room) {
    if (![...room.players.values()].some((p) => p.voiceJoined)) {
      room.voiceMode = null;
      room.voiceRevision = (room.voiceRevision || 0) + 1;
    }
  }
  function broadcastVoiceEvent(room, player, kind, reason = '') {
    const payload = {
      type: 'voice-event',
      id: crypto.randomUUID(),
      roomId: room.id,
      playerId: player.id,
      name: player.name,
      guest: !!player.guest,
      kind,
      reason,
      at: Date.now(),
    };
    for (const p of room.players.values()) if (p.id !== player.id) send(p.ws, payload);
  }
  function chooseVoiceMode(room) {
    if (!room.voiceMode) {
      const policy = realtimeSfu.statusPayload();
      room.voiceMode =
        room.kind === 'chat' && policy.enabled && policy.configured && !policy.hardBlocked
          ? 'sfu'
          : 'p2p';
      room.voiceRevision = (room.voiceRevision || 0) + 1;
    }
    return room.voiceMode;
  }
  function sendVoiceMode(room, reason = '') {
    for (const p of room.players.values())
      send(p.ws, {
        type: 'voice-mode',
        roomId: room.id,
        mode: room.voiceMode,
        revision: room.voiceRevision,
        reason,
      });
  }
  function forceRoomP2p(room, reason = 'A chamada foi sincronizada em P2P para todos.') {
    if (room.voiceMode === 'p2p') return;
    room.voiceMode = 'p2p';
    room.voiceRevision = (room.voiceRevision || 0) + 1;
    for (const p of room.players.values())
      if (p.voiceJoined) {
        p.mediaTransport = 'p2p';
        void realtimeSfu.cleanupClient(p.id, room.id);
      }
    sendVoiceMode(room, reason);
    broadcastVoiceRoster(room);
  }
  function prepareVoice(ws, message) {
    if (!ws.roomId && ws.gameRoomId) {
      ws.roomId = ws.gameRoomId;
      send(ws, { type: 'voice-room-attached', room: safeRoom(rooms.get(ws.roomId)) });
    }
    const room = rooms.get(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!player) {
      send(ws, {
        type: 'sfu-response',
        requestId: message.requestId,
        ok: false,
        error: { code: 'NOT_IN_ROOM', message: 'Entre em um canal primeiro.' },
      });
      return;
    }
    if (room.channelType === 'text') {
      send(ws, {
        type: 'sfu-response',
        requestId: message.requestId,
        ok: false,
        error: {
          code: 'TEXT_CHANNEL',
          message: 'Entre em um canal de voz para iniciar uma chamada.',
        },
      });
      return;
    }
    const mode = chooseVoiceMode(room);
    send(ws, {
      type: 'sfu-response',
      requestId: message.requestId,
      ok: true,
      data: { mode, revision: room.voiceRevision },
    });
    sendVoiceMode(room);
  }
  function handleVoiceState(ws, message) {
    const room = rooms.get(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!room || !player) return;
    if (room.channelType === 'text') {
      send(ws, { type: 'error', code: 'TEXT_CHANNEL', message: 'Este canal é somente de texto.' });
      return;
    }
    const previousTransport = player.mediaTransport;
    const previouslyJoined = !!player.voiceJoined;
    if (message.joined) {
      chooseVoiceMode(room);
      if (
        message.transport === 'p2p' ||
        (!player.voiceJoined &&
          [...room.players.values()].filter((p) => p.voiceJoined).length >=
            realtimeSfu.statusPayload().maxParticipants)
      )
        forceRoomP2p(room);
    }
    player.voiceJoined = !!message.joined;
    if (previouslyJoined !== player.voiceJoined)
      broadcastVoiceEvent(room, player, player.voiceJoined ? 'joined' : 'left', 'voice-toggle');
    player.voiceMuted = player.voiceJoined && !!message.muted;
    player.voiceDeafened = player.voiceJoined && !!message.deafened;
    player.cameraOn = player.voiceJoined && !!message.camera;
    player.screenOn = player.voiceJoined && !!message.screen;
    const q = String(message.quality || player.transmissionQuality || 'balanced');
    player.transmissionQuality = ['economy', 'balanced', 'high'].includes(q) ? q : 'balanced';
    player.screenFps = [15, 30, 60].includes(message.screenFps)
      ? message.screenFps
      : player.screenFps || 30;
    const transport = String(message.transport || player.mediaTransport || 'p2p');
    player.mediaTransport =
      player.voiceJoined && room.voiceMode === 'sfu' && ['sfu', 'sfu-pending'].includes(transport)
        ? transport
        : 'p2p';
    if (player.voiceJoined && player.mediaTransport === 'sfu')
      player.transmissionQuality = realtimeSfu.notePlayerQuality(
        room.id,
        player.id,
        player.transmissionQuality,
      );
    if (
      !player.voiceJoined ||
      (player.mediaTransport === 'p2p' && ['sfu', 'sfu-pending'].includes(previousTransport))
    )
      void realtimeSfu.cleanupClient(player.id, room.id);
    if (player.voiceJoined) sendVoiceMode(room);
    else resetVoiceModeIfEmpty(room);
    // Fora da chamada, os clientes recebem apenas voiceActive no room-state.
    // Identidade, mute, câmera e compartilhamento só são enviados aos membros da call.
    broadcastRoom(room);
    broadcastRooms();
    broadcastChatChannels();
    broadcastVoiceRoster(room);
    if (room.kind === 'chat' && player.voiceJoined) {
      realtimeSfu.broadcastStatus(room);
      realtimeSfu.broadcastPublications(room);
    }
  }
  function handleVoiceSignal(ws, message) {
    const room = rooms.get(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!room || !player || !player.voiceJoined) return;
    const target = room.players.get(String(message.targetId || ''));
    if (
      !target ||
      !target.voiceJoined ||
      target.id === player.id ||
      player.mediaTransport !== 'p2p' ||
      target.mediaTransport !== 'p2p'
    )
      return;
    const signalType = String(message.signalType || '');
    if (!['offer', 'answer', 'ice', 'renegotiate-request', 'stream-watch'].includes(signalType))
      return;
    if (signalType === 'stream-watch' && room.kind !== 'chat') return;
    send(target.ws, {
      type: 'voice-signal',
      fromId: player.id,
      fromName: player.name,
      signalType,
      data: message.data || null,
    });
  }

  async function playSound(ws, message) {
    const room = rooms.get(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!ws.account || ws.account.expiresAt <= Date.now()) {
      send(ws, {
        type: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Entre em uma conta para usar os efeitos sonoros.',
      });
      return;
    }
    if (!player?.voiceJoined) {
      send(ws, {
        type: 'error',
        code: 'VOICE_REQUIRED',
        message: 'Entre na chamada para tocar um efeito.',
      });
      return;
    }
    const now = Date.now(),
      blocked = () => Date.now() < (room.soundUntil || 0) && room.soundFileId !== message.fileId;
    if (ws.soundPending || now - (ws.lastSoundAt || 0) < 150) {
      send(ws, {
        type: 'error',
        code: 'SOUND_RATE',
        message: 'Aguarde um instante antes de tocar novamente.',
      });
      return;
    }
    if (blocked()) {
      send(ws, {
        type: 'error',
        code: 'SOUND_RATE',
        message: 'Aguarde o efeito atual terminar para trocar de áudio.',
      });
      return;
    }
    ws.lastSoundAt = now;
    ws.soundPending = true;
    try {
      const file = await fileStorage.sound(message.fileId);
      if (
        ws.roomId !== room.id ||
        room.players.get(player.id) !== player ||
        !player.voiceJoined ||
        ws.account?.expiresAt <= Date.now()
      )
        return;
      if (blocked())
        throw Object.assign(Error('Aguarde o efeito atual terminar para trocar de áudio.'), {
          code: 'SOUND_RATE',
        });
      room.soundUntil = Date.now() + Math.max(3000, file.durationMs);
      room.soundFileId = file.id;
      const event = {
        type: 'soundboard-play',
        id: crypto.randomUUID(),
        roomId: room.id,
        file,
        playerId: player.id,
        name: player.name,
        at: Date.now(),
      };
      for (const p of room.players.values()) if (p.voiceJoined) send(p.ws, event);
    } catch (e) {
      send(ws, {
        type: 'error',
        code: e.code || 'SOUND_UNAVAILABLE',
        message: e.status || e.code === 'SOUND_RATE' ? e.message : 'Efeito sonoro indisponível.',
      });
    } finally {
      ws.soundPending = false;
    }
  }

  function makeMatchPlayer(room, seat) {
    const hp = roomHumanBySeat(room, seat);
    return {
      id: seat,
      seat,
      clientId: hp?.id || null,
      name: hp?.name || `IA ${seat + 1}`,
      bot: !hp,
      hand: [],
      reserve: null,
      totalCrowns: 0,
      totalShadows: 0,
      roundCrowns: 0,
      roundShadows: 0,
      influence: 0,
      hadCrown: false,
      crownStreak: 0,
    };
  }
  function totalPairs(p) {
    return Math.min(p.totalCrowns, p.totalShadows);
  }
  function prestige(p) {
    return p.totalCrowns + p.totalShadows + 2 * totalPairs(p);
  }
  function rawAccumulated(p) {
    return p.totalCrowns + p.totalShadows;
  }

  function requestStart(ws) {
    const room = gameRoomFor(ws),
      player = room?.players.get(ws.clientId);
    if (!room || !player) {
      send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
      return;
    }
    if (room.kind !== 'game') {
      send(ws, {
        type: 'error',
        code: 'CHAT_ONLY_ROOM',
        message: 'O Salão Livre não inicia partidas.',
      });
      return;
    }
    if (roomHostId(room) !== ws.clientId) {
      send(ws, { type: 'error', code: 'NOT_HOST', message: 'Somente o anfitrião pode iniciar.' });
      return;
    }
    if (room.players.size < 2) {
      send(ws, {
        type: 'error',
        code: 'NOT_ENOUGH_PLAYERS',
        message:
          'São necessários pelo menos 2 jogadores online. As vagas restantes serão preenchidas por IAs.',
      });
      return;
    }
    const notReady = [...room.players.values()].filter((p) => !p.ready);
    if (notReady.length) {
      send(ws, {
        type: 'error',
        code: 'PLAYERS_NOT_READY',
        message: 'Todos os jogadores precisam marcar Pronto.',
      });
      return;
    }
    if (room.game && room.game.phase !== 'game-over') {
      send(ws, {
        type: 'error',
        code: 'GAME_ALREADY_STARTED',
        message: 'A partida já foi iniciada.',
      });
      return;
    }
    startGame(room);
  }

  function startGame(room) {
    const players = [0, 1, 2, 3].map((seat) => makeMatchPlayer(room, seat));
    let botIndex = 0;
    for (const p of players) if (p.bot) p.name = Bots.at(botIndex++);
    const firstStarter = rand(4);
    room.game = {
      token: crypto.randomUUID(),
      players,
      round: 1,
      trick: 1,
      deck: [],
      undealt: [],
      decree: null,
      lawUsage: Object.fromEntries(LAWS.map((l) => [l, 0])),
      currentLaw: 'ordem',
      trump: null,
      declaredLeadSuit: null,
      leader: firstStarter,
      firstRoundStarter: firstStarter,
      lastCrown: null,
      lastShadow: null,
      previousWinningSuit: null,
      plays: [],
      turn: null,
      phase: 'starting',
      pending: null,
      promptSeq: 0,
      turnDeadline: null,
      turnSerial: 0,
      turnTimer: null,
      logHistory: [],
    };
    for (const p of room.players.values()) p.ready = false;
    broadcastRoom(room);
    broadcastRooms();
    for (const hp of room.players.values())
      send(hp.ws, { type: 'game-started', seat: hp.seat, room: safeRoom(room), version: VERSION });
    broadcastLog(
      room,
      `Partida online iniciada. ${players[firstStarter].name} foi sorteado para abrir a primeira rodada.`,
    );
    setupRound(room);
  }

  function resetRoundStats(game) {
    for (const p of game.players) {
      p.hand = [];
      p.reserve = null;
      p.intelligence = null;
      p.roundCrowns = 0;
      p.roundShadows = 0;
      p.influence = 0;
      p.hadCrown = false;
      p.crownStreak = 0;
    }
  }
  function setupRound(room) {
    const g = room.game;
    if (!g) return;
    g.phase = 'round-start';
    g.trick = 1;
    g.currentLaw = 'ordem';
    g.trump = null;
    g.declaredLeadSuit = null;
    g.lawUsage = Object.fromEntries(LAWS.map((l) => [l, 0]));
    g.lastCrown = null;
    g.lastShadow = null;
    g.previousWinningSuit = null;
    g.plays = [];
    g.turn = null;
    g.turnDeadline = null;
    g.pending = null;
    clearTurnTimer(g);
    resetRoundStats(g);
    const deck = shuffle(makeDeck());
    for (let i = 0; i < 10; i++)
      for (let seat = 0; seat < 4; seat++) g.players[seat].hand.push(deck.pop());
    g.undealt = deck;
    for (const p of g.players) sortHand(p.hand);
    broadcastLog(
      room,
      `Rodada ${g.round}: as cartas foram distribuídas. A primeira Lei será Ordem.`,
    );
    chooseDecreeStage(room);
  }
  function chooseDecreeStage(room) {
    const g = room.game;
    const min = Math.min(...g.players.map(rawAccumulated));
    const tied = g.players.filter((p) => rawAccumulated(p) === min);
    const chooser = tied[rand(tied.length)];
    const picks = chooseDecrees
      ? chooseDecrees(DECREES)
      : shuffle(DECREES)
          .slice(0, 2)
          .map((d) => d.id);
    g.phase = 'choose-decree';
    g.pending = { kind: 'decree', seat: chooser.seat, options: picks };
    broadcastGameState(room);
    if (chooser.bot) {
      schedule(room, () => applyDecreeChoice(room, chooser.seat, picks[rand(picks.length)]), 650);
    } else
      sendPrompt(room, chooser.seat, {
        kind: 'choose-decree',
        title: 'Escolha o Decreto',
        options: picks,
      });
  }
  function applyDecreeChoice(room, seat, decreeId) {
    const g = room.game;
    if (
      !g?.pending ||
      g.pending.kind !== 'decree' ||
      g.pending.seat !== seat ||
      !g.pending.options.includes(decreeId)
    )
      return false;
    g.decree = decreeById[decreeId];
    g.pending = null;
    broadcastLog(room, `${g.players[seat].name} escolheu o Decreto ${g.decree.name}.`);
    if (decreeId === 'reserva') startMultiCardStage(room, 'reserva');
    else if (decreeId === 'corte' || decreeId === 'conselho') startMultiCardStage(room, decreeId);
    else if (decreeId === 'espionagem') startIntelligence(room);
    else {
      if (decreeId === 'favor') for (const p of g.players) p.influence = 1;
      beginTrick(room);
    }
    return true;
  }
  function startMultiCardStage(room, kind) {
    const g = room.game;
    g.phase = `choose-${kind}`;
    g.pending = { kind, waiting: new Set(), choices: new Map() };
    for (const p of g.players) {
      if (p.bot) {
        g.pending.choices.set(p.seat, chooseBotCard(p, kind));
      } else {
        g.pending.waiting.add(p.seat);
        sendPrompt(room, p.seat, {
          kind: `choose-${kind}`,
          title:
            kind === 'reserva'
              ? 'Escolha sua Reserva'
              : kind === 'conselho'
                ? 'Conselho — passe uma carta à direita'
                : 'Corte Aberta',
          cardIds: p.hand.map((c) => c.id),
        });
      }
    }
    broadcastGameState(room);
    maybeFinishMultiStage(room);
  }
  function chooseBotCard(p, kind) {
    if (kind === 'reserva')
      return [...p.hand].sort((a, b) => Math.abs(a.value - 6.5) - Math.abs(b.value - 6.5))[0]?.id;
    return p.hand[rand(p.hand.length)]?.id;
  }
  function maybeFinishMultiStage(room) {
    const g = room.game,
      p = g?.pending;
    if (!p || !['reserva', 'corte', 'rotation', 'conselho'].includes(p.kind) || p.waiting.size)
      return;
    if (p.kind === 'reserva') {
      for (const pl of g.players) {
        const id = p.choices.get(pl.seat);
        const idx = pl.hand.findIndex((c) => c.id === id);
        if (idx < 0) continue;
        pl.reserve = pl.hand.splice(idx, 1)[0];
      }
      g.pending = null;
      broadcastLog(room, 'Todas as Casas separaram sua carta de Reserva.');
      broadcastGameState(room);
      beginTrick(room);
      return;
    }
    if (p.kind === 'corte') {
      for (const pl of g.players) {
        const id = p.choices.get(pl.seat);
        const c = pl.hand.find((c) => c.id === id);
        if (c) {
          c.public = true;
          c.publicReason = 'Corte Aberta';
        }
      }
      g.pending = null;
      broadcastLog(room, 'Corte Aberta: cada Casa revelou uma carta.');
      broadcastGameState(room);
      beginTrick(room);
      return;
    }
    if (p.kind === 'rotation' || p.kind === 'conselho') {
      const council = p.kind === 'conselho',
        direction = council ? -1 : 1;
      Rules.passCards(g.players, p.choices, direction);
      for (const pl of g.players) sortHand(pl.hand);
      g.pending = null;
      broadcastGameEvent(room, {
        event: 'exchange',
        kind: council ? 'conselho' : 'rotation',
        moves: g.players.map((pl) => ({
          from: pl.seat,
          to: (pl.seat + direction + 4) % 4,
          label: `${pl.name} → ${g.players[(pl.seat + direction + 4) % 4].name}`,
        })),
        title: council ? 'Conselho — pacto entre as Casas' : `Rotação — fim da vaza ${g.trick}`,
      });
      broadcastLog(
        room,
        `${council ? 'Conselho' : 'Rotação'}: quatro cartas ocultas foram passadas simultaneamente para a ${council ? 'direita' : 'esquerda'}.`,
      );
      broadcastGameState(room);
      schedule(room, () => (council ? beginTrick(room) : chooseNextLawStage(room)), 3500);
    }
  }

  function startIntelligence(room) {
    const g = room.game;
    g.phase = 'private-intelligence';
    g.pending = { kind: 'intelligence-ack', waiting: new Set() };
    for (const p of g.players) {
      p.intelligence = Rules.intelligence(g.players, p.seat);
      if (!p.bot) {
        g.pending.waiting.add(p.seat);
        sendToSeat(room, p.seat, { type: 'private-intelligence', intelligence: p.intelligence });
      }
    }
    broadcastLog(
      room,
      'Espionagem: cada Casa recebeu uma informação privada sobre o jogador à direita.',
    );
    broadcastGameState(room);
    if (!g.pending.waiting.size) {
      g.pending = null;
      beginTrick(room);
    }
  }
  function acknowledgePrivate(room, seat, kind) {
    const g = room.game,
      p = g.pending;
    if (p?.kind !== kind || !p.waiting.has(seat)) return false;
    p.waiting.delete(seat);
    if (!p.waiting.size) {
      g.pending = null;
      schedule(
        room,
        () => (kind === 'intelligence-ack' ? beginTrick(room) : startTurns(room)),
        180,
      );
    }
    return true;
  }

  function beginTrick(room) {
    const g = room.game;
    if (!g) return;
    g.phase = 'trick-start';
    g.plays = [];
    g.trump = null;
    g.declaredLeadSuit = null;
    g.turn = null;
    g.pending = null;
    g.lawUsage[g.currentLaw]++;
    broadcastLog(room, `Vaza ${g.trick}: ${lawName(g.currentLaw)}.`);
    broadcastGameState(room);
    if (g.currentLaw === 'estandarte') return declareTrumpStage(room);
    if (g.currentLaw === 'usurpacao') return usurpacaoGiveStage(room);
    startTurns(room);
  }
  function lawName(id) {
    return (
      {
        ordem: 'Ordem',
        estandarte: 'Estandarte',
        revolta: 'Revolta',
        anarquia: 'Anarquia',
        usurpacao: 'Usurpação',
      }[id] || id
    );
  }
  function declareTrumpStage(room) {
    const g = room.game,
      seat = g.lastShadow;
    if (seat === null || seat === undefined) {
      g.trump = SUITS[rand(4)];
      return startTurns(room);
    }
    const p = g.players[seat];
    g.phase = 'choose-trump';
    g.pending = { kind: 'trump', seat, options: [...SUITS] };
    broadcastGameState(room);
    if (p.bot) schedule(room, () => applyTrump(room, seat, chooseBotTrump(p)), 500);
    else
      sendPrompt(room, seat, {
        kind: 'choose-trump',
        title: 'Declare o Trunfo',
        options: [...SUITS],
      });
  }
  function chooseBotTrump(p) {
    return SUITS.map((s) => ({
      s,
      score:
        p.hand.filter((c) => c.suit === s).reduce((a, c) => a + c.value, 0) +
        p.hand.filter((c) => c.suit === s).length * 5,
    })).sort((a, b) => b.score - a.score)[0].s;
  }
  function applyTrump(room, seat, suit) {
    const g = room.game;
    if (
      !g?.pending ||
      g.pending.kind !== 'trump' ||
      g.pending.seat !== seat ||
      !SUITS.includes(suit)
    )
      return false;
    g.trump = suit;
    g.pending = null;
    broadcastLog(room, `${g.players[seat].name} declarou ${suitName(suit)} como Trunfo.`);
    broadcastGameState(room);
    startTurns(room);
    return true;
  }
  function suitName(s) {
    return { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' }[s] || s;
  }

  function usurpacaoEligibleCards(hand) {
    return Rules.eligible(hand);
  }
  function usurpacaoGiveStage(room) {
    const g = room.game,
      shadow = g.players[g.lastShadow];
    if (!shadow) return startTurns(room);
    if (g.players.some((p) => p.hand.length < 4))
      throw new Error('Usurpação exige ao menos quatro cartas por Casa.');
    const options = g.players
      .filter((p) => p.seat !== shadow.seat && Rules.eligible(p.hand).length)
      .map((p) => p.seat);
    g.phase = 'usurp-target';
    g.pending = { kind: 'usurp-target', seat: shadow.seat, options };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(room, () => applyUsurpTarget(room, shadow.seat, options[rand(options.length)]), 500);
    else
      sendPrompt(room, shadow.seat, {
        kind: 'usurp-target',
        title: 'Usurpação — escolha uma Casa',
        options: options.map((seat) => ({ seat, name: g.players[seat].name })),
      });
  }
  function applyUsurpTarget(room, seat, targetSeat) {
    const g = room.game,
      p = g?.pending;
    if (p?.kind !== 'usurp-target' || p.seat !== seat || !p.options.includes(targetSeat))
      return false;
    const shadow = g.players[seat],
      target = g.players[targetSeat],
      eligible = Rules.eligible(shadow.hand);
    g.phase = 'usurp-give';
    g.pending = {
      kind: 'usurp-give',
      seat,
      shadow: seat,
      target: targetSeat,
      eligibleIds: eligible.map((c) => c.id),
    };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(
        room,
        () => applyUsurpGive(room, seat, [...eligible].sort((a, b) => a.value - b.value)[0].id),
        500,
      );
    else
      sendPrompt(room, seat, {
        kind: 'usurp-give',
        title: 'Usurpação — separe uma carta',
        cardIds: eligible.map((c) => c.id),
        otherName: target.name,
      });
    return true;
  }
  function applyUsurpGive(room, seat, cardId) {
    const g = room.game,
      p = g?.pending;
    if (p?.kind !== 'usurp-give' || p.seat !== seat || !p.eligibleIds.includes(cardId))
      return false;
    const shadow = g.players[p.shadow],
      target = g.players[p.target];
    const exchange = Rules.reserveExchange(g.players, shadow, target, cardId, shuffle);
    g.phase = 'usurp-pick';
    g.pending = { kind: 'usurp-pick', seat, shadow: seat, target: target.seat, ...exchange };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(room, () => applyUsurpPick(room, seat, rand(exchange.pickableIds.length)), 500);
    else
      sendPrompt(room, seat, {
        kind: 'usurp-pick',
        title: 'Usurpação — escolha às cegas',
        count: exchange.pickableIds.length,
        otherName: target.name,
        note: 'Sua carta está separada e nunca pode retornar. Corte Aberta permanece protegida.',
      });
    return true;
  }
  function applyUsurpPick(room, seat, index) {
    const g = room.game,
      p = g?.pending;
    if (
      p?.kind !== 'usurp-pick' ||
      p.seat !== seat ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= p.pickableIds.length
    )
      return false;
    const shadow = g.players[p.shadow],
      target = g.players[p.target],
      { given, taken } = Rules.finishExchange(shadow, target, p, index);
    sortHand(shadow.hand);
    sortHand(target.hand);
    const waiting = new Set([shadow, target].filter((x) => !x.bot).map((x) => x.seat));
    g.phase = 'usurp-reveal';
    g.pending = { kind: 'usurp-ack', waiting };
    broadcastGameEvent(room, {
      event: 'exchange',
      kind: 'usurpacao',
      title: 'Usurpação — troca de mãos',
      shadow: seat,
      target: target.seat,
      moves: [
        { from: target.seat, to: seat, label: 'Carta oculta → Sombra' },
        { from: seat, to: target.seat, label: 'Carta separada → Casa escolhida', delay: 220 },
      ],
    });
    if (!shadow.bot)
      sendToSeat(room, seat, {
        type: 'private-usurpation',
        role: 'shadow',
        outgoing: given,
        incoming: taken,
        otherName: target.name,
        returnedSameCard: false,
      });
    if (!target.bot)
      sendToSeat(room, target.seat, {
        type: 'private-usurpation',
        role: 'target',
        outgoing: taken,
        incoming: given,
        otherName: shadow.name,
        returnedSameCard: false,
      });
    broadcastLog(
      room,
      `Usurpação: ${shadow.name} e ${target.name} trocaram uma carta oculta. Nenhuma carta protegida foi movida.`,
    );
    broadcastGameState(room);
    if (!waiting.size)
      schedule(
        room,
        () => {
          g.pending = null;
          startTurns(room);
        },
        3200,
      );
    return true;
  }

  function clearTurnTimer(g) {
    if (!g) return;
    if (g.turnTimer) {
      clearTimeout(g.turnTimer);
      g.turnTimer = null;
    }
    g.turnDeadline = null;
  }
  function armTurnTimer(room, seat) {
    const g = room.game;
    if (!g) return;
    clearTurnTimer(g);
    const serial = ++g.turnSerial;
    g.turnDeadline = Date.now() + TURN_MS;
    g.turnTimer = setTimeout(() => {
      const live = room.game;
      if (
        !live ||
        live.token !== g.token ||
        live.phase !== 'await-play' ||
        live.turn !== seat ||
        live.turnSerial !== serial
      )
        return;
      const p = live.players[seat];
      const legal = legalCards(live, p);
      if (!legal.length) return;
      const card = legal[rand(legal.length)];
      broadcastGameEvent(room, { event: 'turn-timeout', seat, seconds: 60 });
      broadcastLog(room, `Tempo esgotado: ${p.name} recebeu uma jogada automática.`);
      commitPlay(room, p, card, {
        hidden: false,
        declaredSuit: null,
        isReserve: live.decree?.id === 'reserva' && live.trick === 10 && p.reserve?.id === card.id,
        timeout: true,
      });
    }, TURN_MS + 60);
  }
  function startTurns(room) {
    const g = room.game;
    clearTurnTimer(g);
    g.phase = 'await-play';
    g.turn = g.leader;
    broadcastGameState(room);
    advanceTurn(room);
  }
  function influenceBlocked(g, p) {
    return Rules.influenceBlocked(g, p);
  }
  function leadSuit(g) {
    return g.declaredLeadSuit || g.plays[0]?.card?.suit || null;
  }
  function legalCards(g, p) {
    let cards = [...p.hand];
    if (g.decree?.id === 'reserva' && g.trick === 10 && p.reserve) return [p.reserve];
    if (g.plays.length === 0 && g.decree?.id === 'sucessao' && g.previousWinningSuit) {
      const alt = cards.filter((c) => c.suit !== g.previousWinningSuit);
      if (alt.length) cards = alt;
    }
    if (g.plays.length === 0) return cards;
    if (['ordem', 'estandarte', 'revolta', 'usurpacao'].includes(g.currentLaw)) {
      return Rules.followCards(cards, g.currentLaw, leadSuit(g), g.trump);
    }
    return cards;
  }
  function canUseInfluence(g, p, cost = 1) {
    if (p.influence < cost || influenceBlocked(g, p)) return false;
    if (g.plays.length === 0) return p.seat === g.leader;
    return true;
  }
  function influenceLegalCards(g, p) {
    return legalCards(g, p).filter((c) => c.publicReason !== 'Corte Aberta');
  }
  function chooseBotPlay(g, p, legal) {
    const sorted = [...legal].sort((a, b) => a.value - b.value),
      seek = Math.random() < 0.55;
    if (g.currentLaw === 'revolta') return seek ? sorted[0] : sorted[sorted.length - 1];
    if (g.currentLaw === 'anarquia') return seek ? sorted[sorted.length - 1] : sorted[0];
    if (g.currentLaw === 'estandarte' && g.trump) {
      const tr = legal.filter((c) => c.suit === g.trump).sort((a, b) => a.value - b.value);
      if (seek && tr.length) return tr[tr.length - 1];
    }
    return seek ? sorted[sorted.length - 1] : sorted[0];
  }
  function advanceTurn(room) {
    const g = room.game;
    if (!g || g.phase !== 'await-play') return;
    if (g.plays.length >= 4) {
      clearTurnTimer(g);
      return resolveTrick(room);
    }
    const seat = (g.leader + g.plays.length) % 4;
    g.turn = seat;
    const p = g.players[seat],
      legal = legalCards(g, p);
    if (!p.bot) armTurnTimer(room, seat);
    else clearTurnTimer(g);
    broadcastGameState(room);
    if (g.decree?.id === 'reserva' && g.trick === 10 && p.reserve) {
      return schedule(
        room,
        () => {
          if (
            !room.game ||
            room.game.turn !== seat ||
            room.game.phase !== 'await-play' ||
            !p.reserve
          )
            return;
          commitPlay(room, p, p.reserve, { hidden: false, declaredSuit: null, isReserve: true });
        },
        620,
      );
    }
    if (p.bot) {
      schedule(
        room,
        () => {
          if (!room.game || room.game.turn !== seat || room.game.phase !== 'await-play') return;
          const card = chooseBotPlay(g, p, legal);
          let influenceAction = 'none',
            modifier = 0,
            declaredSuit = null;
          if (card.publicReason !== 'Corte Aberta' && !influenceBlocked(g, p)) {
            if (
              canUseInfluence(g, p, 2) &&
              card.value >= 4 &&
              card.value <= 9 &&
              Math.random() < 0.3
            ) {
              const seekCrown = Math.random() < 0.62;
              influenceAction =
                g.currentLaw === 'revolta'
                  ? seekCrown
                    ? 'minus'
                    : 'plus'
                  : seekCrown
                    ? 'plus'
                    : 'minus';
              modifier = influenceAction === 'plus' ? 3 : -3;
              p.influence -= 2;
            } else if (canUseInfluence(g, p, 1) && Math.random() < 0.12) {
              influenceAction = 'sigilo';
              p.influence -= 1;
            }
            if (influenceAction !== 'none' && g.plays.length === 0) {
              declaredSuit = card.suit;
              g.declaredLeadSuit = declaredSuit;
            }
          }
          commitPlay(room, p, card, {
            hidden: influenceAction !== 'none',
            influenceAction,
            modifier,
            declaredSuit,
            isReserve: g.decree?.id === 'reserva' && g.trick === 10 && p.reserve?.id === card.id,
          });
        },
        620,
      );
    }
  }
  function handlePlay(room, seat, msg) {
    const g = room.game;
    if (!g || g.phase !== 'await-play' || g.turn !== seat) return false;
    const p = g.players[seat];
    if (p.bot) return false;
    const legal = legalCards(g, p);
    const card = legal.find((c) => c.id === msg.cardId);
    if (!card)
      return (
        sendToSeat(room, seat, {
          type: 'error',
          code: 'ILLEGAL_CARD',
          message: 'Esta carta não pode ser jogada agora.',
        }),
        false
      );
    let action = String(msg.influenceAction || (msg.hidden ? 'sigilo' : 'none'));
    if (!['none', 'sigilo', 'plus', 'minus'].includes(action)) action = 'none';
    const hidden = action !== 'none',
      cost = action === 'sigilo' ? 1 : hidden ? 2 : 0,
      modifier = action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
    const declaredSuit = msg.declaredSuit || null;
    if (hidden) {
      if (!canUseInfluence(g, p, cost))
        return (
          sendToSeat(room, seat, {
            type: 'error',
            code: 'NO_INFLUENCE',
            message: `Você precisa de ${cost} Influência${cost > 1 ? 's' : ''} para esta ação.`,
          }),
          false
        );
      if (card.publicReason === 'Corte Aberta')
        return (
          sendToSeat(room, seat, {
            type: 'error',
            code: 'CORTE_INFLUENCE_BLOCKED',
            message:
              'A carta revelada pela Corte Aberta não pode ser jogada oculta por Influência.',
          }),
          false
        );
      if (g.plays.length === 0) {
        if (!SUITS.includes(declaredSuit) || card.suit !== declaredSuit)
          return (
            sendToSeat(room, seat, {
              type: 'error',
              code: 'BAD_DECLARATION',
              message: 'Ao abrir oculta, anuncie o mesmo naipe da carta jogada.',
            }),
            false
          );
        g.declaredLeadSuit = declaredSuit;
      }
      p.influence -= cost;
    }
    const isReserve = g.decree?.id === 'reserva' && g.trick === 10 && p.reserve?.id === card.id;
    commitPlay(room, p, card, {
      hidden,
      influenceAction: action,
      modifier,
      declaredSuit,
      isReserve,
    });
    return true;
  }
  function commitPlay(
    room,
    p,
    card,
    {
      hidden = false,
      influenceAction = 'none',
      modifier = 0,
      declaredSuit = null,
      isReserve = false,
      timeout = false,
    } = {},
  ) {
    const g = room.game;
    clearTurnTimer(g);
    if (isReserve) {
      p.reserve = null;
    } else {
      const idx = p.hand.findIndex((c) => c.id === card.id);
      if (idx < 0) throw new Error('Carta não encontrada na mão.');
      p.hand.splice(idx, 1);
    }
    if (card.public) {
      card.public = false;
      card.publicReason = null;
    }
    const play = {
      playerId: p.seat,
      card,
      hidden,
      influenceAction,
      modifier,
      order: g.plays.length,
    };
    g.plays.push(play);
    if (influenceAction !== 'none') {
      const cost = influenceAction === 'sigilo' ? 1 : 2;
      broadcastGameEvent(room, {
        event: 'influence-used',
        playerId: p.seat,
        name: p.name,
        action: influenceAction,
        modifier,
        cost,
        declaredSuit: declaredSuit || null,
      });
      broadcastLog(
        room,
        `<strong>Influência:</strong> ${p.name} usou <strong>${influenceLabel(play)}</strong>${declaredSuit ? ` e anunciou ${suitName(declaredSuit)}` : ''}.`,
      );
    }
    broadcastGameEvent(room, {
      event: 'card-played',
      playerId: p.seat,
      hidden,
      card: hidden ? null : card,
      declaredSuit: declaredSuit || null,
      isReserve,
    });
    if (hidden && g.plays.length === 1 && declaredSuit)
      broadcastLog(
        room,
        `${p.name} anunciou ${suitName(declaredSuit)} e abriu com uma carta oculta usando Influência.`,
      );
    else
      broadcastLog(
        room,
        `${p.name} jogou ${hidden ? 'uma carta oculta' : `${suitName(card.suit)} ${card.value}`}${isReserve ? ' da Reserva' : ''}.`,
      );
    g.turn = null;
    broadcastGameState(room);
    schedule(
      room,
      () => {
        g.phase = 'await-play';
        advanceTurn(room);
      },
      480,
    );
  }

  function evaluateTrick(g) {
    return Rules.evaluate(g.plays, g.currentLaw, leadSuit(g), g.trump);
  }

  function resolveTrick(room) {
    const g = room.game;
    if (!g) return;
    g.phase = 'resolve';
    g.turn = null;
    const { crown, shadow } = evaluateTrick(g);
    const cp = g.players[crown.playerId],
      sp = g.players[shadow.playerId];
    cp.roundCrowns++;
    cp.totalCrowns++;
    sp.roundShadows++;
    sp.totalShadows++;
    const influenceGains = [];
    for (const p of g.players) {
      if (p.seat !== cp.seat && p.seat !== sp.seat) {
        const before = p.influence;
        p.influence = Math.min(2, p.influence + 1);
        if (p.influence > before) influenceGains.push({ seat: p.seat, after: p.influence });
      }
    }
    const sameCrown = g.lastCrown === cp.seat;
    if (sameCrown) cp.crownStreak++;
    else {
      for (const p of g.players) p.crownStreak = 0;
      cp.crownStreak = 1;
    }
    const revealedPlays = g.plays.map((x) => ({ ...x, hidden: false }));
    g.lastCrown = cp.seat;
    g.lastShadow = sp.seat;
    g.previousWinningSuit = crown.card.suit;
    g.leader = cp.seat;
    g.phase = 'trick-result';
    broadcastGameEvent(room, {
      event: 'trick-result',
      law: g.currentLaw,
      crownId: cp.seat,
      shadowId: sp.seat,
      revealedPlays,
      influenceGains,
    });
    const crownValue = playValue(crown),
      shadowValue = playValue(shadow);
    const crownShown = crown.modifier
      ? `${crown.card.value} ${crown.modifier > 0 ? '+3' : '-3'} → ${crownValue}`
      : `${crown.card.value}`;
    const shadowShown = shadow.modifier
      ? `${shadow.card.value} ${shadow.modifier > 0 ? '+3' : '-3'} → ${shadowValue}`
      : `${shadow.card.value}`;
    broadcastLog(
      room,
      `${lawName(g.currentLaw)} — Coroa: ${cp.name} (${suitName(crown.card.suit)} ${crownShown}). Sombra: ${sp.name} (${suitName(shadow.card.suit)} ${shadowShown})${g.currentLaw === 'estandarte' && g.trump ? ` • Trunfo: ${suitName(g.trump)}` : ''}.`,
    );
    broadcastGameState(room, true);
    schedule(room, () => afterTrickAnimation(room, sameCrown), 6400);
  }
  function afterTrickAnimation(room, sameCrown) {
    const g = room.game;
    if (!g) return;
    const cp = g.players[g.lastCrown];
    if (g.decree?.id === 'desafio') {
      const shouldReveal = !cp.hadCrown || sameCrown;
      cp.hadCrown = true;
      if (shouldReveal) {
        const privateCards = cp.hand.filter((c) => !c.public);
        if (privateCards.length) {
          return challengeStage(room, cp, privateCards);
        }
      }
    } else cp.hadCrown = true;
    continueAfterChallenge(room);
  }
  function challengeStage(room, p, cards) {
    const g = room.game;
    g.phase = 'challenge';
    g.pending = { kind: 'challenge', seat: p.seat, cardIds: cards.map((c) => c.id) };
    broadcastGameState(room);
    if (p.bot) {
      schedule(room, () => applyChallenge(room, p.seat, cards[rand(cards.length)].id), 400);
    } else
      sendPrompt(room, p.seat, {
        kind: 'challenge',
        title: 'Desafio — revele uma carta',
        cardIds: cards.map((c) => c.id),
      });
  }
  function applyChallenge(room, seat, cardId) {
    const g = room.game,
      pending = g?.pending;
    if (
      !pending ||
      pending.kind !== 'challenge' ||
      pending.seat !== seat ||
      !pending.cardIds.includes(cardId)
    )
      return false;
    const p = g.players[seat],
      c = p.hand.find((x) => x.id === cardId);
    if (!c) return false;
    c.public = true;
    c.publicReason = 'Desafio';
    g.pending = null;
    broadcastGameEvent(room, { event: 'challenge-reveal', seat, card: c });
    broadcastLog(room, `Desafio: ${p.name} revelou ${suitName(c.suit)} ${c.value}.`);
    broadcastGameState(room);
    continueAfterChallenge(room);
    return true;
  }
  function continueAfterChallenge(room) {
    const g = room.game;
    if (g.trick === 10) return endRound(room);
    if (g.decree?.id === 'rotacao' && [7, 8, 9].includes(g.trick)) return startRotationStage(room);
    chooseNextLawStage(room);
  }
  function startRotationStage(room) {
    const g = room.game;
    g.phase = 'rotation';
    g.pending = { kind: 'rotation', waiting: new Set(), choices: new Map() };
    for (const p of g.players) {
      if (p.bot) g.pending.choices.set(p.seat, p.hand[rand(p.hand.length)].id);
      else {
        g.pending.waiting.add(p.seat);
        sendPrompt(room, p.seat, {
          kind: 'rotation',
          title: `Rotação — fim da vaza ${g.trick}`,
          cardIds: p.hand.map((c) => c.id),
        });
      }
    }
    broadcastGameState(room);
    maybeFinishMultiStage(room);
  }
  function minHandBeforeTrick(g, t) {
    return g.decree?.id === 'reserva' ? (t === 10 ? 1 : 10 - t) : 11 - t;
  }
  function lawEligibleAt(g, law, trickNum) {
    return !(law === 'usurpacao' && minHandBeforeTrick(g, trickNum) < 4);
  }
  function canFinishLawSequence(g, rem, lastLaw, trickNum, memo = new Map()) {
    if (trickNum > 10) return LAWS.every((l) => rem[l] === 0);
    const key = `${trickNum}|${lastLaw}|${LAWS.map((l) => rem[l]).join(',')}|${g.decree?.id || ''}`;
    if (memo.has(key)) return memo.get(key);
    for (const l of LAWS) {
      if (rem[l] <= 0 || l === lastLaw) continue;
      if (!lawEligibleAt(g, l, trickNum)) continue;
      rem[l]--;
      if (canFinishLawSequence(g, rem, l, trickNum + 1, memo)) {
        rem[l]++;
        memo.set(key, true);
        return true;
      }
      rem[l]++;
    }
    memo.set(key, false);
    return false;
  }
  function safeLawChoices(g, nextTrick) {
    const rem = Object.fromEntries(LAWS.map((l) => [l, 2 - g.lawUsage[l]]));
    return LAWS.filter((l) => {
      if (rem[l] <= 0 || l === g.currentLaw || !lawEligibleAt(g, l, nextTrick)) return false;
      rem[l]--;
      const ok = canFinishLawSequence(g, rem, l, nextTrick + 1);
      rem[l]++;
      return ok;
    });
  }
  function chooseNextLawStage(room) {
    const g = room.game,
      seat = g.lastShadow,
      p = g.players[seat],
      valid = safeLawChoices(g, g.trick + 1);
    if (!valid.length) throw new Error('Não há Lei válida para a próxima vaza.');
    g.phase = 'choose-law';
    g.pending = { kind: 'law', seat, options: valid };
    broadcastGameState(room);
    if (p.bot) schedule(room, () => applyLawChoice(room, seat, valid[rand(valid.length)]), 450);
    else
      sendPrompt(room, seat, {
        kind: 'choose-law',
        title: 'Escolha a próxima Lei',
        options: valid,
      });
  }
  function applyLawChoice(room, seat, law) {
    const g = room.game,
      p = g?.pending;
    if (!p || p.kind !== 'law' || p.seat !== seat || !p.options.includes(law)) return false;
    g.currentLaw = law;
    g.pending = null;
    g.trick++;
    broadcastLog(room, `${g.players[seat].name}, como Sombra, escolheu ${lawName(law)}.`);
    beginTrick(room);
    return true;
  }
  function endRound(room) {
    const g = room.game;
    g.phase = 'round-end';
    g.turn = null;
    for (const p of g.players) p.influence = 0;
    const scores = g.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      crowns: p.totalCrowns,
      shadows: p.totalShadows,
      pairs: totalPairs(p),
      prestige: prestige(p),
    }));
    broadcastGameEvent(room, { event: 'round-ended', round: g.round, scores });
    broadcastGameState(room);
    if (g.round >= 3) return schedule(room, () => endGame(room), 3500);
    const nextStarter = (g.lastCrown + 1) % 4;
    schedule(
      room,
      () => {
        g.round++;
        g.leader = nextStarter;
        broadcastLog(
          room,
          `${g.players[nextStarter].name} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`,
        );
        setupRound(room);
      },
      3500,
    );
  }
  function endGame(room) {
    const g = room.game;
    g.phase = 'game-over';
    const sorted = [...g.players].sort(
      (a, b) =>
        prestige(b) - prestige(a) ||
        totalPairs(b) - totalPairs(a) ||
        b.totalCrowns - a.totalCrowns ||
        b.totalShadows - a.totalShadows,
    );
    const top = sorted[0];
    const tied = sorted.filter(
      (p) =>
        prestige(p) === prestige(top) &&
        totalPairs(p) === totalPairs(top) &&
        p.totalCrowns === top.totalCrowns &&
        p.totalShadows === top.totalShadows,
    );
    broadcastLog(
      room,
      `Partida encerrada. ${tied.map((p) => p.name).join(' e ')} ${tied.length > 1 ? 'dividem o Trono' : 'ocupa o Trono'}.`,
    );
    broadcastGameEvent(room, {
      event: 'game-ended',
      winners: tied.map((p) => p.seat),
      scores: sorted.map((p) => ({
        seat: p.seat,
        name: p.name,
        crowns: p.totalCrowns,
        shadows: p.totalShadows,
        pairs: totalPairs(p),
        prestige: prestige(p),
      })),
      finalLog: [...(g.logHistory || [])],
    });
    broadcastGameState(room);
  }

  function sendPrompt(room, seat, prompt) {
    const g = room.game;
    if (!g) return;
    const id = `p${++g.promptSeq}`;
    sendToSeat(room, seat, { type: 'game-prompt', prompt: { id, ...prompt } });
  }
  function handleGameAction(ws, message) {
    const room = gameRoomFor(ws),
      hp = room?.players.get(ws.clientId),
      g = room?.game;
    if (!room || !hp || !g) {
      send(ws, { type: 'error', code: 'NO_GAME', message: 'Não existe partida ativa nesta sala.' });
      return;
    }
    const seat = hp.seat,
      action = message.action,
      payload = message.payload || {};
    let ok = false;
    if (action === 'choose-decree') ok = applyDecreeChoice(room, seat, payload.value);
    else if (action === 'choose-trump') ok = applyTrump(room, seat, payload.value);
    else if (action === 'choose-law') ok = applyLawChoice(room, seat, payload.value);
    else if (action === 'usurp-target') ok = applyUsurpTarget(room, seat, payload.targetSeat);
    else if (action === 'usurp-give') ok = applyUsurpGive(room, seat, payload.cardId);
    else if (action === 'usurp-pick') ok = applyUsurpPick(room, seat, Number(payload.index));
    else if (action === 'challenge') ok = applyChallenge(room, seat, payload.cardId);
    else if (action === 'play-card') ok = handlePlay(room, seat, payload);
    else if (action === 'usurp-ack' || action === 'intelligence-ack')
      ok = acknowledgePrivate(room, seat, action);
    else if (['choose-reserva', 'choose-corte', 'choose-conselho', 'rotation'].includes(action)) {
      const p = g.pending,
        expected =
          action === 'choose-reserva'
            ? 'reserva'
            : action === 'choose-corte'
              ? 'corte'
              : action === 'choose-conselho'
                ? 'conselho'
                : 'rotation';
      if (
        p?.kind === expected &&
        p.waiting?.has(seat) &&
        g.players[seat].hand.some((c) => c.id === payload.cardId)
      ) {
        p.choices.set(seat, payload.cardId);
        p.waiting.delete(seat);
        ok = true;
        broadcastGameState(room);
        maybeFinishMultiStage(room);
      }
    }
    if (!ok && !['play-card'].includes(action))
      send(ws, {
        type: 'error',
        code: 'INVALID_ACTION',
        message: 'Essa ação não é válida neste momento.',
      });
  }
  function autoResolvePendingSeat(room, seat) {
    const g = room.game,
      p = g?.pending;
    if (!g || !p) return;
    const gp = g.players[seat];
    gp.bot = true;
    gp.clientId = null;
    if (['usurp-ack', 'intelligence-ack'].includes(p.kind) && p.waiting?.has(seat)) {
      acknowledgePrivate(room, seat, p.kind);
      return;
    }
    if (p.waiting?.has(seat)) {
      let cardId = gp.hand[rand(gp.hand.length)]?.id;
      if (p.kind === 'reserva') cardId = chooseBotCard(gp, 'reserva');
      p.choices.set(seat, cardId);
      p.waiting.delete(seat);
      maybeFinishMultiStage(room);
      return;
    }
    if (p.seat !== seat) return;
    if (p.kind === 'decree') applyDecreeChoice(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'trump') applyTrump(room, seat, chooseBotTrump(gp));
    else if (p.kind === 'law') applyLawChoice(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'usurp-target')
      applyUsurpTarget(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'usurp-give') {
      const eligible = usurpacaoEligibleCards(gp.hand);
      const c = [...eligible].sort((a, b) => a.value - b.value)[0];
      if (c) applyUsurpGive(room, seat, c.id);
    } else if (p.kind === 'usurp-pick')
      applyUsurpPick(room, seat, rand(p.pickableIds?.length || 1));
    else if (p.kind === 'challenge') applyChallenge(room, seat, p.cardIds[rand(p.cardIds.length)]);
  }

  function privateGameState(room, viewerSeat, revealPlays = false) {
    const g = room.game;
    if (!g) return null;
    const viewer = g.players[viewerSeat];
    const players = g.players.map((p) => ({
      id: p.seat,
      seat: p.seat,
      name: p.name,
      ai: p.bot,
      handCount: p.hand.length,
      reservePresent: !!p.reserve,
      hand: p.seat === viewerSeat ? p.hand : undefined,
      reserve: p.seat === viewerSeat ? p.reserve : undefined,
      publicCards: p.hand.filter((c) => c.public),
      totalCrowns: p.totalCrowns,
      totalShadows: p.totalShadows,
      roundCrowns: p.roundCrowns,
      roundShadows: p.roundShadows,
      influence: p.influence,
      prestige: prestige(p),
      pairs: totalPairs(p),
    }));
    const plays = g.plays.map((pl) => ({
      playerId: pl.playerId,
      order: pl.order,
      hidden: revealPlays ? false : pl.hidden,
      card: revealPlays || !pl.hidden || pl.playerId === viewerSeat ? pl.card : null,
      modifier: pl.modifier || 0,
      influenceAction: pl.influenceAction || 'none',
    }));
    const legal =
      g.phase === 'await-play' && g.turn === viewerSeat
        ? legalCards(g, viewer).map((c) => c.id)
        : [];
    const influenceLegal =
      g.phase === 'await-play' && g.turn === viewerSeat && canUseInfluence(g, viewer, 1)
        ? influenceLegalCards(g, viewer).map((c) => c.id)
        : [];
    return {
      online: true,
      youSeat: viewerSeat,
      round: g.round,
      trick: g.trick,
      phase: g.phase,
      currentLaw: g.currentLaw,
      lawUsage: g.lawUsage,
      trump: g.trump,
      declaredLeadSuit: g.declaredLeadSuit,
      decree: g.decree,
      lastCrown: g.lastCrown,
      lastShadow: g.lastShadow,
      previousWinningSuit: g.previousWinningSuit,
      leader: g.leader,
      turn: g.turn,
      turnDeadline: g.turnDeadline || null,
      plays,
      players,
      legalCardIds: legal,
      influenceLegalCardIds: influenceLegal,
      canUseInfluence:
        g.phase === 'await-play' &&
        g.turn === viewerSeat &&
        canUseInfluence(g, viewer, 1) &&
        influenceLegal.length > 0,
      canUseManeuver:
        g.phase === 'await-play' &&
        g.turn === viewerSeat &&
        canUseInfluence(g, viewer, 2) &&
        influenceLegal.length > 0,
      influenceBlocked: influenceBlocked(g, viewer),
      intelligence: viewer.intelligence || null,
    };
  }
  function broadcastGameState(room, revealPlays = false) {
    if (!room.game) return;
    for (const hp of room.players.values())
      send(hp.ws, { type: 'game-state', state: privateGameState(room, hp.seat, revealPlays) });
  }

  const chatHistory = createChatHistory({ auth: accountAuth });
  const fileStorage = createFiles({
    auth: accountAuth,
    membership: (id, roomId) =>
      [...(rooms.get(roomId)?.players.values() || [])].some((p) => p.ws.account?.id === id),
    canAttach: (id, roomId) =>
      rooms.get(roomId)?.channelType !== 'voice' &&
      [...(rooms.get(roomId)?.players.values() || [])].some((p) => p.ws.account?.id === id),
    onDeleted: (row) => {
      if (row.kind === 'direct') {
        for (const ws of wss.clients)
          if (
            ws.account?.expiresAt > Date.now() &&
            [row.owner_id, row.direct_peer_id].includes(ws.account.id)
          )
            send(ws, { type: 'attachment-deleted', id: row.id });
        return;
      }
      for (const room of rooms.values())
        for (const m of room.chatHistory || [])
          if (m.attachment?.id === row.id) m.attachment.deleted = true;
      broadcastAll({ type: 'attachment-deleted', id: row.id });
    },
  });
  const community = createCommunity({ wss, rooms, send, auth: accountAuth });
  const azulService = createAzulService({ auth: accountAuth, wss, send });
  const splendorService = createSplendorService({ auth: accountAuth, wss, send });
  const loveLetterService = createLoveLetterService({ wss, send });
  const socialService = createSocialService({
    auth: accountAuth,
    wss,
    send,
    rooms,
    files: fileStorage,
  });
  const communityManagement = createCommunityManagement({
    auth: accountAuth,
    rooms,
    db:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        ? fileStorage.db
        : null,
    onChanged: broadcastChatChannels,
    onDeleted: (room) => {
      for (const p of [...room.players.values()]) {
        if (p.ws.textRoomId === room.id) leaveTextRoom(p.ws);
        else if (p.ws.independentGames) leaveVoiceRoom(p.ws, 'channel-deleted');
        else leaveRoom(p.ws, 'channel-deleted', true);
        send(p.ws, { type: 'channel-deleted', roomId: room.id });
      }
    },
    onRoleChanged: (id, role) => {
      for (const ws of wss.clients)
        if (ws.account?.id === id) {
          ws.account.role = role;
          send(ws, { type: 'role-updated', role, permissions: permissions(role) });
          const room = rooms.get(ws.roomId);
          if (room) broadcastRoom(room);
        }
      community.broadcast();
      void community.refreshDirectory();
    },
  });
  fileStorage.install(app);
  communityManagement.install(app, express);
  socialService.install(app, express);
  app.get('/', (_req, res) =>
    res.type('text/plain').send(`A Lei do Trono backend ${VERSION} online.`),
  );
  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      version: VERSION,
      features: {
        loveLetter: true,
        splendor: true,
        azul: true,
        soundboardRestart: true,
        voiceProfileActivity: true,
        independentGameVoice: true,
        gameRulesVersion: Rules.version,
        socialMessaging: true,
        chatModeration: true,
        channelNotifications: true,
      },
      auth: accountAuth.health(),
      files: fileStorage.health(),
      presence: community.health(),
      chatHistory: chatHistory.health(),
      social: socialService.health(),
      azul: azulService.health(),
      splendor: splendorService.health(),
      loveLetter: loveLetterService.health(),
      community: communityManagement.health(),
      rooms: safeRooms(),
      chatOnlyCount: [...rooms.values()]
        .filter((r) => r.kind === 'chat')
        .reduce((n, r) => n + r.players.size, 0),
      chatChannels: safeChatChannels(),
      realtime: realtimeSfu.publicHealth(),
      uptime: process.uptime(),
    }),
  );
  app.get('/realtime/status', (_req, res) => res.json(realtimeSfu.statusPayload()));
  app.get('/rooms', (_req, res) => res.json({ rooms: safeRooms() }));

  wss.on('connection', (ws) => {
    ws.clientId = crypto.randomUUID();
    ws.roomId = null;
    ws.textRoomId = null;
    ws.gameRoomId = null;
    ws.independentGames = false;
    ws.isAlive = true;
    ws.account = null;
    ws.authPending = false;
    ws.authAttempts = 0;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    send(ws, {
      type: 'welcome',
      clientId: ws.clientId,
      rooms: safeRooms(),
      chatChannels: safeChatChannels(),
      serverVersion: VERSION,
      features: {
        loveLetter: true,
        splendor: true,
        azul: true,
        soundboardRestart: true,
        voiceProfileActivity: true,
        independentGameVoice: true,
        gameRulesVersion: Rules.version,
        socialMessaging: true,
        chatModeration: true,
        channelNotifications: true,
        gameActivity: true,
        independentTextChannels: true,
        guestGame: true,
        voiceEvents: true,
        presence: true,
        roles: true,
        managedChannels: true,
        soundboard: true,
        screenFps: true,
      },
      auth: accountAuth.health(),
      realtime: realtimeSfu.publicHealth(),
    });
    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', code: 'BAD_JSON', message: 'Mensagem inválida.' });
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        send(ws, { type: 'error', code: 'BAD_JSON', message: 'Mensagem inválida.' });
        return;
      }
      if (message.type === 'guest-authenticate') {
        if (ws.account) {
          azulService.disconnect(ws);
          splendorService.disconnect(ws);
          loveLetterService.disconnect(ws);
        }
        const now = Date.now();
        if (!ws.guestRate || ws.guestRate.until < now)
          ws.guestRate = { count: 0, until: now + 60000 };
        if (++ws.guestRate.count > 15) {
          send(ws, {
            type: 'guest-result',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'GUEST_RATE_LIMIT',
              message: 'Aguarde um minuto para tentar novamente.',
            },
          });
          return;
        }
        try {
          const identity = community.guest(ws, message);
          if (ws.guest?.id !== identity.id) leaveRoom(ws, 'guest-change');
          for (const other of wss.clients)
            if (other !== ws && other.guest?.id === identity.id) {
              leaveRoom(other, 'session-reconnected');
              other.guest = null;
              other.close(4002, 'Convidado reconectado');
            }
          ws.account = null;
          ws.activity = null;
          ws.guest = identity;
          community.note(ws);
          send(ws, {
            type: 'guest-result',
            requestId: message.requestId,
            ok: true,
            guest: {
              id: identity.id,
              nickname: identity.nickname,
              ticket: identity.ticket,
              expiresAt: identity.expiresAt,
            },
          });
          community.broadcast();
        } catch (err) {
          send(ws, {
            type: 'guest-result',
            requestId: message.requestId,
            ok: false,
            error: { code: err.code || 'GUEST_FAILED', message: err.message },
          });
        }
        return;
      }
      if (message.type === 'authenticate') {
        if (++ws.authAttempts > 20) {
          ws.close(4001, 'Muitas tentativas de autenticação');
          return;
        }
        ws.authQueue = (ws.authQueue || Promise.resolve())
          .catch(() => {})
          .then(async () => {
            const priorAccount = ws.account;
            try {
              const account = await accountAuth.identity(message.access_token);
              if (ws.readyState !== WebSocket.OPEN) return;
              if (ws.guest || (priorAccount && priorAccount.id !== account.id)) {
                azulService.disconnect(ws);
                splendorService.disconnect(ws);
                loveLetterService.disconnect(ws);
                leaveRoom(ws, 'account-change');
              }
              if (!priorAccount && account.sessionId)
                for (const other of wss.clients)
                  if (
                    other !== ws &&
                    other.account?.id === account.id &&
                    other.account.sessionId === account.sessionId
                  ) {
                    leaveRoom(other, 'session-reconnected');
                    azulService.disconnect(other);
                    splendorService.disconnect(other);
                    loveLetterService.disconnect(other);
                    other.account = null;
                    other.close(4002, 'Sessão reconectada em outra aba');
                  }
              if (priorAccount?.id !== account.id) ws.activity = null;
              ws.guest = null;
              ws.account = account;
              ws.authAttempts = 0;
              send(ws, {
                type: 'auth-result',
                requestId: message.requestId,
                ok: true,
                user: {
                  id: account.id,
                  nickname: account.nickname,
                  role: account.role,
                  permissions: permissions(account.role),
                },
                expiresAt: account.expiresAt,
              });
              community.note(ws);
              community.broadcast();
              void community.refreshDirectory();
              send(ws, { type: 'chat-channels', channels: safeChatChannels(true) });
              void communityManagement.refreshFor(message.access_token).catch(() => {});
            } catch (err) {
              if (err.status === 401 || err.code === 'EMAIL_NOT_CONFIRMED') {
                azulService.disconnect(ws);
                splendorService.disconnect(ws);
                loveLetterService.disconnect(ws);
                ws.account = null;
                leaveRoom(ws, 'auth-expired');
              }
              send(ws, {
                type: 'auth-result',
                requestId: message.requestId,
                ok: false,
                error: {
                  code: err.code || 'AUTH_UNAVAILABLE',
                  message: err.message || 'Não foi possível entrar.',
                },
              });
            }
          });
        return;
      }
      const publicMessages = ['list-rooms', 'list-chat-channels', 'ping'];
      const publicStatus = message.type === 'sfu-request' && message.action === 'status';
      const gameGuest = community.validGuest(ws);
      const guestActions = [
        'check-name',
        'leave-room',
        'leave-game-room',
        'leave-voice-room',
        'ready',
        'start-room',
        'game-action',
        'chat-message',
        'voice-prepare',
        'voice-fallback',
        'voice-state',
        'voice-signal',
        'state-request',
      ];
      const guestAllowed =
        gameGuest &&
        (message.type === 'presence-request' ||
          message.type === 'check-name' ||
          (['join-room', 'join-game-room'].includes(message.type) &&
            rooms.get(message.roomId)?.kind === 'game') ||
          ((gameRoomFor(ws)?.kind === 'game' || rooms.get(ws.roomId)?.kind === 'game') &&
            guestActions.includes(message.type)));
      if (gameGuest && !guestAllowed && !publicMessages.includes(message.type) && !publicStatus) {
        send(ws, {
          type: 'error',
          code: 'LOGIN_REQUIRED_CHAT',
          message: 'Entre em uma conta para acessar o chat M&N.',
        });
        return;
      }
      if (
        accountAuth.required &&
        !guestAllowed &&
        !publicMessages.includes(message.type) &&
        !publicStatus &&
        (!ws.account || ws.account.expiresAt <= Date.now())
      ) {
        send(ws, {
          type: 'error',
          code: 'AUTH_REQUIRED',
          message: 'Entre na sua conta para continuar.',
        });
        return;
      }
      switch (message.type) {
        case 'azul':
          azulService.handle(ws, message);
          break;
        case 'splendor':
          splendorService.handle(ws, message);
          break;
        case 'love-letter':
          loveLetterService.handle(ws, message);
          break;
        case 'list-rooms':
          send(ws, { type: 'rooms', rooms: safeRooms() });
          break;
        case 'list-chat-channels':
          send(ws, {
            type: 'chat-channels',
            channels: safeChatChannels(!!ws.account && ws.account.expiresAt > Date.now()),
          });
          break;
        case 'presence-request':
          send(ws, community.snapshot(ws));
          break;
        case 'activity-state': {
          const result = community.updateActivity(ws, message.activity);
          if (!result.ok)
            send(ws, {
              type: 'error',
              code: result.code,
              message: 'Não foi possível atualizar a atividade.',
            });
          break;
        }
        case 'check-name': {
          const result = accountNameAvailability(ws, message.name);
          send(ws, {
            type: 'name-check-result',
            requestId: String(message.requestId || ''),
            ...result,
          });
          break;
        }
        case 'join-game-room':
          joinGameRoom(ws, message.roomId, message.name);
          break;
        case 'leave-game-room':
          leaveGameRoom(ws);
          break;
        case 'leave-voice-room':
          leaveVoiceRoom(ws);
          break;
        case 'join-room':
          joinRoom(ws, message.roomId, message.name);
          break;
        case 'join-text-channel':
          joinTextRoom(ws, message.roomId, message.name);
          break;
        case 'leave-room':
          leaveRoom(ws, 'leave');
          break;
        case 'ready':
          setReady(ws, message.ready);
          break;
        case 'start-room':
          requestStart(ws);
          break;
        case 'game-action':
          handleGameAction(ws, message);
          break;
        case 'chat-history-request':
          requestChatHistory(ws, message);
          break;
        case 'chat-message-delete':
        case 'chat-history-clear':
          void handleChatModeration(ws, message);
          break;
        case 'chat-message':
          void handleChatMessage(ws, message.text, message.attachmentId, message.roomId);
          break;
        case 'voice-prepare':
          prepareVoice(ws, message);
          break;
        case 'voice-fallback': {
          const room = rooms.get(ws.roomId);
          if (room?.players.get(ws.clientId)?.voiceJoined) forceRoomP2p(room);
          break;
        }
        case 'voice-state':
          handleVoiceState(ws, message);
          break;
        case 'voice-signal':
          handleVoiceSignal(ws, message);
          break;
        case 'soundboard-play':
          void playSound(ws, message);
          break;
        case 'sfu-request':
          void realtimeSfu.handleRequest(ws, message);
          break;
        case 'state-request': {
          const room = gameRoomFor(ws),
            p = room?.players.get(ws.clientId);
          if (room?.game && p)
            send(ws, { type: 'game-state', state: privateGameState(room, p.seat) });
          break;
        }
        case 'ping':
          send(ws, { type: 'pong', at: Date.now() });
          break;
        default:
          send(ws, {
            type: 'error',
            code: 'UNKNOWN_TYPE',
            message: 'Tipo de mensagem desconhecido.',
          });
      }
    });
    ws.on('close', () => {
      azulService.disconnect(ws);
      splendorService.disconnect(ws);
      loveLetterService.disconnect(ws);
      community.note(ws);
      leaveRoom(ws, 'disconnect');
      community.broadcast();
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (accountAuth.required && ws.account && ws.account.expiresAt <= Date.now()) {
        leaveRoom(ws, 'auth-expired');
        ws.close(4001, 'Sessão expirada');
        continue;
      }
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch {}
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {}
    }
  }, 30000);

  let closePromise;
  function close() {
    if (closePromise) return closePromise;
    clearInterval(heartbeat);
    for (const timer of scheduledTimers) clearTimeout(timer);
    scheduledTimers.clear();
    for (const room of rooms.values()) if (room.game?.turnTimer) clearTimeout(room.game.turnTimer);
    azulService.stop();
    splendorService.stop();
    loveLetterService.stop();
    community.stop();
    communityManagement.stop();
    realtimeSfu.stop();
    for (const client of wss.clients) client.terminate();
    closePromise = new Promise((resolve, reject) => {
      wss.close(() => {
        if (!server.listening) return resolve();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    });
    return closePromise;
  }
  return { app, server, wss, close };
}
module.exports = { createRuntime };
