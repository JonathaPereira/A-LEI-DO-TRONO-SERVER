# Especificação 01: Motor de Voz e Transmissão de Tela Baseado no Fluxer com Cloudflare Realtime SFU

## Declaração do Problema

A implementação legada de voz e transmissão de tela falhava de forma recorrente por quatro causas estruturais:

1. Criava uma nova `RTCPeerConnection` e uma nova sessão na Cloudflare para cada track individual (`audio`, `camera`, `screen`, `screen-audio` e cada assinatura remota), multiplicando handshakes ICE/DTLS e falhas de NAT/TURN.
2. Não mantinha um elemento _keep-alive sink_ (`<video>`) ativo no DOM, fazendo o Chromium e o Electron suspenderem a entrega de frames de `getDisplayMedia` quando a prévia local era minimizada, ocultada ou movida para outra aba.
3. Impedia o anúncio imediato da transmissão devido a um atraso artificial de 1.400 ms de ICE gather, edição manual de `a=fmtp` no SDP e polling bloqueante `publication-ready` de até 4.200 ms.
4. Espalhava estado mutável em mais de 60 arquivos no frontend sem fila determinística por recurso nem cancelamento por identificador de operação (`operationId`).

## Solução

Adotar a arquitetura de módulo profundo (`Deep Module`) do **Fluxer (`voice_engine_v2`)** — reducer determinístico, filas isoladas por `resourceKey`, cancelamento por `operationId`, `SourceLifecycleRegistry`, `DisplayMediaCapture` e `ScreenShareTrackPlumbing` com _keep-alive sink_ de `2x2px` — acoplada a um adaptador dedicado ao **Cloudflare Realtime SFU** utilizando **Sessões Assimétricas Persistentes** (`1 Sessão Publisher` + `1 Sessão Subscriber` por participante).

Todo o repositório é reorganizado em um monorepo com separação explícita entre:

- `apps/server`: backend Node.js + Express + WebSocket + SFU para deploy isolado no **Render**.
- `apps/web`: frontend Next.js estático (`output: 'export'`) para deploy isolado no **Surge**.
- `apps/desktop`: host Electron empacotando a saída estática de `apps/web`.
- `packages/protocol`: contratos tipados compartilhados entre cliente e servidor.
- `packages/voice-engine`: motor puro baseado no Fluxer + adaptadores WebRTC e Cloudflare SFU.

## Histórias de Usuário

1. Como participante em um canal de voz, quero iniciar o compartilhamento de tela com áudio do sistema ou janela e ter a transmissão anunciada imediatamente para os espectadores sem esperar polling bloqueante.
2. Como participante compartilhando a tela, quero minimizar a prévia local, trocar de canal de texto ou abrir um jogo mantendo a taxa de quadros estável graças ao _keep-alive sink_ no DOM.
3. Como participante compartilhando a tela, quero alterar resolução (720p, 1080p, 1440p), taxa de quadros (15, 30, 60 fps) ou conteúdo (movimento/detalhe) e ver o motor decidir automaticamente entre atualizar parâmetros do `RTCRtpSender` ou republicar quando o codec exigir.
4. Como participante clicando rapidamente em compartilhar, trocar fonte ou parar a tela, quero que operações antigas sejam descartadas de forma segura via `operationId` sem vazar tracks de captura.
5. Como espectador em um canal de voz, quero receber voz, câmera, vídeo de tela e áudio da tela através de uma única `RTCPeerConnection` de recepção persistente, com renegociações estritamente serializadas.
6. Como administrador ou moderador da sala, quero continuar aplicando silenciamento de servidor, bloqueio de mídia e limites de consumo mensal da Cloudflare com fallback imediato.
7. Como desenvolvedor do projeto, quero fazer deploy independente do backend no Render (`apps/server`) e do frontend estático no Surge (`apps/web`), com uma pirâmide de testes enxuta cobrindo as costuras críticas em PT-BR.

## Decisões de Implementação

- **Módulo Profundo `@trono/voice-engine`**: inspirado em `packages/voice_engine_v2` do `fluxerapp/fluxer`, contendo `core/reducer.ts` (puro), `policies/screenShare.ts` (planejamento de encoding), `policies/screenShareOptions.ts` (dimensões pares, bitrate e parâmetros do `RTCRtpSender`), `source-isolation/SourceLifecycleRegistry.ts`, `runtime/VoiceEngineRuntime.ts` (fila por `resourceKey`) e portas injetáveis (`MediaPort`, `SubscriptionPort`).
- **Sessões Assimétricas no Cloudflare Realtime SFU**: cada participante na chamada usa no máximo 1 sessão de publicação (`publisherSessionId`) e 1 sessão de recepção (`subscriberSessionId`) na API `/v1/apps/{appId}/sessions/...`.
- **Publicação Atômica de Tela + Áudio da Tela**: o cliente envia `screen` e `screen-audio` juntos em `publish-tracks` (`POST /sessions/{id}/tracks/new` com `location: 'local'`), e o backend anuncia imediatamente após receber o Answer SDP válido da Cloudflare.
- **ScreenShareTrackPlumbing**: mantém `<video data-flx="voice.screen-share-keepalive">` (`2x2px`, `muted`, `playsInline`, `opacity: 0.001`) durante a transmissão ativa, aplica `contentHint` (`motion` ou `detail`), prioriza codecs preservando pares `video/rtx` e aplica `RTCRtpSender.setParameters()` sem mangling de SDP.
- **Monorepo Front/Back Separados**: `npm workspaces` com `apps/server`, `apps/web`, `apps/desktop`, `packages/protocol` e `packages/voice-engine`, preservando jogos existentes, assets e migrações Supabase.

## Decisões de Testes (Pirâmide de Testes nas 3 Costuras)

Testamos apenas interfaces públicas nas costuras acordadas, nunca detalhes internos:

1. **Base (~70% Unitários)**: Interface pública de `@trono/protocol` e `@trono/voice-engine` (`transitionVoiceEngine`, `VoiceEngineRuntime`, `planScreenEncodingChange`, `buildScreenShareSenderParameters`, `SourceLifecycleRegistry`).
2. **Meio (~20% Integração)**: Costura dos adaptadores `CloudflareRealtimeSfuService` (contra `FakeCloudflareCallsProvider`) e `CloudflareSfuExecutionAdapter` + `ScreenShareTrackPlumbing` (contra `FakeRTCPeerConnection` e `FakeDisplayMedia`).
3. **Topo (~10% E2E Playwright)**: Aplicação real no Chromium validando login/navegação e chamada de voz com transmissão de tela e áudio ponta a ponta entre dois participantes.

## Fora de Escopo

- Substituição do Cloudflare Realtime SFU por servidor LiveKit próprio.
- Reescrita das regras internas dos jogos de tabuleiro já existentes (Trono, Azul, Splendor, Love Letter, Similo).
