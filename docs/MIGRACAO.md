# Estado da migração

Atualizado em 22/10/2026. Este é o checkpoint para continuar sem o histórico do
chat. Responsabilidades e ciclos de vida estão em [ARQUITETURA.md](ARQUITETURA.md);
comandos e ambiente em [DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).
O histórico detalhado das conversões permanece no Git.

## Branch e limites

- Contribuição atual em `codex/desktop-ci-parallel`, baseada na main `f3472cb`,
  no clone novo sem worktrees adicionais nem upstream para main. Felipe autorizou
  commit e push desta contribuição em 22/10/2026; a main não foi alterada.
- Upstream incorporado cobrindo `8044ec4..6b9ae47`: desktop 0.2.11 a 0.3.2 e backend 0.14.0-alpha portados para a arquitetura migrada.
- Não publicar, fazer deploy nem substituir o aplicativo instalado sem pedido
  explícito. O pacote em `artifacts/windows-app/win-unpacked/` é só para conferência.
- Preservar todos os jogos, mensagens, perfis, arquivos, chamadas, clipes e soundboard.
- Continuar com um socket por cliente e um dono por recurso de mídia. Consumidores
  emprestados não encerram o microfone, a tela ou o contexto de outro dono.

## Conversões concluídas

| Área | Onde editar |
| --- | --- |
| Composição frontend | `src/app/`, `src/components/application.tsx` e `src/app/application-runtime.tsx`. Next App Router, React e TypeScript estrito; exportação estática compartilhada com Electron. |
| Transporte, canais e chat | `src/lib/socket/`, `lib/channels/`, `lib/chat/`; interfaces nos componentes dos respectivos domínios. Transporte, identidade e participação únicos. |
| Conta, arquivos e perfis | `lib/auth/`, `lib/files/`, `lib/profiles/`, `lib/community/`, `lib/messenger/`; formulários, editor, biblioteca e conversas em React. |
| Chamadas e moderação | `lib/voice/` possui captura, publicação, P2P, SFU, recuperação, reprodução, diagnóstico e moderação de participantes (mutar, bloquear mídia, expulsar). Painéis e configurações em React. |
| Jogos e lançador | `lib/games/` possui regras e controladores tipados de A Lei do Trono, Azul, Splendor, Love Letter, Ticket to Ride e hub Nexus; componentes em `components/games/`. Cinzas continua independente em `public/roguelite/`. |
| Remote PC e Gamepad | `lib/voice/remote-*`, `components/voice/remote-pc-dialog.tsx`, `electron/remote-input.cjs` e `electron/native-audio/remote-input.cpp` para controle remoto WebRTC e injeção nativa de controle virtual Xbox (ViGEm). |
| Clipes e gravação | `lib/clips/` e `lib/recording/` possuem buffer, worker, armazenamento, mixer, encoder, exportação e ponte Windows; controles/bibliotecas em React. |
| Áudio e soundboard | `lib/audio/` e `lib/soundboard/` possuem efeitos, player, decode, recorte e envio. Worklets tipados em `lib/voice/worklets/`; recursos e ganhos anteriores preservados. |
| Shell e preferências | `lib/desktop/`, `lib/preferences/`, `lib/settings/`, `lib/notifications/` e componentes dos domínios possuem layout, atividade, avisos e atualização. |
| Backend | Todos os módulos de `server/` são TS estritos, sem DOM. `app.ts` compõe serviços; `index.ts` inicia o processo; `socket-gateway.ts` possui conexão, identidade, dispatch e heartbeat; serviços para Ticket to Ride, moderação e Remote PC. |
| Estilos | `src/styles/index.css` explicita a cascata de domínio, importada pelo layout raiz após `globals.css`. Next compila e distribui o CSS. |
| Electron | `electron/` possui janela, preload, permissões, arquivos, notificações, Nexus IPC e auxiliares nativos (ViGEm). Desenvolvimento e testes usam identidade/perfil separados da instalação. |

`src/legacy/`, o manifesto de scripts, `legacy-runtime.tsx` e `server/runtime.cjs`
foram removidos. Não há controladores de domínio JS carregados pelo renderer nem
módulos JS/CJS restantes em `server/`. As fachadas `Trono*` ainda consumidas apontam
para os mesmos donos; não devem ganhar cópias de estado ou listeners.

Os serviços do backend possuem validação de entrada, autorização, projeções
privadas, cancelamento e descarte por instância. Filas capturam a identidade e
revalidam operações quando necessário. Os adapters de testes são portas explícitas
da composição; não alteram exports de produção. Conta continua obrigatória e os
serviços externos não foram reconfigurados.

