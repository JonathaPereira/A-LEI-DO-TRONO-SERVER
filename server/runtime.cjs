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

  function sanitizeChat(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 300);
  }
  function broadcastAll(payload) {
    for (const client of wss.clients) send(client, payload);
  }
  function send(ws, payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }
  async function handleChatMessage(ws, rawText, attachmentId, requestedRoomId) {
    const room = rooms.get(channels.selectedChatId(ws)),
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
        if (channels.selectedChatId(ws) !== room.id || room.players.get(player.id) !== player)
          return;
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
        if (channels.selectedChatId(ws) !== room.id || room.players.get(ws.clientId)?.ws !== ws)
          return;
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
    const room = rooms.get(channels.selectedChatId(ws));
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
      channels.selectedChatId(ws) !== room.id ||
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
          channels.selectedChatId(ws) !== room.id ||
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
    sendHistory: sendChatHistory,
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
    createRoom: createManagedChatRoom,
    db:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        ? fileStorage.db
        : null,
    onChanged: (...args) => channels.broadcastChatChannels(...args),
    onDeleted: (room) => channels.deleteRoom(room),
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
