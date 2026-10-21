'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { RealtimeSfuManager } = require('./realtime-sfu.ts');
const { createAuth } = require('./auth.ts');
const { createFiles } = require('./files.ts');
const { createCommunity } = require('./community.ts');
const { createChatHistory } = require('./chat-history.ts');
const { createSocialService } = require('./social-service.ts');
const { createAzulService } = require('./azul-service.ts');
const { createSplendorService } = require('./splendor-service.ts');
const { createLoveLetterService } = require('./love-letter-service.ts');
const { createCommunityManagement } = require('./community-management.ts');
const { permissions, CREATOR_EMAIL } = require('./roles.ts');
const { createThroneService } = require('./throne-service.ts');

function createRuntime({
  scheduleDelay = (ms) => ms,
  chooseDecrees,
  throneRandom,
  objectStorage,
  loveLetterRandom,
} = {}) {
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
              throneService.rename(room, player.seat, account.nickname);
              broadcastRoom(room);
              broadcastVoiceRoster(room);
              if (room.game) throneService.broadcastState(room);
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

  const Rules = require('../src/lib/games/throne-rules.ts').throneRules;

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
    version: VERSION,
  });

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
  function broadcastRoom(room) {
    const payload = { type: 'room-state', room: safeRoom(room) };
    for (const p of room.players.values()) send(p.ws, payload);
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

    if (leaving) throneService.disconnect(room, leaving, reason);

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
      send(ws, { type: 'game-state', state: throneService.privateState(room, p.seat) });
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

  const throneService = createThroneService({
    rooms,
    send,
    safeRoom,
    broadcastRoom,
    broadcastRooms,
    version: VERSION,
    scheduleDelay,
    chooseDecrees,
    random: throneRandom,
  });
  const chatHistory = createChatHistory({ auth: accountAuth });
  const fileStorage = createFiles({
    adapter: objectStorage,
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
  const loveLetterService = createLoveLetterService({ wss, send, createRandom: loveLetterRandom });
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
    createRoom: (channel) => ({
      id: channel.id,
      kind: 'chat',
      max: null,
      players: new Map(),
      createdAt: Date.now(),
      game: null,
      chatHistory: [],
      nextSeat: 0,
    }),
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
          throneService.setReady(ws, message.ready);
          break;
        case 'start-room':
          throneService.start(ws);
          break;
        case 'game-action':
          throneService.handle(ws, message);
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
            send(ws, { type: 'game-state', state: throneService.privateState(room, p.seat) });
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
    throneService.stop();
    azulService.stop();
    splendorService.stop();
    loveLetterService.stop();
    socialService.stop();
    community.stop();
    communityManagement.stop();
    chatHistory.close();
    const closingSfu = realtimeSfu.stop();
    accountAuth.stop();
    fileStorage.stop();
    for (const client of wss.clients) client.terminate();
    closePromise = Promise.all([
      closingSfu,
      new Promise((resolve, reject) => {
        wss.close(() => {
          if (!server.listening) return resolve();
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
      }),
    ]).then(() => undefined);
    return closePromise;
  }
  return { app, server, wss, close };
}
module.exports = { createRuntime };