`supabase/install.sql` ordena os 13 SQL existentes e recusa bases já instaladas.
`database:prepare` gera um arquivo revisável; `test:database` instala o mesmo
conteúdo em PGlite vazio. Isso não equivale a aplicar migrações num Supabase real.

## Últimos checkpoints

- `8f57f84`: remove o runtime JS do servidor e conclui composição/gateway tipados.
- `33ea00e`: importa a cascata pelo Next, remove manifesto/cópias CSS estáticas e
  divide o antigo `base/style.css` em 14 arquivos de domínio, sem reordenar declarações.
  Oito regras exatamente repetidas foram removidas mantendo a última ocorrência
  no mesmo contexto. Temas Original/Discord e URLs locais de imagens/fontes permanecem.
- `259615c`: habilita `noUnusedLocals`/`noUnusedParameters` no frontend
  e backend, remove argumentos/opções privados sem leitura e a fachada
  `TronoAppearance` sem consumidores. Posições obrigatórias de callbacks usam `_`.
  Títulos da chamada têm hosts React vazios e um único dono de conteúdo, sem
  `replaceChildren()` para disputar texto com o componente estático.
- A varredura estática de imports não encontrou módulos TS de `src/`/`server/`
  fora do grafo das entradas de produção. Rotas, boot e worklets foram tratados
  como entradas próprias. É evidência auxiliar; não autoriza apagar recursos
  distribuídos ou APIs externas por ausência de um import estático.
- `ae30757`: atualiza a suíte da Corte para participação explícita na voz, controles
  visíveis, hosts de mão/diálogos React e o contrato de fullscreen do desktop.
  A troca privada simulada agora usa cartas distintas e uma fase/participantes
  coerentes; a validação de produção não foi afrouxada. Foram encontradas e
  corrigidas duas falhas reais: `channelType: null` legítimo das salas de jogo
  era recusado na navegação; o modo online permanecia após mudar/sair da sala,
  impedindo iniciar uma partida local. Há regressões mínimas para ambos os casos.
- A chamada agora guarda a identidade da sala da tentativa e a confirma após o
  preparo. A saída/exclusão encerra os recursos mesmo se a navegação já tiver
  consumido o evento e apagado seus metadados. Isso corrige captura que permanecia
  ativa ao excluir um canal ocupado. Há regressões para chamadas ativas, preparo
  pendente e anexação de sala durante o preparo, preservando saídas de outros jogos.
- `f3784c7`: o botão do perfil tem espaço próprio no rodapé do
  card com mídia; não cobre mais o fullscreen do vídeo. O popover acompanha o
  tamanho do card por ResizeObserver, descartado junto dos listeners.
  O soundboard considera as barras visíveis do workspace e aplica sua altura
  disponível. Na mesa desktop de 480×520, o rótulo redundante “LEI ATUAL” fica
  oculto para não sobrepor as cartas; nome, imagem, trunfo e tooltip permanecem.
- **Port das novidades da `main` (0.2.11 a 0.3.2 / backend 0.14.0-alpha)**:
  - **Ticket to Ride**: Motor de jogo completo (`src/lib/games/ticket-to-ride*`), tipos TypeScript (`src/types/ticket-to-ride.ts`), tela interativa com mapa SVG e seleções em React (`src/components/games/ticket-to-ride-screen.tsx`), estilos (`src/styles/games/ticket-to-ride.css`), serviço autoritativo (`server/ticket-to-ride-service.ts`) e protocolo (`server/ticket-to-ride-protocol.ts`). Suíte de regras, bot e isolamento de mãos públicas/privadas verificadas.
  - **Nexus Hub & Launcher**: Launcher e isolamento de jogos web externos (`src/lib/games/nexus*`, `src/components/games/nexus-screen.tsx`, `src/styles/games/nexus-host.css`, `electron/nexus.cjs`) com sandbox estrito e token seguro.
  - **Remote PC Beta & Gamepad Virtual**: Streaming de baixa latência e controle remoto via WebRTC (`src/lib/voice/remote-*`, `src/components/voice/remote-pc-dialog.tsx`, `src/styles/voice/remote-pc.css`, `server/remote-pc.ts`), telemetria em tempo real e injeção nativa de controle virtual Xbox 360 no Windows via ViGEmClient C++ addon (`electron/remote-input.cjs`, `electron/native-audio/remote-input.cpp`).
  - **Moderação de Voz**: Ações de staff para mutar/desmutar forçado, bloquear/liberar mídias de vídeo/tela e expulsar da sala de voz no card de participantes (`src/components/voice/participant-card.tsx`), suportado pelo serviço de moderação do backend (`server/voice-moderation.ts`) com verificação rigorosa de cargos no servidor.
  - **Regressões e testes**: 15 arquivos de testes novos cobrindo regras, protocolo WS, Nexus, Remote Input, Gamepad, e moderação. Todos os testes unitários (34/34 casos) passam com 100% de sucesso. Typecheck estrito (`npm run typecheck`), verificação de formatação (`npm run format:check`) e build estático do Next.js (`npm run build`) passam com código de saída 0.

