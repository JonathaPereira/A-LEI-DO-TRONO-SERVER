'use strict';
const {
  createChannelService,
  createChannelRooms,
  createManagedChatRoom,
} = require('../server/channel-service.ts');
function fixture({
  factory = createChannelService,
  required = true,
  enabled = false,
  maxParticipants = 6,
} = {}) {
  const rooms = createChannelRooms();
  for (const [id, type] of [
    ['text-only', 'text'],
    ['voice-only', 'voice'],
  ])
    rooms.set(
      id,
      createManagedChatRoom({ id, name: id, description: 'fixture', channel_type: type }),
    );
  const messages = [],
    effects = [],
    clients = new Set();
  const sfu = {
    cleanupClient(clientId, roomId) {
      effects.push({ cleanup: [clientId, roomId] });
      return Promise.resolve();
    },
    statusPayload: () => ({ enabled, configured: true, hardBlocked: false, maxParticipants }),
    notePlayerQuality: (_roomId, _playerId, quality) => quality,
    broadcastStatus: (room) => effects.push({ status: room.id }),
    broadcastPublications: (room) => effects.push({ publications: room.id }),
  };
  const throne = {
    disconnect: (room, member, reason) =>
      effects.push({ disconnect: [room.id, member.id, reason] }),
    privateState: () => null,
    rename: () => {},
    broadcastState: () => {},
  };
  const service = factory({
    rooms,
    wss: { clients },
    send: (ws, message) =>
      messages.push({ to: ws.clientId, ...JSON.parse(JSON.stringify(message)) }),
    auth: { required },
    sfu,
    throne,
    presenceChanged: () => effects.push({ presence: true }),
    nameReserved: (name) => name === 'Reserved',
    sendHistory: async (ws, room) => {
      effects.push({ history: [ws.clientId, room.id] });
    },
  });
  const connection = (id, nickname = id, guest = false) => {
    const ws = {
      clientId: id,
      roomId: null,
      textRoomId: null,
      gameRoomId: null,
      independentGames: false,
      account: guest
        ? null
        : {
            id: 'account-' + id,
            nickname,
            role: 'member',
            expiresAt: Date.now() + 999999,
            avatar_preset: 'crown',
            avatar_file_id: null,
          },
      guest: guest
        ? {
            id: 'guest-' + id,
            nickname,
            expiresAt: Date.now() + 999999,
            guest: true,
            avatar_preset: 'person',
            avatar_file_id: null,
            ticket: 'ticket-' + id,
          }
        : null,
    };
    clients.add(ws);
    return ws;
  };
  return { service, rooms, messages, effects, clients, connection };
}
module.exports = { fixture };
