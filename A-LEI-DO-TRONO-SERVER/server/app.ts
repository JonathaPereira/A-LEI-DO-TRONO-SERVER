import express from 'express';
import { createMobilePush } from './mobile-push.ts';
import http from 'node:http';
import { WebSocketServer, type Server as SocketServer } from 'ws';
import { BackendSocket, createSocketGateway, sendSocket as send } from './socket-gateway.ts';
import { RealtimeSfuManager } from './realtime-sfu.ts';
import { createAuth } from './auth.ts';
import { createFiles } from './files.ts';
import { createCommunity } from './community.ts';
import { createChatHistory } from './chat-history.ts';
import { createSocialService } from './social-service.ts';
import { createAzulService } from './azul-service.ts';
import { createSplendorService } from './splendor-service.ts';
import { createSimiloService } from './similo-service.ts';
import { createLoveLetterService } from './love-letter-service.ts';
import { createTicketToRideService } from './ticket-to-ride-service.ts';
import { RemotePc } from './remote-pc.ts';
import { createCommunityManagement } from './community-management.ts';
import { permissions } from './roles.ts';
import { createChatService } from './chat-service.ts';
import { createVoiceSoundboard } from './voice-soundboard.ts';
import { createThroneService } from './throne-service.ts';
import {
  createChannelRooms,
  createManagedChatRoom,
  createChannelService,
} from './channel-service.ts';
import { serverFeatures } from './capabilities.ts';
import type { Express } from 'express';
import type { Server } from 'node:http';
import type { ObjectStorage } from './files-contract';
export interface ApplicationOptions {
  scheduleDelay?(ms: number): number;
  chooseDecrees?: Parameters<typeof createThroneService>[0]['chooseDecrees'];
  throneRandom?(): number;
  objectStorage?: ObjectStorage;
  similoRandom?: Parameters<typeof createSimiloService>[0]['createRandom'];
  loveLetterRandom?: Parameters<typeof createLoveLetterService>[0]['createRandom'];
}
export interface BackendApplication {
  app: Express;
  server: Server;
  wss: SocketServer<typeof BackendSocket>;
  close(): Promise<void>;
}
export function createApplication({
  scheduleDelay = (ms) => ms,
  chooseDecrees,
  throneRandom,
  objectStorage,
  loveLetterRandom,
  similoRandom,
}: ApplicationOptions = {}): BackendApplication {
  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
  const accountAuth = createAuth({
    onRevoke: (event) => gateway.revoke(event),
    onProfileChange: (account) => gateway.profileChanged(account),
  });
  accountAuth.install(app, express);
  const server = http.createServer(app);
  const wss = new WebSocketServer<typeof BackendSocket>({
    WebSocket: BackendSocket,
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
    verifyClient: (info: { origin: string }) =>
      !info.origin || !accountAuth.required || accountAuth.allowedOrigins.has(info.origin),
  });

  const VERSION = '0.14.0-alpha';

  const rooms = createChannelRooms();
  const realtimeSfu = new RealtimeSfuManager({
    rooms,
    send,
    broadcastVoiceRoster: (room) => {
      const current = rooms.get(room.id);
      if (current === room) channels.broadcastVoiceRoster(current);
    },
    version: VERSION,
  });
  const remotePc = new RemotePc({
    rooms,
    send,
    ice: () =>
      realtimeSfu._turnIceServers().catch(() => ({
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
        turn: false,
      })),
  });
  const remoteSweep = setInterval(() => remotePc.sweep(), 2000);
  remoteSweep.unref?.();

  function broadcastAll(payload: unknown) {
    for (const client of wss.clients) send(client, payload);
  }
  const throneService = createThroneService({
    rooms,
    send,
    safeRoom: (room) => {
      const current = rooms.get(room.id);
      return current === room ? channels.safeRoom(current) : null;
    },
    broadcastRoom: (room) => {
      const current = rooms.get(room.id);
      if (current === room) channels.broadcastRoom(current);
    },
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
    remotePc,
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
            ws.account &&
            ws.account.expiresAt > Date.now() &&
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
  const soundboard = createVoiceSoundboard({
    files: fileStorage,
    participation: (ws) => channels.voiceParticipation(ws),
    send,
  });
  const community = createCommunity({ wss, rooms, send, auth: accountAuth });
  const azulService = createAzulService({ auth: accountAuth, wss, send });
  const splendorService = createSplendorService({ auth: accountAuth, wss, send });
  const loveLetterService = createLoveLetterService({ wss, send, createRandom: loveLetterRandom });
  const similoService = createSimiloService({ wss, send, createRandom: similoRandom });
  const ticketToRideService = createTicketToRideService({ wss, send });
  const mobilePush = createMobilePush({
    auth: accountAuth,
    db:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        ? fileStorage.db
        : null,
  });
  mobilePush.install(app, express);
  const socialService = createSocialService({
    auth: accountAuth,
    wss,
    send,
    rooms,
    files: fileStorage,
    push: mobilePush.deliver,
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
          const room = rooms.get(ws.roomId || '');
          if (room) {
            channels.broadcastRoom(room);
            channels.broadcastVoiceRoster(room);
          }
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
      features: serverFeatures,
      auth: accountAuth.health(),
      files: fileStorage.health(),
      presence: community.health(),
      chatHistory: chatHistory.health(),
      social: socialService.health(),
      androidPush: mobilePush.health(),
      azul: azulService.health(),
      splendor: splendorService.health(),
      loveLetter: loveLetterService.health(),
      similo: similoService.health(),
      ticketToRide: ticketToRideService.health(),
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

  const gateway = createSocketGateway({
    wss,
    auth: accountAuth,
    rooms,
    channels,
    throne: throneService,
    azul: azulService,
    splendor: splendorService,
    loveLetter: loveLetterService,
    similo: similoService,
    ticketToRide: ticketToRideService,
    remotePc,
    community,
    communityManagement,
    chat,
    soundboard,
    sfu: realtimeSfu,
    version: VERSION,
  });
  let closePromise: Promise<void> | undefined;
  function close() {
    if (closePromise) return closePromise;
    clearInterval(remoteSweep);
    remotePc.stop();
    gateway.stop();
    throneService.stop();
    azulService.stop();
    splendorService.stop();
    loveLetterService.stop();
    similoService.stop();
    ticketToRideService.stop();
    socialService.stop();
    mobilePush.stop();
    community.stop();
    communityManagement.stop();
    soundboard.stop();
    chat.stop();
    chatHistory.close();
    const closingSfu = realtimeSfu.stop();
    channels.stop();
    accountAuth.stop();
    fileStorage.stop();
    closePromise = Promise.all([
      closingSfu,
      new Promise<void>((resolve, reject) => {
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