- **CI de lifecycle após o merge `21297fa`**: a fixture do gateway não fornecia
  Ticket to Ride nem Remote PC. A reconexão lançava uma exceção antes de fechar o
  socket antigo e o teste aguardava indefinidamente. As portas de teste agora
  acompanham os serviços e verificam o descarte dos quatro jogos. As expectativas
  de cargos incluem `moderateVoice`; fixtures SFU criam sua pasta temporária antes
  de usá-la. O teste de autenticação conserva o token enviado e avança o relógio
  explicitamente, eliminando a falha intermitente na virada de segundo.
  Os 150 casos passaram em uma cópia limpa da main em cerca de 1,7 s, além do
  comando final no checkout (cerca de 2,4 s com build em paralelo). Tipagem,
  formatação e build estático passaram. Cada teste tem limite de 30 s; a etapa do
  workflow tem limite de 2 minutos. Correção local, sem publicação ou novo deploy.

- **CI de Ticket to Ride**: o teste WebSocket enviava uma oferta sem
  `data.type: 'offer'`, rejeitada pelo parser compartilhado de sinalização.
  O cenário agora envia o contrato completo e confere remetente, tipo e SDP
  recebidos após iniciar a partida. A suíte completa passou (14 casos, incluindo
  navegador) e as regressões de canais/voz em jogos passaram (8 casos). A correção
  altera somente o teste; captura, transporte e validação de produção permanecem
  iguais. Tipagem, formatação e build estático também foram conferidos.

- **Etapas restantes dos Actions após Ticket to Ride**: o restante do job Windows
  passou localmente: Love Letter (16 casos), runtime/áudio/políticas e
  empacotamento (38, nenhum ignorado), chamada entre layouts (1) e executável
  empacotado (1). Helpers C++, diretório do aplicativo e instalador NSIS 0.3.2
  foram gerados. Preparo real e ZIP passaram, com um único EXE e hashes
  correspondentes; frontend com instalador ocupa cerca de 188,9 MiB (limite 190).
  Publicação e retenção foram executadas apenas com portas GitHub em memória,
  inclusive usando os arquivos reais; não houve upload/deploy/exclusão remota.
- **Contrato da entrega Next/Electron**: a execução revelou uma falha posterior
  ao instalador. O empacotador procurava no HTML um link montado pelo React no
  cliente. Layout e botão agora derivam a versão de `electron/package.json`;
  o empacotador confere `mn-desktop-version` antes de substituir saídas, sem
  editar chunks/HTML. Regressões cobrem HTML sem botão, versão ausente/divergente
  e link no navegador (17 casos com publicação/retenção simuladas). Tipagem,
  formatação e build passaram.
- **Workflow independente de clipes**: `TronoClipTests.csproj` ainda referenciava
  `../TronoClips/`. Os links agora usam `../clips-helper/`. Testes .NET da ponte
  e atalho Windows passaram; publicação self-contained e montagem do pacote com
  EXE e instruções passaram em `artifacts/`.

- **Intermitência dos controles no Electron (`39815922261`)**: a fixture usava um
  contador global para alternar Reserva/Espionagem. Depois que os humanos saíam
  da primeira sala, os bots continuavam jogando; uma rodada adicional consumia o
  decreto reservado à segunda sala. O teste esperava informação privada de
  Espionagem enquanto o servidor solicitava a escolha de Reserva.
  O seletor injetado agora recebe a sala e a fixture fixa seu decreto por sala.
  Uma regressão com serviço real e relógio controlado falhou antes da correção
  e passou depois, cobrindo bots da sala anterior nas rodadas 1, 2 e 3.
  Os 151 casos de backend, cinco de rodadas e sete de escolhas no navegador
  passaram; o teste completo de controles passou duas vezes consecutivas no
  Electron. Tipagem, formatação e build passaram. Logs específicos usam o prefixo
  `artifacts/actions-controls-`; os timeouts e a captura de mídia não foram alterados.

