# Andamento da migração

Base inicial: `7db2d81`. Branch: `codex/next-typescript-structure`.
Main integrada até `35c5c5f` (desktop 0.2.9).
Preservar jogos, clipes, soundboard, perfis, mensagens e chamadas.
Atualize este arquivo para permitir continuidade sem o histórico do chat.

## Entregue nesta etapa

- Next.js, React e TypeScript estrito com exportação estática.
- Telas TSX por domínio e compositor com eventos React.
- Controles de chamada em TypeScript, mantendo a identidade dos nós.
- Backend em `server/`, composição reutilizável e entrada do processo separadas.
- Sessões de convidados e configuração ICE extraídas com tipos explícitos.
- Electron em `electron/`, consumindo o renderer gerado pelo Next.
- Comandos de desenvolvimento, formatação, tipagem e build.
- Documentos históricos fora da raiz e caminhos de CI/empacotamento atualizados.
- Transporte WebSocket em TypeScript, com pendências e fila de identidade únicas.
- Comandos e estado de participação em TypeScript; `legacy/network.js` removido.
- Compositor React com rascunho, emojis e ciclo de upload tipado; adaptador de envio removido.
- Lista React com histórico, paginação, revisões e moderação em TypeScript.
- Listas de canais React com catálogo tipado, seleção, presença e indicadores de notificação.
- Transporte HTTP de arquivos tipado e componentes React compartilhados para anexos e avatares.
- Captura, processamento e descarte do microfone em TypeScript, com cancelamento por geração.
- Captura e ciclo de vida da tela em TypeScript, preservando a fonte do replay e o clone de envio.
- Captura, fallback de dispositivo e ciclo de vida da câmera em TypeScript.
- Conexões P2P, transceivers, filas de sinalização/trilhas e negociação em TypeScript.
- Streams recebidos, listeners, tolerância de vídeo e recuperação em TypeScript.
- Negociação SFU, catálogo, publicação, assinaturas, camadas e retries em TypeScript.
- Players, ganhos de reprodução, autoplay e roteamento da saída em TypeScript.
- Coleta de diagnóstico, métricas/proteção de recepção e prioridade nativa em TypeScript.

## Conversão ainda necessária

Os controladores em `src/legacy/` continuam em JavaScript. Eles não se tornaram
React ou TypeScript apenas porque a marcação foi convertida. Coordenação da chamada e status/ICE,
edição/visualização de perfis e galeria, navegação/gerenciamento de canais, notificações e jogos
permanecem nesses controladores. As listas de canais já são renderizadas em React;
o catálogo está em `lib/channels/`, sem cópia de estado em `game.js`.
Lista, histórico, revisões e moderação agora pertencem a `lib/chat/` e componentes React.
Transporte de arquivos está em `lib/files/`; anexos e avatares compartilham componentes
React, com adaptadores para os chamadores legados ainda ativos.
Transporte, comandos e estado de participação agora pertencem a `lib/socket/`.
Os sinais P2P e a negociação SFU são validados em `lib/voice/peer-protocol.ts` e
`sfu-protocol.ts`. Payloads de jogos, status/ICE e controles de consumo ainda
não têm validação completa.
`server/runtime.cjs` ainda reúne regras de A Lei do Trono e coordenação de canais.
Módulos JS existentes ainda não recebem a verificação estrita dos módulos TS.

## Limpeza após a migração

- Removidos 67 arquivos históricos ou redundantes (33,88 MiB na árvore atual):
  capturas, manuais substituídos, notas antigas e guias sem implementação atual.
  Continuam recuperáveis no histórico Git.
- Preservados os oito originais de arte, créditos, licenças, manual distribuído,
  notas Windows 0.2.4/0.2.3 e instruções do bridge usadas pelo workflow.
- Removidas cinco funções sem chamadas: `clonePlain`, as duas `pickWinner`,
  `scheduleTavernBar` e `cameraMediaConstraints`, além do estado `musicStep`.
  Música, efeitos, fallback de câmera e regras compartilhadas continuam ativos.
- Configuração do backend consolidada em `PUBLICAR_SURGE_LEVE.md`. O exemplo de
  `APP_URL` agora usa HTTPS, como exige o backend; `AUTH_ALLOWED_ORIGINS` mantém
  a origem local. Nenhum segredo ou serviço remoto foi alterado.
- Corrigidas referências aos arquivos removidos e a espera de inicialização do
  teste de áudio após o carregamento do Next, mantendo suas verificações de PCM.

Validação desta limpeza: tipagem, formatação, build, `npm test` (4 integrações e
79 testes), `test:ui` (3), `test:desktop:layout` (1), áudio real no navegador (1)
e empacotamento/retenção (9) passaram. A configuração de autenticação do exemplo
foi conferida localmente, com valores fictícios e sem chamadas ao Supabase.
A limitação da suíte antiga `test:frontend` descrita abaixo permanece.

## Transporte WebSocket — 16/10/2026

- `lib/socket/transport.ts` concentra conexão única, listeners, deadlines e todas
  as requisições correlacionadas. Respostas precisam coincidir em tipo e ID.
- Timeout de abertura fecha o socket e permite uma nova tentativa. Desconexão
  rejeita pendências, cancela a fila de identidade e ignora eventos antigos.
- Operações de identidade usam a conexão recebida em `serializeIdentity`, ligada
  àquela sessão. Após logout, não podem autenticar um socket novo nem restaurar
  resultados que chegaram antes de a operação assíncrona continuar.
- `legacy/network.js` perdeu socket, timers e mapas de pendências. Na etapa
  seguinte, abaixo, o restante foi convertido e o arquivo removido.
- `LegacyRuntime` fornece a fábrica importada pelo Next antes de carregar os
  controladores. Não há outra implementação copiada do transporte em `public/`.
- `npm run test:socket` executa 13 regressões do transporte e uma integração com
  backend real local e autenticação simulada. Também faz parte de `npm test`.

