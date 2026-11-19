# ADR 002: Sessões Assimétricas Persistentes (1 Publisher + 1 Subscriber) no Cloudflare Realtime SFU

- **Status:** Aceito
- **Data:** 2026-11-19

## Contexto

O modelo anterior criava uma nova `RTCPeerConnection` e uma nova sessão na API Cloudflare Calls para cada track individual (`audio`, `camera`, `screen`, `screen-audio` e cada assinatura remota), além de impor atrasos artificiais de 1.400 ms de ICE gather e polling bloqueante de `publication-ready` de até 4.200 ms. Isso multiplicava handshakes DTLS/ICE, degradava a estabilidade em NATs restritos e atrasava o anúncio de transmissões de tela.

## Decisão

Padronizar o transporte SFU em **Sessões Assimétricas Persistentes** por participante em chamada:

1. No máximo **1 `publisherSessionId`** (`1` `RTCPeerConnection` de envio) e **1 `subscriberSessionId`** (`1` `RTCPeerConnection` de recepção) por participante, criados/reutilizados via `ensure-session`.
2. **Publicação atômica** de `screen` + `screen-audio` em uma única requisição `publish-tracks` (`POST /sessions/{id}/tracks/new` com `location: 'local'`).
3. **Anúncio imediato**: assim que a Cloudflare retorna Answer SDP e lista de tracks válidas, `CloudflareRealtimeSfuService` registra as publicações no catálogo da sala e emite `sfu-publications` imediatamente, sem polling bloqueante.
4. **Serialização estrita por sessão**: tanto o adaptador cliente (`CloudflareSfuExecutionAdapter`) quanto o backend (`CloudflareRealtimeSfuService` via `sessionQueues`) enfileiram mutações SDP por sessão.

## Consequências

- **Positivas:** Redução drástica de negociações ICE/DTLS por chamada, início quase instantâneo de transmissões de tela com áudio e eliminação de colisão de `signalingState` em renegociações concorrentes.
- **Trade-offs:** O `CloudflareRealtimeSfuService` mantém compatibilidade retroativa com ações legadas (`publish-track`, `publication-ready`, `subscribe-track`, `close-publication`, `close-subscription`) durante a transição dos clientes.
