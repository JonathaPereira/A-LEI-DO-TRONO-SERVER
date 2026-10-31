# Reconstrução do frontend

Checkpoint atualizado em 31/10/2026.

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

O inventário por arquivo da migração foi aposentado. Seu histórico e as decisões
de destino permanecem no Git; os contratos vigentes estão nesta tabela e na
arquitetura.
Assets, vendor, licenças, créditos e documentos distribuídos são fontes protegidas.
out e .next são saídas.

| Área                                                  | Tratamento vigente                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/components/games, src/lib/games, src/styles/games | Fluxos completos preservados: criação/lobby, partida, regras, efeitos, áudio, resultado e reconexão. Catálogo reconstruído.                                                               |
| public/roguelite                                      | Aplicativo Cinzas, assets, persistência e ponte preservados. Nexus mantém integração independente.                                                                                        |
| Elementos compartilhados dos jogos                    | Comunicação flutuante, avisos de turno/influência, cinemática, resultado, tooltips e controles ficam protegidos, mesmo fora das três pastas.                                              |
| Estilos compartilhados                                | Dependências extraídas para games e delimitadas por gameSurface, incluindo overlays. Shell usa CSS Modules próprios. Não apagar regras necessárias aos jogos por não aparecerem no shell. |
| Conta/rede/chat/arquivos/perfis/mídia                 | Donos existentes observados por snapshots; views novas delegam comandos.                                                                                                                  |
| Clipes/gravação/soundboard/Remote PC                  | Mesmos armazenamento, autorização e transportes; apresentação reintegrada. Replay da tela transmitida reativado no Electron; captura independente da tela principal permanece desativada.                                                |
| Backend/Electron/tipos compartilhados                 | Serviços, HTTP/WS/IPC, autorização e persistência preservados. Helpers exigem ambiente nativo.                                                                                            |
| Apresentação externa antiga                           | 30 views/posicionadores finais retirados após revisão individual, além dos cortes anteriores. Destinos registrados no Git; nenhuma árvore legada paralela.                                   |

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

Similo — contribuição `codex/similo-clue-layout`, sobre main `0b1cc40` (#61 já
incorporado), preparando Windows 1.0.0 por solicitação do usuário. Não alterar a
main; preservar a recuperação de voz. A numeração pública passa a 1.x; protocolo
do backend continua compatível e este reparo não exige SQL/deploy de servidor.

O teste inicial confirmou a mesma relação nas três projeções e a orientação
correta na faixa; não reproduziu uma divergência de pacotes. Reproduziu a pista
horizontal voltando a ficar vertical na ampliação (190×285). O inspetor agora usa
a relação autoritativa e preserva posição e legenda. A rotação fixa foi separada
de transformações transitórias; espaço horizontal é reservado explicitamente.

Configurações trocam dez botões grandes por dois grupos: 12 cartas da mesa e
baralho do informante. Tema principal e mistura opcional não permitem duplicação;
os valores compartilhados e permissões permanecem com o controlador existente.
As novas verificações cobrem escolha independente, alteração compartilhada,
bloqueio dos demais participantes e orientação em três clientes, três larguras,
movimento normal/reduzido e ampliação. Typecheck, format:check e build aprovados;
1.454 testes core sem falhas/skips. Duas rodadas Similo/mesa cheia/DMs/recuperação
de voz passaram com seis verificações cada, sem falhas/skips. Inspeção manual
conferiu seletores desktop/telefone e ampliação horizontal; sem golden snapshots.
Capturas/mídia são fixtures e WebSockets/contas de teste são reais/descartáveis.
Evidências em artifacts/similo-repair. A execução Windows
[40707264219](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40707264219)
aprovou jornadas web/Electron, executável, NSIS e publicação no commit de código
`da447ba`. O site e latest.yml anunciam 1.0.0. O EXE público foi baixado por
inteiro (142.234.607 bytes) e teve SHA-512 conferido; hashes das cinco folhas de
arte também passaram. Evidência pública em
`codex/similo-delivery-control:similo-1.0-production-check.json`.

Backend respondeu HTTP 200 com Similo e recuperação de voz habilitados. Este
reparo não exige novo backend. Actions não pôde criar o PR pela política do
repositório: contribuição enviada em `codex/similo-clue-layout`, main preservada,
compare disponível para criação e merge pelo usuário.


