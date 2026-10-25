# Reconstrução do frontend

Atualizado em 25/10/2026. Este é o plano de execução e o checkpoint para qualquer
agente continuar sem o histórico do chat. Produto e referência visual ficam em
[UX_COMUNICACAO.md](UX_COMUNICACAO.md); donos em
[ARQUITETURA.md](ARQUITETURA.md); ambiente em
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).

## Estado e autorização

- Reinício solicitado pelo usuário após perda das alterações anteriores.
- Base: `f343049`. Contribuição: `codex/frontend-rebuild`; main permanece intacta.
- Implementação local autorizada. Em 25/10/2026, o usuário aprovou o Marco 2 e
  autorizou o commit de todas as alterações atuais para separar o Marco 3.
  Push, PR, instalações nativas e deploy continuam fora desta autorização.
- `package-lock.json` já tinha alterações ao iniciar: preservá-las.
- Marcos 1 e 2 receberam aceite. Marco 3 autorizado para implementação; seu
  aceite visual e a verificação integrada final continuam pendentes.
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
  A chamada ativa foi observada depois; veja o checkpoint do Marco 2 abaixo.
- A revisão automática recusou exclusão de views por checagem só de imports.
  Nenhuma exclusão foi executada naquela rodada; o Marco 3 registra as remoções
  posteriores. Auditoria adicional de 11 views
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
- Direção visual do Marco 1 aceita. Marco 2 implementado após observação da
  chamada por REA, com captura nativa validada e aceite recebido em 25/10.
  O corte final continua pendente no Marco 3.

## Marco 2 — aprovado em 25/10/2026

Marco 1 aprovado pelo usuário com “agora sim”. O commit local e1070da registra
esse marco. O usuário aprovou o resultado do Marco 2 após testar a interface e
solicitou o commit de todas as alterações atuais na mesma branch, estabelecendo
uma referência antes do Marco 3. O commit local é `e170860`; não houve push.

### Referência e implementação

A chamada preparada pelo usuário foi observada com REA: quatro pessoas, duas
telas, grade e foco em pessoa/transmissão. Playwright realizou as trocas de foco;
REA inspecionou/capturou os estados. Os menus vieram das capturas do usuário.
IDs, fatos, adaptações e lacunas estão no documento UX. Não há pedido pendente
para repetir aquela preparação.

Em 25/10, a janela isolada havia sido fechada (CDP 9333 recusou conexão).
Foi reaberta com o mesmo perfil e a sessão autenticada recuperada foi inspecionada
com REA. Isso não substitui as evidências anteriores da chamada.

- Grade responsiva com pessoa e tela separadas, foco manual e miniaturas, barra
  Phosphor, conversa lateral recolhível e acesso às configurações.
- Um único compositor/conversa e o mesmo player por mídia permanecem montados.
  Os contêineres dos players passam entre shell e hosts dos jogos sem recaptura.
- Menus de voz e transmissão têm volumes independentes, silenciar local,
  assistir/parar, câmera, prévia local, troca de fonte e moderação existente.
  Permissões exibidas continuam derivadas do stage e verificadas no servidor.
- Configurações apresentam dispositivos, ganhos, processamento, qualidade,
  áudio, permissões e diagnóstico. O seletor conserva o dono nativo existente.
- Corrigidos: player da transmissão preso no host dos jogos; grade cortada com
  seis cartões; miniaturas abaixo da área útil; Escape fechando menu e foco ao
  mesmo tempo; saída explícita do fullscreen nativo; chaves de diagnóstico.
- A regressão encontrou hover oscilante no resultado do Love Letter com movimento
  reduzido: posições alternavam 34/36 px a cada frame. Um teste mínimo confirmou
  a causa. CSS agora mantém esse botão imóvel somente nessa preferência; o
  visual normal e as declarações anteriores dos jogos permanecem preservados.
- Fixtures de Azul/Splendor/Love Letter passaram a entrar na voz pela navegação
  pública, preservando jogadas, segredos, reconexão, placares e asserts de mídia.
  Removida instrumentação temporária do resultado de Love Letter.

