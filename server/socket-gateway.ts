import { socketFeatures } from './capabilities.ts';
import WebSocket, { type Server as SocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  readSocketEnvelope,
  readSocketGuest,
  socketFailure as publicFailure,
} from './socket-protocol.ts';
import { withAbort } from './abortable.ts';
import { permissions } from './roles.ts';
import type { BackendAccount } from './auth-contract';
import type { GuestIdentity } from './sessions';
import type { ChannelConnection, ChannelRoom } from './channel-contract';
import type { createAuth } from './auth';
import type { createChannelService } from './channel-service';
import type { createThroneService } from './throne-service';
import type { createAzulService } from './azul-service';
import type { createSplendorService } from './splendor-service';
import type { createLoveLetterService } from './love-letter-service';
import type { createTicketToRideService } from './ticket-to-ride-service';
import type { createCommunity } from './community';
import type { createCommunityManagement } from './community-management';
import type { createChatService } from './chat-service';
import type { createVoiceSoundboard } from './voice-soundboard';
import type { RealtimeSfuManager } from './realtime-sfu';
import type { RemotePc } from './remote-pc';
export class BackendSocket extends WebSocket implements ChannelConnection {
  clientId = randomUUID();
  roomId: string | null = null;
  textRoomId: string | null = null;
  gameRoomId: string | null = null;
  independentGames = false;
  account: BackendAccount | null = null;
  guest: GuestIdentity | null = null;
  isAlive = true;
  activity: { name: string; startedAt: number; seenAt: number } | null = null;
  authAttempts = 0;
  authQueue?: Promise<void>;
  guestRate?: { count: number; until: number };
  readonly identityScope = new AbortController();
}
export function sendSocket(connection: unknown, payload: unknown): void {
  if (connection instanceof WebSocket && connection.readyState === WebSocket.OPEN) {
    const serialized = JSON.stringify(payload);
    if (serialized !== undefined) connection.send(serialized);
  }
}
interface Options {
  wss: SocketServer<typeof BackendSocket>;
  auth: ReturnType<typeof createAuth>;
  rooms: ReadonlyMap<string, ChannelRoom>;
  channels: ReturnType<typeof createChannelService>;
  throne: ReturnType<typeof createThroneService>;
  azul: ReturnType<typeof createAzulService>;
  splendor: ReturnType<typeof createSplendorService>;
  loveLetter: ReturnType<typeof createLoveLetterService>;
  ticketToRide: ReturnType<typeof createTicketToRideService>;
  remotePc: RemotePc;
  community: ReturnType<typeof createCommunity>;
  communityManagement: ReturnType<typeof createCommunityManagement>;
  chat: ReturnType<typeof createChatService>;
  soundboard: ReturnType<typeof createVoiceSoundboard>;
  sfu: RealtimeSfuManager;
  version: string;
}
/** Owns one set of socket listeners, identity operations and heartbeat per application. */
export function createSocketGateway({
  wss,
  auth: accountAuth,
  rooms,
  channels,
  throne: throneService,
  azul: azulService,
  splendor: splendorService,
  loveLetter: loveLetterService,
  ticketToRide: ticketToRideService,
  remotePc,
  community,
  communityManagement,
  chat,
  soundboard,
  sfu: realtimeSfu,
  version: VERSION,
}: Options) {
  let closed = false;
  const send = sendSocket;
  function queueIdentity(ws: BackendSocket, operation: () => void | Promise<void>) {
    const task = (ws.authQueue || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (closed || ws.identityScope.signal.aborted || ws.readyState !== WebSocket.OPEN) return;
        await operation();
      });
    ws.authQueue = task;
    void task
      .finally(() => {
        if (ws.authQueue === task) ws.authQueue = undefined;
      })
      .catch(() => {});
  }
  function onConnection(ws: BackendSocket) {
    if (closed) {
      ws.terminate();
      return;
    }
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    send(ws, {
      type: 'welcome',
      clientId: ws.clientId,
      rooms: channels.safeRooms(),
      chatChannels: channels.safeChatChannels(),
      serverVersion: VERSION,
      features: socketFeatures,
      auth: accountAuth.health(),
      realtime: realtimeSfu.publicHealth(),
    });
    ws.on('message', (raw) => {
      if (closed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', code: 'BAD_JSON', message: 'Mensagem inválida.' });
        return;
      }
      const message = readSocketEnvelope(parsed);
      if (!message) {
        send(ws, { type: 'error', code: 'BAD_JSON', message: 'Mensagem inválida.' });
        return;
      }
      if (message.type === 'guest-authenticate') {
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
        const guestInput = readSocketGuest(message);
        if (!guestInput) {
          send(ws, {
            type: 'guest-result',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'INVALID_NICKNAME',
              message: 'Escolha um nome válido para o convidado.',
            },
          });
          return;
        }
        queueIdentity(ws, () => {
          try {
            const identity = community.guest(ws, guestInput);
            if (ws.account) {
              azulService.disconnect(ws);
              splendorService.disconnect(ws);
              loveLetterService.disconnect(ws);
              ticketToRideService.disconnect(ws);
            }
            if (ws.guest?.id !== identity.id) channels.leaveRoom(ws, 'guest-change');
            for (const other of wss.clients)
              if (other !== ws && other.guest?.id === identity.id) {
                channels.leaveRoom(other, 'session-reconnected');
                other.guest = null;
                other.identityScope.abort();
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
              error: {
                code: publicFailure(err, 'GUEST_FAILED').code,
                message: publicFailure(err).message,
              },
            });
          }
        });
        return;
      }
      if (message.type === 'authenticate') {
        if (++ws.authAttempts > 20) {
          ws.close(4001, 'Muitas tentativas de autenticação');
          return;
        }
        queueIdentity(ws, async () => {
          const priorAccount = ws.account;
          try {
            const account = await withAbort(
              accountAuth.identity(
                typeof message.access_token === 'string' ? message.access_token : '',
                ws.identityScope.signal,
              ),
              ws.identityScope.signal,
            );
            if (closed || ws.readyState !== WebSocket.OPEN) return;
            if (ws.guest || (priorAccount && priorAccount.id !== account.id)) {
              azulService.disconnect(ws);
              splendorService.disconnect(ws);
              loveLetterService.disconnect(ws);
              ticketToRideService.disconnect(ws);
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
                  ticketToRideService.disconnect(other);
                  other.account = null;
                  other.identityScope.abort();
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
            void communityManagement
              .refreshFor(typeof message.access_token === 'string' ? message.access_token : '')
              .catch(() => {});
          } catch (err) {
            if (closed || ws.readyState !== WebSocket.OPEN) return;
            if (
              publicFailure(err).status === 401 ||
              publicFailure(err).code === 'EMAIL_NOT_CONFIRMED'
            ) {
              azulService.disconnect(ws);
              splendorService.disconnect(ws);
              loveLetterService.disconnect(ws);
              ticketToRideService.disconnect(ws);
              ws.account = null;
              channels.leaveRoom(ws, 'auth-expired');
            }
            send(ws, {
              type: 'auth-result',
              requestId: message.requestId,
              ok: false,
              error: {
                code: publicFailure(err).code || 'AUTH_UNAVAILABLE',
                message: publicFailure(err).message || 'Não foi possível entrar.',
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
            rooms.get(typeof message.roomId === 'string' ? message.roomId : '')?.kind === 'game') ||
          ((channels.gameRoomFor(ws)?.kind === 'game' ||
            rooms.get(ws.roomId || '')?.kind === 'game') &&
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
        case 'ticket-to-ride':
          ticketToRideService.handle(ws, message);
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
        case 'voice-moderate':
          channels.moderateVoice(ws, message);
          break;
        case 'voice-state':
          channels.handleVoiceState(ws, message);
          break;
        case 'voice-signal':
          channels.handleVoiceSignal(ws, message);
          break;
        case 'soundboard-play':
          void soundboard.play(ws, message);
          break;
        case 'remote-pc':
          void remotePc.handle(ws, message);
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
      if (closed) return;
      ws.identityScope.abort();
      azulService.disconnect(ws);
      splendorService.disconnect(ws);
      loveLetterService.disconnect(ws);
      ticketToRideService.disconnect(ws);
      community.note(ws);
      channels.leaveRoom(ws, 'disconnect');
      community.broadcast();
    });
    ws.on('error', () => {});
  }
  wss.on('connection', onConnection);

  const heartbeat = setInterval(() => {
    if (closed) return;
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

  return {
    revoke(event: { userId: string; sessionId?: string; all: boolean }) {
      if (closed) return;
      for (const ws of wss.clients)
        if (
          ws.account?.id === event.userId &&
          (event.all || ws.account.sessionId === event.sessionId)
        ) {
          azulService.disconnect(ws);
          splendorService.disconnect(ws);
          loveLetterService.disconnect(ws);
          ticketToRideService.disconnect(ws);
          ws.account = null;
          ws.identityScope.abort();
          channels.leaveRoom(ws, 'auth-expired');
          send(ws, {
            type: 'error',
            code: 'AUTH_REQUIRED',
            message: 'Sua sessão foi encerrada. Entre novamente.',
          });
          ws.close(4001, 'Sessão encerrada');
        }
    },

    profileChanged(account: BackendAccount) {
      if (closed) return;
      azulService.updateAccount(account);
      splendorService.updateAccount(account);
      loveLetterService.updateAccount(account);
      ticketToRideService.updateAccount(account);
      for (const ws of wss.clients)
        if (ws.account?.id === account.id) {
          ws.account = { ...ws.account, ...account };
          channels.updateProfile(ws, account);
        }
      for (const ws of wss.clients)
        if (ws.account && ws.account.expiresAt > Date.now())
          send(ws, { type: 'member-profile-updated', accountId: account.id });
      community.broadcast();
    },

    stop() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      wss.removeListener('connection', onConnection);
      for (const ws of wss.clients) {
        ws.identityScope.abort();
        ws.terminate();
      }
    },
  };
}