Recuperação de voz preparada em `codex/voice-reconnect-grace`, Windows 0.3.12,
sobre main `51bf245`. A atualização 0.3.11/Similo foi incorporada (#59) e publicada
pela execução Windows `40620493982`; a checagem pública posterior confirmou site,
instalador e os hashes dos cinco temas, além de `features.similo=true` no backend.

A correção de voz mantém chamada, geração, captura e peers por até 45 segundos
na perda temporária de sinalização. O servidor reserva a participação, revalida
conta/sessão ou convidado e transfere a mesma identidade/assento para o socket
novo. Confirmação repetida/resposta perdida não duplica membros. Não reabre voz
após saída manual; revogação, sessão substituída, moderação e prazo final encerram
a participação. Sem SQL; depende de deploy do backend com `features.voiceResume`.

A auditoria pública de produção retornou três HTTP 200 e cinco pongs consecutivos.
Primeira resposta: 22,6 s; seguintes: 95/107 ms. SFU habilitado/configurado e sem
bloqueio por limite; TURN desabilitado/não configurado. Isso identifica uma lacuna
para redes P2P restritivas, sem comprovar a causa da queda relatada. Evidência
pública em `codex/similo-delivery-control:voice-server-audit.json`; não houve
login, entrada em sala ou alteração de chamada em produção nessa auditoria.

Typecheck, format:check, build e 1.454 contratos core passaram na versão final,
sem falhas/skips (`artifacts/voice-recovery/core-final.log`). Duas rodadas locais
da seleção shell/DMs/Similo/moderação/recepção/recuperação tiveram 11 aprovados e
dois skips de RTP/PCM por política Chromium gerenciada; esses dois checks seguem
obrigatórios no Windows. Após o ajuste final de cancelamento, duas rodadas focadas
de recuperação passaram com mic/câmera/tela/peers preservados em três quedas e
saída efetiva durante a quarta. As contas e capturas são fixtures explícitas.

A aceitação Electron real inclui interromper o socket durante captura nativa de
uma janela QA e conferir identidade, microfone, stream e player conservados.
A execução Windows
[40700039990](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40700039990)
aprovou essa conferência Electron, jornadas de mídia, executável e NSIS real no
commit de código `d729181`. Publicação conjunta no Surge aprovada. A conferência
pública baixou os 142.234.453 bytes do EXE, verificou SHA-512 contra `latest.yml`,
confirmou frontend 0.3.12 e os cinco hashes de arte. Evidência:
`codex/similo-delivery-control:voice-recovery-production-check.json`.

Backend público respondeu HTTP 200, mas ainda sem `features.voiceResume`: falta
incorporar e fazer deploy da contribuição para ativar a recuperação. TURN continua
sem configuração. A política do repositório impediu Actions de criar o PR; código
está enviado em `codex/voice-reconnect-grace`, com compare para criação manual.
Main foi preservada nesta execução. A indisponibilidade anterior do ambiente
não publicou mudanças; a entrega acima foi retomada e validada depois.


Similo integrado na contribuição `codex/similo-online`, sobre a main `9149a52`,
preparando Windows 0.3.11. O usuário aprovou o protótipo e solicitou integração
com mesa escura, capitão alternado, HUD ajustado e informações flutuantes nas
120 cartas. Conta, backend, socket, áudio, voz e membros mantêm seus donos.
O serviço autoritativo valida ator/revisão e projeta segredo/mão somente para o
informante. Todos votam antes da decisão do capitão. Sem SQL ou ranking novo.

Typecheck, format:check, build e 1.441 contratos core passaram localmente, sem
falhas/skips. Fluxo Similo com três clientes reais completou vitória/derrota,
baralhos misturados, privacidade, divergência, informações, dimensões de janela
e continuidade de microfone/câmera/tela. Imagens e mídia são fixtures explícitas
conforme `games/similo/README.md`; evidências em `artifacts/similo`.
O fluxo final do Similo passou duas vezes consecutivas, incluindo animação normal,
movimento reduzido e suspense autoritativo de 2,2 segundos. DMs, membros e shell
e Love Letter passaram nas duas rodadas da seleção afetada: oito verificações
por rodada, sem falhas/skips, incluindo as partidas completas. Windows/NSIS e
publicação pertencem ao workflow do mesmo commit. Fontes não comprovam deploy.
O backend precisa ser atualizado com a contribuição e anunciar `features.similo`.
As artes são entregues separadamente em `similo-mn.surge.sh`, com hashes da mesma
execução, antes do frontend/instalador; isso conserva o limite do pacote Surge.


A primeira execução Windows `40612206178`, no commit `3aaf232`, aprovou os
contratos e as jornadas do Similo, mas encerrou a jornada do Atalaia por timeout.
As evidências retiveram combate e campanha recarregada; nenhuma entrega foi
publicada. O fixture agora traz a aba Godot à frente nos gestos, limita esperas,
registra fases e encerra contexto e conexões dos servidores estáticos. Mantém
120 s globais e as verificações de jogo, CSV, save e mídia.

Uma conferência com oito participantes reproduziu sete votos invadindo outras
cartas em janela baixa. A apresentação agrupa votos após os três primeiros num
marcador com contagem e nomes acessíveis. A regressão usa oito contas de fixture,
login e WebSocket reais e três dimensões de tela. As duas rodadas finais de
Similo (três/oito pessoas) e Atalaia passaram com três cenários por rodada,
sem falhas/skips, em `artifacts/similo/release-fix-round1/2.log`.

Entrega de avatares de DMs e membros, Windows 0.3.10, sobre main `6badf3c`:
mensagens próprias/recebidas usam o perfil existente; painel único abre por
padrão e acompanha chamada, texto, DMs, catálogo e jogos, com online/offline e
controle de visibilidade. Preserva mídia, conta, regras e Atalaia 0.2. Sem SQL.

Reprodução funcional falhou na base pela ausência dos avatares/painel e passou
após a correção. Typecheck, format:check, build e 1.430 testes core aprovados.
Regressões de conta, presença/visitantes, atividade, perfis, anexos/isolamento,
Ticket to Ride e chamada com navegação aprovadas. A conferência dos alvos da
Corte passou, recolhendo a lateral pelo botão público nas telas pequenas.
O cenário do Love Letter também recolhe esse painel antes de sair da mesa
pela tela estreita; a abertura padrão e as verificações da partida permanecem.
Sua repetição completa aprovou os dois testes, sem skips, em
`dm-members-love-letter-recheck.log`.
Logs/imagens temporários em `artifacts/dm-members*`; retratos e microfones desses
cenários são fixtures. Imagens foram inspecionadas, sem novos snapshots visuais.

Estresse opcional com dez clientes não aprovou vídeo remoto neste host: o
timeout em `application-call-browser.cjs:448` também foi reproduzido em checkout
separado da main `6badf3c`, sem as alterações. Evidências em
`dm-members-regression-recheck.log` e `dm-members-baseline-call-stress.log`.
O Chromium gerenciado exige `disable_non_proxied_udp`; a recepção PCM do perfil
release reprova explicitamente essa política, sem relaxar o gate de entrega.
Isso não comprova captura física. Aceitação Electron/NSIS real e publicação
dependem da execução Windows do mesmo commit, como descrito abaixo.

A execução Windows `40594109750` aprovou core e browser, mas a fixture
`desktop-background-voice` tentou entrar na voz durante a restauração automática
do canal inicial (`joined:false`, zero capturas, “Entre em um canal primeiro”).
A preparação agora aguarda o reconhecimento da sala e usa o botão público de
entrada na voz. As medições PCM/RTP e as verificações de janela minimizada,
coberta e oculta permanecem, sem relaxar limites nem adicionar retries.

`40596193806` aprovou também Electron/mídia; o smoke empacotado parou na
conferência de uma capa do catálogo, antes de abrir o Cinzas. Capas usam
`loading="lazy"` e, com a coluna de membros, as últimas linhas podem ficar fora
da área de rolagem visível. O smoke agora traz cada capa à área visível antes
de exigir carregamento e registra a URL de requisições locais que falharem.
Permanecem cache verificado, isolamento do iframe, partida e zero downloads
remotos na aceitação offline do Cinzas.

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

Todos os contratos core ativos permanecem. tests/release.json seleciona 19 arquivos
browser e nove desktop de fluxos essenciais: conta, chat/DM, perfil, arquivos,
gravação, soundboard, partida da Corte, permissões, voz/captura, sessão criptografada,
PCM de envio/recepção sob carga, controle remoto nativo, runtime e atualização,
além de Similo, Atalaia, membros/DMs e recuperação da sinalização de voz.
Recepção PCM não pode ser pulada no perfil de entrega. Executável empacotado e
instalador têm aceitação posterior obrigatória. Não há retry automático.

As suítes completas continuam no mesmo npm test. extended_browser inclui os 60
arquivos browser quando jogos/cascata ou escopo amplo exigirem. Estresse de dez
pessoas, combinações extensas de viewport, DSP especializado e drivers não
bloqueiam toda publicação rotineira; declarar resultado/capacidade ao executá-los.

O publicador exige o mesmo commit e a tentativa exata que validou e produziu os
artefatos. A regressão rejeita aprovação emprestada de tentativa anterior.
Confere hashes de ZIP/EXE, manifesto e versão publicada. A aprovação pertence ao
job Validate and package Windows; mudar o nome exige atualizar o resolver e seu
teste. Operação: [PUBLICAR_SURGE_LEVE.md](PUBLICAR_SURGE_LEVE.md).

## Enxugamento dos testes

Em 27/10/2026, revisão contra 75340bf retirou os controladores aposentados de
escolha Original/Discord e da grade antiga de telas, seus casos exclusivos,
dois helpers sem chamadores e duas verificações da organização de imports CSS.
Assets, cascata renderizada dos jogos e contratos ativos foram preservados.
Justificativas por remoção, inventário, revisão e logs ficam em
`artifacts/test-trim`.

A árvore de testes passou de 309 para 306 arquivos, com 576 linhas a menos.
As suítes passaram de 180/56/20 para 179/56/20 arquivos core/browser/desktop.
Dez blocos de cadastro/confirmação usam a fixture HTTP existente; os fluxos de
autenticação continuam verificando suas etapas explicitamente.

O perfil de entrega mede cinco combinações reais de voz em segundo plano:
nativo a 100% nos três estados de janela, nativo a 180% oculto e RNNoise a 100%
oculto. Sem perfil, permanecem as nove combinações. Baseline por configuração,
amostras de cinco segundos, limiares PCM/RTP e identidade dos recursos continuam
iguais. Partida completa, rodada humana e gates de distribuição permanecem.

Verificação local contra a base 75340bf, antes da atualização de main, com logs
em `artifacts/test-trim`:

| Limite | Resultado |
| --- | --- |
| Fontes | typecheck, format:check e build aprovados; build de referência 2,8s e posterior 3,9s. |
| Core | 1.398 aprovados, zero falhas/skips; 44,8s, contra 1.412 em 46,8s antes do corte. Os 14 casos retirados pertenciam aos contratos aposentados e à organização dos imports. |
| Browser completo | 164 aprovados, zero falhas e dois skips externos de FFmpeg/FFprobe; 544,6s. Reprodução/decodificação Chromium aprovadas. |
| Browser release | Duas rodadas: 42 aprovados e um skip externo por rodada; 151,4s e 148,2s. Referência anterior: 149,0s. |
| Electron release | Duas rodadas: 14 aprovados e uma falha de foco do Remote PC em cada; 96,8s e 110,1s. Referência anterior: 14 aprovados e a mesma falha, em 133,6s. Nenhum skip. |
| Voz em segundo plano | Cinco combinações comprovadas em cada rodada release; 57,4s e 58,7s, contra 80,8s antes. Matriz completa sem perfil aprovada com nove combinações e zero skips, em 92,5s. |
| Empacotamento local | Executável gerado sem instalação; 7,3s antes e 7,6s depois, sem ganho atribuído ao corte de testes. |
| Executável real | Smoke do pacote atual aprovado: um teste, zero falhas/skips, em 31,5s. |
| Revisão | Padrões e especificação: zero achados de implementação. |

Naquela execução, o perfil desktop não ficou integralmente aprovado: o clique nativo do Remote PC
não foca o campo da janela de QA. A falha ocorreu antes das alterações, repetiu
isoladamente e permaneceu nas duas rodadas posteriores. O diagnóstico descartável
confirmou janela focada e comandos aceitos pela ponte RemoteInput, sem estabelecer
a causa do clique incorreto. O teste e suas asserções permanecem; não há retry ou skip
para ocultar a falha. Essas duas rodadas não receberam aceite. A revalidação
sobre a versão 1.0, abaixo, registra o diagnóstico posterior e as rodadas aprovadas.

As medições usam Electron real, WebRTC e PCM recebido por outro cliente, com
fala WAV alimentando o dispositivo de captura de teste do Chromium. Não comprovam
microfone físico nem equipamentos do usuário. O bloqueio inicial de HTTP local
por EACCES foi separado em `blocked-core.log`; as medições válidas usaram acesso
ao loopback. NSIS não foi instalado neste host e não houve publicação.

Depois dessas medições, a pedido do usuário, main foi atualizada por fast-forward
para `3707647` (Windows 0.3.7, reparo do atualizador e animações de Love Letter).
O corte foi reaplicado sem conflitos na branch `codex/test-suite-trim`, criada
sobre essa base. O perfil release agora inclui os 14 arquivos browser de main.
Typecheck, format:check, build, 1.409 contratos core e os dois testes browser
de Love Letter passaram na nova base, sem skips. A primeira execução core teve
ENOTEMPTY na limpeza temporária de um teste inalterado de empacotamento; os cinco
casos desse arquivo passaram isoladamente e a nova execução core inteira passou.
Os logs `main-update-*` preservam ambas as execuções. Essa revalidação cobre esses
limites; as medições completas browser/Electron acima pertencem à base anterior.

Na continuação, o usuário autorizou aposentar o inventário da migração junto dos
trechos sem uso comprovado. O CSV e suas referências foram retirados; o histórico
permanece no Git. Saíram seis módulos aposentados de catálogo, shell e
posicionamento, além do export LibraryNavigation sem consumidores. O catálogo
atual e GameAction permanecem. Os testes válidos de janela foram movidos para
`tests/desktop-window.cjs`, e a integração da Corte passou a testar o dono atual
`desktop/window`; os casos exclusivos dos modelos aposentados foram retirados.

Foram removidos sete assets sem uso atual, somando 2.983.000 bytes: cinco PNGs de
leis substituídos pelos SVGs atuais, a antiga faixa de taverna e um ícone de volume.
Os três fallbacks de áudio e seus créditos permanecem, com a documentação ajustada.
Conferência local preservou as 48 cartas dinâmicas, todas as leis SVG e referências
locais do manual, além dos 73 arquivos do manifesto Cinzas com tamanho/hash iguais.
RNNoise, licenças, recursos ativos e dependências de desenvolvimento permanecem.

Após este corte, as suítes têm 178/55/20 arquivos core/browser/desktop. Typecheck,
format:check, build, 1.391 casos core, dez casos browser afetados e dois testes
Electron reais passaram sem falhas ou skips. A seleção browser cobriu catálogo,
continuidade da chamada, shell, cascata dos jogos, áudio real e a partida completa
da Corte; Electron cobriu criação/dimensionamento da janela e captura sem perder a voz.
Revisões de padrões e especificação não encontraram pendências. Justificativas e
logs estão em `artifacts/unused-audit`. Nessa etapa, a entrada nativa do Remote PC
ainda estava sem aceite; o corte não alterou nem repetiu esse teste. A continuação
1.0 abaixo registra sua revalidação.

## Continuação sobre Windows 1.0.0

Em 28/10/2026, a contribuição `codex/test-suite-trim` incorporou por fast-forward
a main `3c39d82`, preservando a main local e o corte sem commit. Similo, Atalaia
e a recuperação de voz foram mantidos. O usuário autorizou commit/push desta
contribuição após a verificação; publicação e instalação não fazem parte da etapa.

A auditoria renovada confirmou os órfãos anteriores e retirou três exports sem
consumidores: `DiagnosticPanel`, `ConnectionIndicator` e `directUnread`. O
diagnóstico vigente permanece em `ConnectionDetails`, com o mesmo controlador e
cópia do relatório; as projeções atuais de mensagens não lidas permanecem. Saíram
também dois workflows temporários de despacho/cancelamento do Similo 0.3.11 e oito
arquivos de status, logs e capturas dessa entrega na raiz, somando 3.610.631 bytes.
Os workflows ativos e os gates de executável, NSIS e publicação foram preservados.
Razões por remoção, backups temporários e verificações ficam em `artifacts/v1-cleanup`.

A conferência de recursos preservou 48 cartas WebP, cinco leis SVG, três fallbacks
de música, os links locais do manual e os 73 hashes de Cinzas. Árvores de Atalaia,
Similo, Cinzas e RNNoise não tiveram alterações. Os terrenos antigos de Atalaia
continuam usados pelas estradas através de `data/maps.json`, apesar dos fundos novos.

As suítes da base 1.0 passaram de 185/61/20 para 183/60/20 arquivos
core/browser/desktop, sem alterar comandos, perfis ou formato dos manifestos.
A árvore de testes/helpers passou de 320 para 315 arquivos e de 68.183 para
66.976 linhas pelo mesmo inventário, uma redução de 1.207 linhas.
Dois cenários de chamada agora fecham a gaveta de membros pelo controle público
nas larguras estreitas; a abertura por padrão continua coberta pelo cenário de
DMs/membros. Um array nunca preenchido e suas verificações inoperantes foram
retirados. A fixture de áudio deixou de exigir quatro painéis e passou a exercitar
também Similo, conservando volume, mute, restauração e persistência por jogo.

No Similo, a verificação das animações esperava a fase de revelação no cliente A,
mas lia os estilos do cliente B antes de sua atualização. O teste agora aguarda
a fase pública no próprio B. Uma sonda descartável atrasando somente esse pacote
em 600 ms reproduziu o vermelho e confirmou o verde após a correção, sem mudar
animações, timeouts ou asserções.

Essa verificação expôs o menu Som da Corte parcialmente fora da tela em 1280 px:
o cabeçalho quebrava a linha e o botão voltava à esquerda, com o painel em x=-160,5.
`margin-left: auto` conserva o alinhamento à direita. O teste existente exige o
painel inteiro no viewport; PCM real de Splendor e os cinco jogos passaram depois
da correção. Inspeção descartável conferiu seis larguras entre 390 e 1910 px,
sem criar golden snapshots ou atribuir aceite visual humano.

O Remote PC original passou sem alterações após reservar o desktop sem interação.
A sonda Win32 identificou outra janela sobre a posição de QA durante as falhas,
e o usuário confirmou estar usando o computador. No build final, após o browser
encerrar e com o desktop reservado, duas rodadas desktop release consecutivas
passaram com 15 casos cada, zero falhas/skips, em 90,1/97,1 s. O subteste de voz
levou 50,8 s em cada, com cinco combinações, contra 92,2 s na main antes do corte.
A matriz sem perfil passou novamente com nove combinações em 92,4 s. O ajuste
do Som passou no navegador e no executável atualizado, cujo smoke completo levou
60,6 s, incluindo recursos próprios e a integração Atalaia.

Medição core da mesma main: 1.454 casos em 48,9 s antes; após o corte, 1.422 casos
em 51,6 s e 48,1 s na rodada final, sem falhas/skips. A variação não comprova ganho
de duração core. O build levou 7,2/5,3 s com caches locais; o pacote NSIS final
levou 30,8 s, medido separadamente. Essas
variações não são atribuídas ao corte de testes. Fontes sintéticas, Chrome
instalado 156 como fallback do executor e Electron real foram usados. O Chromium
empacotado do Playwright não está disponível; FFmpeg/FFprobe externos também não.
Não houve instalação neste Windows nem publicação.

Uma queda de energia interrompeu a segunda rodada browser sem resultado final;
os fontes e hashes foram conferidos após a retomada. Duas novas rodadas browser
release consecutivas passaram: 51 aprovados, zero falhas e um skip externo de
FFmpeg/FFprobe em cada, em 420,4/333,2 s. O browser completo final teve 172
aprovados, zero falhas e dois skips externos, em 804,9 s, com a partida local de
três rodadas e a recuperação de voz preservadas. As execuções interrompidas e as falhas
de carregamento da rodada desktop concorrente permanecem nos logs; não recebem
aceite nem são tratadas como retries automáticos.

Typecheck, format:check, build, core completo, browser completo, duas rodadas
release em cada ambiente, matriz completa de voz e smoke empacotado concluídos.
Revisão do diff completo contra `3c39d82`: padrões e especificação sem achados.

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
A [execução Windows 40517015220](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40517015220)
passou no commit `d61f60d`, incluindo jornadas web/Electron, aplicativo
empacotado e instalação NSIS no runner descartável. A publicação no Surge
passou; `downloads/latest.yml` e o metadado da página anunciam 0.3.7. O EXE
público respondeu a HEAD e faixa parcial, e seu download completo teve o
mesmo SHA-256 da release aprovada. Instalações afetadas ainda precisam
instalar manualmente a 0.3.7 uma vez para recuperar atualizações futuras.


## Ajustes de jogos e Atalaia — 0.3.8

A atualização visual seguinte está na branch `codex/desktop-atalaia-visual-refresh`,
Atalaia Godot 0.2 / Windows 0.3.9. A referência web 0.6.1 foi consultada após
o usuário liberar seu acesso público. Ela possui mais conteúdo do que o projeto
Godot recebido; a atualização conserva as regras, três regiões, 15 ondas e o
formato do save desse projeto.

O HUD usa ícones vetoriais e indicadores separados de núcleo, ouro e onda; o
campo deixa de esticar na horizontal e recorta objetos nas bordas. Novos fundos
preservam as estradas pintadas por uma malha sobre as rotas existentes. Transições
de construção, movimento, evolução, dano e ouro não alteram os números das regras.
Relatório e doutrinas conservam os nós enquanto atualizam, preservando o foco.

O exportador executa 24 verificações de regras e 21 de interface antes de gerar
o jogo. Recursos JS/WASM/PCK têm versão/commit nos nomes, conferidos no navegador
e na publicação. Typecheck, format:check, build do frontend e 1.430 contratos core
passaram localmente. A política determinística original concluiu a campanha na
onda 15 com 22/30 de integridade. Evidências locais ficam em
`artifacts/atalaia/visual-*`; aceitação do EXE/NSIS e publicação pertencem à
execução Windows/Surge do mesmo commit, não ao preparo local.

Branch `codex/games-polish-integration`, sobre os fontes refatorados da entrega
0.3.6 e a reconstrução já integrada à main. Incorpora o reparo do atualizador
da main `3707647`, com NSIS direto e verificação de `app-update.yml` no pacote
e na instalação. A entrega de jogos passou a 0.3.8 para avançar a versão publicada.
As etapas ficaram em commits separados:
Love Letter, Ticket to Ride, Nexus e Atalaia.

- Love Letter: suspense do Guarda de 2 s, anúncio geral de 1,2 s e resultado de
  2,8 s; transições visuais acompanham esses tempos.
- Ticket to Ride: centros e ângulos dos 309 espaços impressos calibrados para
  as 100 rotas; sprites normalizados sem alterar a arte original. A captura
  `artifacts/rail-calibration/all-309-wagons.png` usa todas as rotas ocupadas
  artificialmente apenas para conferir o alinhamento.
- Nexus: usuário identificou erro transitório da Cloudflare e confirmou retorno
  ao funcionamento no Windows. O upload existente foi preservado. Configuração
  compartilhada, erros detalhados e guia de recolocação atualizados. A execução
  Windows 40511295663 abriu o upload real, com canvas Godot e sem falha de rede;
  não é uma validação de campanha/PvP completo.
- Atalaia: projeto do ZIP preservado em `games/atalaia`, incluindo artes, áudio,
  licenças, regras e testes. Exportação Web real em Godot 4.6.3, Compatibility,
  sem threads; CSV adaptado ao navegador. Catálogo carrega somente após Jogar,
  em aba própria na web e sessão isolada no Windows. O pacote Godot é separado
  do frontend/EXE para manter o limite do site. O publicador valida e envia o
  jogo antes de atualizar o catálogo; a chamada mantém seus donos.

Evidência local concluída: typecheck, format:check e build; 1.430 contratos core,
zero falhas/skips (`artifacts/atalaia/all-core-final.log`); duas rodadas da seleção
Love Letter/Nexus/Ticket/Atalaia com 10 aprovados por rodada
(`affected-browser-final-1/2.log`). Depois, o teste de Atalaia passou mais duas
vezes com espelho HTTP real, incluindo módulos de áudio, ausência de erros JS,
construção, onda, persistência após recarregar, CSV e chamada preservada
(`mirror-browser-final-1/2.log`). As 24 verificações Godot passaram na exportação
reproduzível. Os bytes externos são locais nas regressões; disponibilidade do
novo domínio depende da publicação.

Uma corrida preexistente no teste do heartbeat foi corrigida em commit separado:
o teste aguardava somente o cliente fechar antes de conferir o descarte do
servidor. Agora aguarda também o fechamento dos dois sockets no servidor, sem
alterar o backend. Dois ciclos focados e o core completo passaram depois.

A aceitação do EXE/NSIS e da janela Atalaia empacotada pertence ao workflow Windows
full app do mesmo commit. A versão 0.3.8 preparada localmente não comprova sua
publicação: o manifesto de produção continua sendo a referência. Aprovação
visual anterior do frontend não implica aceite dos novos ajustes de jogos.


Após incorporar o reparo do atualizador na 0.3.8: typecheck, format:check e build
aprovados; 1.430 contratos core (`artifacts/atalaia/v038-core.log`) e duas rodadas
Atalaia/Nexus, com sete casos por rodada e zero falhas/skips
(`v038-browser-1/2.log`). Os fontes de apresentação de Love Letter e do tabuleiro
não mudaram nessa integração; a nova entrega Windows confirma também a configuração
do atualizador incorporada ao NSIS.


## Android — preparação da 1.0.1 (29/10/2026)

Branch `codex/android-app`, base main `6b9a283`. Usuário pediu Android com
composição responsiva, notificações e segundo plano; autorizou preparar Firebase
e instruções pois ainda não possui projeto. A entrega é incremental: host
Capacitor, UI de celular, Keystore, serviço de chamada e FCM de DMs/pedidos.
Web e Windows preservam seus donos e recursos. Não declarar paridade nativa
completa: captura da tela/áudio de outros apps, host de Remote PC e push de canais
não estão implementados no APK. Firebase, SQL aditivo, backend publicado e chave
permanente são requisitos operacionais descritos no guia de desenvolvimento.

Regressões específicas reproduziram cancelamento tardio da concessão e endereço
localhost incorreto antes da correção; contratos locais passaram depois. Layout
mobile usa navegador com microfone virtual; teste Android em emulador pertence ao
workflow do mesmo commit. Resultados finais e links de entrega serão registrados
após sua execução. Nenhuma aprovação visual ou de hardware é presumida.


Fechamento Android/1.0.1: código validado `2858e66`. A revisão Windows detectou
que o painel mobile herdava a coluna 2 do desktop e criava uma coluna implícita,
espremendo o Love Letter a 75px em 480px de viewport. O painel agora ocupa a
coluna 1; novos checks conferem a largura com membros abertos no navegador e na
WebView Android. Nenhuma regra/animação de jogo foi alterada. Duas rodadas locais
Love Letter/Similo/DMs/mobile passaram com sete casos por rodada, além de
compilação do APK e checks de tipo/formato/build. O core completo e as jornadas
foram repetidos nas execuções abaixo.

- [Android API35, 40941960824](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40941960824):
  passou login em backend real descartável/Supabase simulado, geometria da tela,
  mesma track do microfone virtual após cinco segundos minimizado, aviso nativo,
  saída e logout. Publicou a prévia corrigida 1.0.1, 55.762.267 bytes. Download
  completo conferido com SHA-256 `f608d9acdb488a098513d479b9bf0b06eb225227c36872c63ca846f74a0faba9`,
  assinatura APK v2 de teste válida e nenhum backend de fixture embutido.
- [Windows/Electron/NSIS/Surge, 40942027782](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40942027782):
  passou jornadas, executável empacotado, instalador real em runner descartável e
  publicação conjunta. Verificação externa confirmou frontend/latest.yml 1.0.1,
  EXE de 139.263.180 bytes com SHA-512 completo igual ao manifesto e as cinco
  folhas de Similo com SHA-256 correto. Relatório operacional fica na branch de
  controle, fora desta contribuição.

Main permaneceu em `6b9a283`, sem PR criado automaticamente. Backend respondeu
HTTP200 e preserva Similo/voiceResume; a origem Android respondeu 403 no preflight.
**Login no APK exige incorporar/deploy o backend desta branch** (ou autorizar
`https://localhost` no servidor existente). Firebase e chave permanente continuam
não configurados: avisos com processo encerrado não estão ativos, e este APK é de
teste. SQL aditivo é necessário ao ativar push; não foi executado no banco real.
Hardware, áudio físico, Bluetooth, câmera e tela bloqueada prolongada continuam
sem aceite. Captura nativa da tela/áudio de outros apps, host de Remote PC e push
de canais não foram portados; web/Windows conservam seus recursos. As execuções
não significam paridade nativa completa nem aceite visual do usuário.


Retomada de clipes em 31/10/2026, na contribuição `codex/clipes-tela`: replay do
Electron reativado apenas sobre a fonte compartilhada, com atalho global ativo
quando pronto. Central com submenu de qualidade/atalhos/pasta, perfis Excelente
e Econômica e controle do buffer temporário sem encerrar a transmissão nem
apagar clipes já criados. Versões e publicação permanecem intactas.
Tipos, formato e build passaram; 43 testes core de clipes passaram. Os dois
arquivos browser afetados passaram em duas rodadas consecutivas, com 16 testes
por rodada e nenhum skip. A primeira rodada teve oscilação na duração do trecho
e a nova fixture desktop precisou de frames animados; as duas seguintes passaram
sem relaxar a asserção de duração. Chromium usou mídia sintética e ponte Electron
simulada em Linux; atalho/captura/áudio no Windows real e aceite visual continuam
sem validação nesta retomada. Análise estática da demora nas chamadas registrada
no guia de desenvolvimento, sem alterar seu fluxo nem atribuir tempos medidos.


Publicação de front/backend autorizada em 31/10/2026, com deploy automático do
Render confirmado pelo usuário ao atualizar main. Otimização adicional de SFU:
consultas de ICE e status iniciam em paralelo; publicação continua aguardando as
duas. Novo teste reproduziu a espera sequencial antes da mudança. Os 97 testes
focados de transporte/realtime/clipes passaram, assim como tipos/formato/build.
Cenário SFU e continuidade básica de chamada passaram no Chromium; a malha de dez
clientes P2P falhou por vídeo remoto sem frames no prazo, no caminho P2P que não
foi alterado. Não equivale a validação real de latência. Testes nativos Windows
foram atualizados para o replay disponível e o registro/desregistro do atalho.
Versões preservadas; a publicação deve conservar os gates Windows existentes.

A seleção focada de continuidade básica/SFU passou em duas rodadas consecutivas
no mesmo build (dois testes por rodada, sem skips). Main remota conferida antes
do envio: `2fd2c63`. O push a main solicita os deploys automáticos confirmados;
acompanhamento da API GitHub e verificação pública dependem da liberação de rede
salva no rascunho do ambiente. Envio do commit não comprova publicação concluída.