| Dono                                                  | Responsabilidade                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| voice/stage.ts                                        | Participantes, foco pessoa/tela, streams emprestadas, volumes e moderação. |
| voice/navigation.ts                                   | Página aberta independente da participação em voz.                         |
| voice/toolbar.ts                                      | Ações no gesto original e capacidades reais da plataforma.                 |
| voice/settings.ts e screen-options                    | Dispositivos, ganhos e preferências de transmissão.                        |
| settings/initialize.ts                                | Preparação funcional sem montar a apresentação antiga.                     |
| desktop/capture.ts                                    | Seleção/cancelamento nativo; único wrapper de captura.                     |
| components/voice/media-tile.tsx                       | Player permanente transferido entre hosts do shell e jogos.                |
| components/application/call*.tsx e media-settings.tsx | Nova apresentação, slots e assinaturas; sem novos donos de captura/rede.   |

### Validação concluída

| Verificação                                   | Resultado e evidência em artifacts/frontend-reset                     |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Core determinístico completo                  | 1.403/1.403; call-core.log.                                           |
| Chamada e autenticação no navegador           | 4/4; call-browser-regression.log.                                     |
| Jogos integrados e hover reduzido             | 15/15; call-games-final.log.                                          |
| Electron real: chamada/captura e autenticação | 2/2; call-desktop-regression.log.                                     |
| Tipos, formatação e exportação estática       | Passaram; call-typecheck.log, call-format-check.log e call-build.log. |

Playwright conferiu 1440×900, 1024×768, 768×1024 e 390×844. Conferiu também
quatro contas e duas transmissões via WebRTC, foco, volumes separados, Escape,
fullscreen e continuidade em chat/catálogo/Trono/configurações. Capturas em
call-qa; não são snapshots visuais aprovados.

No Electron, main/preload e captura de uma BrowserWindow controlada são reais.
Cancelamento inicial e de troca de fonte, pausar/retomar prévia, fullscreen,
navegação, parar tela e sair da voz preservam/liberam as tracks esperadas.
Microfone é sintético; permissões são pré-concedidas apenas no perfil descartável.
Não comprova equipamento físico, áudio por aplicativo ou qualidade pela internet.
Os cenários dos jogos que simulam a ponte Windows continuam identificados como
fixtures; não são os dois cenários de Electron real da tabela.

Testes novos constam de tests/suites.json e das seleções existentes no CI; nenhuma
nova entrada npm foi criada. Artefatos de falha do CI incluem call-qa. Pipeline
remota não foi executada/publicada. Revisão local incluiu diff e arquivos novos;
backend, preload, armazenamento e protocolos foram preservados.

### Ajustes após o feedback visual de 25/10

O usuário gostou da direção e pediu mais espaço para a transmissão, foco por
clique no quadro e um cenário com dez pessoas. Ajustes incorporados sem avançar
para o Marco 3:

- Cabeçalhos compactos na chamada e miniaturas em faixa horizontal no foco.
  A transmissão conserva sua proporção e não perde conteúdo por recorte.
- O quadro inteiro é acionável por mouse, toque e teclado. Clicar no quadro
  ampliado volta à grade; uma transmissão ainda não assistida abre e recebe foco.
  Controles e menus continuam separados da área de seleção.
- Cartões, vídeos e streams mantêm identidade ao passar entre grade/foco/faixa.
  Recepção, socket, captura e volumes continuam nos donos anteriores.
- Cenário descartável real da aplicação com dez contas, quatro câmeras
  ilustradas e duas transmissões sintéticas via WebRTC local. Contas são
  preparadas em duas levas antes de conectar clientes, sem alterar o limite de
  cadastro da produção. Não é teste de capacidade de rede/hardware de dez pessoas.
- QA em 1920×1080, 1440×900, 1024×768, 768×1024 e 390×844. Doze quadros cabem
  em quatro colunas/três linhas no desktop; a faixa do foco rola sem mover o
  quadro principal. Identidade do player e foco de teclado foram conferidos.
- Validação desta rodada: 41/41 contratos pertinentes em call-space-models.log;
  2/2 fluxos da chamada em call-ten-people.log; 8/8 verificações de autenticação
  e navegação/Corte em call-space-navigation.log; 1/1 fluxo de captura no Electron
  real em call-space-desktop.log. typecheck, format check e build passaram.
  Não foi repetida a suíte core completa nesta rodada de apresentação.