- **Sobreposição dos controles da Corte (`39819723658`)**: a carta inferior
  invadia o decreto quando o espaço útil diminuía. A regressão focal reproduziu
  `tableCard0` sobre Espionagem em 1008 × 651 antes da correção. Cartas, centro
  e moedas agora ocupam trilhas distintas da grade; a mesa tem rolagem quando necessário.
  Foram retiradas as posições absolutas conflitantes e a regra antiga que
  escondia a crônica entre 901 e 1100 px. `test:desktop:layout` começa com a
  regressão focal e depois usa dois Electron em janela inicialmente pequena,
  variando dimensões nos dois layouts e preservando as mesmas mídias/peers.
  Não há cliques forçados nem aumento dos timeouts.
  A etapa completa passou novamente após ajustar as moedas: regressão focal
  em cerca de 11 s e chamada nativa em 85 s, sem casos ignorados. Depois do
  ajuste final passaram também Corte/partidas locais/estilos (11 casos),
  políticas/áudio/runtime/entrega (38) e o executável recém-compilado (1).
  Tipagem, formatação e exportação estática passaram; YAML do workflow validado.
  Instalador NSIS recompilado sem instalação. Preparo local e ZIP passaram:
  frontend com instalador em 188,9 MiB (limite 190), 237 arquivos e um único EXE
  com SHA-256 igual ao instalador gerado. Estes pacotes são de QA local 0.3.2;
  não foram publicados nem substituíram a versão instalada.
- **Grupo de interface do Windows**: uma execução local revelou outra corrida:
  o teste de canais abria o texto antes da confirmação da troca de sala, que
  fechava esse painel. O teste aguarda a confirmação e a seleção antes de abrir.
  O grupo completo passou em 17 casos e a variante desktop em mais dois.
  A falha de emoji do perfil em `39822368692` não foi reproduzida nessas
  repetições, inclusive com CPU do renderer reduzida em quatro vezes; não há
  correção presumida desse ponto. Falhas de perfil e Electron
  agora salvam imagens; o workflow retém apenas essas evidências e logs por sete
  dias, sem incluir perfis locais nem o diretório inteiro de artifacts.
- **Diferença de versões conferida**: o registro do Windows informa 0.3.3,
  originada do build bem-sucedido `39703076365`, commit `0f52f55a`, branch
  `codex/desktop-installer-running-app`. Esse build usa a estrutura anterior à
  migração e inclui um ajuste NSIS para fechar o aplicativo na bandeja. A main
  migrada `588ad46` declara 0.3.2; não havia novos commits nela ao buscar o remoto.
  O ajuste foi posteriormente portado para `electron/` na preparação da 0.3.4,
  com preload, lockfile e instruções sincronizados. Não instalar
  um pacote de QA com a identidade/registro do aplicativo real. A instalação do
  usuário foi apenas consultada.
- **Criação da janela no runner (`39832539204`)**: o teste focal da Corte passou,
  mas o segundo Electron falhou antes do login. A linha de redimensionamento
  consultava `BrowserWindow.getAllWindows()[0]` antes de criar a janela. O helper
  de teste `desktop-first-window.cjs` aguarda `firstWindow()`, obtém a BrowserWindow
  correspondente à página e só então define o tamanho. A regressão nativa
  `desktop-window-start.cjs` controla a criação real da janela: reproduziu o mesmo
  `undefined.setContentSize` com a ordem antiga e passou com a espera correta.
  Ela integra `test:desktop:layout`. Não altera o aplicativo nem os timeouts.
  Tipagem, formatação e build passaram. O comando completo passou nos três casos,
  sem skips: janela adiada, geometria da Corte e chamada com dois Electron
  (aproximadamente 77 s na etapa nativa). Evidência em
  `artifacts/actions-window-layout-final.log`. A execução remota `39835581336`,
  commit `f3472cb`, passou em 22/10/2026; o job Windows completo levou 13min48s.

A antiga branch `codex/fix-backend-ci` acompanhava `origin/main` como upstream;
esse vínculo explicava pushes da contribuição para a main pela sincronização.
Felipe substituiu o clone. No clone novo há um único checkout; a contribuição
`codex/desktop-ci-parallel` foi criada sem upstream, a partir de `f3472cb`.
Main e origin/main permanecem nesse commit. Ao publicar a contribuição, usar o
nome próprio da branch como destino, sem configurar origin/main como upstream.

