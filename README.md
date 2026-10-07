# A Lei do Trono — Backend v0.5.9 Alpha

Servidor autoritativo WebSocket/Node.js do protótipo online.

## Partida
- Mantém as três salas de jogo com até 4 jogadores e preenchimento por bots.
- Valida as regras, turnos, Influência, Leis, Decretos, Coroa, Sombra e pontuação.
- Jogador desconectado durante a partida é substituído por bot e a sala recebe o evento de desconexão.

## Comunicação v0.5.9
- Sinalização WebRTC privada entre todos os participantes da chamada.
- Estados de câmera, microfone e compartilhamento de tela só são enviados a quem entrou na call.
- Quem está fora da call recebe apenas o indicador público de que há alguém conectado.
- O Salão Livre (`chat-livre`) é separado das partidas e não impõe limite fixo de participantes no servidor.
- O backend sinaliza áudio, câmera e compartilhamento de tela; a mídia continua P2P entre navegadores.

> Observação: P2P com apenas STUN pode falhar entre algumas redes restritivas/CGNAT. Para confiabilidade de produção em qualquer rede, configure um servidor TURN no frontend.

## Deploy
Suba `server.js` e `package.json` ao repositório do backend no GitHub. O Render fará o deploy automaticamente; se necessário, use **Manual Deploy → Deploy latest commit**.

Depois confirme em `/health`:

```json
{"ok":true,"version":"0.5.9-alpha"}
```
