# Fluxo de contribuição

## Antes de implementar

Leia AGENTS.md e docs/MIGRACAO.md. Consulte arquitetura para os donos afetados e
UX_COMUNICACAO para apresentação. Inspecione código e regressões antes de alterar.
Preserve alterações existentes e use contribuição codex/. Commit, push, PR,
instalação e deploy precisam de autorização compatível com a ação.

## Skills e limites de teste

Use codebase-design ao alterar a interface ou o dono de um módulo, tdd para novos
comportamentos/correções e writing-for-agents para instruções/documentação de
agentes. Use diagnosing-bugs para falhas sem causa estabelecida, research para
investigação factual, prototype para dúvidas de interação e domain-modeling para
terminologia/decisões de domínio. Anuncie a skill na primeira aplicação.

Respeite disable-model-invocation e capacidades reais da sessão. Skills manuais
dependem de invocação explícita; sua escolha não autoriza publicar no tracker.
Skills indisponíveis não autorizam instalação ou configuração por conta própria.

Os limites já aprovados para a reconstrução são comandos/snapshots públicos de
controladores, HTTP/WebSocket, fluxos Playwright e recursos nativos no Electron.
Não é preciso reconfirmá-los. Um novo contrato ainda não decidido exige alinhamento.

## TDD e revisão

Implemente pequenas fatias verticais: resultado esperado independente; teste
falhando pelo comportamento correto; implementação mínima; teste aprovado.
Erro de importação ou ambiente não comprova a reprodução. Reaproveite seams e
fixtures. Teste comportamento, autorização, identidade, cancelamento e descarte
quando afetados, sem espelhar métodos privados.

Documentação e apresentação sem comportamento novo recebem verificação
proporcional. Aceite visual humano antecede novos snapshots permanentes.

Após código, execute typecheck, format check, build e regressões afetadas.
Interface consome out: faça build antes. Mídia exige Electron real. Declare
simulações e limitações ambientais. Revise o diff completo, inclusive novos
arquivos e alterações sem commit, contra pedido e padrões; use code-review
quando houver base compatível, sem criar commit para fabricar uma base.

## Documentação, tracker e encerramento

Atualize o documento dono da informação; não crie MD por sessão/ajuste. Migração
guarda andamento; UX guarda produto; arquitetura guarda donos; desenvolvimento
guarda ambiente/operação. Relatórios temporários ficam em artifacts.

Issues/specs ficam no GitHub do remote atual. Inspecione tickets e dependências
antes de tratá-los como contrato; publique somente com autorização do usuário.
PR não é uma fila automática de novos pedidos. Não invente rótulos de triagem:
use o vocabulário vigente no tracker quando essa operação for solicitada.

Para Discord, use reverse-engineer-anything e a seção de referência em
UX_COMUNICACAO. Diferencie observação, inferência e lacuna; cenários visuais não
comprovam captura física ou qualidade de transporte.

Conclua informando resultado, checks realmente executados, pendências e aceite
necessário. Preserve aceites anteriores; não atribua aprovação ao usuário sem
recebê-la.
