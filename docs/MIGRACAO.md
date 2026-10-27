# Reconstrução do frontend

Checkpoint atualizado em 27/10/2026.

Fonte única do plano e checkpoint. Produto/REA:
[UX_COMUNICACAO.md](UX_COMUNICACAO.md); donos:
[ARQUITETURA.md](ARQUITETURA.md); operação:
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md); contribuição:
[agents/workflow.md](agents/workflow.md). Detalhes históricos ficam no Git.

## Direção e autorização

Reconstruir a apresentação externa aos jogos mantendo backend, regras, recursos,
protocolos e lógica cliente. Next, React, TypeScript e exportação estática
compartilhada com Electron permanecem. Nenhuma migração de banco.

Visitante entra pela tela de login; após autenticação, comunicação diretamente.
Jogos têm catálogo próprio. A Corte usa preto/grafite e dourado, sidebar única
e Phosphor Icons. Discord orienta interações, sem reprodução literal.

Branch: codex/frontend-rebuild. Base original: f343049. Marcos 1 e 2:
e1070da e e170860. Último checkpoint anterior ao fechamento: edb8450.
Preservar alterações existentes e AGENTS/docs de agentes.

Os três marcos receberam aceite visual humano em 25/10/2026. Em 26/10, o
usuário autorizou commit/push desta contribuição, execução de Windows full app e
publicação automática da versão 0.3.5 no Surge após pipeline e instalador
aprovados. Main e PR ficam fora desta execução. Não instalar drivers/aplicativo
neste host; a aceitação do instalador pertence ao runner Windows descartável.

## Plano e entregas

| Etapa      | Conteúdo                                                                                           | Estado                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Preparação | Inventário, referência/regressões dos jogos, isolamento da cascata e inicialização desacoplada.    | Implementada.                                                                                      |
| Marco 1    | Autenticação, shell, canais, presença, chat, amigos/DMs, catálogo e jogos completos.               | Aceito visualmente.                                                                                |
| Marco 2    | Grade/foco, menus, conversa lateral, captura por abas e configurações de mídia.                    | Aceito visualmente; Electron real verificado.                                                      |
| Marco 3    | Perfis/GIF, arquivos, soundboard, clipes, gravação, Remote PC e administração; corte final e docs. | Aceito visualmente; implementação, corte e verificações locais concluídos. Limites nativos abaixo. |

Antes de remover fontes, identificar conteúdo, ações/estado, imports, referências
dinâmicas, fachadas Trono*, IDs/eventos, variáveis CSS e URLs. Grafo estático serve
para escolher candidatos, nunca como prova suficiente. Não criar outra árvore
de frontend legado: recuperação pelo Git.

## Preservação e destinos

Matriz por arquivo: [frontend-preservation.csv](frontend-preservation.csv).
Conserva caminhos/hashes da base e registra decisões/destinos após inspeção.
Assets, vendor, licenças, créditos e documentos distribuídos são fontes protegidas.
out e .next são saídas.

| Área                                                  | Tratamento vigente                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/components/games, src/lib/games, src/styles/games | Fluxos completos preservados: criação/lobby, partida, regras, efeitos, áudio, resultado e reconexão. Catálogo reconstruído.                                                               |
| public/roguelite                                      | Aplicativo Cinzas, assets, persistência e ponte preservados. Nexus mantém integração independente.                                                                                        |
| Elementos compartilhados dos jogos                    | Comunicação flutuante, avisos de turno/influência, cinemática, resultado, tooltips e controles ficam protegidos, mesmo fora das três pastas.                                              |
| Estilos compartilhados                                | Dependências extraídas para games e delimitadas por gameSurface, incluindo overlays. Shell usa CSS Modules próprios. Não apagar regras necessárias aos jogos por não aparecerem no shell. |
| Conta/rede/chat/arquivos/perfis/mídia                 | Donos existentes observados por snapshots; views novas delegam comandos.                                                                                                                  |
| Clipes/gravação/soundboard/Remote PC                  | Mesmos armazenamento, autorização e transportes; apresentação reintegrada. Replay Windows continua suspenso conforme capacidade existente.                                                |
| Backend/Electron/tipos compartilhados                 | Serviços, HTTP/WS/IPC, autorização e persistência preservados. Helpers exigem ambiente nativo.                                                                                            |
| Apresentação externa antiga                           | 30 views/posicionadores finais retirados após revisão individual, além dos cortes anteriores. Destinos reais na matriz; nenhuma árvore legada paralela.                                   |

