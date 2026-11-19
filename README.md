# A Lei do Trono

Plataforma web, desktop (Electron) e mobile (Android/Capacitor) de comunicação em voz/vídeo, transmissão de tela e jogos de tabuleiro em tempo real.

A arquitetura de voz e transmissão de tela combina o **motor determinístico baseado no Fluxer (`@trono/voice-engine`)** com **sessões assimétricas persistentes no Cloudflare Realtime SFU**, separando claramente o backend (**Render**) do frontend estático (**Surge**).

## Estrutura do Repositório

```text
.
├── apps/
│   ├── server/                 # Backend Node.js + Express + WebSocket + SFU (deploy Render)
│   ├── web/                    # Frontend Next.js Static Export (src/, public/, out/ -> Surge)
│   └── desktop/                # Host Electron e helpers nativos (empacota apps/web/out)
├── packages/
│   ├── protocol/               # Contratos tipados e validadores puros SFU (@trono/protocol)
│   └── voice-engine/           # Motor Fluxer: reducers, runtime, políticas e adaptador SFU
├── scripts/                    # Automação de build, empacotamento e runner da pirâmide
├── supabase/                   # Migrações e scripts SQL de persistência
├── tests/
│   ├── unit/                   # Base (~70%): protocolo, reducer, runtime, políticas e plumbing
│   ├── integration/            # Meio (~20%): adaptador WebRTC cliente e serviço SFU backend
│   └── e2e/                    # Topo (~10%): fluxos críticos ponta a ponta no Playwright
└── docs/
    ├── ARQUITETURA.md          # Módulos profundos, costuras e diagramas de fluxo
    ├── DEPLOY_RENDER_SURGE.md  # Guia de deploy independente Render (back) e Surge (front)
    ├── PIRAMIDE_DE_TESTES.md   # Estratégia de testes nas 3 costuras (70/20/10)
    └── adr/                    # Registros de Decisão Arquitetural (ADRs)
```

## Pré-requisitos

- **Node.js `>= 24.12.0`** (projeto validado em Node 26 com `--experimental-strip-types` nativo)
- **npm workspaces** habilitado (via `npm install` na raiz)

## Comandos Principais

### Desenvolvimento e Build

| Comando                  | Descrição                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `npm run dev`            | Sobe o frontend Next.js em modo desenvolvimento (`127.0.0.1`)                        |
| `npm run server:dev`     | Compila `@trono/protocol` e `@trono/voice-engine` e inicia o servidor com `--watch`  |
| `npm run build:packages` | Compila os workspaces `packages/protocol` e `packages/voice-engine`                  |
| `npm run build:server`   | Compila os pacotes compartilhados e valida tipos de `@trono/server`                  |
| `npm run build:web`      | Compila os pacotes, prepara renderer e gera a exportação estática em `apps/web/out/` |
| `npm run deploy:surge`   | Executa `build:web` e publica `./apps/web/out` no Surge (`a-lei-do-trono.surge.sh`)  |

### Qualidade e Pirâmide de Testes

| Comando                    | Descrição                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`        | Compila pacotes e valida tipos TypeScript em web e server                                                 |
| `npm run format:check`     | Verifica formatação Prettier em `packages`, `apps`, `tests`, `scripts`, `README.md`, `AGENTS.md` e `docs` |
| `npm run test:unit`        | Executa testes unitários em `tests/unit/*.test.ts`                                                        |
| `npm run test:integration` | Executa testes de integração em `tests/integration/*.test.ts`                                             |
| `npm run test:e2e`         | Executa testes E2E Playwright em `tests/e2e/*.spec.ts` com `--retries 1`                                  |
| `npm test`                 | Compila pacotes e executa as camadas unitária e de integração                                             |

## Documentação Técnica

- [Arquitetura do Motor de Voz e SFU (`docs/ARQUITETURA.md`)](docs/ARQUITETURA.md)
- [Deploy Independente no Render e Surge (`docs/DEPLOY_RENDER_SURGE.md`)](docs/DEPLOY_RENDER_SURGE.md)
- [Pirâmide de Testes (`docs/PIRAMIDE_DE_TESTES.md`)](docs/PIRAMIDE_DE_TESTES.md)
- [ADR 001 — Motor Fluxer com Adaptador Cloudflare SFU](docs/adr/001-motor-fluxer-com-adaptador-cloudflare-sfu.md)
- [ADR 002 — Sessões Assimétricas Publisher/Subscriber Cloudflare](docs/adr/002-sessoes-assimetricas-publisher-subscriber-cloudflare.md)
- [ADR 003 — Separação de Apps Render e Surge](docs/adr/003-separacao-apps-render-e-surge.md)
