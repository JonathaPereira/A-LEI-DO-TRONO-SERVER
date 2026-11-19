# Guia de Trabalho no Repositório (`AGENTS.md`)

Aplicativo web, desktop Electron e host Android de comunicação por voz/vídeo, transmissão de tela e jogos de tabuleiro. Responda e documente sempre em **PT-BR** (português do Brasil). A instrução mais recente do usuário prevalece sobre convenções e skills.

## Antes de alterar

- Confira `git status` e a branch atual (`codex/` para trabalho em andamento). Mantenha `main` intacta e preserve alterações existentes. Commit, push, PR, deploy e instalação exigem autorização explícita.
- Consulte os documentos donos antes de propor ou implementar mudanças:
  - Arquitetura, módulos profundos e fronteiras: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
  - Deploy independente Render + Surge: [`docs/DEPLOY_RENDER_SURGE.md`](docs/DEPLOY_RENDER_SURGE.md)
  - Pirâmide de testes e costuras: [`docs/PIRAMIDE_DE_TESTES.md`](docs/PIRAMIDE_DE_TESTES.md)
  - Decisões arquiteturais: [`docs/adr/`](docs/adr/)
  - Especificação de voz/SFU: [`docs/specs/01-transmissao-fluxer-cloudflare-sfu.md`](docs/specs/01-transmissao-fluxer-cloudflare-sfu.md)
- Inspecione código e testes da área afetada antes de editar e explicite resultado esperado, invariantes e limite público.

## Estrutura do Monorepo

- `packages/protocol`: contratos tipados compartilhados entre cliente e servidor (`SfuClientAction`, validadores de payload SFU, descritores de publicação e SDP).
- `packages/voice-engine`: motor puro baseado no Fluxer (`voice_engine_v2`) com reducer determinístico, filas por `resourceKey`, cancelamento por `operationId`, `SourceLifecycleRegistry`, `DisplayMediaCapture`, `ScreenShareTrackPlumbing` e `CloudflareSfuExecutionAdapter`.
- `apps/server`: backend Node.js + Express + WebSocket + `CloudflareRealtimeSfuService` para deploy isolado no **Render**.
- `apps/web`: frontend Next.js com exportação estática (`output: 'export'`, fontes em `apps/web/src/`, assets em `apps/web/public/`, saída em `apps/web/out/`) para deploy isolado no **Surge**.
- `apps/desktop`: host Electron e helpers nativos empacotando a saída estática `apps/web/out`.

## Contratos Permanentes

- **TDD nas 3 costuras da Pirâmide de Testes**: todo comportamento novo ou correção de bug começa com teste falhando nas interfaces públicas (`tests/unit/`, `tests/integration/`, `tests/e2e/`), nunca testando detalhes internos privados.
- **Regras TypeScript + Node 26 nativo (`strip-types` + `NodeNext`)**:
  - Use extensão `.ts` explícita em imports relativos internos em `packages/**` e `apps/server/**`.
  - Use sempre `import type` para imports exclusivos de tipo.
  - Mantenha `strict: true`, `noUnusedLocals: true` e `noUnusedParameters: true` sem suprimir erros com `any` ou casts inseguros.
- **Um dono por recurso de mídia e isolamento de captura**:
  - `SourceLifecycleRegistry` detém o ciclo de vida das tracks capturadas (`stop()` garantido em substituição/parada sem afetar capturas mais novas).
  - Consumidores emprestados (prévia, mosaico, _keep-alive sink_ `<video data-flx="voice.screen-share-keepalive">`) nunca chamam `track.stop()`.
- **Sessões assimétricas no Cloudflare Realtime SFU**:
  - No máximo 1 `RTCPeerConnection` Publisher + 1 `RTCPeerConnection` Subscriber por participante na chamada.
  - Renegociações SDP estritamente serializadas por sessão; publicação conjunta de `screen` + `screen-audio` sem espera artificial de ICE gather, sem mangling de `a=fmtp` no SDP e sem polling bloqueante de `publication-ready`.
- **Saídas geradas e preservação de jogos**:
  - Não edite manualmente saídas em `apps/web/out/`, `apps/web/.next/`, `packages/*/dist/`, `android/app/src/main/assets/public/`.
  - Preserve integralmente jogos completos, assets, migrações Supabase e documentação/licenças associadas.

## Verificação e Documentação

Após alterações de código:

1. Build de pacotes compartilhados e checagem de tipos: `npm run typecheck`
2. Checagem de formatação: `npm run format:check`
3. Build da aplicação afetada (`npm run build:server` e/ou `npm run build:web`)
4. Pirâmide de testes conforme camada alterada:
   - `npm run test:unit` (~70% — `tests/unit/*.test.ts`)
   - `npm run test:integration` (~20% — `tests/integration/*.test.ts`)
   - `npm run test:e2e` (~10% — `tests/e2e/*.spec.ts`, com `--retries 1`)
5. Entregue apenas evidências e saídas de comandos realmente executados após a edição final.
6. Atualize os documentos donos em `docs/` e `AGENTS.md`/`README.md` quando fronteiras ou operações mudarem; não crie relatórios soltos por ajuste.