Tipagem, formatação, build estático, `npm test` (4 integrações anteriores e 93
testes), `test:ui` (3) e `test:desktop:layout` (1) passaram. O Electron manteve
socket, peers e trilhas de mídia ao navegar e trocar layouts. A integração nova
conferiu cache e troca de identidade, reconexão, mensagens e participação
independente em texto, voz e jogo. Não houve acesso a infraestrutura remota.

## Cliente e estado de rede — 16/10/2026

- `lib/socket/client.ts` substitui os comandos e o cache de identidade do antigo
  controlador. Recebe transporte e acesso à conta/mídia por dependências explícitas.
- `state.ts` concentra participação e capacidades em snapshots imutáveis, com
  assinatura de mudanças. Os listeners de mensagens veem o estado atualizado.
  Desconexão remota preserva a última participação conhecida para o descarte dos
  controladores; saída explícita limpa texto, voz e jogo, como no fluxo anterior.
- `protocol.ts` valida os eventos que alteram esse estado e respostas de conta,
  convidado, nome e preparo de chamada. Mensagens inválidas de participação não
  chegam aos controladores antigos. Outros payloads permanecem opacos.
- `browser.ts` inicializa um cliente por página. O nome global `TronoNetwork`
  continua para compatibilidade, sem uma segunda implementação. A fábrica global
  intermediária `TronoSocketTransport` deixou de existir.
- Excluídos `src/legacy/network.js` e sua entrada no manifesto. A preparação do
  renderer remove JS/CSS gerados que perderam o fonte. Conferida a ausência de
  `network.js` em `public/`, `out/` e nos recursos do pacote Windows.
- A integração de rede importa o cliente TS diretamente, sem avaliar JS legado.
  O teste empacotado configura seu backend nos chunks Next, sem alterar a política
  de segurança do aplicativo. Imports relativos TS explícitos funcionam também
  nos testes Node; o compilador reescreve suas extensões quando há emissão.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
100 testes, incluindo 21 em `test:socket`), `test:ui` (3), `test:desktop:layout`
(1) e `tests/desktop-packaged.js` (1) passaram. Sete regressões novas verificam
participação independente, snapshots, listeners, mensagens inválidas, respostas
tipadas, compatibilidade com capacidades ausentes e inicialização única.
O pacote Windows local validou recursos, mídia, Splendor e Love Letter com o
backend de teste. Não houve publicação ou mudança em serviços remotos.

## Compositor e upload — 16/10/2026

- `lib/chat/composer.ts` possui rascunho, seleção, limites, progresso, cancelamento
  e descarte de uploads. O estado e os eventos passaram juntos para o novo módulo.
  `browser.ts` mantém uma instância por página e lê conta e biblioteca de arquivos
  já existentes; não duplica conexão ou implementação HTTP de upload.
- `ChatComposer` controla texto, arquivo, emojis, feedback e teclado em React.
  Preserva Enter, Shift+Enter e composição IME, posição de inserção de emoji e
  Escape. Limites continuam em 300 caracteres, 10 MB por arquivo e 100 MB por vídeo.
- Operações canceladas/antigas não enviam anexos nem sobrescrevem uma operação
  nova. Arquivos já enviados, mas não vinculados, são removidos quando a mesma
  conta ainda permite a limpeza. Após troca de conta, não se tenta remover usando
  credenciais da conta seguinte. O transporte compartilhado também valida a conta.
- Erros de persistência restauram rascunho somente no canal correto e quando não
  existe texto mais recente. Mudança de conta limpa o rascunho; troca de canal ou
  desconexão preserva texto e cancela o arquivo selecionado/ativo.
- Removidos o adaptador `lib/socket/chat-actions.ts`, o envio de `TronoSocial`, o
  estado de upload e os listeners antigos de arquivo/emojis em `legacy/social.js`.
  Histórico e moderação continuavam no controlador e delegavam feedback ao novo
  módulo; foram convertidos na etapa seguinte. O React possui o campo e o feedback.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
113 testes, incluindo 13 em `test:chat`), `test:ui` (3), moderação no navegador (1)
e `test:desktop:layout` (1) passaram. O compositor real foi testado com PDF enviado
ao backend local e armazenamento simulado, cancelamento, falha de persistência e
paginação de 55 mensagens sem duplicatas após recarga. No Electron, o envio em um
canal de texto preservou socket, peers, trilhas de mídia e jogo ativo. Nada publicado.

## Mensagens, histórico e moderação — 16/10/2026

- `lib/chat/messages.ts` possui mensagens, revisões, cursor, paginação e moderação.
  Uma única assinatura do cliente de rede recebe eventos; não há socket adicional.
  `message-protocol.ts` valida cada página inteira antes de aceitar sua revisão.
  Mensagens e anexos são imutáveis; a mesclagem elimina IDs duplicados e preserva
  a identidade das linhas existentes. Revisões antigas não restauram exclusões.
- `chat-messages.tsx` possui lista, botão de histórico e diálogo em React.
  O snapshot anterior à alteração do DOM preserva a posição de leitura ao carregar
  mensagens anteriores. Texto usa o escape do React, e datas incluem dia e ano.
- Confirmações pertencem ao canal e expiram ao navegar, trocar de conta, desconectar,
  perder permissão ou receber a exclusão da mensagem escolhida. Respostas precisam
  coincidir em requisição, canal, ação e mensagem; timeouts liberam operações pendentes.
  Descartar o controlador remove listeners e impede novos pedidos. O backend mantém
  a decisão final de autorização; somente criadores veem controles em canais de texto.
- Avatares e anexos continuam nos renderizadores compartilhados usados também por
  perfis e DMs. Cada host vazio tem um dono e limpeza explícita; o anexo recebe uma
  cópia para que o renderizador antigo não altere o estado imutável do chat.
- Removidas cerca de 250 linhas substituídas de `legacy/social.js`, incluindo estado,
  listeners, renderização e moderação antigos. Não lidas e sons continuam ali pelo
  pequeno ponto de integração `onChatActivity`; captura e jogos não foram duplicados.
  O arquivo permanece porque ainda contém esses outros recursos ativos.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