Evidências locais: `artifacts/actions-*.log`, `actions-delivery-audit.json` e os
pacotes gerados. Runner/permissões do GitHub dependem da próxima execução remota;
as validações locais não publicaram o aplicativo.

## Organização da esteira Windows

O workflow `Windows full app` separa a validação em três jobs independentes,
todos em Windows e no mesmo commit:

- `checks`: tipagem, formatação, backend, regras, privacidade e contratos de entrega.
- `interfaces`: interfaces em Chromium, nos modos web e desktop simulado, e jogos.
- `windows`: helpers C++, Electron real, entrada remota, SFU e áudio. O teste
  completo de layout/chamada executa logo após o build nativo. As medições de
  áudio ficam neste runner, separadas da carga das interfaces; loopback e runtime
  também executam sequencialmente entre si.

`delivery` depende do sucesso dos três. Só então gera o diretório do aplicativo,
testa o binário empacotado, cria instalador/ZIP e publica o rascunho privado.
O NSIS recebe `--prepackaged` com esse mesmo diretório: não recompõe a aplicação
após seu teste. Na validação local, os 226 arquivos anteriores permaneceram
idênticos; o NSIS acrescentou somente seu auxiliar normal `resources/elevate.exe`.
O diretório final também passou novamente no teste de aplicativo empacotado.
O fluxo especial de atualizar somente as instruções de um rascunho continua
independente. O nome do workflow e a exigência de conclusão com sucesso, usados
por `frontend-publish.yml`, permanecem iguais.

A comparação das listas na primeira etapa preservou os 94 arquivos de teste da
esteira anterior. A preparação da 0.3.4 acrescenta o teste de instalação descrito
abaixo. Apenas `desktop-notifications.js` e `call-stability.js` deixaram
de executar duas vezes. Nenhuma asserção foi retirada nem tornou-se opcional.
O teste grande `desktop-call-layout.js` permanece completo nesta etapa.

Cada job usa cache de downloads npm e instala as dependências do seu lockfile.
Interfaces, mídia nativa e entrega geram seu próprio frontend no mesmo commit;
isso repete um build curto, evitando transferir a exportação e grandes pacotes
entre runners. O único artefato de transferência contém os dois EXE C++ já
validados (cerca de 650 KiB antes da compressão). A entrega restaura esses arquivos
em `artifacts/native-audio/Release`, sem recompilar os helpers.

O artefato `native-helpers-<run_id>` expira em um dia e é removido após a entrega
bem-sucedida. Se outra validação ou a entrega falhar, continua disponível nesse
prazo para repetir somente os jobs que falharam; o nome não muda entre tentativas.
Depois de expirar, repetir a execução completa. Evidências de falha ficam em
artefatos separados por domínio durante sete dias. Instalador e ZIP continuam
armazenados na release privada, sem transferi-los por artefatos do Actions.

Próximas decisões dependem dos tempos da primeira execução reorganizada: conferir
o ganho real com a disponibilidade de runners, avaliar o custo total de minutos
e só então selecionar suítes por domínio/arquivos alterados. Paralelismo reduz a
espera quando há runners disponíveis, mas repete preparação e pode consumir mais
minutos. Não mover cobertura crítica para uma execução opcional para obter verde.
Desmembrar o teste grande de layout exige comparar as garantias específicas de
continuidade de mídia com as suítes de domínio antes de retirar cenários dele.

Validação local desta alteração: tipagem, formatação, build estático, actionlint
1.7.12 e análise sintática dos comandos PowerShell passaram. Os comandos extraídos
dos jobs reorganizados passaram em 268 testes de backend/contratos e 44 de
interfaces, sem skips. A inicialização adiada da janela, geometria da Corte,
chamada completa com dois Electron, loopback do Windows e runtime passaram em
cinco testes, também sem skips. Helpers compilados e transferência local por ZIP
conservaram seus hashes; os dois EXE incluídos no pacote são idênticos aos
validados. O teste do aplicativo empacotado passou antes e depois do NSIS. O
instalador foi gerado com `--prepackaged`, e o preparo dos downloads passou
(site 188,9 MiB; instalador 135,5 MiB). Logs `artifacts/ci-parallel-*`.

