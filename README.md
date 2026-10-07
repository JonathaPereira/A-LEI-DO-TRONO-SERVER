# A Lei do Trono — Backend v0.5.6 Alpha

Backend WebSocket autoritativo da partida online.

## Nesta versão
- 3 salas, 4 assentos; 2 a 4 humanos e IAs nas vagas restantes.
- servidor controla baralho, mãos privadas, turnos, Leis, Decretos, Coroa, Sombra, Influência e Prestígio.
- validação rígida: Coroa e Sombra nunca podem pertencer ao mesmo jogador.
- cronômetro autoritativo de 60 s; no fim do tempo o servidor joga uma carta legal aleatória.
- Usurpação protege a carta da Corte Aberta e Influência não pode ocultá-la.
- Desafio transmite a carta revelada para feedback visual.
- log da partida preservado e enviado no fim.
- IAs recebem os nomes Bonifácio, Epaminondas e Cícero; Otacílio é o quarto nome quando necessário.
- ao desconectar no meio da partida, o assento é assumido por uma IA com um desses nomes.

## Render
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Depois do deploy, `/health` deve mostrar `0.5.6-alpha`.

## Novidades v0.5.6
- Influência 2.0: 1 ficha = Sigilo; 2 fichas = Manobra +3/-3, com valor efetivo limitado a 1-12.
- Decreto Silêncio bloqueia o gasto apenas nas vazas 1-3.
- Chat de texto por sala com histórico temporário.
- Sinalização WebRTC de voz via WebSocket; o áudio segue P2P entre os jogadores.

- Estado público de câmera por jogador para o WebRTC.
- Evento público `influence-used` informa Sigilo ou Manobra +3/-3 sem revelar a carta.
- Desconexões em partida carregam motivo e atualizam imediatamente o assento substituído por IA.