127 testes, incluindo 27 em `test:chat`), `test:ui` (3), moderação no navegador (1)
e `test:desktop:layout` (1) passaram. O navegador conferiu paginação de 55 mensagens
sem duplicatas e com âncora de rolagem preservada, exclusão de anexo compartilhado
e cancelamento da confirmação ao trocar de canal. O Electron preservou socket,
peers, trilhas e jogo durante o envio. Backend e armazenamento de teste são locais;
nenhum serviço remoto foi alterado e nada foi publicado.

## Catálogo e listas de canais — 16/10/2026

- `lib/channels/catalog.ts` concentra catálogo, seleção recebida de `lib/socket/`
  e projeção dos indicadores de notificação. `protocol.ts` valida listas e
  participantes antes de aplicar uma atualização; snapshots e dados são imutáveis.
  Duplicatas e páginas inválidas não alteram a lista anterior.
- A atualização HTTP de `community-admin.js` registra a geração do catálogo.
  Respostas atrasadas não substituem broadcasts posteriores nem ressuscitam canais
  excluídos. Metadados sem informações de presença preservam os dados ao vivo;
  mudanças de conta removem participantes privados e invalidam a requisição antiga.
- `ChannelList` possui botões, grupos de texto/voz, canal selecionado, até oito
  avatares com indicador de excedentes, não lidas e silenciamento em React.
  O renderizador de avatar compartilhado também atende mensagens, sem implementar
  outro transporte de imagens. O destaque de seleção acompanha o snapshot da rede.
- Removidos o catálogo duplicado, renderização, listeners de clique e listener de
  lista em `game.js`; retiradas as escritas nos canais em `community.js` e
  `notifications.js`, incluindo os MutationObservers de silenciamento. Notificações
  ainda possuem seus contadores/preferências e agora publicam uma projeção para React.
- Navegação, bloqueio de troca concorrente e retomada de voz continuam no fluxo
  existente do hub. O gerenciamento e seus diálogos continuam no controlador próprio.
  Não há socket, captura, peer ou proprietário de chamada adicional nesta conversão.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
136 testes, incluindo 9 em `test:channels`), `test:ui` (4) e
`test:desktop:layout` (1) passaram. O teste novo usa backend local para criar canais,
clicar texto/voz, verificar não lidas/silenciamento e excluir o texto selecionado
sem encerrar a chamada. O Electron usa os próprios botões React ao trocar para texto
e voltar, preservando socket, peers, microfone, câmera, tela e jogo. Os serviços
externos são simulados; nada foi publicado nem alterado em infraestrutura remota.

## Arquivos e avatares compartilhados — 16/10/2026

- `lib/files/client.ts` possui HTTP autenticado, upload com progresso/cancelamento,
  cache e deduplicação de links, permissões e avisos de exclusão. Trocas de conta,
  inclusive A → B → A, invalidam resultados antigos e cancelam uploads ativos.
  Preview e download mantêm links distintos; exclusões invalidam cache e pendências.
- `protocol.ts` valida metadados e URLs HTTP(S) com expiração. O chat reutiliza o
  parser de arquivos. Limites e formatação de tamanho são compartilhados entre
  compositor, mensagens privadas e transporte. Os limites anteriores foram mantidos.
- `components/files/attachment.tsx` renderiza imagens, vídeos, PDFs, download e
  exclusão. Chat, DMs e galeria usam a mesma implementação React; a compatibilidade
  das telas antigas monta e desmonta raízes por host, sem mutar objetos de mensagens.
  A autorização final continua no servidor, inclusive para anexos privados.
- `components/profiles/avatar.tsx` substitui os hosts imperativos no chat/canais.
  `lib/profiles/` concentra ícones, catálogo e compatibilidade de hidratação para
  telas antigas, com proteção contra respostas de outra conta ou tentativa anterior.
- Removido `legacy/avatar-icons.js` e sua entrada no manifesto. A preparação do
  renderer retirou a cópia gerada. `legacy/profile-files.js` perdeu cerca de 300
  linhas substituídas e conserva somente seus fluxos ativos de perfil e galeria.
  Retirados adaptadores antigos de renderização no chat e contadores de redesenho
  que ficaram sem consumidores. Não há segunda implementação frontend do transporte HTTP.
- A suíte de anexos privados esperava o antigo botão Amigos em telas estreitas.
  A falha foi reproduzida no commit anterior `537bf49`; o teste agora verifica a
  entrada atual de mensagens diretas, sua posição e clique em quatro tamanhos.
  A troca de conta tem preparação própria e preserva suas verificações de privacidade.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
150 testes, incluindo 14 em `test:files`), `test:ui` (4), anexos privados no navegador
(9 contando os subtestes) e `test:desktop:layout` (1) passaram. No Electron, upload
e exclusão de PDF preservaram socket, peers, microfone, câmera, tela e jogo.
Os testes usam backend local, armazenamento simulado e mídia sintética; não validam
R2/TURN reais. Nenhuma infraestrutura remota foi alterada e nada foi publicado.

## Captura e processamento do microfone — 16/10/2026

- `lib/voice/microphone.ts` é o dono dos recursos brutos/processados, pedidos em
  andamento, troca de entrada e descarte, incluindo capturas antigas que aguardam
  substituição do sender. Cancelar a chamada impede que permissões/processadores
  atrasados instalem trilhas ou alterem o estado de uma chamada posterior.
- `audio-constraints.ts` mantém as restrições e o fallback nativo, preservando o
  dispositivo selecionado. O módulo aplica mute e ganho atuais mesmo quando o
  usuário os altera durante a permissão; câmera e trilhas de tela não são descartadas
  ao trocar somente o microfone.
- `microphone-processor.ts` possui grafo, ganho, limiter, conexão dos worklets e
  fallback. O cancelamento desconecta o grafo; um filtro que termina depois é
  destruído sem ser conectado. O AudioContext continua compartilhado pela chamada.
  Uma falha do filtro durante sua inicialização não sobrescreve o fallback nativo.
