# 04: Políticas de Tela, Isolamento de Captura e Track Plumbing do Fluxer

**O que construir:** Implementar em `@trono/voice-engine` o planejador `planScreenEncodingChange`, cálculos de dimensões pares/bitrates/parâmetros de `RTCRtpSender` (`screenShareOptions.ts`), `SourceLifecycleRegistry`, `DisplayMediaCapture` (com isolamento de áudio de janela e limpeza em erro) e `ScreenShareTrackPlumbing` (elemento _keep-alive sink_ `<video 2x2px>`, `contentHint` e priorização de codecs preservando `video/rtx`).

**Bloqueado por:** 02: Contratos Compartilhados SFU, Voz e Sinalização (`@trono/protocol`).

**Status:** concluido

- [x] `planScreenEncodingChange` e `buildScreenShareSenderParameters` implementados conforme o Fluxer.
- [x] `SourceLifecycleRegistry` impedindo vazamento de tracks ao substituir ou parar a captura.
- [x] `ScreenShareTrackPlumbing` criando/removendo o `<video data-flx="voice.screen-share-keepalive">` e preservando pares `video/rtx`.
- [x] Testes unitários em `tests/unit/screen-share-policies.test.ts` e `tests/unit/screen-share-plumbing.test.ts` passando via TDD.
