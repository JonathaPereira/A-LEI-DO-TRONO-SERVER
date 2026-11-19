# 02: Contratos Compartilhados SFU, Voz e Sinalização (`@trono/protocol`)

**O que construir:** Definir no pacote `packages/protocol` os tipos discriminados e validadores puros das mensagens WebSocket trocadas entre `apps/web` e `apps/server` para o modelo de sessões assimétricas Cloudflare SFU (`ensure-session`, `publish-tracks`, `unpublish-tracks`, `subscribe-tracks`, `renegotiate`, `update-subscription`, `close-session`, `ice-config`, `list-publications`), além de validadores de SDP e catálogos de publicação.

**Bloqueado por:** 01: Bootstrap da Branch, MCPs, Skills Matt Pocock e Estrutura Monorepo.

**Status:** concluido

- [x] Contratos TypeScript puros exportados por `@trono/protocol`.
- [x] Validadores puros rejeitando SDPs inválidos, tipos desconhecidos e payloads acima do limite.
- [x] Testes unitários de contrato em `tests/unit/protocol-sfu.test.ts` escritos via TDD e passando.