- Removidos cerca de 270 linhas substituídas de `legacy/social.js`, incluindo os
  donos antigos de captura, gerações, loading e processamento. As fábricas tipadas
  entram pelo `LegacyRuntime`; há uma instância de microfone no controlador.
  Publicação P2P/SFU fica em um callback que verifica a validade da operação.
- Câmera, tela, peers, coordenação da chamada e contextos compartilhados continuam
  no legado. Preferências e intenção de mute ainda são lidas desse controlador;
  não há um segundo socket, peer ou captura de microfone nesta conversão.
- O teste RNNoise deixou de fixar `/usr/bin/chromium`: respeita os overrides
  existentes e usa o Chromium do Playwright por padrão, inclusive no Windows.

Validação: tipagem, formatação, build, `npm test` (4 integrações anteriores e
170 testes, incluindo 20 em `test:voice:capture`), `test:ui` (4), `test:voice` (14)
e `test:desktop:layout` (1) passaram. O Electron preservou chamada, câmera, tela,
peers e jogo durante navegação, texto e anexos; também conferiu saída com captura
pendente, encerramento das trilhas atrasadas e nova entrada. Medições reais de PCM
mantiveram áudio contínuo em segundo plano, e RNNoise reduziu ruído preservando fala.
Dispositivos e serviços externos são de teste; SFU/TURN reais não foram consultados.
Uma execução de `npm test` oscilou na ordenação de duas mensagens do teste SQL de
histórico e passou na reexecução, sem alterar o backend ou silenciar o teste.

## Captura de tela — 16/10/2026

- `lib/voice/screen-capture.ts` possui a fonte original, o clone de saída, os
  listeners e o descarte. Foram removidos de `social.js` os streams, a geração
  de captura e os listeners substituídos; compartilhamento ativo é estado derivado.
- Mantidos os pedidos nativos de vídeo/áudio, o máximo entre qualidade da chamada
  e replay, o contentHint escolhido e a ausência de constraints nas trilhas clonadas.
  Bitrate, FPS do sender, SDP, camada única de tela no SFU e adaptação continuam com
  os parâmetros anteriores. `backgroundThrottling: false` no Electron foi preservado.
- Trocar fonte aguarda a publicação antes de liberar a anterior; cancelar o seletor
  conserva a captura e seus listeners. Sair libera também fontes em retirada e
  resultados atrasados. Falhas de publicações antigas não cancelam um seletor novo.
- O controlador ainda publica em P2P/SFU, atualiza a interface e conecta a fonte
  original ao controlador de clipes. Câmera e negociação WebRTC ainda não foram convertidas.
- `test:voice:capture` inclui 11 regressões de tela, totalizando 31 testes de captura.
  O teste Electron usa fonte animada e verifica quadros decodificados no segundo
  participante antes/depois da troca, preservação de peers/socket/microfone/câmera,
  cancelamento, encerramento da fonte e saída com seletor pendente.

Validação: tipagem, formatação, build estático, suíte geral, 31 testes de captura,
14 regressões de voz/PCM e o Electron passaram. No navegador Edge, compositor,
canais e layouts passaram; `profile-media-browser.js` falhou na verificação de
estado/cor do botão de câmera. A mesma falha de cor foi reproduzida usando o
`social.js` de `9ba0bc5`, antes desta extração; evidência local em
`artifacts/screen-profile-baseline.log`. Corrigir esse fluxo é pendência da câmera.
A ordenação SQL do histórico oscilou novamente e passou na reexecução da suíte geral.

Os testes usam fontes sintéticas e serviços locais. Não medem 60 FPS em jogos
reais nem conectividade SFU/TURN externa. Antes de alterar codec, limites do sender
ou negociação, comparar envio e recepção sob o mesmo jogo/carga; o indicador atual
pode recorrer ao FPS configurado na captura quando faltam estatísticas de envio.

## Integração da main 0.2.8 — 16/10/2026

- Integrada `origin/main` em `a68ed1c`, mantendo os caminhos de Next/TypeScript,
  backend e Electron. Os arquivos de `frontend/` e `desktop/app/` não foram restaurados.
- Versão, preload, download, manifesto e notas de distribuição atualizados para 0.2.8.
- Correções de início/desligamento de câmera/tela e layouts incorporadas ao controlador
  e ao módulo tipado de posicionamento. Pedidos lentos de rede não bloqueiam os controles.
- Modo nativo do microfone sem expander adicional, preservando fala baixa; RNNoise mantido.
- Chat por botão próprio nos canais mistos, visualizador de imagens React compartilhado,
  capas em mensagens diretas, cabeçalho recolhível e ajustes de Splendor/Love Letter.
- GIPHY e migração de créditos importados da main, com testes autenticados, URLs e SQL
  locais. Nenhuma migração foi aplicada ao banco remoto e nenhuma chave foi configurada.
- Fixtures agora aguardam os controladores Next; URLs de arquivos incluem validade e
  respeitam o parser tipado. Testes de layout usam câmera animada estável no Windows,
  preservando as verificações de identidade e encerramento das trilhas.

Tipagem, formatação, build, suíte geral, nove verificações de controles/layout,
perfis/GIPHY/empacotamento e o Electron passaram. O fluxo de perfil também passou
com as correções da main. As próximas alterações da main estão em 0.2.9 e serão
integradas em seguida; esta entrada registra o ponto validado da 0.2.8.

## Integração da main 0.2.9 — 16/10/2026

- Integrada `origin/main` em `35c5c5f`, após o merge 0.2.8 `bc9d457`.
  Electron, preload, lockfile, link de download e documentação acompanham 0.2.9.
- Switches Windows impedem redução de prioridade do renderer coberto/minimizado;
  o contexto de envio do desktop solicita margem de 40 ms em 48 kHz.
