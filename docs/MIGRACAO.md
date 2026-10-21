# Estado da migração

Atualizado em 21/10/2026. Este documento registra o estado atual e as pendências;
os detalhes de responsabilidade e ciclo de vida ficam em [ARQUITETURA.md](ARQUITETURA.md).
O histórico das etapas anteriores permanece no Git.

## Base e limites de contribuição

- Branch de trabalho: `codex/next-typescript-structure`.
- Base inicial: `7db2d81`. Alterações upstream incorporadas até `8044ec4`, desktop 0.2.10.
  Isso não significa que houve uma consulta mais recente ao remoto.
- `main` permanece em `7db2d81`. Commits são locais e assinados; publicação exige
  pedido explícito do usuário. Não instalar nem atualizar o aplicativo distribuído
  como parte dos testes.
- Preservar todos os jogos, mensagens, perfis, chamadas, arquivos, clipes e soundboard.
  A migração não autoriza remover funcionalidades para reduzir o trabalho.

## O que já tem dono em TypeScript/React

| Área | Responsabilidade atual |
| --- | --- |
| Estrutura | Next App Router em `src/app/`, componentes por domínio e exportação estática compartilhada com Electron. |
| Rede e canais | `lib/socket/` possui um transporte, identidade e participação; `lib/channels/` possui catálogo, seleção e gestão. |
| Chat e arquivos | `lib/chat/` possui compositor, histórico, paginação e moderação; `lib/files/` possui transporte HTTP, cache e biblioteca. |
| Perfis e comunidade | `lib/profiles/`, `lib/community/` e `lib/messenger/` possuem leitura/edição, presença, conversas e anexos; interfaces em React. |
| Notificações | `lib/notifications/` possui preferências, contadores, deduplicação e entrega web/nativa. |
| Chamada | `lib/voice/` possui captura, publicação, P2P, SFU, recuperação, reprodução, diagnóstico, navegação e controles. Configurações e painéis em React. |
| Jogos | Controladores, mesa, navegação, escolhas e motor local de A Lei do Trono convertidos. Azul, Splendor e Love Letter têm motores compartilhados e controladores tipados; host de Cinzas integrado. |
| Clipes | `lib/clips/` possui buffer WebM, worker, sessão, armazenamento, exportação, preferências, coordenação e ponte Windows; biblioteca e controles em React. |
| Gravação manual | `lib/recording/` possui captura, mixer, encoder e escrita; `components/recording/` possui controles e runtime único. |
| Música/efeitos locais | `lib/audio/` possui catálogo, player e síntese dos jogos; controles React em `components/audio/`; armazenamento resiliente em `lib/storage/`. Não possui recursos da chamada. |
| Soundboard | `lib/soundboard/` possui biblioteca, player, decode, recorte WAV e upload por sessão; `components/soundboard/` possui menu, editor e waveform React. Transporte e exclusões são compartilhados com FilesClient. |
| Conta | `lib/auth/` possui transporte, validação, sessão, renovação, convidados e formulários; `components/auth/` possui diálogos React e integração única com rede/desktop. Política de senha compartilhada com o backend. |
| Preferências/layout | `lib/preferences/` possui preferências por conta; layout, aparência, shell desktop, atividade e controles de atualização possuem donos tipados. |
| Backend | `server/app.ts` compõe instâncias, `index.ts` inicia o processo; conta, arquivos, sessões, ICE, permissões, WAV, histórico, comunidade, mensagens diretas, SFU, participação/voz dos canais e coordenação dos quatro jogos possuem módulos TS estritos, sem DOM. Jogos importam regras/nomes compartilhados de `lib/games/`. Resta `runtime.cjs`, com chat/moderação, execução do soundboard e composição. |
| Electron | `electron/` contém janela, preload, permissões e captura. Desenvolvimento/testes usam identidade e perfis separados da instalação. |

As fachadas `Trono*` ainda necessárias encaminham aos mesmos donos; não devem
receber cópias de estado ou listeners. O núcleo independente de Cinzas e seus
recursos em `public/roguelite/` foram preservados.

## Remoções mais recentes

- `clips.js`, `clip-buffer.js`, `clip-store.js` e `clip-desktop.js`: responsabilidades
  transferidas para os módulos de clipes; assets antigos podados pelo build.
- `recording.js`: gravação manual e controles convertidos. Encerrar a captura libera
  tela/mixer antes de aguardar escolha de pasta ou escrita; microfone emprestado
  da chamada não é encerrado.
- `personal-prefs.js` e `rtc-config.js`: preferências e defaults RTC consolidados,
  preservando chaves existentes, STUN e pool de quatro candidatos.
- `bot-names.js`: sequência compartilhada em `lib/games/bot-names.ts`, importada
  pelos serviços e pelo protótipo local, sem global. A remoção inicial havia deixado
  esse consumidor local sem import; o teste nativo expôs a falha e agora verifica
  também os quatro nomes. O teste do pacote consulta o manifesto atual em vez de
  exigir scripts já removidos.
