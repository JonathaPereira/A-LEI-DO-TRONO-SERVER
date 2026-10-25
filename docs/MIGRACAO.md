# Reconstrução do frontend

Atualizado em 24/10/2026. Este é o plano de execução e o checkpoint para qualquer
agente continuar sem o histórico do chat. Produto e referência visual ficam em
[UX_COMUNICACAO.md](UX_COMUNICACAO.md); donos em
[ARQUITETURA.md](ARQUITETURA.md); ambiente em
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).

## Estado e autorização

- Reinício solicitado pelo usuário após perda das alterações anteriores.
- Base: `f343049`. Contribuição: `codex/frontend-rebuild`; main permanece intacta.
- Implementação local autorizada; commit, push, PR, instalações nativas e deploy não fazem
  parte desta autorização.
- `package-lock.json` já tinha alterações ao iniciar: preservá-las.
- O primeiro ponto de parada é o aceite humano do Marco 1. Marco 2 e Marco 3
  exigem os aceites anteriores; não registrar aceites ainda não recebidos.
- O corte de apresentação é parcial. Estilos necessários foram extraídos; views
  antigas sem montagem permanecem até a revisão semântica de suas dependências.

## Resultado esperado

Substituir toda a apresentação externa aos jogos, começando por uma base mínima
compilável. Preservar backend, regras, protocolos, lógica cliente e todos os
recursos atuais. Next/React/TypeScript e exportação estática compartilhada com
Electron permanecem. A entrada após autenticação será a comunicação, com área
própria de Jogos e visual próprio da Corte: preto/dourado sutil, sidebar única e Phosphor Icons.
Discord permanece referência de interação.

## Preparação e corte

1. Conferir branch, diff e recursos disponíveis. Registrar a referência visual
   dos jogos e executar regressões relevantes antes da extração.
2. Fechar o inventário por arquivo: preservar, desacoplar, substituir ou excluir.
   Considerar imports, fachadas Trono*, eventos, IDs, CSS, URLs, workers e IPC.
   Ausência de import estático não comprova que algo pode ser apagado.
3. Isolar interfaces completas dos jogos, seus recursos e estilos necessários.
   Separar catálogo/navegação geral dos lobbies e mesas preservados.
4. Separar inicialização funcional da montagem das telas. Reutilizar os donos
   existentes por comandos, snapshots e assinaturas.
5. Substituir a composição por uma base mínima e retirar apresentação antiga
   depois de extrair suas responsabilidades. Usar Git como histórico, sem criar
   uma árvore paralela de frontend legado.

## Matriz de preservação

| Área                                                                                    | Destino                                                                                                          |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| src/components/games, src/lib/games e src/styles/games                                  | Preservar fluxo completo: criação, lobby, mesa, regras, áudio, efeitos e resultados. Reconstruir catálogo geral. |
| public/roguelite                                                                        | Preservar Cinzas, recursos, salvamento e integração.                                                             |
| Artes, sons, fontes, manuais, vendor e licenças                                         | Preservar originais usados por jogos ou recursos existentes. Saídas compiladas não são fontes.                   |
| Tipos, validações e protocolos em src usados pelo servidor                              | Preservar mesmo que estejam fora de server.                                                                      |
| Avisos de turno/influência, cinemática e resultados em navigation                       | Incorporar à superfície preservada dos jogos.                                                                    |
| CSS de base, navegação, perfis, voz e desktop                                           | Extrair dependências dos jogos, mantendo precedência; remover apresentação exclusiva substituída.                |
| Sessão, socket, chat, arquivos, perfis, mídia, clipes, gravação, soundboard e Remote PC | Preservar lógica e posse dos recursos; desacoplar DOM e views.                                                   |
| server e electron                                                                       | Preservar serviços, autorização, protocolos, persistência, preload e integrações nativas.                        |
| Home, shell, comunicação e configurações antigas                                        | Substituir apresentação e posicionadores; retirar fontes quando suas responsabilidades estiverem extraídas.      |

A matriz versionável por arquivo é [frontend-preservation.csv](frontend-preservation.csv),
com decisões da base f343049, hashes e destinos. Ela não autoriza exclusões só por
classificação. Imports, IDs, variáveis e URLs detalhados ficam em
`artifacts/frontend-reset/inventory.json`; evidências temporárias ficam nesse diretório. Atualizar esta matriz quando a inspeção revelar uma
dependência nova; não criar outro documento de plano.