- `rawAtUnity` foi adaptado ao processador TS: nativo/off em 100% usam captura
  direta; outros ganhos e RNNoise continuam no mesmo grafo. Ganho zero/mute
  desabilitam fonte, saída e trilha processada. Mudar volume não reabre o microfone.
- A validade das publicações também confere a trilha selecionada, evitando que
  uma troca de ganho atrasada substitua uma saída mais recente. Três regressões
  novas cobrem seleção direta, fallback e mudanças concorrentes; captura soma 34 testes.
- Importado o teste Windows de áudio em segundo plano, com caminhos `electron/`
  e `out/`, inicialização Next e navegador local configurável. O workflow o executa
  cedo e cria o diretório do relatório antes de iniciar a verificação.
- Fixtures de perfil/jogos compartilham a câmera animada dos testes de layout,
  mantendo todos os asserts de identidade e encerramento. Canais e rede passaram
  a usar portas diferentes; sua colisão causava 403 ao executar suítes em paralelo.
- Teste do pacote valida `resources/renderer` e a versão de `electron/package.json`,
  incluindo a ausência do manual antigo e a presença do manual atual.

Passaram tipagem, formatação, build estático, `npm test` (4 integrações e 185 testes),
34 testes de captura, 15 de voz/PCM, controles/layout, perfis/GIPHY, mensagens privadas e jogos.
Splendor completou os fluxos desktop/web e Love Letter manteve as trilhas da chamada.
Também passaram os 13 checks de política/layout Electron, os 17 de perfis/pacotes,
a montagem do executável Windows local e sua regressão com recursos instalados.

O teste Windows mediu nove cenários: nativo 100%, nativo 180% e RNNoise 100%, cada
um com janela coberta, minimizada e oculta. Cada coleta recebeu 240 mil amostras
PCM em cerca de cinco segundos, sem concealment nessa execução, sem recapturar
microfone e sem reconectar peers. Evidências locais: `artifacts/main-029-background.log`
e `artifacts/windows-background-voice.json`. Não mede jogos reais, SFU/TURN externos
ou a latência final da chamada. Nenhum push, instalação ou banco remoto foi alterado.

## Captura e ciclo de vida da câmera — 16/10/2026

- `lib/voice/camera.ts` concentra captura, fallback de qualidade/dispositivo,
  pedido pendente, listener de encerramento e descarte. `types/voice.ts` define
  configurações e snapshots imutáveis; as referências de mídia são emprestadas.
- Removidos de `legacy/social.js` o estado duplicado da câmera, a geração,
  promessa de captura, abertura/fallback, listener e descarte físico substituídos.
  O controlador deriva disponibilidade do módulo e conserva preferências,
  intenção dos controles, mensagens e publicação SFU/P2P.
- A troca libera a webcam anterior antes de abrir outra. Relaxar qualidade mantém
  a entrada escolhida; a preferência só é limpa quando a enumeração confirma que
  esse dispositivo sumiu. Negar permissão não dispara novas tentativas.
- Parar/sair libera a trilha e invalida pedidos imediatamente, mesmo com permissão
  ou publicação pendente. Uma chamada nova não espera o pedido antigo; resultados
  atrasados são descartados e não alteram o loading ou os controles novos.
- A disponibilidade continua anunciada antes da publicação. Attach/detach P2P
  atrasado reconcilia o sender com a captura atual. A integração SFU existente
  conserva seus identificadores e cancelamento, sem alterar o protocolo remoto.
- O módulo toca somente na trilha de câmera que possui no stream AV compartilhado.
  Microfone e tela mantêm suas instâncias e seus parâmetros de captura.

Validação: tipagem, formatação, build estático e `npm test` passaram (4 integrações
e 196 testes, incluindo 45 de captura e 11 novos de câmera). No navegador, passaram
layout, compositor, canais, perfis e controles, com substituições de sender atrasadas.
A regressão com dois Electron conferiu troca e encerramento da câmera, permissão
atrasada após sair/entrar e preservação de microfone, tela, peers, socket e jogo.
Também passaram 11 verificações de permissões, política do renderer, PCM do
microfone nativo e recepção contínua de áudio com foco alterado e tarefas longas.
Evidências locais: `artifacts/camera-regressions.log`, `camera-controls.log`,
`camera-ui.log`, `camera-electron.log` e `camera-voice.log`.
As câmeras/telas são sintéticas; não medimos webcam física, jogos a 60 FPS ou
SFU/TURN externos. Nada foi publicado nem alterado em infraestrutura remota.

## Conexões e negociação P2P — 16/10/2026

- `lib/voice/p2p-peers.ts` possui o mapa único de conexões, transceivers, filas de
  sinalização e trilhas, ICE pendente, colisões de oferta e timers de negociação,
  repetição e reconexão. Estado privado deixa de ser anexado aos objetos do browser;
  apenas referências emprestadas dos senders/transceivers conservam seus nomes
  de compatibilidade para publicação, recepção e diagnóstico ainda legados.
- `peer-protocol.ts` valida remetente, tipo/SDP, campos ICE e comandos antes de
  criar peers. O protocolo enviado ao backend e a comparação dos IDs para escolher
  o iniciador continuam iguais. O iniciador cria os quatro m-lines na ordem atual;
  quem responde reutiliza os recebidos, sem duplicar transceivers.
- Fechar remove callbacks, cancela todos os timers (inclusive o pedido inicial
  atrasado), limpa ICE e invalida operações em andamento. Um SDP antigo não envia
  resposta ou oferta depois que outra conexão passou a usar o mesmo ID.
- Reinícios ICE não se perdem ao agrupar pedidos ou enquanto uma oferta está
  sendo preparada/aguarda resposta. As trilhas são relidas após substituições
  assíncronas, preservando a captura atual. Nenhum dispositivo é aberto/encerrado
  pelo módulo; os parâmetros de mídia e a assinatura de tela foram preservados.
- Retirados de `social.js` mapa/filas/flags/timers de negociação, listeners P2P,
  criação/vinculação de transceivers e handlers SDP/ICE substituídos. O controlador
  conserva SFU, seleção de transporte/ICE, coordenação da chamada, UI, players e
  limpeza de recepção/streams/medidores; ainda não pode ser excluído.