- `profile-data.js` e `server/profile-customization.js`: validação de escrita
  compartilhada em `lib/profiles/validation.ts`, com entrada HTTP tipada como
  `unknown` em `server/profile-customization.ts`. Leitura tolerante de registros
  antigos continua separada; erros, defaults e regras de gravação foram preservados.
- `azul-rules.js` e `azul-presentation.js`: motor e passos de pontuação tipados em
  `lib/games/`, importados diretamente. Servidor conserva autoridade e pilhas
  privadas; não há mais globais de regras/apresentação no renderer.
- `love-letter-rules.js`: motor tipado em `lib/games/`, com estado privado separado
  da projeção pública por jogador. Mãos, Padre e escolhas do Chanceler preservados;
  fixture determinística usa aleatoriedade por sala, sem alterar exports globais.
- `splendor-data.js` e `splendor-rules.js`: catálogo clássico e motor compartilhado
  em TypeScript. Baralhos e reservas passam pela projeção pública por jogador;
  pagamentos, ranking e licença dos dados permanecem preservados.
- `application-audio-worklet.js` e `light-noise-worklet.js`: fontes em
  `lib/voice/worklets/`, mantendo os mesmos caminhos gerados. Cálculos, buffer,
  ganhos e aprendizado preservados; os tipos do worklet não poluem Window.
- `application-audio.js`: dono tipado dos jobs/grafos por ID, assinatura IPC única,
  cancelamento de preparos e descarte de trilhas/contextos próprios. Créditos de
  pacotes descartados continuam sendo devolvidos; parar o C++ não aguarda o contexto.
- `noise-suppression.js` e `light-noise.js`: cache/preparo dos filtros em
  `lib/voice/noise-processors.ts`, recursos locais e fachadas em `noise-runtime.ts`.
  Timers, fetch e nós são descartados; contextos/microfones são emprestados.
- `desktop-platform.js`: seletor React em `components/desktop/capture-dialog.tsx`
  e controlador em `lib/desktop/capture.ts`. Cancelamento de preparo usa o ID do
  job; metadados inválidos e respostas tardias liberam recursos próprios. A tela
  entregue pertence ao chamador; áudio do computador continua uma escolha explícita.
- `audio.js`: preferências, player de música e efeitos separados em módulos tipados.
  Controles do portal, lobby e mesa projetam o mesmo estado em React; fontes,
  nós e contexto próprios são liberados sem fechar recursos emprestados. Faixas,
  fallbacks locais, créditos, ganhos e chaves existentes foram preservados.
- `soundboard-client.js`: controle, editor e player convertidos. Troca de conta
  cancela leitura/envio e invalida biblioteca/URLs antigas; fechar o menu cancela
  a prévia pendente, preservando efeitos recebidos da chamada. Decoder fecha seu
  próprio contexto; menu e waveform são React. Assinaturas de rede, eventos e
  observador de layout têm descarte explícito.
- `auth-boot.js`: fonte tipada em `lib/auth/callback-boot.ts`, conservando o caminho
  estático e a entrada beforeInteractive. Credenciais são consumidas uma vez;
  hashchange e descarte têm cobertura própria. O build agora posiciona a política
  de referrer antes dos recursos hoisted; Electron e servidor estático também a
  enviam em cabeçalho. A falha de referrer foi reproduzida com o bootstrap antigo.
- `auth.js`: último controlador JavaScript do frontend removido. Sessão e
  formulários têm donos tipados; credenciais não entram nos snapshots observáveis.
  Renovação concorrente é única e respostas antigas não atravessam logout/troca
  de conta. Persistência nativa é serializada; formulários, callbacks e convidados
  cancelam trabalho substituído. Diálogos estáticos anteriores foram apagados.
  Inicialização sai da fase de commit do React antes de montar raízes de domínio;
  não depende mais da espera acidental pelo download de um script.
- `src/legacy/`: pasta removida. A composição em `src/app/application-runtime.tsx`
  importa o layout de controles diretamente e não carrega scripts de domínio.
  Estilos foram para `src/styles/` por domínio, com 33 arquivos/770.491 bytes e
  precedência idênticos. Isso ainda não consolida sobreposições históricas de CSS.
  A ponte de anexos sem consumidores foi apagada; layout de controles descarta
  observers/listeners e restaura os nós emprestados.
- `server/roles.js`, `soundboard.js` e `chat-history.js`: fontes substituídos por
  TypeScript estrito. Histórico valida páginas RPC e mantém compatibilidade com
  metadados antigos; filas são isoladas por canal. Encerramento cancela requisições
  pendentes e impede executar jobs que aguardavam na fila.
- `server/community.js`: presença/diretório convertidos com protocolo de RPC
  separado. Página inválida não altera parcialmente membros ou nomes reservados;
  consultas concorrentes compartilham uma promessa. Encerrar cancela HTTP/timer,
  limpa tickets e impede respostas tardias. Apelidos têm um contrato puro comum
  ao serviço de conta e aos convidados.
