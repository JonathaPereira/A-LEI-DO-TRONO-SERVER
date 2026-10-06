'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';

const roomDefs = [
  ['sala-cetro', 'Sala do Cetro'],
  ['sala-chave', 'Sala da Chave'],
  ['sala-mascara', 'Sala da Máscara'],
];

const rooms = new Map(roomDefs.map(([id, name]) => [id, {
  id,
  name,
  max: 4,
  players: new Map(),
  createdAt: Date.now(),
}]));

function sanitizeName(value) {
  const name = String(value || 'Jogador')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 18);
  return name || 'Jogador';
}

function nextFreeSeat(room) {
  const occupied = new Set([...room.players.values()].map(p => p.seat));
  for (let seat = 0; seat < room.max; seat += 1) {
    if (!occupied.has(seat)) return seat;
  }
  return null;
}

function roomHostId(room) {
  const sorted = [...room.players.values()].sort((a, b) => a.seat - b.seat);
  return sorted[0]?.id || null;
}

function publicPlayer(room, player) {
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    ready: !!player.ready,
    host: player.id === roomHostId(room),
  };
}

function safeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    max: room.max,
    count: room.players.size,
    players: [...room.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map(p => publicPlayer(room, p)),
  };
}

function safeRooms() {
  return [...rooms.values()].map(safeRoom);
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastAll(payload) {
  for (const client of wss.clients) send(client, payload);
}

function broadcastRooms() {
  broadcastAll({ type: 'rooms', rooms: safeRooms() });
}

function broadcastRoom(room) {
  const payload = { type: 'room-state', room: safeRoom(room) };
  for (const player of room.players.values()) {
    if (player.ws) send(player.ws, payload);
  }
}

function leaveRoom(ws, reason = 'leave') {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (!room) {
    ws.roomId = null;
    return;
  }

  const leaving = room.players.get(ws.clientId);
  room.players.delete(ws.clientId);
  ws.roomId = null;

  broadcastRoom(room);
  broadcastRooms();

  if (leaving) {
    const payload = {
      type: 'player-left',
      roomId: room.id,
      playerId: leaving.id,
      name: leaving.name,
      reason,
    };
    for (const player of room.players.values()) {
      if (player.ws) send(player.ws, payload);
    }
  }
}

function joinRoom(ws, roomId, rawName) {
  const room = rooms.get(roomId);
  if (!room) {
    send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala inexistente.' });
    return;
  }

  if (ws.roomId === roomId && room.players.has(ws.clientId)) {
    send(ws, { type: 'joined-room', room: safeRoom(room), me: publicPlayer(room, room.players.get(ws.clientId)) });
    return;
  }

  leaveRoom(ws, 'switch-room');

  if (room.players.size >= room.max) {
    send(ws, { type: 'error', code: 'ROOM_FULL', message: 'Sala cheia.' });
    return;
  }

  const seat = nextFreeSeat(room);
  if (seat === null) {
    send(ws, { type: 'error', code: 'NO_SEAT', message: 'Nenhum assento disponível.' });
    return;
  }

  const player = {
    id: ws.clientId,
    name: sanitizeName(rawName),
    seat,
    ready: false,
    joinedAt: Date.now(),
    ws,
  };

  room.players.set(ws.clientId, player);
  ws.roomId = room.id;

  send(ws, { type: 'joined-room', room: safeRoom(room), me: publicPlayer(room, player) });
  broadcastRoom(room);
  broadcastRooms();
}

function setReady(ws, ready) {
  const room = rooms.get(ws.roomId);
  const player = room?.players.get(ws.clientId);
  if (!room || !player) {
    send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
    return;
  }
  player.ready = !!ready;
  broadcastRoom(room);
  broadcastRooms();
}

function requestStart(ws) {
  const room = rooms.get(ws.roomId);
  const player = room?.players.get(ws.clientId);
  if (!room || !player) {
    send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
    return;
  }

  if (roomHostId(room) !== ws.clientId) {
    send(ws, { type: 'error', code: 'NOT_HOST', message: 'Somente o anfitrião pode iniciar.' });
    return;
  }

  if (room.players.size < 2) {
    send(ws, { type: 'error', code: 'NOT_ENOUGH_PLAYERS', message: 'São necessários pelo menos 2 jogadores para o teste online.' });
    return;
  }

  const notReady = [...room.players.values()].filter(p => !p.ready);
  if (notReady.length) {
    send(ws, { type: 'error', code: 'PLAYERS_NOT_READY', message: 'Todos os jogadores precisam marcar Pronto.' });
    return;
  }

  // Nesta alpha, ainda não começa a lógica autoritativa da partida.
  // O evento serve para validar o fluxo de lobby entre navegadores.
  const payload = {
    type: 'room-starting',
    room: safeRoom(room),
    message: 'Lobby validado. Próxima etapa: sincronização autoritativa da partida.',
  };
  for (const p of room.players.values()) if (p.ws) send(p.ws, payload);
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('A Lei do Trono backend online.');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.5.0-alpha', rooms: safeRooms(), uptime: process.uptime() });
});

app.get('/rooms', (_req, res) => {
  res.json({ rooms: safeRooms() });
});

wss.on('connection', (ws, req) => {
  ws.clientId = crypto.randomUUID();
  ws.roomId = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, {
    type: 'welcome',
    clientId: ws.clientId,
    rooms: safeRooms(),
    serverVersion: '0.5.0-alpha',
  });

  ws.on('message', raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', code: 'BAD_JSON', message: 'Mensagem inválida.' });
      return;
    }

    switch (message.type) {
      case 'list-rooms':
        send(ws, { type: 'rooms', rooms: safeRooms() });
        break;
      case 'join-room':
        joinRoom(ws, message.roomId, message.name);
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
      case 'ping':
        send(ws, { type: 'pong', at: Date.now() });
        break;
      case 'game-action':
      case 'state-request':
        send(ws, {
          type: 'ack',
          requestType: message.type,
          note: 'Reservado para a próxima etapa da partida autoritativa.',
        });
        break;
      default:
        send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: 'Tipo de mensagem desconhecido.' });
    }
  });

  ws.on('close', () => leaveRoom(ws, 'disconnect'));
  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

server.listen(PORT, HOST, () => {
  console.log(`A Lei do Trono backend ouvindo em http://${HOST}:${PORT}`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    try { ws.close(1001, 'Servidor reiniciando'); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