Validação: tipagem, formatação, build, quatro regressões da interface e suíte principal
(4 integrações e 211 testes) passaram. Há 15 testes P2P em `npm run test:voice:peers`, incluídos em `npm test`,
cobrindo filas, colisões, ICE, retries, encerramento e operações antigas.
Dois Electron negociaram novamente com reinício ICE, câmera, tela e áudio ativos,
mantendo peers, socket, trilhas e jogo e recebendo novos quadros de tela. Também
passaram as trocas de câmera/permissões atrasadas e navegação/layouts existentes.
Os 15 checks de controles, microfone nativo e recepção de áudio no browser passaram,
incluindo PCM recebido durante tarefas longas e mudanças de foco. Evidências:
`artifacts/peers-regressions.log`, `peers-electron.log`, `peers-ui.log` e `peers-media.log`.
Mídia sintética e backend local; SFU/TURN externos e jogos reais a 60 FPS não foram
medidos. Não houve publicação ou alteração de infraestrutura remota.

## Streams recebidos e ciclo de vida das trilhas — 16/10/2026

- `lib/voice/remote-media.ts` possui os streams AV/tela recebidos, classificação
  das trilhas P2P, listeners P2P/SFU, histórico de vídeo e recuperação. Cada binding
  identifica seu peer ou assinatura; substituição/saída retira listeners e trilhas
  juntos. Um evento antigo não reabre áudio, renderiza ou renegocia a conexão nova.
- Removidos de `social.js` os mapas duplicados de streams, timestamps de vídeo,
  timers, classificação/recuperação de receivers e listeners substituídos. O
  controlador publica a intenção de assistir/esconder e recebe callbacks para
  renderizar, anexar áudio e registrar/remover a proteção dos receivers.
- Streams e trilhas são emprestados aos players, sem clones ou processamento de
  quadros. P2P mantém o encerramento das trilhas sob responsabilidade do peer;
  retirar uma assinatura SFU conserva o `stop()` explícito. Uma retirada antiga
  só pode remover seus próprios bindings, preservando a publicação nova.
- Mantidos 3800 ms para recuperar vídeo ausente e 5200 ms de tolerância a mute
  breve. A tolerância pertence à identidade da trilha. A recuperação considera
  apenas vídeo desejado e deduplica também pedidos enquanto aguarda sinalização.
  Cancelar, sair ou limpar invalida continuações/retries. A escolha de P2P/SFU e
  a tolerância SFU de 8 s para início de recepção continuam no controlador.
- Players, ganhos/saída, contextos de áudio, métricas/proteção e negociação SFU
  continuam legados. Esta etapa não mudou buffer de voz, codec, bitrate, captura
  ou parâmetros de FPS/resolução.

Validação: 14 novos testes em `tests/remote-media.cjs` (29 com negociação P2P),
incluídos na suíte principal. Cobrem identidade, m-lines, descarte/listeners,
assinaturas SFU, jitter breve e cancelamento/deduplicação de recuperação.
Tipagem, formatação, build estático, quatro regressões da interface e `npm test`
(4 integrações e 225 testes) passaram.
O Electron verificou a remoção dos listeners das trilhas antigas, reconexão com
novos quadros de câmera e eventos antigos sem afetar a captura atual; preservou
microfone, tela, peers, socket, jogo e os fluxos anteriores de layout/renegociação.
Os 15 checks de controles e áudio no navegador passaram, incluindo 240 mil
amostras PCM recebidas com foco alterado e tarefas longas na interface.
Evidências: `artifacts/receive-regressions.log`, `receive-electron.log`,
`receive-media.log`, `receive-ui.log` e `receive-build.log`.
Mídia sintética e backend local; ciclos de assinatura SFU são simulados nos testes
do módulo. Não houve medição de SFU/TURN externos ou jogos reais a 60 FPS,
publicação ou mudança em infraestrutura remota.

## Negociação e recursos SFU — 16/10/2026

- `lib/voice/sfu-session.ts` possui peers ativos e em negociação, mapas de publicação
  e assinatura, catálogo, fila de assinaturas/camadas, timers de retry e cancelamento.
  Foram removidos os mapas, filas, geração, timers, listeners e negociação substituídos
  de `social.js`; esse controlador recebe visões emprestadas e callbacks de interface.
- `sfu-protocol.ts` valida IDs, SDP, tipo de mídia/RIDs, listas completas e respostas
  de prontidão, renegociação e camada. Uma lista inválida preserva a anterior; uma
  resposta HTTP antiga não desfaz um broadcast mais recente. O socket e o protocolo
  de `server/realtime-sfu.js` continuam os existentes.
- O descarte local é síncrono. Abortar retira listeners/deadlines e fecha peers
  sem aguardar a rede. Respostas atrasadas ainda têm seu sessionId encerrado, sem
  selecionar recursos da chamada nova. Trocar catálogo cancela também assinaturas
  pendentes; retirar uma publicação não trava a próxima negociação.
- Trocar microfone/câmera enquanto a confirmação está pendente conserva a publicação
  quando o sender já possui uma trilha nova. Camadas são atualizadas em sequência;
  respostas antigas não alteram assinaturas novas, e camada única conserva RID nulo.
- `sfu-encoding.ts` conserva o simulcast da câmera e a dica de bitrate do SDP de
  tela. A tela continua em camada única no fluxo nativo. O helper sem chamadas
  `sfuScreenEncodings` foi retirado. `peer-wait.ts` conserva 4200 ms de coleta ICE,
  14 s para publicação e 18 s para recepção, com limpeza ao cancelar.
- Bootstrap ICE/TURN, escolha do transporte, status/consumo e coordenação da chamada
  ainda pertencem a `social.js`, assim como players, ganhos e métricas de recepção.