- `server/community-management.js`: canais, cargos e consultas de perfis/contas
  convertidos. HTTP autenticado e leitura das respostas têm módulos próprios.
  Salas continuam criadas pelo runtime e reutilizadas; leituras canceladas não
  alteram o mapa. Mutações já iniciadas concluem a sincronização mesmo se o
  cliente HTTP fechar; o encerramento do serviço cancela ambas. A regressão de
  mensagem de perfil interrompido por troca de conta também foi corrigida.
- `server/social-service.js`: amigos, mensagens privadas, convites, anexos,
  paginação e limites por conta/ação convertidos. Respostas usam o protocolo
  compartilhado; confirmação e broadcast correspondem ao envio solicitado.
  Leituras canceladas não degradam a saúde do serviço; descarte impede publicações
  tardias. A validação de anexos encaminha cancelamento ao mesmo adapter de arquivos.

O desktop mantém a política existente de replay web suspenso: não cria
`TronoClips`, controles web ou ponte web de clipes no Electron. A gravação manual
continua disponível. Não reativar captura automática como efeito da migração.

## Trabalho restante

Não há mais `src/legacy/` nem controladores de domínio carregados por script.
O boot antecipado de callback continua beforeInteractive e os worklets mantêm
seus caminhos. Estilos ainda têm preparação estática conforme o guia desktop.
A API
`TronoApplicationAudio.cancel(id)` cancela somente o preparo/grafo desse job;
não descarta o dono global nem as outras capturas.

Antes desse recorte, `electron/native-helper.cjs` consolidou os caminhos do helper
C++ de áudio/atividade. O modo de desenvolvimento procurava um diretório acima
do repositório; agora usa o artefato do mesmo build configurado no pacote.
Uma regressão compara os dois consumidores à configuração do electron-builder.

### 1. Backend e contratos externos

- Extrair chat/moderação, execução do soundboard e composição de `server/runtime.cjs`,
  preservando `createApplication()` e o isolamento por instância.
- Converter o runtime por domínio, mantendo autorização e persistência.
- Completar validação dos payloads externos com seus consumidores de chat/soundboard e identidade.
- `tsconfig.server.json` verifica módulos TS estritamente; não torna os serviços JS
  existentes estritos por estarem na mesma pasta.

### 2. Estilos e limpeza final

Consolidar CSS por domínio depois de retirar os respectivos controladores.
A ordem em `src/styles/manifest.json` contém sobreposições necessárias para estados
de chamada fora da vista inicial. As pastas já estão organizadas, mas ainda é
necessário consolidar regras por domínio, validar a cascata e avaliar importação
direta pelo Next. Remover adaptadores apenas sem consumidores.

`public/` na raiz contém também recursos originais. Somente JS/CSS gerados na raiz,
`out/`, `.next/` e `artifacts/` são saídas regeneráveis; não tratar todos os assets
como temporários. Licenças, créditos, modelos de áudio, SQL, manuais distribuídos
e recursos dos jogos permanecem necessários. Evidências em `artifacts/` podem ser
apagadas quando não forem mais úteis; builds/testes as recriam conforme necessário.

### Instalação nova do banco: roteiro concluído

`supabase/install.sql` centraliza a ordem dos 13 SQL e recusa uma base já instalada.
`database:prepare` gera SQL para revisão/SQL Editor; `test:database` instala o mesmo
conteúdo em PGlite vazio. Os fontes SQL anteriores não foram modificados. Comandos,
limites e distinção em relação ao histórico/reset do CLI estão no guia desktop.
O aceite num Supabase completo permanece externo; nenhum projeto remoto foi alterado.

## Ponto de retomada da maratona

Checkpoint de trabalho: autenticação, arquivos, os quatro serviços de jogos e SFU convertidos, na branch
`codex/next-typescript-structure`.
O frontend não tem mais pasta legacy nem controladores JavaScript de domínio.
A migração completa ainda não está concluída: `runtime.cjs` permanece em
JavaScript e não ganha tipagem estrita por consumir módulos TS.

`server/auth.js` foi removido. `auth.ts`, `auth-provider.ts`, `auth-protocol.ts`
e `auth-errors.ts` separam rotas/limites, transporte, validação e erros públicos.
Conta continua fechada por padrão e verificada pelo provedor antes de ler claims
locais. Confirmação, recuperação sem enumeração, perfis e revogação permanecem.
O shutdown agora cancela os HTTP e limpa o timer/limites dessa instância;
gravações já aceitas conservam as notificações após o cliente fechar.

`server/files.js` foi removido. `files.ts` possui autorização, uploads, quota e
limpeza; `files-protocol.ts` valida páginas/reserva/confirmação; contratos e
limites ficam em `files-contract.ts`. `storage-database.ts`, `storage-r2.ts` e
`file-upload.ts` possuem DB, assinatura/objeto e leitura limitada do upload.
Shutdown cancela HTTP/objeto e libera timer/deadlines; uma resposta tardia não
libera quota nem publica exclusão. PUT incerto conserva a reserva até a limpeza
posterior confirmar exclusão. Autorização privada exige booleano explícito.

O runtime recebe `objectStorage` como dependência opcional para testes. A fixture
de anexos usa essa porta em vez de alterar exports ESM. O registro sintético do
soundboard agora inclui `object_key`, presente nas linhas reais; a ausência foi
corretamente recusada pela validação nova. Nenhuma validação foi afrouxada.

