import crypto from 'node:crypto';
import type { BackendAccount } from './auth-contract';
import type { ManagedChannel } from './management-protocol';
import type { RealtimeSfuManager } from './realtime-sfu';
import type { createThroneService } from './throne-service';
import type { ChannelConnection, ChannelRoom, ChannelMember } from './channel-contract';
import { object } from './http-api.ts';
import { readVoiceState, readVoiceSignal, roomId as validRoomId } from './channel-protocol.ts';
type WireEvent = { type: string; [key: string]: unknown };
interface Options {
  rooms: Map<string, ChannelRoom>;
  wss: { clients: Iterable<ChannelConnection> };
  send(ws: ChannelConnection, message: WireEvent): void;
  auth: { required: boolean };
  sfu: Pick<
    RealtimeSfuManager,
    | 'cleanupClient'
    | 'statusPayload'
    | 'notePlayerQuality'
    | 'broadcastStatus'
    | 'broadcastPublications'
  >;
  throne: Pick<
    ReturnType<typeof createThroneService>,
    'disconnect' | 'privateState' | 'rename' | 'broadcastState'
  >;
  presenceChanged(): void;
  nameReserved(name: string): boolean;
  sendHistory(ws: ChannelConnection, room: ChannelRoom): Promise<void>;
}
export function createChannelRooms(): Map<string, ChannelRoom> {
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

  const rooms = new Map<string, ChannelRoom>(
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

  return rooms;
}
export function createManagedChatRoom(channel: ManagedChannel): ChannelRoom {
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    channelType: channel.channel_type,
    kind: 'chat',
    max: null,
    players: new Map(),
    createdAt: Date.now(),
    game: null,
    chatHistory: [],
    nextSeat: 0,
  };
}
/** Owns text/voice/game membership and room voice coordination on the existing socket. */
export function createChannelService({
  rooms,
  wss,
  send,
  auth: accountAuth,
  sfu: realtimeSfu,
  throne: throneService,
  presenceChanged,
  nameReserved,
  sendHistory: sendChatHistory,
}: Options) {
  let closed = false;
  const roomFor = (id: unknown) => (typeof id === 'string' ? rooms.get(id) : undefined);
  function sanitizeName(value: unknown) {
    const raw = (typeof value === 'string' ? value : '')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    return [...raw].slice(0, 20).join('');
  }
  function nameKey(value: unknown) {
    return sanitizeName(value).normalize('NFKC').toLocaleLowerCase('pt-BR');
  }
  function nameOwner(name: unknown, excludeClientId: string | null = null) {
    const key = nameKey(name);
    if (!key) return null;
    for (const room of rooms.values())
      for (const p of room.players.values())
        if (p.id !== excludeClientId && nameKey(p.name) === key) return { room, player: p };
    return null;
  }
  function nameAvailability(name: unknown, excludeClientId: string | null = null) {
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
  function accountNameAvailability(ws: ChannelConnection, rawName: unknown) {
    const result = nameAvailability(
      ws.guest?.nickname || (accountAuth.required ? ws.account?.nickname : rawName),
      ws.clientId,
    );
    if (ws.guest && nameReserved(result.name))
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
  function nextFreeSeat(room: ChannelRoom) {
    if (room.kind === 'chat') return room.nextSeat++;
    const occupied = new Set([...room.players.values()].map((p) => p.seat));
    for (let seat = 0; seat < (room.max ?? 4); seat += 1) if (!occupied.has(seat)) return seat;
    return null;
  }
  function roomHostId(room: ChannelRoom) {
    if (room.kind !== 'game') return null;
    const sorted = [...room.players.values()].sort((a, b) => a.seat - b.seat);
    return sorted[0]?.id || null;
  }
  function publicPlayer(room: ChannelRoom, player: ChannelMember) {
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
  function safeRoom(room: ChannelRoom) {
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
  function privateVoiceRoster(room: ChannelRoom) {
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
  function broadcastVoiceRoster(room: ChannelRoom) {
    if (closed) return;
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
    if (closed) return;
    for (const ws of wss.clients)
      send(ws, {
        type: 'chat-channels',
        channels: safeChatChannels(!!ws.account && ws.account.expiresAt > Date.now()),
      });
  }
  function safeRooms() {
    return [...rooms.values()].filter((r) => r.kind === 'game').map(safeRoom);
  }
  function broadcastAll(payload: WireEvent) {
    if (closed) return;
    for (const client of wss.clients) send(client, payload);
  }
  function broadcastRooms() {
    if (closed) return;
    broadcastAll({ type: 'rooms', rooms: safeRooms() });
    presenceChanged();
  }
  function broadcastRoom(room: ChannelRoom) {
    if (closed) return;
    const payload = { type: 'room-state', room: safeRoom(room) };
    for (const p of room.players.values()) send(p.ws, payload);
  }
  // Text membership is independent of the primary voice/game room. Both use the
  // same authenticated socket; media signaling and SFU sessions stay in ws.roomId.
  function leaveTextRoom(ws: ChannelConnection) {
    if (closed) return;
    const room = roomFor(ws.textRoomId);
    ws.textRoomId = null;
    if (!room) return;
    if (ws.roomId !== room.id && ws.gameRoomId !== room.id) room.players.delete(ws.clientId);
    if (!room.players.size && room.kind !== 'chat') room.chatHistory = [];
    broadcastRoom(room);
    broadcastChatChannels();
  }
  function createRoomPlayer(
    ws: ChannelConnection,
    room: ChannelRoom,
    name: string,
    seat = nextFreeSeat(room),
  ): ChannelMember {
    if (seat === null) throw new Error('Nenhum assento disponível.');
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
  function joinTextRoom(ws: ChannelConnection, roomId: unknown, rawName: unknown) {
    if (closed) return;
    if (ws.guest) {
      send(ws, {
        type: 'error',
        code: 'LOGIN_REQUIRED_CHAT',
        message: 'Entre em uma conta para acessar o chat M&N.',
      });
      return;
    }
    if (!validRoomId(roomId)) {
      send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala inexistente.' });
      return;
    }
    const room = roomFor(roomId);
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
    presenceChanged();
  }
  function removeRoomPlayer(ws: ChannelConnection, room: ChannelRoom | undefined, reason: string) {
    if (!room) return;
    const leaving = room.players.get(ws.clientId);
    if (leaving && leaving.ws !== ws) return;
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

  function gameRoomFor(ws: ChannelConnection) {
    return roomFor(ws.independentGames ? ws.gameRoomId : ws.roomId);
  }
  function selectedChatId(ws: ChannelConnection) {
    return ws.textRoomId || ws.roomId || ws.gameRoomId;
  }
  function leaveGameRoom(ws: ChannelConnection, reason = 'leave') {
    if (closed) return;
    const id =
      ws.gameRoomId ||
      (!ws.independentGames && roomFor(ws.roomId)?.kind === 'game' ? ws.roomId : null);
    if (!id) return;
    ws.gameRoomId = null;
    if (ws.roomId === id) ws.roomId = null;
    removeRoomPlayer(ws, roomFor(id), reason);
    send(ws, {
      type: 'left-game-room',
      roomId: id,
      primaryRoomId: ws.roomId,
      chatRoomId: selectedChatId(ws) || null,
    });
  }
  function leaveVoiceRoom(ws: ChannelConnection, reason = 'leave', keepText = true) {
    if (closed) return;
    const room = roomFor(ws.roomId);
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
      presenceChanged();
    } else removeRoomPlayer(ws, room, reason);
    send(ws, {
      type: 'left-voice-room',
      roomId: room.id,
      primaryRoomId: null,
      chatRoomId: selectedChatId(ws) || null,
    });
  }
  function leaveRoom(ws: ChannelConnection, reason = 'leave', keepText = false) {
    if (closed) return;
    leaveGameRoom(ws, reason);
    if (!keepText) leaveTextRoom(ws);
    leaveVoiceRoom(ws, reason, keepText);
  }
  function joinGameRoom(ws: ChannelConnection, roomId: unknown, rawName: unknown) {
    if (closed) return;
    if (!validRoomId(roomId)) {
      send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala inexistente.' });
      return;
    }
    const room = roomFor(roomId),
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
    if (room.players.size >= (room.max ?? 4)) {
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
  function sendGameMembership(ws: ChannelConnection, room: ChannelRoom) {
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

  function joinRoom(ws: ChannelConnection, roomId: unknown, rawName: unknown) {
    if (closed) return;
    if (!validRoomId(roomId)) {
      send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala inexistente.' });
      return;
    }
    if (ws.independentGames && roomFor(roomId)?.kind === 'game')
      return joinGameRoom(ws, roomId, rawName);
    if (accountAuth.required) rawName = ws.guest?.nickname || ws.account?.nickname;
    const room = roomFor(roomId);
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
        me: publicPlayer(room, room.players.get(ws.clientId)!),
      });
      void sendChatHistory(ws, room);
      return;
    }
    if (ws.independentGames) {
      leaveVoiceRoom(ws, 'switch-room');
      leaveTextRoom(ws);
    } else leaveRoom(ws, 'switch-room');
    if (room.kind === 'game' && room.players.size >= (room.max ?? 4)) {
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
  function resetVoiceModeIfEmpty(room: ChannelRoom) {
    if (![...room.players.values()].some((p) => p.voiceJoined)) {
      room.voiceMode = null;
      room.voiceRevision = (room.voiceRevision || 0) + 1;
    }
  }
  function broadcastVoiceEvent(
    room: ChannelRoom,
    player: ChannelMember,
    kind: 'joined' | 'left' | 'disconnected',
    reason = '',
  ) {
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
  function chooseVoiceMode(room: ChannelRoom) {
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
  function sendVoiceMode(room: ChannelRoom, reason = '') {
    for (const p of room.players.values())
      send(p.ws, {
        type: 'voice-mode',
        roomId: room.id,
        mode: room.voiceMode,
        revision: room.voiceRevision,
        reason,
      });
  }
  function forceRoomP2p(
    room: ChannelRoom,
    reason = 'A chamada foi sincronizada em P2P para todos.',
  ) {
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
  function prepareVoice(ws: ChannelConnection, input: unknown) {
    if (
      closed ||
      !object(input) ||
      typeof input.requestId !== 'string' ||
      !input.requestId ||
      input.requestId.length > 80
    )
      return;
    const message = { requestId: input.requestId };
    const gameRoom = roomFor(ws.gameRoomId);
    if (!ws.roomId && gameRoom?.kind === 'game' && gameRoom.players.get(ws.clientId)?.ws === ws) {
      ws.roomId = ws.gameRoomId;
      send(ws, { type: 'voice-room-attached', room: safeRoom(gameRoom) });
    }
    const room = roomFor(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws) {
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
  function handleVoiceState(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    const message = readVoiceState(input);
    if (!message) return;
    const room = roomFor(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws) return;
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
    player.transmissionQuality = message.quality || player.transmissionQuality || 'balanced';
    player.screenFps = message.screenFps || player.screenFps || 30;
    const transport = message.transport || player.mediaTransport || 'p2p';
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
  function handleVoiceSignal(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    const message = readVoiceSignal(input, ws.clientId);
    if (!message) return;
    const room = roomFor(ws.roomId),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws || !player.voiceJoined) return;
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

  return {
    safeRooms,
    safeRoom,
    publicPlayer,
    safeChatChannels,
    broadcastRoom,
    broadcastRooms,
    broadcastChatChannels,
    broadcastVoiceRoster,
    selectedChatId,
    gameRoomFor,
    accountNameAvailability,
    joinRoom,
    joinGameRoom,
    joinTextRoom,
    leaveRoom,
    leaveVoiceRoom,
    leaveGameRoom,
    leaveTextRoom,
    prepareVoice,
    handleVoiceState,
    handleVoiceSignal,
    fallbackVoice(ws: ChannelConnection) {
      if (closed) return;
      const room = roomFor(ws.roomId);
      const player = room?.players.get(ws.clientId);
      if (room && player?.ws === ws && player.voiceJoined) forceRoomP2p(room);
    },
    updateProfile(ws: ChannelConnection, account: BackendAccount) {
      if (closed) return;
      for (const id of new Set([ws.roomId, ws.textRoomId, ws.gameRoomId])) {
        const room = roomFor(id),
          player = room?.players.get(ws.clientId);
        if (room && player?.ws === ws) {
          player.name = account.nickname;
          player.avatar_preset = account.avatar_preset || 'crown';
          player.avatar_file_id = account.avatar_file_id || null;
          throneService.rename(room, player.seat, account.nickname);
          broadcastRoom(room);
          broadcastVoiceRoster(room);
          if (room.game) throneService.broadcastState(room);
        }
      }
    },
    deleteRoom(room: ChannelRoom) {
      if (closed) return;
      for (const player of [...room.players.values()]) {
        const ws = player.ws;
        if (ws.textRoomId === room.id) leaveTextRoom(ws);
        else if (ws.independentGames) leaveVoiceRoom(ws, 'channel-deleted');
        else leaveRoom(ws, 'channel-deleted', true);
        send(ws, { type: 'channel-deleted', roomId: room.id });
      }
    },
    stop() {
      if (closed) return;
      closed = true;
      for (const room of rooms.values()) room.players.clear();
      rooms.clear();
    },
  };
}
