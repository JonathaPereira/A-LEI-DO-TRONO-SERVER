# 07: Integração `apps/web` (Surge) e `apps/desktop` (Electron) ao Novo Motor de Voz

**O que construir:** Integrar o controlador `@trono/voice-engine` e o `CloudflareSfuExecutionAdapter` na interface web (`apps/web`) e no host desktop (`apps/desktop`), eliminando o legado acoplado e garantindo scripts independentes de build e publicação entre `apps/server` (Render) e `apps/web` (Surge).

**Bloqueado por:**

- 05: Adaptador Cliente WebRTC Assimétrico para Cloudflare Realtime SFU
- 06: Serviço Backend Cloudflare SFU Assimétrico e Organização `apps/server`

**Status:** concluido

- [x] Interface web (`apps/web`) compilando em exportação estática para o Surge consumindo `@trono/voice-engine` e `@trono/protocol`.
- [x] Host Electron (`apps/desktop`) apontando para a nova organização de build e captura nativa.
- [x] Scripts `build:server`, `start:server`, `build:web` e `deploy:surge` funcionais.