`server/love-letter-service.js` também foi removido. `love-letter-service.ts`
possui salas, participação, limites, bots, reconexão e timers;
`love-letter-protocol.ts` valida comandos e estrutura da jogada. O motor segue
autoritativo e recebe somente campos conhecidos após conferir a revisão.
`publicState(viewer)` continua sendo a única projeção de cartas/efeitos privados.
Stop limpa salas/participação e todos os timers, sem ações/broadcast tardios.
A fixture de embaralhamento usa a porta `loveLetterRandom` da composição, sem
alterar exports ESM. O teste de nomes compartilhados também aponta para o módulo TS.

`server/azul-service.js` foi removido. `azul-service.ts` possui a coordenação e
`azul-protocol.ts` valida comandos/jogadas; `game-ranking.ts` possui HTTP privado,
confirmação de gravação e readiness. Leitura de ranking reutiliza o protocolo puro
do frontend, validando a página completa e descartando campos extras. `socket-command.ts`
centraliza apenas a correlação limitada, compartilhada com Love Letter.
Partida conserva ID idempotente e resultado calculado pelo servidor; retry manual
cancela o timer anterior para manter uma tentativa agendada. Shutdown cancela RPC,
salas e timers. Desconexão/troca de identidade suprime respostas tardias de ranking.
Cada sala também possui seu fluxo de aleatoriedade, injetável na fábrica para testes.

`server/splendor-service.js` foi removido. `splendor-service.ts` usa o mesmo
transporte de ranking com `readSplendorRanking` e possui timers/RPC/retry por
instância. `splendor-protocol.ts` valida comandos, IDs e vetores de fichas;
reservas cegas, pagamento, devolução e nobres continuam validados pelo motor.
A projeção continua individual por jogador, inclusive nos logs da reserva cega.

Primeiro recorte de SFU concluído: `realtime-policy.ts` possui leitura de env,
perfis, limites de consumo, qualidade/RID e estimativas de egress;
`realtime-usage.ts` possui contador e checkpoint mensal. O manager usa o mesmo
contador por getter, sem cópia paralela. Caminho de checkpoint/env podem ser
injetados por instância; dados malformados não restauram bytes. Defaults, limites
e perfis de bitrate foram preservados. Leitura/gravação de arquivo saiu do manager,
assim como helpers de política substituídos e `totalGb()`, sem consumidores.
`realtime-sfu.js` foi removido. `realtime-sfu.ts` possui sessões, participação,
filas e publicações/assinaturas; `realtime-contract.ts` descreve essas fronteiras.
`realtime-provider.ts` valida respostas completas, limita HTTP e remove credenciais
dos erros. `abortable.ts` delimita a espera mesmo se um adaptador ignorar o sinal;
`ice.ts` usa o mesmo cancelamento e recusa páginas TURN parcialmente inválidas.
Autorização continua por socket, participante e sala. Cada participação possui um
escopo cancelável; sair invalida trabalho ativo e enfileirado sem bloquear a próxima
chamada. Reservas de publicação incluem pedidos em andamento no limite de donos.
Respostas tardias não reinstalam sessões nem confirmam publicações substituídas.
O shutdown aborta HTTP/filas/TURN, limpa mapas e tenta fechar tracks conhecidas com
prazo compartilhado de três segundos, aguardado pela composição. A limpeza remota
é melhor esforço: uma criação cuja resposta se perdeu não fornece ID para fechar.
SDP/RTP/RID, perfis de bitrate/simulcast e tempos de recuperação foram preservados.

`throne-service.ts` agora possui as fases autoritativas de A Lei do Trono,
cartas privadas, bots, prompts, projeção por espectador e todos os timers.
`throne-contract.ts` descreve estado privado e pendências discriminadas;
`throne-protocol.ts` projeta os campos conhecidos dos comandos. Seleções,
índices/assentos e campos de Influência são validados antes de alterar a partida.
Pronto/início/ações conferem o socket atual; saída transfere o assento ao bot.
Shutdown invalida transições, limpa os timers de turno e solta o estado privado.
O runtime delega também mudança de nome e substituição do jogador, sem possuir
outro timer de partida. `deck` e `firstRoundStarter` foram retirados do estado
online por não terem leitores; o baralho de distribuição permanece local.

`channel-service.ts` possui o catálogo e a participação independente em texto,
voz e jogo, a projeção pública/roster privado, troca de modo e sinalização.
`channel-contract.ts` descreve a mesma conexão e os membros compartilhados com
os outros serviços; nenhum segundo socket ou capturador foi criado.
`channel-protocol.ts` valida destinos e flags de voz. A sinalização usa o mesmo
parser do cliente; os tipos de protocolo foram separados dos recursos DOM em
`src/types/peer-signal.ts`, permitindo validação estrita no Node sem DOM.
Sete fixtures WebSocket agora enviam ofertas com `data.type`, como o cliente real;
as anteriores omitiram esse campo e eram corretamente recusadas pela validação.
Destino inválido/cheio preserva a chamada; rosters privados exigem participação e
estado/sinalização exigem o socket atual. Stop libera mapas e suprime broadcasts.

