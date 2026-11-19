# 03: Núcleo do Motor de Voz Fluxer (`@trono/voice-engine` Core, Reducers e Runtime)

**O que construir:** Implementar o núcleo determinístico do motor de voz baseado no `@fluxer/voice_engine_v2`: protocolo de eventos/comandos com `operationId`, reducers puros por domínio (`connection`, `room`, `microphone`, `camera`, `screen`, `screenAudio`, `remoteTrackSubscription`), portas (`MediaPort`, `SubscriptionPort`, `GatewayPort`) e `VoiceEngineRuntime` com serialização por `resourceKey` e descarte seguro de operações obsoletas.

**Bloqueado por:** 02: Contratos Compartilhados SFU, Voz e Sinalização (`@trono/protocol`).

**Status:** concluido

- [x] Reducers puros 100% determinísticos sem dependência de DOM ou WebRTC.
- [x] `VoiceEngineRuntime` serializando comandos concorrentes por `resourceKey` e ignorando conclusões obsoletas (`isCommandCompletionStale`).
- [x] Suíte unitária em `tests/unit/voice-engine-reducer.test.ts` e `tests/unit/voice-engine-runtime.test.ts` passando via TDD.