## Entregas e aceites

| Marco                              | Implementação                                                                               | Critério de aceite                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Preparação                         | Inventário, referência dos jogos, separação de inicialização e base compilável.             | Cada remoção possui destino conhecido e os jogos continuam verificáveis.            |
| 1 — Estrutura, comunicação e jogos | Autenticação, shell, canais, presença, chat, amigos/DMs, catálogo e jogos reintegrados.     | QA pelo agente, comunicação funcional, jogos preservados e aceite visual humano.    |
| 2 — Chamada e compartilhamento     | Grade/foco, controles, participantes, seleção de compartilhamento e configurações de mídia. | REA da referência pertinente, continuidade de mídia, Electron real e aceite humano. |
| 3 — Configurações e avançados      | Perfis, bibliotecas, soundboard, clipes, gravação, Remote PC e administração.               | Todos os recursos contemplados, corte final e aceite humano.                        |

## Contratos de implementação

- Um socket por cliente e um dono por recurso de mídia. Consumidores de streams
  emprestadas não encerram tracks. Troca de conta/sala invalida operações antigas.
- Tela aberta, destino do compositor e participação em voz/jogo são estados
  distintos. Navegar conserva chamada e players.
- Jogos ficam delimitados visualmente, incluindo overlays. O shell novo não
  depende da cascata antiga; preservar a aparência inicial dos jogos.
- Integração entre jogos, navegação, identidade, rede e áudio tem dono único.
  Fachadas de compatibilidade delegam ao mesmo dono.
- Preservar HTTP, WebSocket, IPC, armazenamento e autorização. Não ampliar backend
  nem executar migrações nesta reconstrução.

## Testes e comandos

Os limites aprovados são controladores/HTTP/WebSocket, fluxos pelo Playwright e
recursos nativos no Electron real. TDD para comportamentos novos e correções;
reutilizar suítes e fixtures. Aceite visual manual antes de snapshots permanentes.

Consolidar os 101 scripts atuais: manter operações necessárias e apenas um
comando de testes, `npm test`, com `--suite core|browser|desktop|all` e `--filter`.
Default: core determinístico. Seleção inválida ou vazia deve falhar claramente.
Atualizar CI e todos os consumidores junto da retirada dos aliases. Não diminuir
cobertura útil para reduzir quantidade de comandos.

Prioridades: sessão/isolamento; permissões; envio/histórico/anexos/retry; partidas
e reconexão; continuidade de chamada; cancelamento e descarte; perfis; soundboard;
clipes/gravação; Remote PC; foco, teclado, Escape e responsividade.

Após código: typecheck, format check, build e regressões afetadas. Build antes de
testes que consomem out. Conferir desktop, janela reduzida, tablet e telefone.
Mídia sintética não comprova hardware ou captura real. Falha de ambiente fica
registrada como pendência, sem alegar validação concluída.

## Documentação e conclusão

README aponta as fontes; AGENTS roteia instruções; arquitetura registra donos;
desenvolvimento cobre ambiente e operação; UX guarda produto/referência; este
arquivo guarda execução; docs/agents/workflow.md guarda contribuição e skills.
Atualizar essas fontes no lugar. Preservar documentação especializada necessária
a jogos, licenças e distribuição. Detalhes históricos permanecem no Git.

Concluído somente com os três aceites, todos os recursos com destino/evidência,
apresentação antiga retirada fora dos jogos, comandos e CI consolidados,
documentação coerente e checks aprovados. Até lá, registrar entregas e pendências
com precisão.

## Checkpoint desta retomada

- Branch criada. Build inicial e 67 regressões de regras/interface dos jogos passaram.
- Inventário de 1.120 arquivos; matriz durável em docs/frontend-preservation.csv.
  899 preservar, 147 desacoplar, 74 substituir; 25 compartilhados com servidor.
- Shell, autenticação, canais, chat, presença, amigos/DMs e catálogo novos sobre os
  donos existentes. Jogos ficam em superfície própria; fontes de áreas dos marcos
  seguintes permanecem preservadas, sem montagem no shell novo.
- 101 scripts consolidados em 19. Os 233 arquivos antes referenciados permanecem
  classificados; a classificação inclui também testes antes fora desses aliases.
- Phosphor 2.1.10 adicionado por solicitação do usuário; imports individuais.
  O bump de body-parser já existente no lockfile foi preservado.