Próximo recorte recomendado: o restante de `server/runtime.cjs` (aproximadamente
930 linhas): chat/moderação, execução do soundboard e composição HTTP/WebSocket.
Manter `createApplication()`, um único socket e os donos de mídia. A fábrica de
canais não executa callbacks durante a construção; callbacks adiados da composição
conectam presença, histórico e jogos sem criar outra instância desses serviços.

Sequência restante, após esse recorte:

1. `server/runtime.cjs`: extrair chat/moderação e execução do soundboard para donos
   tipados, mantendo instâncias independentes e shutdown. Completar payloads dessas
   fronteiras/identidade e deixar somente composição no ponto de entrada tipado.
2. Consolidar a cascata em `src/styles/` e avaliar imports diretos pelo Next.
   A movimentação de arquivos está concluída; as sobreposições e a preparação
   estática continuam explicitamente preservadas.
3. Fechar os aceites físicos/externos descritos abaixo. Não confundir PCM
   sintético, PGlite ou browser/Electron com captura física, e-mail ou produção.

Última validação de código: `typecheck`, `format:check`, build estático e
`npm test` completos passaram. `test:server:lifecycle` tem 118 verificações;
`test:database` tem seis. Os 12 casos de comunidade/canais/arquivos/diretório/editor
e a chamada completa com dois Electron reais passaram após converter o gerenciador.
Os 22 modelos da sessão e a regressão de troca de conta durante salvar perfil
também passaram, preservando o erro do domínio.
Não há alteração pendente de código, instalação do aplicativo ou publicação remota.
Autenticação do backend acrescenta 11 regressões de provedor, identidade,
shutdown, HTTP e posse das alterações; 35 modelos e o fluxo HTTP/WebSocket de
conta passaram. Os 13 casos de conta/editor/diretório no browser também passaram.
No Electron real, persistência criptografada da conta e a chamada completa com
dois clientes passaram; essa etapa não mede loopback físico ou FPS de jogo.
Armazenamento acrescenta 19 regressões de privacidade, validação, quota,
cancelamento, R2 e descarte. Links assinados foram idênticos em 24 cenários;
upload/download/soundboard e a chamada completa em dois Electron passaram.
Os testes usam adaptadores locais, sem acessar R2/Supabase reais.
Love Letter acrescenta seis regressões de fronteira, privacidade, rate limit e
shutdown. Em 100 partidas completas, 5.148 jogadas, 601 avanços de rodada e 11.698
visões privadas foram idênticos ao serviço anterior. Partida completa no browser,
fronteira nativa Electron e fluxo de jogos do pacote Windows existente passaram
contra o backend atual. Nenhum instalador foi executado.
Azul acrescenta sete regressões de fronteira, provider, retry e cancelamento.
Em 100 partidas, 5.484 jogadas e 11.168 visões públicas foram idênticas ao serviço
anterior. Partida completa nos dois layouts, visão portrait, Love Letter e a
chamada com dois Electron reais passaram após a conversão.
Splendor acrescenta seis regressões de fronteira, reservas privadas, carteira,
recordes e shutdown concorrente. Em 100 partidas, 6.143 jogadas e 12.486 visões
privadas foram idênticas ao serviço anterior. Os três casos de interface, incluindo
partidas completas nos dois hosts e preservação da chamada, e o pacote Windows
existente passaram contra o backend atual. Resta apenas um arquivo JS/CJS no
servidor; isso ainda não encerra a migração completa.
Política SFU acrescenta seis regressões de configuração, limites, camadas,
checkpoint, retomada/virada mensal e isolamento. Houve paridade em 20 casos de
limite/base, 960 estimativas de bitrate e 1.500 decisões de RID. Os 125 casos de
`test:sfu`, a chamada completa com dois Electron e o relay SFU em Electron passaram.
Nenhum parâmetro de negociação, captura, bitrate ou recuperação foi ajustado.
O manager SFU acrescenta 15 regressões diretas de negociação, autorização, limite
concorrente, validação do provedor/TURN, filas, saída/reentrada e shutdown limitado.
Doze fluxos das quatro mídias e três qualidades conservaram 102 chamadas ao provedor
e 162 eventos no protocolo. Os 125 casos SFU e a chamada com dois Electron passaram.
O relay nativo agora atravessa também o manager Node tipado e seu adaptador de
provedor, negociando mídia WebRTC real no Electron. Exige descarte imediato dos
peers do cliente e aguarda separadamente o descarte remoto. Isso não testa uma
conta Cloudflare real, TURN de produção, loopback físico nem FPS em jogo.
A Lei do Trono acrescenta oito regressões de comandos, posse, privacidade,
substituição por bot, cancelamento e isolamento. Dez partidas de três rodadas
cobrem todos os decretos. A comparação com o coordenador anterior cobriu 100
partidas completas, 14.611 ações, 123.950 visões privadas e 269.445 eventos idênticos.
Tipagem, formatação, build estático, suíte completa e a fronteira Electron passaram.
Os nove casos de interface de escolhas, lobby e simulação local passaram, incluindo
as três rodadas locais, escolhas privadas e preservação dos recursos da chamada.
`court-browser.js` falha na expectativa antiga de entrada automática em voz,
antes de entrar na partida; a mesma falha foi reproduzida com o runtime anterior.
Canais acrescentam sete regressões de participação, privacidade, limites/modo,
destinos inválidos, convidados, mensagens malformadas e shutdown. A comparação
com o coordenador anterior preservou 716 comandos, 3.904 eventos e 1.335 efeitos.
Tipagem, formatação, build estático, suíte completa, sete casos de interface e
a chamada com dois Electron passaram, além do relay SFU pelo backend tipado.
Limites de aceites físicos/externos continuam os descritos abaixo.
Evidências: `artifacts/storage-owner-*` e `storage-signature-parity.json`;
Love Letter usa `artifacts/love-letter-service-*`;
Azul usa `artifacts/azul-service-*`;
Splendor usa `artifacts/splendor-service-*`;
política/uso SFU usam `artifacts/realtime-policy-*`;
manager/provedor e relay usam `artifacts/realtime-manager-*`;
A Lei do Trono usa `artifacts/throne-service-*`;
canais/participação usam `artifacts/channel-service-*`;
autenticação fica em `artifacts/backend-auth-*`;
mensagens diretas ficam em `artifacts/social-service-*`;
gerenciamento usa `artifacts/community-management-*`;
presença usa `artifacts/community-service-*`; a composição
tem `application-composition-*`, a conta `auth-owner-*` e a instalação
`database-install-*`. Algumas primeiras tentativas nesses diretórios registram
falhas de fixtures já corrigidas; os resultados finais são os descritos aqui.