Revisão do corte: artifacts/frontend-reset/finish-removal-review.json.
Inventários e evidências anteriores são artefatos auxiliares, não outra fonte
de instruções.

## Interfaces e invariantes

- Um socket por cliente e um dono por recurso. Assinaturas de apresentação
  terminam na desmontagem; consumidores emprestados nunca encerram tracks.
- Tela aberta, destino do compositor e participação em voz/jogo são distintos.
  Navegar entre chamada, chat, jogos e configurações conserva players.
- Conta/sala invalidam operações antigas. Captura concluída atrasada é descartada.
  Sair cancela seleção/encoder/persistência pendente da gravação.
- Fachadas delegam ao mesmo dono; nenhum novo contrato de backend.
- Fullscreen nativo pertence a desktop/window. Atualizador e avisos inicializam
  sem depender da casca antiga. Atualização exige prontidão e reinício explícito.
- Somente a superfície ativa abre a confirmação de moderação. Escape respeita
  overlays superiores. Avisos não cobrem os controles de chamada.

## Testes e comandos

Um único comando: npm test, com --suite core|browser|desktop|all e --filter.
tests/suites.json é a classificação; CI usa o mesmo dispatcher. Não adicionar
aliases por cenário. Fazer build antes de consumir out.

Reutilizar node:test, Playwright e fixtures. TDD nos limites aprovados:
comandos/snapshots, HTTP/WS, navegador e Electron. Prioridades: conta/isolamento;
permissões; histórico/envio/anexos/retry; partidas/reconexão; continuidade de voz;
cancelamento/descarte; perfil; soundboard; clipes/gravação; controle remoto;
teclado, foco, Escape, rolagem e responsividade.

Fixtures dos layouts Original/Discord foram migradas para a Corte. A escolha de
layout e o cabeçalho colapsável foram aposentados. Continuam as asserções úteis
de transporte, mídia, identidade, gestos do painel dos jogos e controles.
Mapeamentos ficam em artifacts/frontend-reset/finish-test-consolidation.json
e finish-desktop-consolidation.json. Não retirar cobertura para deixar CI verde.

### Evidência vigente

