import type { MediaTransport } from '../../types/domain';
import type {
  GuestIdentity,
  NameAvailability,
  NetworkAccount,
  NetworkIdentity,
  VoiceContext,
} from '../../types/network';
import type { SocketIdentityConnection, SocketMessage, SocketTransport } from '../../types/socket';
import { createNetworkState } from './state.ts';
import {
  parseStateEvent,
  readAccount,
  readGuest,
  readNameAvailability,
  readPreparedVoice,
  responseError,
} from './protocol.ts';

export const CLIENT_VERSION = '0.13.0-alpha';

export function backendWebSocketUrl(http: string): string {
  return `${http.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`;
}

interface NetworkClientOptions {
  backendHttp: string;
  transport: SocketTransport;
  getIdentity?: () => NetworkIdentity | null;
  getVoiceContext?: () => VoiceContext;
  warn?: (error: unknown) => void;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
}

/** Domain commands share one transport and one membership state; this module has no DOM. */
export function createNetworkClient({
  backendHttp,
  transport,
  getIdentity = () => null,
  getVoiceContext = () => ({}),
  warn = (error) => console.warn('[TronoNetwork]', error),
}: NetworkClientOptions) {
  const BACKEND_HTTP = backendHttp;
  const BACKEND_WS = backendWebSocketUrl(backendHttp);
  const state = createNetworkState(warn);
  let authenticatedToken: string | null = null;
  let authenticatedAccount: NetworkAccount | null = null;
  let authenticatedGuest: GuestIdentity | null = null;
  const listeners = new Set<(message: SocketMessage) => void>();
  const { connect, send } = transport;
  const emit = (message: SocketMessage) => {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        warn(error);
      }
    }
  };
  transport.onMessage((message) => {
    try {
      const event = parseStateEvent(message);
      if (event) state.apply(event);
      if (event?.type === 'connection' && !event.connected) {
        authenticatedToken = null;
        authenticatedAccount = null;
        authenticatedGuest = null;
      }
      if (
        event?.type === 'welcome' &&
        event.serverVersion &&
        event.serverVersion !== CLIENT_VERSION
      )
        emit({
          type: 'version-mismatch',
          clientVersion: CLIENT_VERSION,
          serverVersion: event.serverVersion,
        });
    } catch (error) {
      warn(error);
      return;
    }
    // Keep full payloads (including other negotiated capabilities) for unconverted consumers.
    emit(message);
  });
  function authenticate(token: string) {
    return transport.serializeIdentity((connection) => authenticateNow(token, connection));
  }
  async function authenticateNow(
    token: string,
    connection: SocketIdentityConnection,
  ): Promise<NetworkAccount> {
    if (!token)
      throw Object.assign(new Error('Entre na sua conta para continuar.'), {
        code: 'AUTH_REQUIRED',
      });
    if (!connection.connected) await connection.connect();
    if (!connection.connected) throw new Error('Servidor indisponível. Tente novamente.');
    if (authenticatedToken === token && authenticatedAccount)
      return getIdentity()?.user ?? authenticatedAccount;
    authenticatedToken = null;
    authenticatedAccount = null;
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
    if (msg.ok !== true) {
      authenticatedToken = null;
      throw responseError(msg, 'Entre novamente na sua conta.', 'AUTH_REQUIRED');
    }
    const account = readAccount(msg.user);
    authenticatedAccount = account;
    authenticatedToken = token;
    authenticatedGuest = null;
    return account;
  }
  async function ensureAuthenticated() {
    const identity = getIdentity();
    if (!identity) return true; // Compatibility with isolated clients without account UI.
    const token = await identity.getAccessToken();
    if (!token) {
      identity.open('login');
      return false;
    }
    try {
      await authenticate(token);
      return true;
    } catch (err) {
      if (['AUTH_REQUIRED', 'AUTH_EXPIRED', 'INVALID_CREDENTIALS'].includes(errorCode(err)))
        identity.expire();
      throw err;
    }
  }
  function authenticateGuest(name: string, ticket?: string): Promise<GuestIdentity> {
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
      if (msg.ok !== true)
        throw responseError(msg, 'Não foi possível entrar como convidado.', 'GUEST_FAILED');
      authenticatedAccount = null;
      authenticatedToken = null;
      authenticatedGuest = null;
      authenticatedGuest = readGuest(msg.guest);
      return authenticatedGuest;
    });
  }
  async function ensureGameIdentity(name?: string) {
    const identity = getIdentity();
    if (identity && !identity.user) return identity.ensureGuest(name);
    return ensureAuthenticated();
  }
  function disconnect() {
    state.clearMembership();
    transport.disconnect();
  }
  async function requestSfu(
    action: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 18000,
  ): Promise<unknown> {
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
  async function checkName(name?: string, timeoutMs = 5000): Promise<NameAvailability> {
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
    return readNameAvailability(msg);
  }
  async function joinRoom(roomId: string, name?: string, current: () => boolean = () => true) {
    if (!current()) return false;
    if (!(await (roomId.startsWith('sala-') ? ensureGameIdentity(name) : ensureAuthenticated())))
      return false;
    if (!current()) return false;
    if (!transport.connected) await connect();
    if (!current()) return false;
    if (transport.connected)
      send(
        roomId.startsWith('sala-') && state.getSnapshot().features.independentGameVoice
          ? 'join-game-room'
          : 'join-room',
        {
          roomId,
          name,
        },
      );
    return transport.connected;
  }
  async function joinTextChannel(roomId: string, name?: string) {
    if (!(await ensureAuthenticated())) return false;
    if (!state.getSnapshot().features.independentTextChannels)
      throw new Error('Atualize o backend no Render para abrir texto sem sair da voz.');
    return send('join-text-channel', { roomId, name });
  }
  function leaveRoom() {
    if (
      state.getSnapshot().currentRoom ||
      state.getSnapshot().primaryRoom ||
      state.getSnapshot().gameRoom
    )
      send('leave-room');
    state.clearMembership();
  }
  function leaveGameRoom() {
    return state.getSnapshot().features.independentGameVoice
      ? send('leave-game-room')
      : leaveRoom();
  }
  function leaveVoiceRoom() {
    return state.getSnapshot().features.independentGameVoice
      ? send('leave-voice-room')
      : leaveRoom();
  }
  const api = {
    async ensureLoveLetter() {
      if (!(await ensureAuthenticated())) return false;
      if (!state.getSnapshot().features.loveLetter)
        throw new Error('Atualize o backend para jogar Love Letter.');
      return true;
    },
    loveLetter: (action: string, payload: Record<string, unknown> = {}) =>
      state.getSnapshot().features.loveLetter && send('love-letter', { action, ...payload }),
    async ensureSplendor() {
      if (!(await ensureAuthenticated())) return false;
      if (!state.getSnapshot().features.splendor)
        throw new Error(
          'Splendor ainda não está disponível nesta conexão. Tente novamente após a atualização do servidor.',
        );
      return true;
    },
    splendor: (action: string, payload: Record<string, unknown> = {}) =>
      state.getSnapshot().features.splendor && send('splendor', { action, ...payload }),
    async ensureAzul() {
      if (!(await ensureAuthenticated())) return false;
      if (!state.getSnapshot().features.azul)
        throw new Error('Atualize o backend no Render para habilitar Azul.');
      return true;
    },
    azul: (action: string, payload: Record<string, unknown> = {}) =>
      state.getSnapshot().features.azul && send('azul', { action, ...payload }),
    connect,
    authenticate,
    authenticateGuest,
    disconnect,
    joinRoom,
    joinTextChannel,
    leaveRoom,
    leaveGameRoom,
    leaveVoiceRoom,
    joinChatOnly: (name?: string) => joinRoom('chat-livre', name),
    joinChatChannel: (id: string, name?: string) => joinRoom(id, name),
    requestChatChannels: () => send('list-chat-channels'),
    requestPresence: () => send('presence-request'),
    setActivity: (activity: { name: string } | null) =>
      state.getSnapshot().features.gameActivity && send('activity-state', { activity }),
    get gameActivitySupported() {
      return state.getSnapshot().features.gameActivity;
    },
    requestRooms: () => send('list-rooms'),
    setReady: (r: boolean) => send('ready', { ready: !!r }),
    startRoom: () => send('start-room'),
    gameAction: (action: string, payload: Record<string, unknown> = {}) =>
      send('game-action', { action, payload }),
    requestState: () => send('state-request'),
    ping: () => send('ping'),
    requestChatHistory: (before?: string) =>
      send('chat-history-request', { roomId: state.getSnapshot().currentRoom, before }),
    deleteChatMessage: (id: string, requestId?: string) =>
      !!state.getSnapshot().currentRoom &&
      send('chat-message-delete', { roomId: state.getSnapshot().currentRoom, id, requestId }),
    clearChatHistory: (requestId?: string) =>
      !!state.getSnapshot().currentRoom &&
      send('chat-history-clear', { roomId: state.getSnapshot().currentRoom, requestId }),
    sendChat: (text: string, attachmentId?: string) =>
      !!state.getSnapshot().currentRoom &&
      send('chat-message', { roomId: state.getSnapshot().currentRoom, text, attachmentId }),
    async prepareVoice() {
      if (
        !(await ((state.getSnapshot().primaryRoom || state.getSnapshot().gameRoom)?.startsWith(
          'sala-',
        )
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
      return readPreparedVoice(msg.data);
    },
    fallbackVoice: () => send('voice-fallback'),
    setVoiceState: (
      joined: boolean,
      muted = false,
      camera = false,
      screen = false,
      quality = 'balanced',
      mediaTransport: MediaTransport = 'p2p',
    ) =>
      send('voice-state', {
        joined: !!joined,
        muted: !!muted,
        deafened: !!joined && !!getVoiceContext().deafened,
        camera: !!camera,
        screen: !!screen,
        quality,
        transport: mediaTransport,
        screenFps: getVoiceContext().screenSettings?.fps || 30,
      }),
    playSound: (fileId: string) => send('soundboard-play', { fileId }),
    sendVoiceSignal: (targetId: string, signalType: string, data: unknown) =>
      send('voice-signal', { targetId, signalType, data }),
    requestSfu,
    getRealtimeStatus: () => requestSfu('status', {}, 8000),
    checkName,
    onMessage(fn: (message: SocketMessage) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    BACKEND_HTTP,
    BACKEND_WS,
    CLIENT_VERSION,
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    get connected() {
      return transport.connected;
    },
    get clientId() {
      return state.getSnapshot().clientId;
    },
    get currentRoom() {
      return state.getSnapshot().currentRoom;
    },
    get primaryRoom() {
      return state.getSnapshot().primaryRoom;
    },
    get gameRoom() {
      return state.getSnapshot().gameRoom;
    },
    get independentGameVoice() {
      return state.getSnapshot().features.independentGameVoice;
    },
  };
  return api;
}

export type NetworkClient = ReturnType<typeof createNetworkClient>;