Comandos e ambiente de Edge, Electron e FFmpeg estão no guia desktop. Após mudar
código, repetir as verificações relevantes antes do próximo commit assinado;
manter `main` em `7db2d81` e publicar somente mediante pedido explícito.

## Como continuar um recorte

1. Localizar consumidores, eventos, estado e recursos antes de mover o código.
2. Transferir o dono completo e validar dados externos; manter um socket e um dono
   por recurso. Troca de conta/fonte e descarte devem invalidar trabalho pendente.
3. Remover fonte substituído, entrada no manifesto e adaptadores sem consumidores.
4. Executar tipagem, formatação, build e regressões relevantes. Testes de interface
   consomem `out/`; alterações de mídia também exigem Electron real.
5. Atualizar as pendências deste documento e a responsabilidade em ARQUITETURA;
   criar commit local assinado na branch de contribuição.

Não parar o microfone ou a tela da chamada ao encerrar um consumidor emprestado,
replay, exportação ou gravação. Navegação, layouts e configurações devem preservar
as mesmas trilhas e players. Captura só ocorre pela ação autorizada do usuário.

## Validação local mais recente

Executada em Windows em 20–21/10/2026, após os recortes acima:

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck`, `npm run format:check`, `npm run build` | Passaram. |
| `npm test` | Cadeia completa de backend, jogos e modelos passou após converter áudio compartilhado e integrar o controlador do soundboard. |
| Azul tipado | Paridade exata em 120 partidas (8.433 jogadas/601 replays); 25 regressões de regras/controle/SQL/WS e três casos de interface passaram. |
| Love Letter tipado | Paridade em 100 partidas (6.728 jogadas/464 novas rodadas e visões privadas); 26 regressões e partida completa na interface passaram. Electron real e pacote também passaram sem global antigo. |
| Splendor tipado | Paridade em 120 partidas/10.294 jogadas e catálogo completo; 26 regressões e três casos de interface passaram. Chamada no Electron e pacote passaram sem globais antigos. |
| `npm run test:clips` | 55 verificações passaram; inclui persistência, quota, exportação, encoder, ponte e descarte. |
| `npm run test:recording` | 14 verificações passaram; inclui cancelamento, mixer, finalização e arquivo decodificado. |
| `npm run test:settings` | 137 verificações passaram após consolidar preferências. |
| `npm run test:notifications:ui` | Três fluxos passaram. |
| Perfis após validação compartilhada | 13 verificações de contrato/SQL/mídia, autenticação HTTP/WebSocket e três casos de edição nos layouts web/desktop passaram. |
| `tests/call-controls-browser.js` | 13 verificações passaram após retirar o coordenador antigo de clipes. |
| `npm run test:desktop:layout` | Cenário completo com dois Electron reais passou, incluindo gravação manual e política de clipes. |
| Pacote Windows sem instalador + `tests/desktop-packaged.js` | Executável real, recursos locais e RNNoise passaram com perfil temporário. |
| Caminho do helper/atividade | 29 verificações de núcleo, `test:activity:native`, fluxo completo de permissões/seletor/arquivos e pacote passaram. Recursos/interface usam `--mute-audio`; janela real detectada sem expor PID/caminhos. |
| Worklets tipados | 5.704.704 amostras idênticas em 24 mil blocos, 44,1/48 kHz e mono/estéreo. Oito regressões, 51 de captura e renderização Web Audio no Electron real passaram. |
| Dono de áudio por aplicativo | Nove regressões de protocolo/recursos, incluindo cancelamento por ID, e PCM via IPC/preload/worklet no Electron passaram, com créditos únicos e RMS 0,25. `npm test` completo passou no recorte anterior; chamada/navegação nativa também passou após integrar o seletor. |
| Preparo dos filtros | 13 modelos, três fluxos de navegador e medição de fala/ruído no Electron passaram. Registro reaproveitado por contexto; nativo/off sem filtros extras; chamada/navegação nativa preservada. |
| Seletor desktop | 14 regressões do controlador e cinco verificações da interface passaram; fluxo nativo de seleção/cancelamento/captura e chamada completa com dois Electron passaram. Cancelamento, resposta tardia, isolamento de jobs e preservação da tela entregue são cobertos. |
| Música/efeitos locais | 12 regressões novas e 20 de áudio da chamada passaram; 102 comparações dos 17 efeitos com a versão anterior preservaram os grafos, envelopes, ganhos e buffers de ruído. Navegador verificou forma de onda real, mute, teclado, três painéis sincronizados e descarte sem fechar contexto/trilha emprestados. Portal web/desktop, chamada completa no Electron e pacote passaram. |
| Soundboard | 17 regressões do cliente e dois contratos HTTP/PCM passaram. 48 comparações/29.201.262 bytes de WAV idênticos ao encoder anterior. Dez verificações de navegador/shell, chamada completa no Electron e pacote passaram; renderer nativo também decodificou 15 s estéreo a 48 kHz, preservando níveis/canais com tolerância de quantização. |
| Boot da conta | Seis modelos de callback/HTML e sete verificações de navegador passaram: cadastro, confirmação de uso único, login/logout, recuperação, erros e restauração de convidado. Requisições de recursos não incluem tokens no referrer. Fluxo nativo de cabeçalho/captura/PCM/permissões passou. |
| Conta tipada | 34 modelos de transporte/sessão/formulários/callback/HTML e autenticação HTTP/WS passaram. Sete verificações de conta e oito de permissões/comunidade/arquivos passaram no navegador. Electron real validou criptografia, restauração sem cache da aba, remoção de “lembrar”, login e logout no botão movido para configurações. Chamada completa com dois Electron, pacote Windows e `npm test` completo passaram. |
| Composição e estilos | 28 verificações de navegador passaram, incluindo descarte/reinstalação do layout, hosts/trilhas preservados e fechamento com consumidores ativos. Os 33 estilos/770.491 bytes mantêm conteúdo e precedência idênticos. Tipagem, formatação, build, modelos de conta e `npm test` completo passaram; conta criptografada e pacote passaram no Electron real. |
| Serviços básicos do backend | Oito verificações de política/fila/cancelamento/ciclo de vida passaram. As 24 regressões relacionadas de SQL, persistência após reinício, perfis e soundboard passaram; `npm test` completo, tipagem, formatação e build também passaram. Provedor e bancos são fixtures locais. |
| Instalação nova do banco | Seis verificações passaram: inventário único dos 13 SQL, instalação completa, 12 tabelas com RLS, funções privilegiadas com search_path fixo, privacidade/autorização e bloqueio de reexecução preservando os dados. Executado em PGlite descartável, sem Supabase remoto. |
| Presença/comunidade do backend | Cinco regressões novas de diretório, atomicidade, cancelamento, privacidade, convidados e nomes passaram; suíte de ciclo de vida tem 13 verificações. Conta/HTTP/WS, `npm test` completo, tipagem, formatação e build passaram. Os 15 fluxos relacionados de navegador e chamada completa com dois Electron reais também passaram. |
| Gerenciamento da comunidade | Oito regressões de protocolo/HTTP/fila e três dos adapters de cancelamento passaram; ciclo de vida soma 24 testes. Tipagem, formatação, build e `npm test` passaram. Os 12 casos de interfaces, chamada com dois Electron, conta criptografada e pacote Windows passaram. Corrigido também o erro de perfil cancelado, com 22 modelos de sessão e os dois hosts do editor aprovados. |
| Mensagens diretas do backend | Oito regressões de protocolo, privacidade, limites, cancelamento e HTTP passaram; lookup de anexo também cancela pelo adapter. Ciclo de vida soma 33 testes. SQL/anexos HTTP, `npm test`, tipagem sem DOM, formatação e build passaram. Os 15 casos de mensagens/convites/anexos na interface e a chamada completa com dois Electron reais passaram. |

Evidências ignoradas pelo Git: `artifacts/clip-coordinator-*`, `clip-bridge-*`,
`manual-recording-*`, `personal-preferences-*`, `bot-names-*`, `profile-validation-*`
e `azul-core-*`/`love-letter-core-*`/`splendor-core-*`. As primeiras execuções nativas de `azul-core-desktop*` registram
a regressão do import dos bots; `azul-core-desktop-fixed.log` registra a correção.
Os worklets têm evidências em `artifacts/typed-worklets-*`, incluindo medições
offline no Edge/Electron e o filtro leve com a fixture de fala. Renderização
offline testa o DSP, sem validar o dispositivo físico de loopback.
O dono nativo tem evidências em `artifacts/application-audio-*`; a regressão de
IPC injeta PCM no main de um Electron descartável e não aprova captura física.
Os filtros têm evidências em `artifacts/noise-processors-*`; a medição offline usa
fala da fixture e o WASM local, sem substituir a verificação de microfone físico.
A comparação dos efeitos está em `artifacts/app-audio-parity.json`, com a fonte
anterior obtida de `fcffedb`. O teste mantido de forma de onda e controles é
`tests/tabletop-audio-browser.js`; os modelos ficam em `tests/app-audio.cjs`.
O soundboard tem paridade em `artifacts/soundboard-wav-parity.json` e cadeia completa
em `artifacts/soundboard-full-test.log`; `tests/soundboard-browser.cjs` cobre
recorte, upload, reprodução de sala, foco, mobile e descarte. Decoder/codec e
corridas de sessão/URLs ficam em `tests/soundboard.cjs`. O teste nativo curto é
`tests/desktop-runtime.js`; todos usam dados sintéticos e não aprovam loopback físico.
Callbacks usam `test:auth:models` e `test:auth:ui`; referência da falha anterior em
`artifacts/auth-callback-baseline.log`. Testes de autenticação usam somente o
provedor local da fixture, sem acessar contas ou configurações Supabase reais.
O executável local de conferência está em
`artifacts/windows-app/win-unpacked/MN Trono.exe`; não substitui a instalação.

Para comandos/ambiente completos, veja [DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).
Os testes de navegador deste ambiente usam Edge pelos parâmetros
`CHROMIUM_EXECUTABLE_PATH` e, nas suítes antigas, `AUTH_TEST_CHROMIUM`.
Exportação e decodificação exigem `ffmpeg`/`ffprobe` no PATH; a cópia portátil local
fica em `artifacts/ffmpeg/extracted/`. Testes nativos dependem do Electron instalado
em `electron/node_modules` e do helper C++ compilado quando o fluxo o utiliza.

## Limites e regressões antigas conhecidas

- `test:frontend` ainda espera `#chatOnlyScreen` visível apesar de usar
  `display: contents`; a área visível é `#callWorkspace`. A primeira falha também
  foi reproduzida em `7db2d81`. A aceitação atual está em `test:ui`; a suíte antiga
  não foi silenciada. Evidência: `artifacts/migration-frontend-baseline.log`.
