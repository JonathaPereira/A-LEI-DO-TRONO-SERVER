# Working in this repository

Aplicativo web, Electron e host Android de comunicação e jogos. Explique no idioma do usuário.
A instrução mais recente do usuário prevalece sobre convenções e skills.

## Antes de alterar

- Confira git status e branch. Use contribuição codex/; preserve alterações
  existentes e mantenha main intacta. Commit, push, PR, deploy e instalação
  exigem autorização compatível com a ação.
- Leia [docs/MIGRACAO.md](docs/MIGRACAO.md) para plano/checkpoint e
  [docs/agents/workflow.md](docs/agents/workflow.md) para implementação e revisão.
- Consulte [docs/ARQUITETURA.md](docs/ARQUITETURA.md) para donos; para apresentação,
  leia [docs/UX_COMUNICACAO.md](docs/UX_COMUNICACAO.md). Preserve aceites por marco.
- Inspecione código/testes e explicite resultado esperado, invariantes e limite
  público antes de implementar. Decisões já aprovadas dispensam reconfirmação.

## Contratos permanentes

- Novos comportamentos/correções seguem TDD nos limites aprovados. Use as skills
  pertinentes conforme workflow; respeite invocação manual e ferramentas reais.
- Edite fontes em src, server, electron e android. Assets copiados em
  android/app/src/main/assets/public e configs Capacitor gerados são saídas. out, .next e JS/CSS gerados da raiz de
  public são saídas. Confirme origem antes de remover assets, vendor, manual ou
  roguelite. Jogos completos e recursos existentes devem ser preservados.
- Um socket por cliente e um dono por recurso de mídia. Transfira estado,
  listeners e descarte juntos. Consumidores emprestados não encerram tracks.
- Reutilize controladores; React apresenta snapshots. Fachadas delegam ao mesmo
  dono. Troca de conta/sala invalida operações antigas e libera seu escopo.
- Next exporta a interface compartilhada com Electron e Android; backend existente possui
  conta, dados, WebSocket, validação e autorização. Mudanças nesses limites são
  decisões arquiteturais explícitas.
- Cloudflare: use CLI cf, exceto quando houver configuração Wrangler.

## Verificação e documentação

Após código: typecheck, format:check, build e regressões pertinentes dos scripts
vigentes. Build antes das suítes de interface. Confira mídia no Electron real
conforme [desenvolvimento](docs/DESENVOLVIMENTO_DESKTOP.md), declarando fixtures e
limitações. Avalie manualmente e obtenha aceite antes de novos testes visuais.

Revise o diff completo, incluindo novos arquivos e alterações sem commit. Use
code-review com base compatível. Entregue somente evidências realmente concluídas.

Atualize os documentos donos; não crie planos/relatórios Markdown por ajuste.
MIGRACAO guarda execução; UX guarda produto/referência Discord; arquitetura guarda
donos; desenvolvimento guarda operação; workflow guarda contribuição. Histórico
fica no Git e evidências temporárias em artifacts. Preserve documentação de
jogos, licenças e distribuição necessária.