- QA local passou: login direto, chat, amizade/aceite, DM, anexo privado, catálogo,
  abertura dos jogos, logout com recarga, convidado no catálogo/mesa e viewports
  1440, 1024 e 390; 12 verificações, sem erros JS nesse cenário.
- Core passou em 1.400/1.400 casos; typecheck, format check e build passaram.
- Regressão integrada final: 14/14 casos dos cinco jogos passaram, log em
  artifacts/frontend-reset/games-complete.log. Corrigidos cálculos de espaço,
  hosts de overlays fora do escopo e painel do Trono cobrindo Ticket to Ride.
  As declarações dos 20 estilos dos jogos foram conferidas contra a base.
- O teste de ordem de pacotes do Trono injeta uma fase sintética. Durante esse
  trecho, snapshots reais do relógio da fixture são retidos para não sobrescrever
  a fase; depois, retoma leitura autoritativa. Não é prova de um fluxo real de
  Usurpação ponta a ponta. Outros cenários exercitam o backend descartável.
- Electron está disponível nesta etapa. QA real de autenticação concluído com
  perfil temporário: modal, retorno autenticado da Corte, sessão cifrada,
  restauração, remoção de lembrar e logout. Captura/áudio nativos não foram
  validados por esse cenário; permanecem no Marco 2.
- REA CLI 6.7.0: registro alinhado, MCP ausente; janela isolada recuperada para
  o Marco 2. Nova inspeção autenticada de canais em rea-marco2-inspection.json.
  Chamada ativa/grade/foco/compartilhamento ainda aguardam observação específica.
- A revisão automática recusou exclusão de views por checagem só de imports.
  Nenhuma exclusão dessas views foi executada. Auditoria adicional de 11 views
  em 901 fontes cobre exports, IDs, eventos, fachadas, URLs, workers e IPC:
  artifacts/frontend-reset/presentation-audit.json. São indícios para revisão
  semântica; a remoção e o reset final das fontes continuam pendentes.
- Em 24/10, o usuário confirmou a direção visual do Marco 1 e apontou modal
  cortado e retorno ao login ao sair da Corte. Corrigidos: diálogo possui seu
  dimensionamento fora do shell; voltar preserva a conta e abre comunicação,
  ou catálogo quando convidado. A sessão não era encerrada: o destino era antigo.
- Rodada dessas correções: 74/74 casos de autenticação, navegação, Corte e
  Electron; typecheck, format check e build passaram. Dois casos públicos novos
  em application-shell-browser; auth-desktop adaptado e ambos ligados ao CI.
  Logs/capturas em artifacts/frontend-reset/auth-*.log e auth-regression/.
- Direção visual do Marco 1 aceita. Próximo marco: observar chamada ativa por REA
  e validar mídia no Electron. Marcos 2/3 e corte final continuam pendentes.

## Marco 2 — preparação em andamento

O usuário confirmou o Marco 1 com “agora sim” após as correções. A janela isolada
Discord/CDP 9333 está aberta e autenticada. Pedido pendente: o usuário preparar
uma chamada de teste que controla, idealmente duas pessoas e uma transmissão,
para observar o comportamento exigido antes da implementação visual.

Baseline dos donos preservados: 56/56 casos de stage, toolbar, ciclo de vida,
configurações e foco passaram; artifacts/frontend-reset/call-baseline.log.
Nenhuma nova apresentação de chamada foi implementada antes da referência.

| Integração existente               | Responsabilidade a preservar no novo desenho                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| voice/stage.ts                     | Participantes, streams emprestadas, interesse, volumes e moderação.                                                                      |
| voice/toolbar.ts                   | Ações no gesto original, estado e capacidades reais da plataforma.                                                                       |
| voice/settings.ts e screen-options | Dispositivos, saída, ganhos e preferências de transmissão.                                                                               |
| desktop/capture.ts                 | Seleção/cancelamento e integração nativa; um único wrapper de captura.                                                                   |
| components/voice/media-tile.tsx    | Players estáveis; destino DOM hoje depende de hosts por ID. Adaptar a apresentação sem duplicar vídeo ou interromper tracks emprestadas. |

Próximo passo: REA passivo na chamada preparada; separar fatos, inferências e
lacunas na seção Discord do contrato UX. Depois, reconstruir grade/foco,
controles, menus e seleção de captura com Phosphor e a identidade já aprovada.
