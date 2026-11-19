# 05: Adaptador Cliente WebRTC Assimétrico para Cloudflare Realtime SFU

**O que construir:** Implementar `CloudflareSfuExecutionAdapter` em `@trono/voice-engine` satisfazendo as portas `MediaPort` e `SubscriptionPort` do Fluxer sobre o Cloudflare Realtime SFU, mantendo 1 `RTCPeerConnection` Publisher e 1 `RTCPeerConnection` Subscriber por participante, filas serializadas de renegociação SDP, publicação conjunta de `screen` + `screen-audio` e aplicação imediata dos parâmetros do `RTCRtpSender`.

**Bloqueado por:**

- 03: Núcleo do Motor de Voz Fluxer
- 04: Políticas de Tela, Isolamento de Captura e Track Plumbing do Fluxer

**Status:** concluido

- [x] No máximo 2 `RTCPeerConnection`s criadas por chamada (1 Publisher + 1 Subscriber).
- [x] Publicação conjunta de `screen` e `screen-audio` sem espera de 1.400 ms de ICE gather e sem mangling manual de SDP.
- [x] Testes de integração em `tests/integration/cloudflare-sfu-adapter.test.ts` com `FakeRTCPeerConnection` passando via TDD.
