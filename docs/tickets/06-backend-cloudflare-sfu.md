# 06: Serviço Backend Cloudflare SFU Assimétrico e Organização `apps/server` (Render)

**O que construir:** Implementar `CloudflareRealtimeSfuService` em `apps/server/src/modules/sfu/` suportando sessões assimétricas persistentes (1 Publisher + 1 Subscriber por participante), publicação em lote `publish-tracks` com anúncio imediato no catálogo da sala (eliminando bloqueio por `publication-ready`), moderação, TURN e política de orçamento mensal, além da separação limpa do backend para deploy no Render.

**Bloqueado por:** 02: Contratos Compartilhados SFU, Voz e Sinalização (`@trono/protocol`).

**Status:** concluido

- [x] `CloudflareRealtimeSfuService` reutilizando a sessão Publisher e a sessão Subscriber no Cloudflare Calls.
- [x] Anúncio imediato de `sfu-publications` após confirmação de `tracks/new`, mantendo compatibilidade retroativa no gateway.
- [x] Testes de integração em `tests/integration/cloudflare-sfu-service.test.ts` com `FakeCloudflareCallsProvider` passando via TDD.