Passaram tipagem, formatação, build estático, `npm test` (4 integrações e 245 testes),
os quatro fluxos de `test:ui` e 15 checks de controles/áudio no navegador. Os 20 novos
testes de SFU estão em `npm run test:voice:sfu` e na suíte principal.
`npm run test:desktop:sfu` usa o módulo real no Electron com relay WebRTC local:
publica áudio/tela, recebe quadros e energia de áudio, reseta e reconecta sem reabrir
capturas; verifica 60 FPS solicitados e 8 Mbps no sender de tela. A regressão P2P
com dois Electron também passou, preservando socket, peers, trilhas, jogo e layouts.
Isso não mede entrega sustentada de 60 FPS em jogos, redes reais ou SFU/TURN externos.
Evidências: `artifacts/sfu-desktop-final.log`, `sfu-regressions.log`, `sfu-media.log`,
`sfu-ui.log` e `sfu-build.log`. Nenhum serviço remoto foi alterado ou publicado.

A falha intermitente do histórico SQL foi isolada em PGlite: mensagens podiam ter
o mesmo timestamp, e os UUIDs aleatórios não sustentavam a sequência que a fixture
esperava. O commit local `daef5e8` usa IDs ordenados apenas na fixture e acrescenta
um caso com inserção fora de ordem/horário igual para conferir desempate e cursor.
Asserções, permissões, SQL e backend de produção foram preservados.

## Players e ganhos de reprodução — 16/10/2026

- `lib/voice/audio-playback.ts` possui players, streams de reprodução, ganhos de
  voz/tela, volume geral, deafen, bloqueios de autoplay, contexto e roteamento de
  saída. Os mapas e funções substituídos foram removidos de `social.js`; ele
  conserva controles, preferências persistidas e seleção das trilhas recebidas.
- Até ganho efetivo 1, o áudio usa a trilha original pelo elemento nativo. A
  amplificação usa um contexto separado do microfone, com 40 ms e 48 kHz como
  antes. Não há novo dispositivo, peer, socket, clone de trilha ou processamento
  de vídeo. Suspender o contexto restaura a reprodução direta.
- `audio-gain.ts` possui ganho/limiter e limpa também construções parciais.
  Deafen inicializa o grafo em zero. Retirar player desconecta seus nós e libera
  o elemento, sem encerrar a trilha recebida. Sair fecha o contexto e invalida
  resultados de reprodução/saída anteriores.
- Pedidos de play são deduplicados e preservam o gesto do usuário. Rejeições de
  players retirados não bloqueiam os novos. Trocas de saída são serializadas por
  destino, preservando a escolha mais recente diante de sucessos/erros antigos.
  Fallback para a saída padrão também atualiza os outros players e o contexto.
- `legacy/audio-gain.js` e sua entrada no manifesto foram excluídos; a preparação
  do renderer também removeu sua cópia gerada de `public/` e do build estático.
  Sons de chamada, soundboard e jogos continuam preservados nos seus módulos.
- `npm run test:voice:playback` executa 13 regressões, também incluídas em
  `npm test`. Cobrem trilha emprestada, ganho/deafen, suspensão, falha parcial,
  autoplay, respostas atrasadas e descarte/troca de saída.

Passaram tipagem, formatação, build estático, `npm test` (4 integrações e 258
checks), os quatro fluxos de `test:ui` e 15 checks de controles/áudio no navegador.
O teste de recepção mediu PCM contínuo durante tarefas longas da interface,
conservando a mesma captura e peers. No Electron, os três testes passaram:
chamada P2P com layouts/recapturas, SFU com relay local e nove cenários de
segundo plano no Windows. O teste SFU agora usa o player tipado e verifica ganho,
deafen, retorno à reprodução direta, identidade de player/trilha/peers e descarte
do contexto ao reconectar. Nos cenários coberto, minimizado e oculto, a recepção
PCM permaneceu contínua nos modos nativo e RNNoise, sem recaptura ou reconexão.
As fontes de teste são sintéticas; isso não mede jogos a 60 FPS, saídas físicas
específicas ou rotas SFU/TURN externas. O teste manual fica para o fim da migração.
Evidências locais: `artifacts/playback-unit.log`, `playback-regressions.log`,
`playback-media.log`, `playback-ui.log`, `playback-build.log` e
`playback-desktop.log`. Não houve publicação ou alteração de serviços remotos.

## Métricas e proteção da recepção — 16/10/2026

- `lib/voice/telemetry.ts` possui registro/identidade dos receivers de voz, coleta
  assíncrona e agendamento do diagnóstico, contadores por peer, histórico, métricas
  de saída e recursos/prioridade nativos. `types/voice-diagnostics.ts` descreve os
  dados consumidos de WebRTC e os snapshots apresentados à interface.
- `reception-policy.ts` conserva a margem inicial de 60 ms, teto de 140 ms, passos
  de 40 ms, intervalo mínimo de aumento de 10 s e redução após 60 s estáveis.
  A proteção só ajusta receivers de voz; áudio de tela/jogos e vídeo permanecem
  fora dessa política. Capturas, trilhas, senders, conexões e socket são emprestados.
- Uma coleta é compartilhada por geração. Sair invalida leituras e libera o bloqueio
  sem esperar WebRTC/IPC; uma chamada nova pode coletar enquanto a antiga responde.
  Resultados de peers retirados não recriam receivers ou sobrescrevem baselines de
  conexões novas. A limpeza final conserva registros que chegaram durante a leitura.
- Contadores são ligados ao objeto do peer e limpos quando a conexão/estatística
  sai. Intervalos faltantes/reiniciados não contam como estabilidade da recepção;
  falhas de `getStats` retiram a medição antiga e não restauram a qualidade adaptativa.
- Pedidos de prioridade nativa são serializados, com resultados antigos invalidados.
  Reset também solicita a liberação da prioridade. Recursos/prioridade do preload
  são validados; uma leitura de recursos anterior não desfaz uma decisão mais nova.
  O agendamento conserva 2/5/15 s e a diferença entre web oculta e desktop.