Logs e imagens ficam em artifacts/frontend-reset. A rodada 40402075694 aprovou
1.411 contratos, quatro grupos browser (164 aprovados, dois skips de codec),
mídia Windows, executável e atualização NSIS real. A entrega foi bloqueada por
falso positivo do filtro PowerShell (# skipped 0), reproduzido e corrigido.
A rodada 40403634984 revelou instabilidade na simulação de fallback do RNNoise;
os outros grupos passaram. Nenhuma delas publicou a versão 0.3.5.

A pedido do usuário, a entrega foi simplificada e estabilizada localmente antes
de novo envio. As repetições encontraram erros de fixture que uma rodada isolada
não mostrava: constraints de hardware aplicadas a um oscilador, prazo de resposta
da UI confundido com continuidade PCM, teclado enviado antes do foco pelo clique
nativo e comandos de jogo antes da navegação inicial. Foram corrigidos mantendo
tracks, frames, energia/RTP, injeção real e partida completa.

### Conferência local anterior ao envio

| Limite | Resultado e evidência em artifacts/frontend-reset |
| --- | --- |
| Fontes e compilação | typecheck e format:check aprovados; local-release-build.log e local-release-native-build.log. |
| Core completo | 1.412/1.412, zero skips, 45,8s em local-release-core-final.log. |
| Perfil browser | Duas rodadas consecutivas: 42 aprovados, zero falhas e um skip externo de FFmpeg por rodada; local-release-v3-browser-1/2.log. Decode pelo Chromium aprovado. |
| Perfil Electron | Duas rodadas consecutivas: 15/15, zero skips; local-release-v3-desktop-1/2.log. |
| Repetição web + Electron | 252,0s e 252,4s por rodada completa; inclui partida, PCM de envio/recepção, foco e Remote PC. |
| RNNoise que falhava | Três rodadas de seis casos, sem falhas/skips, com dois núcleos e o timeout de clique original; local-noise-final-1/2/3.log. |
| Glue PowerShell real | 21 casos de sucesso, propagação de falhas, argumentos e skips; check-workflow-gates.cjs. |
| Integridade do publicador | Sete casos, rejeitando ZIP/EXE/manifesto/versão adulterados e caminhos extras; check-publish-integrity.cjs. |
| Executável e instalador | Smoke real aprovado em local-delivery-packaged.log; NSIS gerado em local-delivery-installer.log. Sem instalação no computador do usuário. |
| Pacote distribuível | Site de 188,7 MiB, com um instalador de 135,5 MiB; local-delivery-downloads.log. ZIP/EXE/manifesto reais passaram pelo mesmo verificador do workflow em local-release-real/. |

Este checkpoint registra a preparação local. A aprovação remota de cada entrega
fica na [execução Windows full app](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/workflows/windows-app.yml)
do mesmo commit e na release privada correspondente. A versão efetivamente
publicada é a de [downloads/latest.yml](https://a-lei-do-trono.surge.sh/downloads/latest.yml).
Confira esses resultados antes de repetir qualquer disparo; CI não é o loop de
depuração local. A instalação/atualização NSIS real continua obrigatória no runner
descartável, sem forjar esse ambiente neste host.

Loopback por aplicativo passou localmente; no runner sem saída de áudio, esse caso
pode ser pulado com limitação explícita. FFmpeg/FFprobe externos não substituem a
decodificação real do Chromium. Equipamento físico, driver de gamepad e SFU do
ambiente de destino têm verificação própria.

## Entrega simplificada

Windows full app usa um job de validação/empacotamento Windows e um de publicação,
além da opção existente de atualizar somente instruções. Dependências, frontend e
helpers são instalados/compilados uma vez. Foram retirados a matriz de quatro
runners, sua agregação, --shard e a transferência de helpers entre máquinas.

Todos os contratos core permanecem. tests/release.json seleciona 13 arquivos
browser e nove desktop de fluxos essenciais: conta, chat/DM, perfil, arquivos,
gravação, soundboard, partida da Corte, permissões, voz/captura, sessão criptografada,
PCM de envio/recepção sob carga, controle remoto nativo, runtime e atualização.
Recepção PCM não pode ser pulada no perfil de entrega. Executável empacotado e
instalador têm aceitação posterior obrigatória. Não há retry automático.

As suítes completas continuam no mesmo npm test. extended_browser inclui os 56
arquivos browser quando jogos/cascata ou escopo amplo exigirem. Estresse de dez
pessoas, combinações extensas de viewport, DSP especializado e drivers não
bloqueiam toda publicação rotineira; declarar resultado/capacidade ao executá-los.

O publicador exige o mesmo commit e a tentativa exata que validou e produziu os
artefatos. A regressão rejeita aprovação emprestada de tentativa anterior.
Confere hashes de ZIP/EXE, manifesto e versão publicada. A aprovação pertence ao
job Validate and package Windows; mudar o nome exige atualizar o resolver e seu
teste. Operação: [PUBLICAR_SURGE_LEVE.md](PUBLICAR_SURGE_LEVE.md).

## Correções e limites das fixtures

- Lobby usa alinhamento seguro em janela curta. QuickPanel mantém dimensões
  fracionárias e limites do viewport; ResizeObserver é liberado na desmontagem.
- Preload recebe a versão de app.getVersion; não mantém número fixo independente.
- Captura silenciosa de BrowserWindow não exige loopback; áudio por aplicativo
  conserva sua verificação própria. Os seletores usam as telas atuais da Corte.
- Restauração da conta/sala e operações de captura aguardam conclusão pública;
  a primeira entrada em voz termina antes da navegação seguinte.
- Ganho é medido por PCM no AudioWorklet por meio segundo, sem depender de picos
  amostrados por requestAnimationFrame.
- Dez clientes conservam contextos e peers reais, quatro câmeras e duas telas.
  Fontes sintéticas são 320×180/640×360 a 5 FPS; um falante e nove ouvintes são
  mutados pelos controles reais. Só a interface observada é renderizada. É
  regressão de comportamento/layout, não benchmark HD ou dez falantes simultâneos.
- Entrega remota das telas aguarda até 15s, como a chegada de frames. A fixture
  de redução nativa não aplica constraints reais a áudio sintético. Asserções de
  processamento, tracks, cancelamento e descarte permanecem.

## Revisão e próximos passos

Implementação e corte do Marco 3 concluídos. Revisão de padrões/especificação
corrigiu clique do atualizador e cancelamento de persistência ao sair. Regressões
conservam permissões tardias, mãos/decisões privadas da Corte e soundboard entre
clientes. O teste de cache tolera ENOTEMPTY transitório sem mudar produção.

Para a próxima entrega: reproduzir localmente a seleção afetada em pelo menos
duas rodadas consecutivas, diagnosticar falhas antes de enviar e conferir os
blocos reais do workflow. Depois executar uma vez no runner para aceitar NSIS e
publicar. Confirmar manifesto, metadado e hashes da mesma entrega. Registrar
novos resultados no documento dono, mantendo histórico detalhado no Git.

A aparência geral do chat e maior diferenciação estética do Discord foram adiadas
pelo usuário. Preservar os aceites; não reabrir esses escopos no fechamento.

## Documentação e conclusão

README é a entrada; AGENTS roteia; arquitetura guarda donos; desenvolvimento
operação; UX comportamento/referência/aceites; este arquivo execução; workflow
contribuição. Atualizar a fonte dona e consumidores, sem criar MD por ajuste.
Preservar docs de jogos, licenças e distribuição; histórico detalhado fica no Git.

Encerrar com três aceites, recursos com destino/evidência, corte concluído,
comandos/CI consolidados, docs coerentes e checks pertinentes concluídos com
limitações reais declaradas. Aceite visual não comprova hardware ou CI remoto.

## Reparo do atualizador Windows 0.3.7

A preparação da 0.3.7 parte de `6f9c2bc` (base Windows 0.3.6). O manifesto
público anunciava 0.3.6 e o EXE respondia com tamanho e faixa corretos. O
`electron-updater` 0.3.5 consultou e baixou esse EXE em perfil descartável
quando recebeu configuração válida. O pacote gerado pelo fluxo anterior, porém,
não continha `resources/app-update.yml`: `--dir` não gera esse arquivo e
`--prepackaged` não repete o empacotamento. A ausência reproduziu o erro do
download.

O fluxo agora gera NSIS diretamente. A regressão falhou no pacote antigo e
passou no novo; o instalador 0.3.7 local contém `app-update.yml` também no
payload NSIS. Typecheck, format:check, build, compilação nativa, sete contratos
do atualizador, 1.423 contratos core e duas rodadas do smoke empacotado passaram.
O teste de instalação real permanece para o runner Windows descartável. A
entrega ainda não foi enviada nem publicada. Instalações afetadas precisam
instalar manualmente a primeira versão corrigida para recuperar atualizações
futuras.
