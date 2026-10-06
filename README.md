# A Lei do Trono — Backend v0.5.3 Alpha

Backend WebSocket autoritativo da partida online.

## Nesta versão
- 3 salas, 4 assentos; 2 a 4 humanos e IAs nas vagas restantes.
- servidor controla baralho, mãos privadas, turnos, Leis, Decretos, Coroa, Sombra, Influência e Prestígio.
- validação rígida: Coroa e Sombra nunca podem pertencer ao mesmo jogador.
- resolução revisada de Revolta e Estandarte, incluindo desempate por ordem de jogo.
- cronômetro autoritativo de 60 s para jogadas humanas; no fim do tempo o servidor joga uma carta legal aleatória.
- log da partida preservado no servidor e enviado ao fim do jogo.
- Usurpação protege a carta da Corte Aberta: ela não pode sair de nenhuma das mãos envolvidas.
- Influência não pode ocultar a carta revelada pela Corte Aberta.
- Desafio transmite a carta revelada a todos os clientes para feedback visual.
- desconexão durante a partida substitui o jogador por IA.

## Render
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Depois do deploy, `/health` deve mostrar `0.5.3-alpha`.
