# A Lei do Trono — Backend v0.5.0 Alpha

Backend WebSocket para validar o multiplayer online do lobby.

## Local

```bash
npm install
npm start
```

Abra:

- `http://localhost:10000/health`
- WebSocket: `ws://localhost:10000/ws`

## Render

- Tipo: **Web Service**
- Runtime: **Node**
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

O Render define `PORT` automaticamente.

## O que já faz

- 3 salas fixas;
- máximo de 4 jogadores por sala;
- assentos 0–3;
- host automático;
- Pronto / Não pronto;
- entrada, saída e ocupação em tempo real;
- health check;
- heartbeat WebSocket.

A lógica completa da partida ainda será migrada para o servidor na próxima etapa.