As imagens de demonstração ficam em artifacts/frontend-reset/call-qa:
grid-ten-people.png, focus-ten-people.png, camera-focus-ten-people.png e versões
com a largura no nome. Fontes e teste permanecem na aplicação; as imagens são
evidência de QA, sem novos snapshots dourados ou comandos npm. Após esses
ajustes, o usuário confirmou o aceite final do Marco 2; Marco 3 ainda não aprovado.

### Próximo passo e pendências

1. Marco 2 registrado em `e170860`; nenhum commit do Marco 3 foi solicitado.
2. Concluir Marco 3: perfis, arquivos, soundboard, clipes, gravação, Remote PC
   e administração, reutilizando os donos preservados.
3. Atualizar regressões antigas que ainda dependem dos layouts retirados à medida
   que seus recursos forem reintegrados. Não retirar cobertura útil para obter CI
   verde. A suíte completa browser/desktop e a pipeline inteira ainda não foram
   declaradas aprovadas.
4. Concluir revisão semântica e corte das views antigas fora dos jogos, mantendo
   a matriz de preservação atualizada. A auditoria anterior é indício, não prova
   suficiente para excluir fontes. Não recriar uma árvore de frontend legado.
5. Registrar verificações de hardware/áudio nativo ainda ausentes quando houver
   ambiente pertinente, e concluir a verificação integrada dos recursos do Marco 3.

Evidências temporárias ficam em artifacts/frontend-reset; plano, andamento e
pendências continuam neste arquivo. Marcos 1 e 2 aprovados; Marco 3 pendente.

## Marco 3 — em implementação

Base local: `e170860`, branch `codex/frontend-rebuild`. Alterações sem commit.
O ajuste prévio do usuário nos imports Phosphor (`*Icon`) foi preservado.
Backend, banco e código nativo permanecem sem alterações nesta etapa.

### Integração disponível

- Perfil, rascunho, salvar/descartar, GIFs, viewer e diretório do criador usam os
  donos existentes. Abas conservam campos/rascunhos; troca de conta invalida
  respostas antigas. Biblioteca mantém proteção de mídias de perfil e isolamento.
- Configurações incluem notificações, cores das mesas, áudio dos jogos, arquivos
  e atividade no desktop. Lembrar sessão e permissões usam a sessão/ponte atuais.
  O tema é aplicado à superfície delimitada dos jogos; a Corte conserva o dourado.
- Soundboard, gravação, replay web e Remote PC têm acesso na sidebar e nos jogos.
  A aba Recursos mantém os mesmos controles e hosts de gravação/clipes/Remote PC;
  as mesas possuem acesso a essa aba, sem transferir os controles de DOM.
  Foram retirados os controles/hosts duplicados do antigo painel dos jogos.
- Replay automático continua suspenso no Windows, conforme política nativa.
  A central explica essa disponibilidade. Não foi ativado replay nativo.
- Canais, cargos e arquivos do canal reutilizam autorização e cancelamento dos
  controladores atuais. Sidebar indica chamada ativa, não lidas e canais silenciados.
- Cinco views retiradas: auth/dialogs, auth/host, navigation/portal-contents,
  portal-parallax e portal-credits. Formulários/download estão em application/auth;
  navegação em shell; música/créditos em game-settings sobre audio/catalog.
  A matriz de preservação foi atualizada. A revisão semântica específica fica em
  artifacts/frontend-reset/marco3-removal-review.json. Outras views não foram
  excluídas por ausência de imports; a limpeza final ainda não terminou.

### Gravação e isolamento das fixtures

A fixture parava o MediaRecorder após 1.200 ms, antes do primeiro bloco codificado
no Chrome. O helper compartilhado agora aguarda dados codificados também no
Electron. A instrumentação temporária de eventos/contextos foi retirada; o
observador necessário à sincronização fica somente nos testes. Não houve mudança
de codec ou mixer de produção para contornar a fixture.

O cenário Electron passou a escolher uma porta livre: a porta fixa 11994 estava
ocupada por uma fixture de outro worktree. O processo desse outro trabalho foi
preservado. O encerramento do helper de backend reconhece também signalCode.

### Verificações concluídas nesta rodada

