# Estado da migração

Atualizado em 22/10/2026. Este é o checkpoint para continuar sem o histórico do
chat. Responsabilidades e ciclos de vida estão em [ARQUITETURA.md](ARQUITETURA.md);
comandos e ambiente em [DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).
O histórico detalhado das conversões permanece no Git.

## Branch e limites

- Trabalhar em `codex/next-typescript-structure`; commits locais assinados.
- `main` permanece em `7db2d81`. Upstream incorporado até `8044ec4`, desktop 0.2.10;
  isso não indica uma consulta mais recente ao remoto.
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
| Chamadas | `lib/voice/` possui captura, publicação, P2P, SFU, recuperação, reprodução e diagnóstico. Painéis e configurações em React. |
| Jogos | `lib/games/` possui regras e controladores tipados de A Lei do Trono, Azul, Splendor e Love Letter; componentes em `components/games/`. Cinzas continua independente em `public/roguelite/`. |
| Clipes e gravação | `lib/clips/` e `lib/recording/` possuem buffer, worker, armazenamento, mixer, encoder, exportação e ponte Windows; controles/bibliotecas em React. |
| Áudio e soundboard | `lib/audio/` e `lib/soundboard/` possuem efeitos, player, decode, recorte e envio. Worklets tipados em `lib/voice/worklets/`; recursos e ganhos anteriores preservados. |
| Shell e preferências | `lib/desktop/`, `lib/preferences/`, `lib/settings/`, `lib/notifications/` e componentes dos domínios possuem layout, atividade, avisos e atualização. |
| Backend | Todos os módulos de `server/` são TS estritos, sem DOM. `app.ts` compõe serviços; `index.ts` inicia o processo; `socket-gateway.ts` possui conexão, identidade, dispatch e heartbeat. |
| Estilos | `src/styles/index.css` explicita a cascata de domínio, importada pelo layout raiz após `globals.css`. Next compila e distribui o CSS. |
| Electron | `electron/` possui janela, preload, permissões, arquivos e auxiliares nativos. Desenvolvimento e testes usam identidade/perfil separados da instalação. |

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

## O que ainda falta

A conversão do código e a atualização das suítes antigas estão concluídas.
O aceite físico e externo abaixo continua aberto. Não há outra fila de arquivos
legacy para converter; falhas encontradas nesse aceite devem ser tratadas como
regressões específicas, com reprodução antes de alterar captura/codec/bitrate.

### Aceite físico e externo

Felipe informou que ainda não executou esse aceite. Não concluir a meta
com base apenas nas fontes sintéticas ou nos testes locais.

- Conferir microfone/loopback real e compartilhar um jogo com efeitos a 60 fps
  entre computadores. Os testes sintéticos não medem esse desempenho nem a rede
  real. Comparar recepção, áudio, recuperação e preservação da chamada ao navegar.
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

Confira branch/status e este documento. O próximo passo é executar o desktop
deste checkout pelo fluxo do README e fazer o aceite físico/externo acima.
Se houver falha, registre cenário, versão, transporte e diagnóstico local antes
de ajustar o dono do recurso afetado. As suítes frontend/desktop já estão verdes;
não reintroduzir entrada automática em voz, resizers retirados ou controladores JS.

Após mudanças: tipagem, formatação, build, regressões relevantes e Electron real
quando houver mídia. Atualize este checkpoint e crie commit local assinado.
Não editar `out/`, `.next/` nem JS/CSS gerados na raiz de `public/`. `public/assets`,
`public/vendor`, `public/manual`, Cinzas, SQL, licenças e notas distribuídas são
recursos originais e continuam necessários.
