'use strict';
window.TronoNetwork = (() => {
  const CLIENT_VERSION = '0.13.0-alpha';
  const DEFAULT_BACKEND_HTTP = 'https://a-lei-do-trono-server.onrender.com';
  const normalizeHttp = (url) => String(url || '').replace(/\/+$/, '');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const BACKEND_HTTP = normalizeHttp(
    window.TRONO_BACKEND_URL ||
      (isLocal ? `http://${location.hostname}:10000` : DEFAULT_BACKEND_HTTP),
  );
  const BACKEND_WS = `${BACKEND_HTTP.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`;
  const transport = window.TronoSocketTransport.create({ url: BACKEND_WS });
  let clientId = null,
    currentRoom = null,
    primaryRoom = null,
    gameRoom = null,
    independentGameVoice = false,
    independentTextChannels = false,
    azulSupported = false,
    splendorSupported = false,
    loveLetterSupported = false,
    gameActivitySupported = false,
    authenticatedToken = null,
    authenticatedGuest = null;
  const listeners = new Set();
  const { connect, send } = transport;
  const emit = (msg) =>
    listeners.forEach((fn) => {
      try {
        fn(msg);
      } catch (err) {
        console.warn('[TronoNetwork]', err);
      }
    });
  transport.onMessage((msg) => {
    if (msg.type === 'connection' && !msg.connected) {
      gameActivitySupported = false;
      authenticatedToken = null;
      authenticatedGuest = null;
    }
    if (msg.type === 'welcome') {
      clientId = msg.clientId;
      azulSupported = !!msg.features?.azul;
      splendorSupported = !!msg.features?.splendor;
      loveLetterSupported = !!msg.features?.loveLetter;
      independentTextChannels = !!msg.features?.independentTextChannels;
      independentGameVoice = !!msg.features?.independentGameVoice;
      gameActivitySupported = !!msg.features?.gameActivity;
      if (msg.serverVersion && msg.serverVersion !== CLIENT_VERSION)
        emit({
          type: 'version-mismatch',
          clientVersion: CLIENT_VERSION,
          serverVersion: msg.serverVersion,
        });
    }
    if (msg.type === 'joined-room') {
      primaryRoom = msg.room?.id || null;
      currentRoom = primaryRoom;
      if (msg.room?.kind === 'game') gameRoom = primaryRoom;
    }
    if (msg.type === 'joined-game-room') {
      gameRoom = msg.room.id;
      primaryRoom = msg.primaryRoomId || null;
      currentRoom = msg.chatRoomId || null;
    }
    if (msg.type === 'left-game-room') {
      gameRoom = null;
      primaryRoom = msg.primaryRoomId || null;
      currentRoom = msg.chatRoomId || null;
    }
    if (msg.type === 'left-voice-room') {
      primaryRoom = null;
      currentRoom = msg.chatRoomId || null;
    }
    if (msg.type === 'voice-room-attached') {
      primaryRoom = msg.room.id;
      if (!currentRoom) currentRoom = primaryRoom;
    }
    if (msg.type === 'joined-text-channel') {
      currentRoom = msg.room?.id || null;
      primaryRoom = msg.primaryRoomId || null;
    }
    if (msg.type === 'channel-deleted' && msg.roomId === primaryRoom) primaryRoom = null;
    if (msg.type === 'channel-deleted' && msg.roomId === currentRoom) currentRoom = null;
    emit(msg);
  });

  function responseError(msg, message, code) {
    return Object.assign(new Error(msg.error?.message || message), {
      code: msg.error?.code || code,
      detail: msg.error,
    });
  }
  function authenticate(token) {
    return transport.serializeIdentity((connection) => authenticateNow(token, connection));
  }
  async function authenticateNow(token, connection) {
    if (!token)
      throw Object.assign(new Error('Entre na sua conta para continuar.'), {
        code: 'AUTH_REQUIRED',
      });
    if (!connection.connected) await connection.connect();
    if (!connection.connected) throw new Error('Servidor indisponível. Tente novamente.');
    if (authenticatedToken === token) return window.TronoAuth?.user;
    const msg = await connection.request(
      'authenticate',
      { access_token: token },
      {
        responseType: 'auth-result',
        timeoutMs: 18000,
        timeoutMessage: 'Tempo limite ao entrar na conta.',
        offlineMessage: 'Conexão interrompida.',
      },
    );
    if (msg.ok !== true || !msg.user || typeof msg.user.id !== 'string') {
      authenticatedToken = null;
      throw responseError(msg, 'Entre novamente na sua conta.', 'AUTH_REQUIRED');
    }
    authenticatedToken = token;
    authenticatedGuest = null;
    return msg.user;
  }
  async function ensureAuthenticated() {
    if (!window.TronoAuth) return true; // Only used by isolated older fixtures.
    const token = await window.TronoAuth.getAccessToken();
    if (!token) {
      window.TronoAuth.open('login');
      return false;
    }
    try {
      await authenticate(token);
      return true;
    } catch (err) {
      if (['AUTH_REQUIRED', 'AUTH_EXPIRED', 'INVALID_CREDENTIALS'].includes(err.code))
        window.TronoAuth.expire();
      throw err;
    }
  }
  function authenticateGuest(name, ticket) {
    return transport.serializeIdentity(async (connection) => {
      if (!connection.connected) await connection.connect();
      if (!connection.connected) throw new Error('Servidor indisponível.');
      if (
        authenticatedGuest &&
        authenticatedGuest.ticket === ticket &&
        authenticatedGuest.nickname === name
      )
        return authenticatedGuest;
      const msg = await connection.request(
        'guest-authenticate',
        { name, ticket },
        {
          responseType: 'guest-result',
          timeoutMs: 15000,
          timeoutMessage: 'Tempo limite ao entrar como convidado.',
        },
      );
      if (
        msg.ok !== true ||
        typeof msg.guest?.id !== 'string' ||
        typeof msg.guest.ticket !== 'string' ||
        typeof msg.guest.nickname !== 'string' ||
        !Number.isFinite(msg.guest.expiresAt)
      )
        throw responseError(msg, 'Não foi possível entrar como convidado.', 'GUEST_FAILED');
      authenticatedGuest = msg.guest;
      authenticatedToken = null;
      return msg.guest;
    });
  }
  async function ensureGameIdentity(name) {
    if (window.TronoAuth && !window.TronoAuth.user) {
      return window.TronoAuth.ensureGuest(name);
    }
    return ensureAuthenticated();
  }
  function disconnect() {
    currentRoom = null;
    primaryRoom = null;
    gameRoom = null;
    transport.disconnect();
  }
  async function requestSfu(action, payload = {}, timeoutMs = 18000) {
    const msg = await transport.request(
      'sfu-request',
      { action, payload },
      {
        responseType: 'sfu-response',
        timeoutMs,
        timeoutMessage: 'Tempo limite da operação SFU excedido.',
        timeoutCode: 'SFU_TIMEOUT',
        offlineMessage: 'Não foi possível enviar a operação SFU.',
      },
    );
    if (msg.ok !== true) throw responseError(msg, 'Falha na operação SFU.', 'SFU_ERROR');
    return msg.data;
  }
  async function checkName(name, timeoutMs = 5000) {
    if (!(await ensureGameIdentity(name)))
      return {
        available: false,
        code: 'AUTH_REQUIRED',
        message: 'Entre na sua conta ou escolha um nome de convidado para jogar.',
      };
    if (!transport.connected) await connect();
    if (!transport.connected)
      return {
        available: false,
        name: String(name || ''),
        code: 'NETWORK_OFFLINE',
        message: 'Servidor offline; não foi possível validar o nome.',
      };
    const msg = await transport.request(
      'check-name',
      { name },
      {
        responseType: 'name-check-result',
        timeoutMs,
        timeoutMessage: 'Tempo limite ao validar nome.',
        timeoutCode: 'NAME_CHECK_TIMEOUT',
      },
    );
    if (typeof msg.available !== 'boolean')
      throw Object.assign(new Error('Resposta inválida ao validar nome.'), {
        code: 'INVALID_RESPONSE',
      });
    return msg;
  }
  async function joinRoom(roomId, name) {
    if (!(await (roomId.startsWith('sala-') ? ensureGameIdentity(name) : ensureAuthenticated())))
      return false;
    if (!transport.connected) await connect();
    if (transport.connected)
      send(roomId.startsWith('sala-') && independentGameVoice ? 'join-game-room' : 'join-room', {
        roomId,
        name,
      });
    return transport.connected;
  }
  async function joinTextChannel(roomId, name) {
    if (!(await ensureAuthenticated())) return false;
    if (!independentTextChannels)
      throw new Error('Atualize o backend no Render para abrir texto sem sair da voz.');
    return send('join-text-channel', { roomId, name });
  }
  function leaveRoom() {
    if (currentRoom || primaryRoom || gameRoom) send('leave-room');
    currentRoom = null;
    primaryRoom = null;
    gameRoom = null;
  }
  function leaveGameRoom() {
    return independentGameVoice ? send('leave-game-room') : leaveRoom();
  }
  function leaveVoiceRoom() {
    return independentGameVoice ? send('leave-voice-room') : leaveRoom();
  }
  const api = {
    async ensureLoveLetter() {
      if (!(await ensureAuthenticated())) return false;
      if (!loveLetterSupported) throw new Error('Atualize o backend para jogar Love Letter.');
      return true;
    },
    loveLetter: (action, payload = {}) =>
      loveLetterSupported && send('love-letter', { action, ...payload }),
    async ensureSplendor() {
      if (!(await ensureAuthenticated())) return false;
      if (!splendorSupported)
        throw new Error(
          'Splendor ainda não está disponível nesta conexão. Tente novamente após a atualização do servidor.',
        );
      return true;
    },
    splendor: (action, payload = {}) =>
      splendorSupported && send('splendor', { action, ...payload }),
    async ensureAzul() {
      if (!(await ensureAuthenticated())) return false;
      if (!azulSupported) throw new Error('Atualize o backend no Render para habilitar Azul.');
      return true;
    },
    azul: (action, payload = {}) => azulSupported && send('azul', { action, ...payload }),
    connect,
    authenticate,
    authenticateGuest,
    disconnect,
    joinRoom,
    joinTextChannel,
    leaveRoom,
    leaveGameRoom,
    leaveVoiceRoom,
    joinChatOnly: (name) => joinRoom('chat-livre', name),
    joinChatChannel: (id, name) => joinRoom(id, name),
    requestChatChannels: () => send('list-chat-channels'),
    requestPresence: () => send('presence-request'),
    setActivity: (activity) => gameActivitySupported && send('activity-state', { activity }),
    get gameActivitySupported() {
      return gameActivitySupported;
    },
    requestRooms: () => send('list-rooms'),
    setReady: (r) => send('ready', { ready: !!r }),
    startRoom: () => send('start-room'),
    gameAction: (action, payload = {}) => send('game-action', { action, payload }),
    requestState: () => send('state-request'),
    ping: () => send('ping'),
    requestChatHistory: (before) => send('chat-history-request', { roomId: currentRoom, before }),
    deleteChatMessage: (id, requestId) =>
      !!currentRoom && send('chat-message-delete', { roomId: currentRoom, id, requestId }),
    clearChatHistory: (requestId) =>
      !!currentRoom && send('chat-history-clear', { roomId: currentRoom, requestId }),
    sendChat: (text, attachmentId) =>
      !!currentRoom && send('chat-message', { roomId: currentRoom, text, attachmentId }),
    async prepareVoice() {
      if (
        !(await ((primaryRoom || gameRoom)?.startsWith('sala-')
          ? ensureGameIdentity()
          : ensureAuthenticated()))
      )
        throw new Error('Entre na sua conta ou como convidado do jogo.');
      const msg = await transport.request(
        'voice-prepare',
        {},
        {
          responseType: 'sfu-response',
          timeoutMs: 15000,
          timeoutMessage: 'Não foi possível sincronizar a chamada.',
        },
      );
      if (msg.ok !== true) throw responseError(msg, 'Falha na operação SFU.', 'SFU_ERROR');
      return msg.data;
    },
    fallbackVoice: () => send('voice-fallback'),
    setVoiceState: (
      joined,
      muted = false,
      camera = false,
      screen = false,
      quality = 'balanced',
      transport = 'p2p',
    ) =>
      send('voice-state', {
        joined: !!joined,
        muted: !!muted,
        deafened: !!joined && !!window.TronoSocial?.deafened,
        camera: !!camera,
        screen: !!screen,
        quality,
        transport,
        screenFps: window.TronoSocial?.screenSettings?.fps || 30,
      }),
    playSound: (fileId) => send('soundboard-play', { fileId }),
    sendVoiceSignal: (targetId, signalType, data) =>
      send('voice-signal', { targetId, signalType, data }),
    requestSfu,
    getRealtimeStatus: () => requestSfu('status', {}, 8000),
    checkName,
    onMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    BACKEND_HTTP,
    BACKEND_WS,
    CLIENT_VERSION,
    get connected() {
      return transport.connected;
    },
    get clientId() {
      return clientId;
    },
    get currentRoom() {
      return currentRoom;
    },
    get primaryRoom() {
      return primaryRoom;
    },
    get gameRoom() {
      return gameRoom;
    },
    get independentGameVoice() {
      return independentGameVoice;
    },
  };
  return api;
})();