- `social.js` perdeu registro de recepção, histórico, contadores, filas de prioridade,
  coleta e timer de diagnóstico. Conserva a renderização, adaptação de qualidade e
  exportador anônimo de `call-stability.js`. Os medidores visuais de quem fala e
  seus timers/contexto ainda precisam de extração. `legacy/voice-reception.js` e sua
  entrada no manifesto foram removidos, inclusive a cópia do renderer gerado.
- `npm run test:voice:diagnostics` reúne quatro regressões anteriores da política
  e 16 do coletor, agora incluídas em `npm test`. Cobrem troca de peer/chamada,
  leitura/IPC atrasados, prioridade, intervalos, saída, histórico e agendamento.

Passaram tipagem, formatação, build estático, `npm test` (4 integrações e 278
checks), quatro fluxos de `test:ui` e 15 checks de mídia/controles no navegador.
O Electron passou nos três testes: chamada P2P com layouts/recapturas, SFU via
relay local e nove cenários de segundo plano no Windows. O teste SFU agora coleta
métricas do receiver real, liga/desliga a proteção e verifica restauração da
margem original mantendo a mesma trilha. O helper compartilhado com os testes de
runtime/empacotamento usa a fábrica tipada e foi exercitado nessa regressão,
incluindo a restauração da prioridade do serviço de áudio nativo.

Evidências locais: `artifacts/telemetry-unit.log`, `telemetry-regressions.log`,
`telemetry-media.log`, `telemetry-ui.log`, `telemetry-desktop.log`,
`telemetry-typecheck.log`, `telemetry-format.log` e `telemetry-build.log`.
O teste manual do usuário continua reservado para o fim da migração. Os testes
sintéticos não medem entrega de jogos a 60 FPS ou rotas SFU/TURN externas.
Não houve publicação ou alteração de serviços remotos.

## Próximas alterações, em ordem

1. Extrair medidores visuais de fala e coordenação/entrada da chamada para `lib/voice/`.
   Câmera, captura/processamento do microfone e captura de tela já têm módulos com um único dono.
   Peers e negociação P2P estão em `p2p-peers.ts`; não recriar seu mapa ou suas filas.
   Streams, listeners e timers recebidos estão em `remote-media.ts`, compartilhado por P2P e SFU.
   Publicações/assinaturas, filas, catálogo e retries SFU estão em `sfu-session.ts`.
   Players/ganhos, autoplay e roteamento de saída estão em `audio-playback.ts`.
   Coleta, métricas, proteção de recepção e prioridade estão em `telemetry.ts`/`reception-policy.ts`.
   Adaptação de qualidade e exportação anônima ainda usam `legacy/call-stability.js`.
   Bootstrap ICE/TURN e status/consumo ainda pertencem ao coordenador legado.
   A chamada deve sobreviver à navegação e troca de layout. Validar microfone,
   câmera, tela, áudio de aplicativo e fallback SFU/P2P.
2. Converter navegação/gerenciamento de canais, notificações, perfis/configurações
   e jogos. Cada controlador convertido perde sua entrada no manifesto e seus
   listeners DOM. Não recriar o catálogo, socket ou estado de participação no processo.
   Ao retirar `legacy/profile-files.js`, conservar o cliente de `lib/files/` e os
   componentes já compartilhados; remover os adaptadores quando não houver chamadores.
3. Extrair regras e coordenação de `server/runtime.cjs`, mantendo a interface
   de `createApplication`. Converter os módulos JS por domínio.
4. Consolidar estilos por domínio após retirar os controladores. A ordem atual
   contém sobreposições necessárias para estados de chamada não visíveis no início.
5. Documentar e validar uma instalação nova do banco, com ordem única para os
   SQL legados e as migrações datadas, sem reaplicar mudanças em bases existentes.

## Critérios por fluxo convertido

- Um único dono de estado, listeners e recursos.
- Tipos nas entradas/saídas e validação dos dados externos em execução.
- Remoção do código substituído e da documentação que deixou de valer.
- Regressões do fluxo e teste no Electron quando houver layout, permissão ou mídia.
- Build estático e tipagem sem erros.

## Validação e limites

Verificado em Windows em 15/10/2026:

| Verificação                                             | Resultado                                             |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Tipagem, inclusive sem next-env.d.ts previamente gerado | Passou                                                |
| Formatação e build estático Next.js                     | Passaram                                              |
| npm test                                                | 4 integrações e 79 testes passaram                    |
| test:server:lifecycle                                   | 3 testes passaram                                     |
| test:desktop:core                                       | 27 testes passaram                                    |
| test:ui                                                 | Compositor React, layouts e perfis passaram           |
| test:desktop:layout                                     | Chamada com dois Electron e mídia simulada preservada |
| Helper C++ no novo diretório                            | Compilou com Visual Studio 2026                       |
| Pacote Windows e tests/desktop-packaged.js              | Executável e recursos locais passaram                 |
| Next dev dentro do Electron                             | Atualização de TSX ao salvar conferida                |
| Empacotamento, retenção e Cinzas                        | 21 testes de apoio passaram                           |
| Imports CommonJS relativos movidos                      | Todos resolvidos                                      |

A suíte antiga `test:frontend` precisa ser atualizada para a interface atual.
Sua primeira falha foi reproduzida também com os fontes originais de `7db2d81`:
espera `#chatOnlyScreen` visível, mas esse elemento usa `display: contents` e o
retângulo visível pertence a `#callWorkspace`. A suíte não foi silenciada nem
marcada como ignorada. A aceitação atual está em `test:ui`; modernizar o restante
das expectativas antigas é trabalho pendente. A evidência local é
`artifacts/migration-frontend-baseline.log` (gerada e não versionada).

Integrações usam serviços simulados e as verificações de chamada usam mídia
sintética. Não provam entrega de e-mail, conectividade TURN real ou um deploy.
Não foi alterada infraestrutura remota. Deploys precisam de Node 24.12+ e devem
usar `npm start`; comandos externos fixados em `node server.js` precisam ser
atualizados antes de uma publicação.