Esses resultados não medem o paralelismo, os caches ou a transferência no GitHub:
a primeira execução remota reorganizada ainda precisa ser conferida. A etapa de
instalação do driver virtual do runner não foi executada no computador de Felipe.
As validações locais não publicaram release nem instalaram o aplicativo.
Commit e push da contribuição foram autorizados posteriormente por Felipe.

## Preparação da entrega Windows 0.3.4

`electron/package.json`, as duas entradas de versão do lockfile, preload e
instruções da distribuição estão sincronizados em 0.3.4. O backend conserva
0.14.0-alpha. O build exporta essa versão no metadado do frontend e no botão de
download. Os guias existentes foram atualizados, sem criar outro Markdown de
notas de versão. O roteiro de publicação pelo workflow e a alternativa manual
ficam em `PUBLICAR_SURGE_LEVE.md` e acompanham o ZIP.

`electron/installer.nsh` é o hook exato da 0.3.3 (`0f52f55a`), agora referenciado
por `build.nsis.include`. Usa o plugin nativo nsProcess para localizar o nome
exato do executável, pedir seu fechamento e, após autorização da instalação,
encerrar a instância que continuar escondida na bandeja. Não interpola o caminho
em PowerShell. Mantém a identidade do produto, conta e preferências.

O teste upstream `desktop-installer.js` foi adaptado para `electron/` e bloqueado
fora de Windows GitHub-hosted descartável. Na entrega, executa depois do NSIS e
antes de preparar/publicar downloads: instala em diretório com apóstrofo,
simula a versão antiga que se esconde ao fechar, atualiza, verifica o perfil e
reabre. Um skip nessa etapa reprova o job. Não executar esse instalador de QA
no computador de Felipe; o teste usa a mesma identidade do produto instalado.

Tipagem, formatação, build e 17 testes de atualizador/distribuição passaram.
Manifestos, preload executado em VM e metadado exportado concordam em 0.3.4.
O diretório empacotado foi gerado e sua versão Windows, ASAR, preload e renderer
também identificam 0.3.4. O teste de aplicativo empacotado agora compara essas
versões durante sua execução real.

A abertura local do novo binário foi bloqueada antes de iniciar o aplicativo:
duas tentativas, saída 4551 e stderr informando bloqueio pela política Device
Guard da organização. Não foi alterada nem contornada a política. A abertura do
pacote 0.3.4 e a instalação sobre a bandeja precisam passar no runner Windows;
o sucesso local do pacote 0.3.2 não aprova automaticamente esta entrega.
Evidências em `artifacts/release-034/`, especialmente `packaged-launch-debug.log`.

O NSIS 0.3.4 foi gerado com o hook portado e `--prepackaged`. O preparo do site
passou (188,9 MiB, instalador 135,5 MiB): `latest.yml` informa 0.3.4 e o SHA-512
confere com o único EXE em downloads. O binário e os arquivos locais não são uma
entrega aprovada enquanto as verificações de execução/instalação não passarem.

Após o push autorizado da contribuição, aguardar os três jobs de validação e o
job de entrega do Windows full app; só
depois copiar a tag `desktop-v0.3.4-run-<id>-attempt-<tentativa>` gerada e executar
Publish approved frontend na branch correspondente. Não usar uma tag 0.3.2 ou
0.3.3 para publicar o código 0.3.4. O destino do push é a própria contribuição,
com upstream `origin/codex/desktop-ci-parallel`. Instalação do produto e publicação
no Surge não foram executadas nem autorizadas nesta etapa.

## Validação local

