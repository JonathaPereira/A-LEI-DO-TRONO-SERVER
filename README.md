# A Lei do Trono — Backend v0.5.8 Alpha

Backend WebSocket autoritativo da partida online.

## Nesta versão
- 3 salas, 4 assentos; 2 a 4 humanos e IAs nas vagas restantes.
- servidor controla baralho, mãos privadas, turnos, Leis, Decretos, Coroa, Sombra, Influência e Prestígio.
- cronômetro autoritativo de 60 s; no fim do tempo o servidor joga uma carta legal aleatória.
- Usurpação protege a carta da Corte Aberta e Influência não pode ocultá-la.
- IAs: Bonifácio, Epaminondas, Cícero e Otacílio quando necessário.
- desconexão durante a partida substitui o jogador por IA e gera evento público.

## Comunicação v0.5.8
- O servidor não transporta áudio/vídeo: apenas sinaliza WebRTC.
- Fora da chamada, `room-state` expõe somente `voiceActive` (sim/não).
- Nome dos participantes da call, estado do microfone e câmera são enviados em `voice-roster` somente para jogadores que entraram na chamada.
- Sinalização aceita `offer`, `answer`, `ice` e `renegotiate-request` para ressincronizar câmera quando necessário.

## Render
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Depois do deploy, `/health` deve mostrar `0.5.8-alpha`.


### v0.5.8
O relay de sinalização continua privado aos participantes da call e suporta renegociações mesh entre todos os pares. A principal correção WebRTC está no frontend com Perfect Negotiation.
