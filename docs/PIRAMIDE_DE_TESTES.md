# Pirâmide de Testes nas 3 Costuras

A estratégia de testes valida **exclusivamente as interfaces públicas nas 3 costuras arquiteturais**, evitando testes frágeis acoplados a detalhes internos de implementação e executando nativamente TypeScript em Node 26 (`node --test`) + Playwright.

## Distribuição e Costuras

| Camada                | Proporção | Comando                    | Onde Mora                     | Costura Testada                                                                                                                |
| --------------------- | --------- | -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Base — Unitários**  | ~70%      | `npm run test:unit`        | `tests/unit/*.test.ts`        | Contratos puros de `@trono/protocol`, reducer e runtime do `@trono/voice-engine`, políticas de tela e plumbing DOM/WebRTC      |
| **Meio — Integração** | ~20%      | `npm run test:integration` | `tests/integration/*.test.ts` | Costura dos adaptadores contra mocks estruturais (`FakeCloudflareCallsProvider`, `FakeRTCPeerConnection` e `FakeDisplayMedia`) |
| **Topo — E2E**        | ~10%      | `npm run test:e2e`         | `tests/e2e/*.spec.ts`         | Fluxo ponta a ponta no Chromium real (Playwright com mídia sintética e servidor SFU mockado)                                   |

## 1. Costura Unitária (`tests/unit/*.test.ts`)

Execução direta via `node --test` (sem transpilação extra) cobrindo módulos puros e contratos públicos:

- `tests/unit/protocol-sfu.test.ts`: validação de SDP (`offer`/`answer`), parsing de mensagens SFU, publicação atômica (`screen` + `screen-audio`), assinatura, fechamento de tracks, renegociação e troca de layer simulcast (`f`/`h`/`q`).
- `tests/unit/voice-engine-reducer.test.ts`: transições determinísticas `transitionVoiceEngine(snapshot, event)` em `connection`, `room`, `microphone`, `camera`, `screen`, `screenAudio` e `remoteTrackSubscription`, além de `isCommandCompletionStale`.
- `tests/unit/voice-engine-runtime.test.ts`: serialização de filas por `resourceKey`, cancelamento por `operationId` (`AbortController`) e filtragem de eventos obsoletos no `VoiceEngineRuntime` e `VoiceEngineController`.
- `tests/unit/screen-share-policies.test.ts`: `planScreenEncodingChange` (`noop`, `updateEncoding`, `republish`, `reject`), `floorToEven`, `resolveEffectiveScreenShareDimensions`, `resolveScreenShareDegradationPreference`, `buildScreenShareOptions` e `buildScreenShareSenderParameters`.
- `tests/unit/screen-share-plumbing.test.ts`: `SourceLifecycleRegistry`, `DisplayMediaCapture` (isolamento de áudio e limpeza em falha parcial) e `ScreenShareTrackPlumbing` (_keep-alive sink_ `2x2px`, `contentHint`, `RTCRtpSender.setParameters` e `prioritizeScreenCodec` mantendo pares `video/rtx`).

## 2. Costura de Integração (`tests/integration/*.test.ts`)

Valida a composição completa cliente/servidor nas fronteiras externas sem depender de rede real da Cloudflare:

- `tests/integration/cloudflare-sfu-service.test.ts`: `CloudflareRealtimeSfuService` contra `FakeCloudflareCallsProvider`, validando reutilização de no máximo 1 sessão Publisher + 1 Subscriber por participante, publicação conjunta `screen` + `screen-audio` sem polling, broadcast imediato de `sfu-publications`, moderação e política mensal de consumo (`UsagePolicy`).
- `tests/integration/cloudflare-sfu-adapter.test.ts`: `CloudflareSfuExecutionAdapter` + `VoiceEngineController` contra `FakeRTCPeerConnection` e `FakeDisplayMedia`, validando limite de 2 `RTCPeerConnection`s por chamada, serialização de renegociação SDP, _keep-alive sink_ e priorização `video/rtx`.

## 3. Costura E2E (`tests/e2e/*.spec.ts`)

Executada pelo runner `scripts/test.cjs --layer e2e --retries 1` via `@playwright/test`:

- Valida a aplicação web estática em Chromium real usando `--use-fake-device-for-media-stream` e `--use-fake-ui-for-media-stream` para fluxo de autenticação/sala e chamada de voz com transmissão de tela e áudio entre participantes.

## Runner Unificado (`scripts/test.cjs`)

O script `scripts/test.cjs` suporta filtragem e listagem por camada:

```bash
# Listar arquivos de cada camada
node scripts/test.cjs --list --layer unit
node scripts/test.cjs --list --layer integration
node scripts/test.cjs --list --layer e2e

# Filtrar por padrão de arquivo
node scripts/test.cjs --layer unit --filter screen-share

# Rodar toda a pirâmide local (unit + integration)
npm test
```
