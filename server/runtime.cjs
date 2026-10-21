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
const { permissions } = require('./roles.ts');
const { createChatService } = require('./chat-service.ts');
const { createThroneService } = require('./throne-service.ts');
const {
  createChannelRooms,
  createManagedChatRoom,
  createChannelService,
} = require('./channel-service.ts');

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
          channels.leaveRoom(ws, 'auth-expired');
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
          channels.updateProfile(ws, account);
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

  const rooms = createChannelRooms();
  const realtimeSfu = new RealtimeSfuManager({
    rooms,
    send,
    broadcastVoiceRoster: (...args) => channels.broadcastVoiceRoster(...args),
    version: VERSION,
  });

  function broadcastAll(payload) {
    for (const client of wss.clients) send(client, payload);
  }
  function send(ws, payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
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
    safeRoom: (...args) => channels.safeRoom(...args),
    broadcastRoom: (...args) => channels.broadcastRoom(...args),
    broadcastRooms: (...args) => channels.broadcastRooms(...args),
    version: VERSION,
    scheduleDelay,
    chooseDecrees,
    random: throneRandom,
  });
  const channels = createChannelService({
    rooms,
    wss,
    send,
    auth: accountAuth,
    sfu: realtimeSfu,
    throne: throneService,
    presenceChanged: () => community.broadcast(),
    nameReserved: (name) => community.nameReserved(name),
    sendHistory: (...args) => chat.sendHistory(...args),
    clearHistory: (room) => chat.reset(room),
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
      chat.attachmentDeleted(row.id, row.room_id);
      broadcastAll({ type: 'attachment-deleted', id: row.id });
    },
  });
  const chat = createChatService({
    rooms,
    wss,
    send,
    history: chatHistory,
    files: fileStorage,
    selectedChatId: (ws) => channels.selectedChatId(ws) || null,
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
    createRoom: createManagedChatRoom,
    db:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        ? fileStorage.db
        : null,
    onChanged: (...args) => channels.broadcastChatChannels(...args),
    onDeleted: (room) => {
      channels.deleteRoom(room);
      chat.reset(room);
    },
    onRoleChanged: (id, role) => {
      for (const ws of wss.clients)
        if (ws.account?.id === id) {
          ws.account.role = role;
          send(ws, { type: 'role-updated', role, permissions: permissions(role) });
          const room = rooms.get(ws.roomId);
          if (room) channels.broadcastRoom(room);
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
      rooms: channels.safeRooms(),
      chatOnlyCount: [...rooms.values()]
        .filter((r) => r.kind === 'chat')
        .reduce((n, r) => n + r.players.size, 0),
      chatChannels: channels.safeChatChannels(),
      realtime: realtimeSfu.publicHealth(),
      uptime: process.uptime(),
    }),
  );
  app.get('/realtime/status', (_req, res) => res.json(realtimeSfu.statusPayload()));
  app.get('/rooms', (_req, res) => res.json({ rooms: channels.safeRooms() }));

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
      rooms: channels.safeRooms(),
      chatChannels: channels.safeChatChannels(),
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
          if (ws.guest?.id !== identity.id) channels.leaveRoom(ws, 'guest-change');
          for (const other of wss.clients)
            if (other !== ws && other.guest?.id === identity.id) {
              channels.leaveRoom(other, 'session-reconnected');
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
                channels.leaveRoom(ws, 'account-change');
              }
              if (!priorAccount && account.sessionId)
                for (const other of wss.clients)
                  if (
                    other !== ws &&
                    other.account?.id === account.id &&
                    other.account.sessionId === account.sessionId
                  ) {
                    channels.leaveRoom(other, 'session-reconnected');
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
              send(ws, { type: 'chat-channels', channels: channels.safeChatChannels(true) });
              void communityManagement.refreshFor(message.access_token).catch(() => {});
            } catch (err) {
              if (err.status === 401 || err.code === 'EMAIL_NOT_CONFIRMED') {
                azulService.disconnect(ws);
                splendorService.disconnect(ws);
                loveLetterService.disconnect(ws);
                ws.account = null;
                channels.leaveRoom(ws, 'auth-expired');
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
          ((channels.gameRoomFor(ws)?.kind === 'game' || rooms.get(ws.roomId)?.kind === 'game') &&
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
          send(ws, { type: 'rooms', rooms: channels.safeRooms() });
          break;
        case 'list-chat-channels':
          send(ws, {
            type: 'chat-channels',
            channels: channels.safeChatChannels(!!ws.account && ws.account.expiresAt > Date.now()),
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
          const result = channels.accountNameAvailability(ws, message.name);
          send(ws, {
            type: 'name-check-result',
            requestId: String(message.requestId || ''),
            ...result,
          });
          break;
        }
        case 'join-game-room':
          channels.joinGameRoom(ws, message.roomId, message.name);
          break;
        case 'leave-game-room':
          channels.leaveGameRoom(ws);
          break;
        case 'leave-voice-room':
          channels.leaveVoiceRoom(ws);
          break;
        case 'join-room':
          channels.joinRoom(ws, message.roomId, message.name);
          break;
        case 'join-text-channel':
          channels.joinTextRoom(ws, message.roomId, message.name);
          break;
        case 'leave-room':
          channels.leaveRoom(ws, 'leave');
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
          chat.requestHistory(ws, message);
          break;
        case 'chat-message-delete':
        case 'chat-history-clear':
          void chat.moderate(ws, message);
          break;
        case 'chat-message':
          void chat.message(ws, message);
          break;
        case 'voice-prepare':
          channels.prepareVoice(ws, message);
          break;
        case 'voice-fallback':
          channels.fallbackVoice(ws);
          break;
        case 'voice-state':
          channels.handleVoiceState(ws, message);
          break;
        case 'voice-signal':
          channels.handleVoiceSignal(ws, message);
          break;
        case 'soundboard-play':
          void playSound(ws, message);
          break;
        case 'sfu-request':
          void realtimeSfu.handleRequest(ws, message);
          break;
        case 'state-request': {
          const room = channels.gameRoomFor(ws),
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
      channels.leaveRoom(ws, 'disconnect');
      community.broadcast();
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (accountAuth.required && ws.account && ws.account.expiresAt <= Date.now()) {
        channels.leaveRoom(ws, 'auth-expired');
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
    chat.stop();
    chatHistory.close();
    const closingSfu = realtimeSfu.stop();
    channels.stop();
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