- `tests/desktop-browser.js` teve seis casos aprovados e dez falhas nas expectativas
  antigas de entrada automática em voz/fechamento de configurações. O mesmo
  resultado foi reproduzido em `9ed1162`; a verificação de replay suspenso passou.
  Evidências: `artifacts/clip-buffer-desktop-policy-ui.log` e
  `artifacts/clip-buffer-desktop-policy-baseline.log`. Modernizar essas expectativas
  permanece pendente; não foram ignoradas para declarar sucesso.
- Ao corrigir o caminho do helper, `tests/desktop-audio.js` esgotou 70 segundos
  sem concluir a coleta de PCM. Esse teste executa o C++ diretamente e não usa o
  novo resolvedor de caminhos. Não houve alteração do código C++ ou dos encoders.
  `tests/desktop-runtime.js`, atualizado para `electron/package.json`, avançou por
  atividade/seletor/arquivos, mas esgotou 160 segundos em `saved media permissions`,
  aguardando o microfone. Sem reprodução física (`--mute-audio`), o fluxo completo
  passou, incluindo permitir, lembrar, redefinir e recusar permissões. O aceite
  de loopback físico permanece pendente; não atribuir
  uma causa de dispositivo/driver sem nova evidência. Logs em
  `artifacts/native-helper-path-audio.log` e `native-helper-path-runtime.log`.
  O cenário de atividade foi extraído para um helper reutilizado e passou isolado
  em `test:activity:native`; o fluxo maior mantém suas verificações de permissões.
  O aceite de recursos/interface do pacote passou com `--mute-audio`, isolando-o
  da reprodução física; esse modo ainda instancia os worklets e testa os jogos.
  Isso não substitui nem ignora a regressão de PCM real, que continua sem mute.
  Resultados com reprodução isolada: `native-helper-path-runtime-muted.log` e
  `native-helper-path-packaged-muted.log`.
- Mídia dos testes é sintética. Eles não medem 60 fps em jogos reais, conectividade
  TURN em produção, entrega de e-mail ou um deploy. A gravação usa encoder e mixer
  reais, mas destino de arquivo simulado; não prova o seletor/escrita do Windows.
- Fechar a página durante gravação não garante a exportação; parar explicitamente
  continua necessário. O teste de janela flutuante web simula uma janela de mesma
  origem e não valida a API nativa de Picture-in-Picture.
- Nenhum serviço remoto ou configuração de infraestrutura foi alterado. Publicação
  exige Node 24.12+ e `npm start`; comandos externos antigos com `node server.js`
  precisam ser atualizados antes do deploy.
