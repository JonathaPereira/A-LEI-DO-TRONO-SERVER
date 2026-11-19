# 01: Bootstrap da Branch, MCPs, Skills Matt Pocock e Estrutura Monorepo

**O que construir:** Criar a branch isolada `codex/fluxer-cloudflare-rebuild`, configurar os servidores MCP (`context7` e `cloudflare-docs`), vincular as skills de engenharia do Matt Pocock em `.agents/skills/`, eliminar toda a documentação `.md` legada e todos os testes antigos, e criar a estrutura de pastas do monorepo separando `apps/server` (Render), `apps/web` (Surge), `apps/desktop` (Electron) e `packages/{protocol,voice-engine}`.

**Bloqueado por:** Nenhum (pode iniciar imediatamente).

**Status:** concluido-parcial-em-execucao

- [x] Branch `codex/fluxer-cloudflare-rebuild` criada a partir de `main` sem alterar `main`.
- [x] Servidores MCP `context7` e `cloudflare-docs` configurados em `mcp_config.json`.
- [x] Skills do Matt Pocock vinculadas em `.agents/skills/`.
- [x] Docs legados e 100% dos testes antigos removidos.
- [x] Workspaces e pacotes iniciais configurados no `package.json`.
