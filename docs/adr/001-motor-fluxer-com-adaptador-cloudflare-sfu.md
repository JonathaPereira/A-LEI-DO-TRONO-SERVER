# ADR 001: Adoção da Arquitetura de Motor do Fluxer (`@trono/voice-engine`) com Adaptador Cloudflare SFU

- **Status:** Aceito
- **Data:** 2026-11-19

## Contexto

A implementação legada de voz e transmissão de tela acoplava estado mutável da UI diretamente a chamadas WebRTC e sinalização WebSocket espalhadas por dezenas de arquivos. Esse acoplamento provocava condições de corrida entre cliques rápidos (iniciar/trocar/parar tela), vazamento de `MediaStreamTrack`s, suspensão de frames em compartilhamento minimizado no Chromium/Electron (ausência de _keep-alive sink_) e mangling manual de SDP.

## Decisão

Adotar a arquitetura de **Módulo Profundo (_Deep Module_)** inspirada no `@fluxer/voice_engine_v2` dentro de `packages/voice-engine`:

1. **Reducer puro determinístico (`transitionVoiceEngine`)** gerando snapshots imutáveis e comandos com `operationId` monotônico.
2. **Runtime serializado por `resourceKey` (`VoiceEngineRuntime`)** com `AbortController` e descarte seguro de conclusões obsoletas (`isCommandCompletionStale`).
3. **Políticas e isolamento explícitos**: `planScreenEncodingChange`, `screenShareOptions`, `SourceLifecycleRegistry`, `DisplayMediaCapture` e `ScreenShareTrackPlumbing` (incluindo `<video data-flx="voice.screen-share-keepalive">` `2x2px`, `contentHint`, `RTCRtpSender.setParameters` sem edição manual de SDP e `prioritizeScreenCodec` preservando pares `video/rtx`).
4. **Portas injetáveis (`CloudflareSfuMediaPort` e `SubscriptionPort`)** desacoplando o núcleo puro do `CloudflareSfuExecutionAdapter`.

## Consequências

- **Positivas:** Toda a máquina de estados, políticas de encoding e ciclos de vida de captura passam a ser testáveis em milissegundos via testes unitários puros sem browser; troca rápida de fonte não vaza tracks nem corrompe estado.
- **Trade-offs:** Exige disciplina estrita para que UI React (`src/` / `apps/web`) consuma apenas snapshots do `VoiceEngineController` e nunca manipule `RTCPeerConnection` ou `track.stop()` fora dos donos designados.