| Verificação | Resultado / alcance |
| --- | --- |
| `npm run typecheck`, `format:check`, `build` | Passaram com TS estrito e detecção de código sem uso. |
| `npm test` | Cadeia completa de backend, jogos e modelos passou; inclui os três contratos estáticos de estilos. |
| `test:server:lifecycle` | 150 casos de composição, identidade, serviços, filas, cancelamento, privacidade e shutdown passaram no fechamento do backend. |
| `test:database` | Seis casos com instalação dos 13 SQL, 12 tabelas com RLS, funções e privacidade em PGlite passaram. |
| Estilos compilados | Comparação com a versão anterior e com o grafo atual passou em 14 estados, com cerca de 15,2 milhões de propriedades por execução. Layout/conta/portrait (10 casos), jogos (17), perfis/mensagens/soundboard e clipes (10) passaram. |
| CSS em desenvolvimento | Alterar um estilo de domínio atualizou o Next dev sem recarregar a página, trocar a identidade da conexão ou encerrar o microfone sintético. Fonte temporário restaurado após o teste. |
| Electron após CSS | Pacote Windows reconstruído, chamada completa com dois Electron e relay WebRTC real através do backend tipado passaram (três casos). Não houve instalação. |
| Limpeza final | 30 modelos de motor local/escolhas/mãos/ciclo de vida/aparência e oito casos de layout/aparência/editor/chamada nativa passaram, além da cadeia completa `npm test`. Evidências em `artifacts/final-cleanup-*`. |
| Transições de jogo/voz | 24 modelos de partida/navegação passaram. `test:court` passou nos 18 casos de regras, partidas, participação e interface, incluindo ida/volta do jogo, chamada na mesa, fullscreen, fila de revelação privada e local após online. A cadeia `npm test`, a chamada com dois Electron, o relay SFU e o pacote atual reconstruído também passaram. Logs `game-transition-*`/`game-transitions-*` e `court-final-regressions.log`. |
| Saída do canal de voz | 19 modelos de ciclo de vida, tipagem, formatação, build e `npm test` passaram. A interface verifica que a chamada está conectada antes de excluir o canal e que depois não há microfone ativo. Chamada com dois Electron, relay SFU e pacote reconstruído passaram. A Corte passou em seis casos tanto no Chromium padrão quanto no Edge, emulando viewport sem tentar redimensionar a janela nativa fullscreen. Logs `call-room-exit-*` e `court-fullscreen-viewport*`. Uma execução agrupada falhou no idle dos controles de transmissão; a repetição nativa isolada passou com as mesmas asserções. |
| Paridade | Jogos, efeitos, worklets, WAV, assinatura de arquivos e protocolos foram comparados durante cada conversão. Resultados detalhados e commits anteriores permanecem no Git; nenhuma qualidade de captura/codec/bitrate foi reduzida nesta limpeza. |
| Suítes antes desatualizadas | `frontend-browser.js`: 25 testes (20 cenários + quatro subcenários de mídia + raiz); `desktop-browser.js`: 16 testes (15 cenários + raiz). Todos passaram, sem skips. Fontes formatados, participação explícita em voz, fixtures completas e falha inicial preservada. Logs `final-frontend-green.log` e `desktop-final-current-controls.log`. |
| Fechamento visual | `test:ui` passou nos quatro domínios; `test:court`, 18 testes. Regressões isoladas de stream recebido/fullscreen e shell/soundboard passaram em sete testes. Electron real passou com dois clientes, relay SFU local e pacote final reconstruído, em três testes sequenciais, sem instalação. Logs `final-focused-players-shell.log`, `final-migration-electron.log` e `final-court-layout-regressions.log`. |
| Áudio nativo e runtime | O teste original `desktop-audio.js` passou sem skip: capturou o tom do processo selecionado e excluiu outro processo, pelo helper C++ e API do Windows. `desktop-runtime.js` passou com áudio silenciado e habilitado, conservando as mesmas asserções de permissões, sessão, picker, arquivos e IPC. Os timeouts antigos não se reproduziram; sua causa não foi estabelecida. Logs `native-acceptance-current.log` (dois testes) e `native-runtime-unmuted-option.log` (um teste). |
| Uso real entre computadores | Em 22/10/2026, Felipe testou na própria máquina e relatou que seus amigos conseguiram assistir à transmissão e ouvi-lo normalmente. Confirmou que usou a versão local deste projeto, aberta pelo fluxo `npm run desktop:start`. Aprova qualitativamente voz e recepção da tela na rede real; não registra taxa efetiva de quadros, áudio do jogo ou transporte usado. Checkout desta conferência: `29c0a93`. |

Testes de interface consomem `out/`; execute build antes. Neste ambiente, Edge usa
`CHROMIUM_EXECUTABLE_PATH` e as suítes antigas também `AUTH_TEST_CHROMIUM`.
Exportação/decodificação requerem `ffmpeg` e `ffprobe` no PATH; a cópia portátil
fica em `artifacts/ffmpeg/extracted/`. Clipes passaram após corrigir esse ambiente.
Nesta rodada, a câmera oferecida pelo modo de captura falsa do Edge encerrou com
evento nativo até numa página vazia, sem o projeto (`camera-browser-only.log`).
`tests/synthetic-call-media.cjs` fornece fontes estáveis de câmera/microfone às
suítes da Corte, frontend e desktop. A capacidade de supressão nativa é simulada
explicitamente quando necessária; isso não executa DSP de um driver real.
As asserções de preservação das mesmas trilhas continuam; o teste
não aprova dispositivos físicos. Não houve alteração no dono da captura da câmera.

