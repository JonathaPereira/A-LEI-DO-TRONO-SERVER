# ADR 003: Separação de Aplicações por Alvo de Deploy (`apps/server` no Render e `apps/web` no Surge)

- **Status:** Aceito
- **Data:** 2026-11-19

## Contexto

Com a introdução de pacotes compartilhados (`@trono/protocol` e `@trono/voice-engine`) e a necessidade de evoluir o servidor SFU/WebSocket independentemente da interface estática e do host desktop Electron, manter frontend, backend e contratos misturados sem fronteira de workspaces dificultava builds isolados, checagem de tipos independente e validação de deploy.

## Decisão

Organizar o repositório com **npm workspaces** separando claramente aplicações e pacotes compartilhados:

- `packages/protocol`: contratos tipados e validadores compartilhados (`@trono/protocol`).
- `packages/voice-engine`: motor puro de voz/tela e adaptador SFU (`@trono/voice-engine`).
- `apps/server`: backend Node.js + Express + WebSocket + `CloudflareRealtimeSfuService` (`@trono/server`), com build/typecheck e start independentes para o **Render**.
- `apps/web`: frontend Next.js com exportação estática (`output: 'export'` -> `out/`) para publicação independente no **Surge**.
- `apps/desktop`: host Electron que empacota a saída estática de `apps/web`.

## Consequências

- **Positivas:** `npm run build:server` e `npm run build:web` podem ser executados e verificados de forma independente; o backend não importa arquivos de UI e o frontend estático não embute dependências Node de servidor.
- **Trade-offs:** Exige compilar `packages/protocol` e `packages/voice-engine` (`npm run build:packages`) antes de `typecheck`, `build:server`, `build:web` ou empacotamento desktop, além de manter sincronizadas as variáveis `APP_URL` e `AUTH_ALLOWED_ORIGINS` no Render com o domínio publicado no Surge.