| Verificação                                                                                   | Evidência em artifacts/frontend-reset                                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Core completo: 1.404/1.404                                                                    | marco3-core-final.log                                                                                             |
| Aparência e perfil: 6/6, após falha reproduzida do tema das mesas                             | marco3-appearance-profile.log                                                                                     |
| Arquivos, viewer e contas: 9 casos aprovados; o perfil falhou nessa rodada e passou depois    | marco3-account-browser.log; perfil final em marco3-games-cut.log                                                  |
| Canais/anexos: 2/2, incluindo criar/excluir, mute, não lidas e continuidade de voz            | marco3-channels-green.log                                                                                         |
| Chamada, navegação, Remote PC e soundboard: 11/11                                             | marco3-call-regression.log                                                                                        |
| Replay web: dez aprovações e um skip externo                                                  | seção de clipes em marco3-resources-browser.log; outros recursos desse log falharam e tiveram rodadas posteriores |
| Gravação Chrome: quatro aprovações e um skip externo                                          | marco3-recording-final.log                                                                                        |
| Electron real: captura, configurações e gravação reproduzível preservando chamada/transmissão | marco3-electron-recording.log                                                                                     |
| Azul, Splendor, Love Letter, Ticket to Ride, navegação e perfil: catorze aprovações           | marco3-games-cut.log; esse log também contém falhas antigas do Trono, corrigidas abaixo                           |
| Trono: seis decretos e teste pai aprovados                                                    | marco3-throne-final.log; história/lobby falharam nessa rodada                                                     |
| Trono: história completa e lobby/transferência rejeitada: 2/2                                 | marco3-throne-remainder.log                                                                                       |
| Tipos, formatação e exportação estática                                                       | marco3-typecheck.log; marco3-format-check.log; marco3-build.log                                                   |

Fixtures antigas do Trono passaram a entrar na voz pelo shell atual. Permutações
original/discord retiradas foram substituídas pelo cenário Corte, mantendo tamanhos,
regras, cartas privadas, confirmação, tooltips, histórico e identidade das tracks.
A transferência rejeitada usa o comando público do lobby, pois retomar um jogo
agora reabre o lobby corrente. Não foram atalhadas as partidas para obter aprovação.

FFprobe/FFmpeg estão ausentes: as verificações externas aparecem como skip.
Codificação/decodificação e frames/seek no Chrome continuam obrigatórios. Captura
Electron usou uma BrowserWindow controlada real; microfone é sintético e permissões
foram previamente concedidas apenas no perfil temporário. Remote PC teve vídeo
WebRTC direto e entrada/consentimento numa ponte fixture; isso não comprova injeção
nativa no Windows. Capturas ficam em marco3-qa/; não são snapshots visuais aceitos.

### Pendências para continuar

1. Concluir revisão semântica/corte das views/adaptadores/estilos restantes,
   atualizando a matriz por arquivo. Não recriar uma árvore de frontend legado.
2. Completar QA integrado de notificações/atividade e caminhos nativos pendentes,
   declarando equipamento/serviço indisponível. Preservar cobertura ao adaptar
   outras fixtures antigas; a suíte browser/desktop completa e a pipeline inteira
   não foram declaradas aprovadas.
3. O CI existente recebeu os filtros dos recursos reintegrados, sem novo alias npm.
   Conferir o resultado remoto somente quando houver autorização para publicar.
4. Revisar a entrega integrada e obter aceite visual do Marco 3. Não houve aceite,
   commit, publicação ou deploy desta etapa; a migração continua aberta.

### Polimento atual do Marco 3 — feedback de 25/10

Entrada exclusiva e restauração sem login transitório; seleção de tela separada
da participação em voz; Amigos/Convites/Comunidade; cartão da conta e remoção da
seta decorativa permanecem da primeira revisão (`polish-*`).

A segunda revisão substitui a composição inferior: sidebar de 280px, conexão e
ações câmera/tela/soundboard separadas da faixa de conta (mic/fones/configurações).
Na chamada, soundboard fica depois de mic/fones; a configuração redundante com
reticências saiu. Gravação, clipes e Remote PC ficam em Configurações → Recursos,
com controles permanentemente montados e acesso nos jogos. Sair está no cartão
da conta. Não há transferência do dock entre sidebar e mesas.

GIFs e soundboard possuem estilos próprios. Galeria com cabeçalho/rodapé fixos,
miniaturas legíveis, atribuição e alternativa por link recolhível. Soundboard com
busca local, cartões de 60px e prévia/exclusão discretas; só sua lista rola, ou o
editor quando aberto. Prévia do perfil compacta sem scroll interno nem cena
duplicada. A aparência também deve alcançar o chat; essa ampliação foi adiada
explicitamente pelo usuário. Phosphor preservado.