Evidências ignoradas: `artifacts/style-next-*`, `final-cleanup-*`,
`final-source-imports.json`, `styles-before-next.json`, `style-foundation-split.json`
e `style-deduplication.json`. Os logs antigos dos serviços usam os prefixos
`storage-owner-*`, `realtime-manager-*`, `throne-service-*`, `channel-service-*`,
`chat-service-*`, `voice-soundboard-*` e `socket-gateway-*`.
Essas saídas podem ser apagadas quando não forem mais úteis. Código/testes e o
checkpoint no Git permitem retomar; não depender de um arquivo de artifacts.

## Documentação de atualizações

As oito notas Windows de 0.2.3 a 0.2.10 foram consolidadas em
`docs/ATUALIZACOES.md`, com requisitos operacionais e resumo das versões. O pacote
usa esse nome fixo; não criar outro Markdown a cada atualização. O histórico
detalhado continua no Git. O leia-me Windows deixou de repetir as notas antigas.
As instruções do auxiliar de clipes ficam junto ao fonte em
`electron/clips-helper/LEIA-ME-WINDOWS.txt`; o workflow acompanha esse caminho.
`docs/archive/previews/` mantém os originais de arte, sem alterações.

Tipagem, formatação, build estático e nove regressões de empacotamento/downloads
passaram após a consolidação. Não houve alteração de mídia nem publicação.

## O que ainda falta

A conversão do código e a atualização das suítes antigas estão concluídas.
O teste básico de voz e transmissão entre computadores foi aprovado pelo usuário;
as verificações complementares abaixo continuam abertas. Não há outra fila de arquivos
legacy para converter; falhas encontradas nesse aceite devem ser tratadas como
regressões específicas, com reprodução antes de alterar captura/codec/bitrate.

### Aceite físico e externo

Felipe confirmou o uso da versão local migrada com amigos: voz e recepção da tela
funcionaram normalmente. Esse relato não é uma medição de FPS nem confirma os
demais fluxos abaixo; não repetir o aceite básico como se ainda não tivesse sido feito.

- Complementar o teste com áudio do jogo/loopback e jogo com efeitos a 60 fps.
  A recepção de tela e voz na rede real já foi confirmada; a taxa efetiva de quadros,
  recuperação e preservação da chamada ao navegar não foram relatadas nesse aceite.
- Conferir TURN/SFU, confirmação/recuperação por e-mail e banco no ambiente de
  desenvolvimento apropriado. Fixtures locais/PGlite não aprovam serviços reais.
- Gravação usa mixer/encoder reais, mas simula o destino de arquivos; conferir
  seletor e escrita no Windows. Parar explicitamente antes de fechar a janela:
  o fechamento não garante exportação de uma gravação em andamento.

### Repetir a verificação nativa local

O helper deve estar compilado (`npm run desktop:build:native`). Com uma saída de
áudio disponível, o primeiro comando gera dois tons para verificar isolamento;
o segundo modo habilita áudio nas duas janelas do teste de runtime:

```powershell
node --test --test-concurrency=1 tests/desktop-audio.js tests/desktop-runtime.js
$env:QA_UNMUTED_AUDIO = '1'
node --test tests/desktop-runtime.js
Remove-Item Env:QA_UNMUTED_AUDIO
```

O runtime usa perfis descartáveis e dispositivos falsos do Chromium, inclusive
sem `--mute-audio`. O loopback usa processos geradores de tom reais. Isso aprova
esses caminhos locais, sem aprovar microfone físico, jogo, rede ou serviços reais.

## Como retomar

Confira branch/status e este documento. Voz e transmissão da versão local já
foram testadas com amigos; o próximo passo é complementar o aceite descrito acima.
Se houver falha, registre cenário, versão, transporte e diagnóstico local antes
de ajustar o dono do recurso afetado. As suítes frontend/desktop já estão verdes;
não reintroduzir entrada automática em voz, resizers retirados ou controladores JS.

Após mudanças: tipagem, formatação, build, regressões relevantes e Electron real
quando houver mídia. Atualize este checkpoint e crie commit local assinado.
Não editar `out/`, `.next/` nem JS/CSS gerados na raiz de `public/`. `public/assets`,
`public/vendor`, `public/manual`, Cinzas, SQL, licenças e guias distribuídos são
recursos originais e continuam necessários.