Validação em artifacts/frontend-reset:

- `refine-core.log`: 1.405/1.405 contratos determinísticos, incluindo navegação
  para Recursos em web/desktop.
- `refine-final.log`: 11/11 — chamada, perfil, GIFs e soundboard, incluindo
  bibliotecas preenchidas e contínua posse dos players/capturas.
- `refine-desktop-final.log`: 2/2 no Electron real, captura/gravação/cancelamento
  e sessão nativa criptografada; microfone sintético e janela controlada de QA.
- `refine-resources.log`: 16 aprovações e um skip externo declarado; autenticação,
  gravação e Remote PC com ponte de teste preservam chamadas. Não comprova input
  de hardware ou transporte pela internet.
- `refine-clips-final.log`: 10 aprovações e um skip externo (FFmpeg/FFprobe ausentes);
  replay, áudio, busca temporal, exportação, quota e descarte passaram no Chrome.
- `refine-types.log`, `refine-format-check.log`, `refine-build.log`: tipos,
  formatação e exportação estática. `git diff --check` passou.

Capturas revisadas em refine-qa: 24 itens em 1440×900, 1024×768, 768×1024 e 390×844;
sons sintéticos e prévias ilustrativas com arte local dos jogos. Não são conteúdo
do Discord nem prova de serviço GIPHY ao vivo. call-qa mostra sidebar/barra da
chamada; marco3-qa mostra a prévia compacta. São evidências, não snapshots dourados
ou aceite humano. Referência desta revisão: oito imagens fornecidas pelo usuário;
REA autenticado e limites da observação anterior permanecem registrados no UX.

Rodadas intermediárias com falhas estão preservadas em refine-red/settings-red,
filled/first e clips/green; não apresentá-las como seleções integralmente verdes.
Nenhuma instalação, commit, publicação ou alteração de contrato de backend.
Continuam pendentes corte semântico restante, regressões legadas não adaptadas e
aceite visual integrado do Marco 3.

As revisões seguintes preservam preto/carvão neutro e dourado, áudio rápido só
na sidebar, fundos pessoais na chamada, capas laterais e conta delimitada fora
da voz. Os carregadores existentes respeitam accountId, época e URLs assinadas.
Sem correspondência de conta, a linha fica neutra; não inferir identidade por nome.

Checkpoint atual após as três últimas imagens: DMs recolhíveis com seis linhas
e expansão, avatares sem distorção; editor com campos/prévia em painéis irmãos,
rodapé próprio e Ver prévia em janelas estreitas; MemberCard com estilos locais,
capa inteira e composição própria para perfil completo. Nenhuma seção é cortada.
Clique no fundo dos modais externos aos jogos usa cancelamento nativo, fecha
apenas o de cima e conserva bloqueio de salvar. O teste também cobre arraste
iniciado dentro do diálogo e cancelamento de troca de fonte no Electron.

As falhas reproduzidas e correções estão nos logs final-polish-dm-red/green,
preview-red/green e dismiss-red/green em artifacts/frontend-reset. O primeiro
ensaio de DM tinha nome acessível incompleto (não provava o defeito); corrigido
antes do red definitivo, que detecta precisamente o avatar esticado. As rodadas
contrast-* da revisão anterior continuam como evidência histórica nos artefatos.
Capturas atuais: final-polish-qa (perfil compacto/completo), marco3-qa (editor,
alternância em tela pequena) e auth-regression/direct-group.png (24 conversas).
Arte local dos jogos ilustra perfis nas fixtures; não comprova GIPHY ao vivo.
Sem novos snapshots permanentes, commit ou aceite do Marco 3. As pendências
semânticas e de validação integrada acima continuam abertas.

Validação final desta revisão (logs final-polish-*): ui-final 10/10;
resources 31 aprovações e dois skips externos de FFmpeg/FFprobe ausentes;
desktop 1/1 no Electron real; contracts 98/98. Tipos, format:check, build estático
e diff --check passaram. QA inclui 1440×900, 1024×768, 768×1024 e 390×844.
Captura nativa usa uma janela controlada e microfone sintético; a ponte de
Remote PC não comprova injeção de hardware. A suíte completa e o CI remoto
continuam sem declaração de aprovação.
