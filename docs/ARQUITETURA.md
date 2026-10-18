# Arquitetura e responsabilidades

## Interface

Next.js usa App Router em `src/app/`, React e TypeScript estrito. A exportação
estática permite a mesma interface na web e no Electron. Não há Server Actions,
API Routes ou cookies do servidor Next: conta, dados e WebSocket pertencem ao
backend existente.

`components/application.tsx` compõe as telas por domínio. As telas preservam IDs
e hierarquia relevantes dos controles anteriores. `chat-composer.tsx` possui o
campo de texto, seletor de arquivo/emojis e feedback em React. `lib/chat/composer.ts`
concentra rascunho, arquivo selecionado, progresso e ciclo de vida do upload.
Há uma instância por página, com `getSnapshot()` e `subscribe()`, consumida com
`useSyncExternalStore`. Trocar canal, desconectar ou cancelar invalida a operação;
uma resposta antiga não pode enviar no canal novo ou liberar um upload posterior.
Trocar de conta limpa o rascunho. Não há um segundo socket ou captura de mídia.

O envio usa o cliente de rede tipado. `lib/files/client.ts` possui o transporte
HTTP compartilhado por chat, perfis, mensagens diretas e soundboard. Há um cache
de links por conta, com pedidos simultâneos deduplicados, expiração e invalidação
por exclusão. Mudanças de conta incrementam uma geração: respostas anteriores não
entram no cache e uploads ativos são cancelados. `protocol.ts` valida arquivos
e links; o parser de mensagens reutiliza essa validação para seus anexos.
`lib/chat/messages.ts` possui mensagens, histórico, paginação, revisões e confirmações
de moderação. `message-protocol.ts` valida páginas completas antes de aceitar sua
revisão. Snapshots e mensagens são imutáveis; respostas antigas não restauram linhas
apagadas. Trocar de canal, desconectar ou perder a permissão invalida confirmações.
As permissões da interface não substituem a autorização do servidor.

`chat-messages.tsx` renderiza lista, paginação e diálogo em React, preservando a
posição de leitura ao inserir mensagens anteriores. Avatares e anexos usam
componentes React compartilhados em `components/profiles/` e `components/files/`,
sem mutar o DTO. URLs, erros e previews pertencem ao arquivo e à geração da conta;
respostas antigas não reaparecem em uma linha reutilizada. A atividade do chat
alimenta `lib/voice/navigation.ts`, que possui a contagem atual de não lidas e o
silenciamento do texto, e delega sons a `call-alerts.ts`. O adaptador público
`TronoSocial.onChatActivity` não guarda estado nem escreve nos componentes.
O adaptador `lib/socket/chat-actions.ts` foi excluído.

`lib/socket/transport.ts` possui a conexão WebSocket, correlação de respostas,
timeouts e fila de autenticação de conta/convidado. Requisições correlacionam tipo
de resposta e ID; fechar a conexão rejeita pendências e invalida operações antigas.
O transporte valida o envelope JSON; os domínios continuam responsáveis pelo
conteúdo de cada mensagem. Não abre dispositivos nem conhece elementos da tela.

`lib/socket/client.ts` reúne comandos de rede e identidade. `state.ts` mantém um
snapshot imutável de capacidades e participação em texto/voz/jogo, com
`getSnapshot()` e `subscribe()`. `protocol.ts` valida os eventos que alteram esse
estado e as respostas de conta, convidado, nome e preparo da chamada. O consumidor
P2P valida SDP, ICE e comandos em `lib/voice/peer-protocol.ts`; a negociação SFU
valida respostas e catálogos em `sfu-protocol.ts`. `realtime-protocol.ts` valida
status de consumo e configuração ICE/TURN. Payloads de jogos e os demais
comandos de consumo SFU ainda serão convertidos com seus consumidores;
o protocolo inteiro ainda não está tipado.

`browser.ts` instala uma única instância por página, importada pelo Next antes
dos controladores. `TronoNetwork` permanece apenas como nome de compatibilidade
para consumidores não convertidos. `legacy/network.js` e sua entrada no manifesto
foram excluídos. O catálogo de canais consome esse snapshot para refletir a seleção
imediatamente, sem esperar outro broadcast da lista.

`lib/channels/catalog.ts` possui um catálogo imutável por página, inicializado em
`browser.ts`. Recebe listas do socket e metadados HTTP, validados em `protocol.ts`.
Uma resposta HTTP só é aplicada se o catálogo e a conta não mudaram durante a
requisição; não pode desfazer um broadcast ou recriar um canal excluído. Metadados
sem contagem/presença preservam os valores recebidos da rede. Trocar de conta
descarta os participantes privados do catálogo anterior.

`components/channels/channel-list.tsx` renderiza texto e voz, seleção, presença,
silenciamento e não lidas. `lib/notifications/controller.ts` possui contadores,
deduplicação dos últimos 500 avisos, preferências e entrega. Consome o catálogo
e o socket existentes; publica mudanças sem escrever nos botões dos canais.
`protocol.ts` valida mensagens e destinos; `browser.ts` adapta visibilidade,
permissão, avisos web e IPC nativo. O Electron conserva seus limites de envio.

`components/modals/notification-fields.tsx` renderiza modo, canal, silenciamento
e permissão em React, usando um snapshot imutável. Contadores funcionam com avisos
desligados ou silenciados. Trocar de conta limpa leitura/deduplicação e invalida
respostas de permissão, leituras adiadas e cliques web antigos; cliques nativos
também validam a conta de destino. O início é único no ready e o descarte remove
assinaturas e frames pendentes. Metadados iguais do catálogo não notificam de volta,
evitando um ciclo entre contadores e lista. `TronoNotifications` é a fachada de
compatibilidade do mesmo dono; `legacy/notifications.js` foi excluído.

`legacy/community.js` mantém apenas os ícones das mesas de jogo.
`lib/profiles/icons.ts` contém os desenhos e o catálogo único de avatares.
`avatar.ts` conserva `avatarHtml`/`hydrate` para perfis e jogos não convertidos;
as imagens antigas são invalidadas ao trocar de conta ou excluir um arquivo.
O componente React usa o mesmo catálogo e cliente de arquivos, sem hosts de
renderização imperativa no chat ou nos canais. `legacy/avatar-icons.js` foi removido.

`lib/navigation/app-layout.ts` possui a projeção de layout, destino atual,
identidade e conexão de voz, preferência e retorno ao canal de voz. Lê os donos
existentes; não altera participação nem cria catálogos. Uma seleção adiada é
invalidada por nova navegação, troca de conta/geração ou descarte. O status usa o
toolbar tipado; não deriva estado do texto no DOM. `app-layout-controls.tsx`
renderiza conexão/perfil, rail web e seletor em React. Os slots vazios recebem
os mesmos controles da chamada; o painel inteiro pode mudar de lugar sem recriá-los.
O bootstrap instala `TronoAppLayout` antes do ready e monta a estrutura antes dos
posicionadores. A observação da visibilidade das telas ainda legadas permanece na
ponte; `legacy/app-layout.js` foi excluído.

A seleção/troca de canais e a navegação das telas de jogos ainda passam por
`legacy/game.js`; o shell desktop delega a esses donos por `lib/desktop/shell.ts`. Os cliques React delegam a esse fluxo, que
consulta o catálogo tipado, sem outra lista de canais. A apresentação da chamada
consulta `lib/voice/navigation.ts`; os métodos públicos de `TronoSocial` são adaptadores.
O gerenciamento de canais e seus diálogos permanecem em `legacy/community-admin.js`.

`lib/desktop/shell.ts` possui projeção da área, abertura da lista de canais e
estado visual da janela. Navegação reutiliza portal, jogos e catálogo existentes;
perfil/configurações não trocam a área e clipes conservam o bloqueio atual. O IPC
continua no preload: a leitura inicial da janela e respostas de toggle não podem
sobrescrever um evento nativo posterior. Assinaturas, observação das telas ainda
legadas e raízes React são liberadas pelo runtime do shell.

`components/desktop/shell-controls.tsx` renderiza rail, topo, sombra e informação
da chamada, usando o status do toolbar tipado. O runtime monta antes das
configurações e de app-layout; move os mesmos hosts de diagnóstico e controles.
O botão de soundboard conserva sua ação legada; apenas seu conteúdo é React,
marcado para o posicionador não recriar seus ícones. `effects-layout.ts` observa
visibilidade/tamanho e limita o menu à região disponível, agrupando medições por frame.

`lib/desktop/updates.ts` valida estados nativos e possui somente apresentação,
banner manual/automático, pedidos pendentes e ações. Eventos mais novos vencem
respostas IPC antigas; cliques simultâneos são deduplicados e descarte invalida
continuações. O consentimento e a instalação continuam em `electron/updates.cjs`.
Botão e banner são React; o workspace move `desktopUpdateCheckHost` completo,
conservando o botão e o handler em modo compacto. `desktop-shell.js` e
`desktop-updates.js` saíram dos fontes/manifesto. Estado e handlers de clipes que
nunca eram ativados pelo shell foram retirados, sem habilitar a função.

## Compatibilidade durante a conversão

`src/legacy/manifest.json` define a ordem dos estilos e controladores.
`scripts/prepare-renderer.cjs` prepara JS/CSS públicos antes de iniciar ou compilar
Next. Os arquivos copiados são descartáveis, com um único fonte. Após compilar,
a preparação remove JS/CSS gerados na raiz de `public/` que perderam seu fonte;
isso impede incluir controladores retirados no próximo pacote.

`legacy-runtime.tsx` carrega os controladores uma vez, após hidratação, e dispara
`trono:ready`. Isso substitui a dependência de `DOMContentLoaded`, que pode ocorrer
antes da hidratação. Worklets mantêm os caminhos relativos existentes.

Os controladores podem mover ou reescrever seus elementos. Enquanto um controlador
for dono de uma subárvore, evite renderizações React reativas dentro dela. Para
converter um fluxo, transfira estado e eventos juntos e remova o listener antigo.
Renomear extensões não constitui uma conversão de arquitetura.

O nome `TronoFiles` é compatibilidade para o cliente tipado. Chamadores legados de
`renderAttachment` fornecem um host vazio; `legacy-attachments.tsx` monta nele o
mesmo componente React e desmonta a raiz quando o host sai do documento. O observer
existe somente enquanto há raízes ativas. `legacy/profile-files.js` ainda possui
edição/visualização de perfis e composição de capas; a biblioteca de arquivos saiu
desse controlador.

`lib/files/library.ts` possui lista, consulta de uso, exclusões pendentes e feedback
de Meus arquivos. Reutiliza transporte, URL assinada e exclusões do cliente tipado.
Valida a página inteira antes de publicá-la, com até 200 IDs únicos, e filtra os
arquivos já excluídos, inclusive durante uma consulta pendente. A conta e sua geração
invalidam resultados antigos; um refresh novo impede mensagens de erro anteriores.
O download conserva o gesto do clique e tem uma abertura pendente por arquivo.
Atualizar a lista não cancela uma abertura solicitada; sair da conta ou excluir o
arquivo invalida seu destino.

`components/files/library.tsx` renderiza a biblioteca; `library-runtime.tsx` monta
uma instância por página no host `profileFilesHost`. Perfil web e configurações
desktop movem esse host inteiro, preservando controles e estado. O editor empresta
os IDs de avatar/capa/fundo selecionados via `getProtectedFileIds()` e notifica
mudanças do rascunho; a biblioteca protege esses IDs também na ação de excluir.
O rascunho continua pertencendo ao editor. A leitura dos IDs e seus eventos podem
ser substituídos quando o editor for convertido, sem outro transporte ou cache.

`lib/voice/control-layout.ts` é o único responsável por posicionar controles.
Move os mesmos nós e não abre dispositivos, clona elementos ou renegocia peers.
`lib/voice/microphone.ts` possui captura de microfone, troca de entrada, mute físico,
seleção entre trilha bruta/processada e descarte. A geração da chamada e a do pedido
invalidam permissões, processadores e publicações antigas. O módulo acompanha também
capturas retiradas que aguardam substituição do sender, para liberá-las ao sair.
O snapshot tem um invólucro imutável; streams, trilhas e processador são referências
de mídia pertencentes ao módulo, não DTOs que a interface deva modificar.

`microphone-processor.ts` constrói e encerra o grafo de ganho, limiter e filtro
RNNoise, com fallback nativo. O modo nativo não empilha um expander sobre a captura,
preservando sílabas baixas. Recebe os worklets existentes por dependências;
cancelar durante sua inicialização desconecta o grafo e descarta filtros atrasados.
O AudioContext é emprestado da chamada e não é fechado pelo processador.
No desktop, `rawAtUnity` indica que nativo/off podem enviar a captura diretamente
em 100%; outros ganhos e RNNoise usam a trilha processada. `microphone.ts` escolhe
a saída, aplica mute/ganho zero a todas as trilhas e invalida publicações antigas
quando a seleção muda. Não reabre o dispositivo ao alternar o ganho.

`lib/voice/runtime.ts` compõe os donos da chamada por imports diretos, com uma
instância por janela. O bootstrap o inicializa após `personal-prefs.js`, na ordem
anterior; o início dos listeners ocorre uma única vez em `trono:ready`.
Callbacks adiam a leitura das dependências até sua composição estar completa.
`runtime-ports.ts` descreve as entradas ainda legadas e a fachada `TronoSocial`,
preservada para consumidores não convertidos. Não há registro global de fábricas
`TronoVoiceCapture`; `legacy/social.js` e sua entrada no manifesto foram excluídos.
As instâncias duram pela página; entrada, saída e descarte de mídia continuam
nos donos existentes, sem outro socket, peer ou captura.

`controls.ts` possui preferências e intenção, delegando aquisição, mute, ganho e
encerramento físico aos donos de mídia.
`device-publication.ts` recebe as trocas de trilha e publica nos peers/SFU,
verificando a validade da operação entre esperas de transporte.

`screen-capture.ts` possui a fonte de tela e seu clone de saída, os listeners de
encerramento e o descarte de capturas atuais, atrasadas e em substituição. O pedido
de captura considera a maior resolução/FPS entre chamada e replay; o módulo não
aplica constraints às trilhas clonadas, pois compartilham a fonte com os clipes.
O cancelamento do seletor conserva a fonte anterior. Sua liberação após uma troca
aguarda a publicação, mas sair da chamada descarta também as fontes em retirada.
O acesso ao par fonte/saída é emprestado; consumidores não devem encerrar suas trilhas.

`runtime.ts` deriva o estado de compartilhamento desse módulo, sem outra cópia de
streams, geração ou listeners. Delega publicação e fim do áudio a `screen-publication.ts`
e avisa o controlador de clipes sobre a fonte original.

`camera.ts` possui captura, qualidade do dispositivo, listener de encerramento,
pedido pendente e descarte da câmera. O snapshot imutável contém uma referência
emprestada à fonte/trilha. O módulo adiciona e remove somente sua trilha no stream
AV da chamada; não encerra microfone ou tela. Uma troca libera a webcam anterior
antes de abrir outra, pois alguns dispositivos aceitam apenas uma captura.
O fallback relaxa qualidade mantendo o dispositivo escolhido; só passa à câmera
padrão após confirmar que a entrada salva não existe mais.

Parar ou sair invalida a geração do pedido sem aguardar permissão/publicação.
Uma captura atrasada é encerrada; callbacks antigos não limpam o estado de um
pedido posterior. `runtime.ts` deriva `cameraOn` do snapshot; preferências e intenção
do botão pertencem a `controls.ts`. `device-publication.ts` anuncia disponibilidade
antes de aguardar publicação e inicia a retirada dos senders imediatamente ao parar.
No P2P, uma substituição atrasada reconcilia o sender com a trilha atual para que
um attach/detach anterior não sobrescreva uma câmera nova.

`p2p-peers.ts` possui o mapa de conexões P2P, transceivers, filas de trilhas/sinais,
ICE pendente, colisões de oferta e timers de negociação/reconexão. A escolha do
iniciador conserva a comparação dos IDs. Apenas ele cria os m-lines, nesta ordem:
microfone, câmera, tela, áudio de tela; quem responde reutiliza os transceivers
recebidos antes de criar a resposta, mantendo mídia bidirecional.

`peer-protocol.ts` valida sinais antes de alocar um peer. Fechar uma conexão remove
seus callbacks, cancela todos os timers e invalida filas/continuações assíncronas,
inclusive quando outra conexão já usa o mesmo ID. SDP e ICE tardios não são enviados.
Requisições de reinício ICE sobrevivem à coalescência de negociações e aguardam a
resposta de uma oferta em andamento. As tentativas conservam os limites anteriores.

O módulo recebe as trilhas existentes e a aplicação de qualidade por dependências;
não abre ou encerra dispositivos, cria sockets ou modifica os parâmetros de captura.
Tela/áudio de tela só entram nos senders com assinatura do participante. A publicação
reconfere a trilha desejada após `replaceTrack`, evitando restaurar uma captura antiga.
`connections` é uma visão tipada somente para leitura, com referências emprestadas
dos peers e senders para renderização, publicação e diagnósticos existentes.

`remote-media.ts` possui a composição dos streams recebidos de câmera/voz e tela,
seus listeners, a tolerância de vídeo a mute breve e os timers de recuperação.
Classifica P2P pela ordem dos m-lines, inclusive antes da vinculação do respondente;
SFU informa o tipo e a identidade da assinatura explicitamente. Os players recebem
os mesmos streams/trilhas por referência, sem clones ou processamento de quadros.

Cada binding pertence ao peer ou à assinatura. Substituir, sair ou fechar remove
os listeners junto com a trilha do stream. Eventos de conexões antigas não renderizam,
reabrem áudio ou recuperam a conexão nova. P2P empresta a trilha do peer e não chama
`stop()` nela; SFU conserva o descarte explícito na retirada da assinatura.
Limpar uma assinatura antiga não remove a trilha que a substituiu.

A tolerância de vídeo conserva 5200 ms e pertence à identidade da trilha, para
uma fonte nova ainda muda não herdar o histórico da anterior. A recuperação espera
3800 ms, só considera vídeo desejado e não faz pedidos simultâneos enquanto aguarda
sinalização. Cancelar ou limpar invalida também continuações e retries pendentes.
O callback legado ainda escolhe a renegociação P2P ou solicita novas assinaturas
ao módulo SFU, com a tolerância anterior de 8 s para início de recepção.

`sfu-session.ts` possui peers de publicação/assinatura, recursos em negociação,
catálogo de publicações, filas de assinatura/camada, retries e cancelamento SFU.
As visões dos mapas são somente para leitura; senders/peers são emprestados aos
controles de mídia e aos diagnósticos existentes. Captura e socket não são duplicados.

Fechar ou resetar cancela esperas e remove listeners/peers imediatamente, sem
aguardar o backend. O ID de uma sessão remota é guardado antes de validar a resposta;
se ela chegar atrasada, sua limpeza usa esse ID, sem atingir a conexão nova.
Publicações substituídas no catálogo cancelam assinaturas anteriores inclusive
durante a requisição inicial. Respostas de listagem antigas não desfazem broadcasts.
Trocas de trilha durante a confirmação usam o sender atual, sem invalidar uma
publicação saudável porque a captura anterior terminou.

`sfu-protocol.ts` valida SDP, IDs, tipos de mídia, RIDs, catálogo e confirmações de
negociação/prontidão. `peer-wait.ts` possui listeners e deadlines abortáveis:
4200 ms de coleta ICE, 14 s para conectar publicações e 18 s para assinaturas.
`sfu-recovery.ts` possui recuperação independente por publicação e filas de assinatura
separadas (três slots de voz, dois de vídeo). A voz tenta republicar duas vezes;
câmera/tela/áudio da tela tentam quatro, sem derrubar a voz saudável. Publicações em
recuperação usam 9 s de requisição e 7 s de conexão. Sair ou substituir a captura
invalida o trabalho antigo sem parar trilhas emprestadas. Assinaturas de vídeo
param após quatro falhas por sessão; uma sessão nova reabre o orçamento. A voz
mantém fallback após três falhas reconhecidas de negociação. Erros globais de
disponibilidade/limite também conservam fallback. O backend coordena o modo da sala;
listas de presença atrasadas não acionam troca por temporizador.
Atualizações de camada são serializadas e não restauram estado de assinaturas fechadas;
respostas de camada única conservam RID nulo.

`sfu-encoding.ts` conserva as três camadas de câmera e a dica de bitrate inicial
do SDP de tela. A tela mantém camada única e o fluxo nativo, sem processamento de
quadros ou alteração das constraints da captura. A qualidade dos senders continua
aplicada pelo controlador existente. O helper de encoding de tela que não tinha
chamadas foi retirado junto com a implementação antiga.

`audio-playback.ts` possui elementos de áudio, streams de reprodução, ganhos por
participante/tela, volume geral, deafen, grafo de amplificação e contexto de saída.
A trilha recebida é emprestada: remover ou trocar o player não chama `stop()` nem
clona a trilha. Até ganho efetivo 1, a reprodução usa o elemento nativo, sem criar
um contexto Web Audio. Acima disso, `audio-gain.ts` conecta ganho e limiter à saída
do contexto de reprodução, com a margem anterior de 40 ms a 48 kHz. Falhar durante
a construção desconecta todos os nós já criados e conserva a reprodução direta.
Suspender o contexto também restaura o caminho direto; o microfone não participa
desse grafo. A amplificação nasce em zero quando deafen está ativo.

Pedidos de `play()` são deduplicados por player e começam dentro do gesto do
usuário. Trocar trilha ou sair invalida os resultados anteriores: uma rejeição
atrasada não bloqueia o player novo. Mudanças de `setSinkId` são serializadas por
elemento/contexto; uma resposta antiga não restaura a saída anterior nem apaga
a seleção mais recente. Uma saída indisponível leva todos os players e o contexto
para a padrão, preservando o erro no diagnóstico. Reset fecha o contexto e remove
os elementos sem encerrar capturas ou peers; callbacks antigos não recriam grafos.
Os snapshots de diagnóstico são imutáveis e não expõem elementos/nós mutáveis.

`runtime.ts` adapta seleção de trilha, preferências persistidas e controles ao
módulo de reprodução, sem outros mapas de players, ganhos ou bloqueios. O antigo
`legacy/audio-gain.js` e sua entrada no manifesto foram excluídos. Sons de aviso,
soundboard e áudio dos jogos mantêm seus controladores próprios.

`telemetry.ts` possui registro de receivers de voz, associação ao participante,
coleta `getStats`, deltas de tráfego/perda, métricas de vídeo/ICE/saída, histórico
limitado e agendamento do diagnóstico. Os contadores pertencem ao objeto do peer,
com descarte de peers e IDs de estatística retirados; uma conexão nova não herda
baseline de outra que usava o mesmo identificador. Há uma coleta em andamento por
geração. Sair invalida a leitura e libera o bloqueio imediatamente, sem aguardar
`getStats` ou IPC. Respostas de peers retirados não registram novamente receivers.

`reception-policy.ts` conserva a política de margem solicitada ao WebRTC: começa
em 60 ms, aumenta em passos de 40 até 140 ms com intervalo mínimo de 10 s e reduz
após 60 s estáveis. A decisão usa jitter e reconstrução no intervalo, sem alterar
trilhas ou renegociar. Perda isolada e atraso da interface não aumentam a margem.
Áudio de tela/jogos e vídeo não recebem esses ajustes. Remover receiver ou desativar
proteção restaura seu valor original; browsers sem suporte usam o comportamento
nativo. Uma leitura falha não reapresenta intervalos antigos como medições novas
nem dispara recuperação da qualidade adaptativa por ausência de dados.

O mesmo módulo serializa pedidos de prioridade ao preload e valida os valores de
recursos/prioridade devolvidos pelo Electron. Reset solicita liberação da prioridade;
respostas de uma chamada anterior não alteram o estado da nova. O timer conserva
2 s com painel ativo, 5 s em chamada e 15 s fora dela; páginas web ocultas pulam a
coleta, e o desktop continua coletando. Snapshots e histórico são imutáveis; IDs de
participantes ficam separados das linhas anônimas de voz. O controlador conserva
a renderização dos nomes na tela e o exportador existente permite só campos
anônimos. `legacy/voice-reception.js` e sua entrada no manifesto foram removidos.

`speaking-indicators.ts` possui os medidores visuais, estado de fala, pedidos de
inicialização, nós de análise, timers e listeners de foco/visibilidade/contexto/trilha.
O contexto do microfone e a trilha original são emprestados. O módulo cria só um
invólucro de stream com a mesma trilha; não abre dispositivos, clona/encerra trilhas,
conecta à saída de som ou retoma/fecha o contexto compartilhado.

A análise conserva FFT 256, suavização 0,72, limiar RMS 0,042 e permanência de
300 ms. O timer usa 100 ms em primeiro plano, 200 ms no modo leve e 500 ms sem
foco. Páginas que informam `document.hidden` e contextos suspensos desconectam
os nós de análise e param os timers; retomar reutiliza os mesmos medidores. Há
um listener de estado por contexto e um conjunto de listeners de página somente
enquanto existem medidores/pedidos. No Electron, `backgroundThrottling: false`
pode manter a página reportada como visível/focada mesmo com a janela oculta;
essa política anterior foi preservada, sem forçar suspensão do áudio.

Trocar trilha, retirar participante, encerrar a trilha ou sair invalida pedidos
e remove os nós/listeners/timers correspondentes. Uma inicialização antiga não
substitui a atual, mesmo com IDs iguais; callbacks antigos não afetam uma chamada
nova. Falhar na construção também desconecta os nós parciais. `runtime.ts` recebe
mudanças para pintar cartões/câmeras, sem outro conjunto de participantes falando
ou loop de medidores. Seus listeners de página restantes cuidam da classe visual
de segundo plano, recuperação da reprodução e renderização do diagnóstico.

`realtime.ts` possui status confirmado, erro de sincronização, configuração ICE/TURN,
consultas pendentes e o listener/timer de atualização. Compartilha consultas simultâneas;
um broadcast válido invalida a consulta anterior. Disconnect/stop descartam resultados
pendentes imediatamente, sem aguardar o socket. O timer conserva 15 s e só consulta
com página visível e conexão ativa. O transporte mantém seus deadlines de 8 s.

`realtime-protocol.ts` aceita somente políticas completas nos campos de disponibilidade
consumidos pelo cliente e números finitos para uso/limites. Snapshots são imutáveis;
credenciais temporárias não entram nos snapshots. ICE aceita URLs WebRTC em string ou
array, copia arrays/credenciais e conserva as opções P2P locais. Falhas restauram o
STUN Cloudflare existente. Sair limpa o cache ICE e cancela a espera da chamada;
resultados anteriores não reinstalam credenciais na chamada nova. Um freio de qualidade
local invalida consultas antigas e nunca eleva uma restrição que já era Economia.

O callback de política recebe um guard de revisão; o coordenador também confere a
geração da chamada depois de esperar o encerramento da tela ou ajustes de qualidade.
A consulta não possui capturas, peers ou outro socket. `runtime.ts` coordena a
aplicação da política aos donos existentes; as projeções tipadas alimentam os
controles React, sem cache/listener/timer de consulta paralelos.

`call-lifecycle.ts` possui fase, geração, participação local e promessa de entrada.
A interface é `toggle()`, `leave()`, snapshot e instalação/descarte do listener de
saída. O desbloqueio de áudio permanece síncrono no gesto; preparar a voz precede
capturar o microfone, e a participação só inicia após a captura. A conexão pode
continuar pendente enquanto a interface já oferece sair da voz.

Sair invalida geração/sinal antes dos callbacks, interrompe o dono do microfone e
libera os demais donos em ordem, isolando exceções de limpeza. Cancelar não aguarda
permissão, WebSocket, medidor ou negociação. Resultados antigos não conectam, limpam
recursos nem alteram o indicador de entrada de uma chamada posterior. O sinal da
operação continua válido após conectar e é abortado ao sair.

O mesmo módulo possui o listener de desconexão e de saída/exclusão da sala atual.
Mensagens de outra sala não encerram a chamada. `runtime.ts` instala esse listener
antes de seus listeners de apresentação, para que eles já vejam participação
encerrada. O controlador conserva somente ganchos de interface, composição da
lista de descarte dos donos existentes; a conexão SFU/P2P pertence a `transport.ts`. Não há outro socket ou
captura, nem cópias de fase, geração ou promessa no controlador.

`transport.ts` possui modo local, modo da sala, inicialização SFU, publicação
inicial e fallback P2P. Prepara ICE/status pelos módulos existentes; uma consulta
inicial sem confirmação tem uma segunda tentativa após 500 ms. Sem configuração,
disponibilidade ou orçamento, pede P2P ao backend. Voz publica primeiro; câmera,
tela e áudio da tela iniciam independentemente, com a recuperação de cada tipo
no dono SFU. O anúncio permanece pendente até o microfone estar pronto.

O listener de `voice-mode` valida modo e sala antes de aplicar a decisão do
backend. Não há fallback baseado no roster nem retorno automático a SFU durante
uma chamada. Pedidos concorrentes de fallback são reunidos por geração: pedem
mudança ao backend uma vez, limpam SFU/recepção localmente e anunciam P2P.
A limpeza não aguarda o provedor e não para trilhas de captura emprestadas.

Sair/trocar a sala real invalida a inicialização e suas esperas. Respostas antigas
não anunciam conexão, recuperam publicações ou sobrescrevem a chamada seguinte.
O módulo usa os donos existentes de sessão, configuração, peers e mídia recebida,
sem mapas de transporte duplicados. `runtime.ts` monta as dependências e mantém
a apresentação dos erros de diagnóstico.

`quality.ts` possui preferências de transmissão, formato/bitrate/conteúdo da tela,
ativação da adaptação e filas por sender para `getParameters`/`setParameters`.
Seu snapshot imutável separa a escolha persistida, o teto de consumo SFU e o perfil
adaptado. P2P ignora o orçamento SFU. `quality-policy.ts` contém os perfis e limiares
anteriores: 12 s de instabilidade, pelo menos 20 s entre reduções, dois níveis e
60 s estáveis por etapa de recuperação. A adaptação não reduz o bitrate do microfone;
áudio de aplicativo conserva 192 kbps. A seleção de camada recebida usa essa mesma
política e respeita maximização quando não há adaptação.

O módulo empresta senders/assinaturas dos donos existentes, sem recapturar, clonar
ou encerrar trilhas. Atualiza bitrate, FPS e escala do encoder; o caminho nativo
da tela e a fonte compartilhada com clipes permanecem nos módulos de captura.
Cada fila lê o perfil/trilha atual ao executar. Sair invalida os ajustes pendentes;
continuar uma atualização após câmera/IPC antigo não atinge a chamada seguinte.
`runtime.ts` conserva controles e mensagens da interface, delegando preferências e
aplicação da qualidade ao módulo. Não possui cópias dessas preferências ou filas.

`diagnostic-report.ts` exporta somente os campos técnicos permitidos, com até 24
linhas de recepção e 12 amostras recentes. Não inclui nomes, IDs, IPs, credenciais,
mensagens ou timestamps internos de participantes. `legacy/call-stability.js` e sua
entrada no manifesto foram removidos.

`roster.ts` possui a lista privada de participantes, a inicialização silenciosa,
a capacidade de eventos do servidor e os listeners de lista, estado legado, avisos,
sinalização, saída e publicações SFU. O snapshot ordenado e os participantes são
imutáveis; `members` é uma visão somente para leitura. `roster-protocol.ts` valida
listas completas antes de substituir o estado: uma lista malformada ou com IDs
repetidos não remove participantes nem fecha conexões saudáveis.

A malha P2P só é iniciada para outro participante que anunciou `p2p`; SFU e seus
estados pendentes não abrem peers P2P. Peers com falha conservam o reinício ICE.
Sair fecha os peers pelo dono existente; a retirada SFU fecha as quatro mídias e
remove apenas as publicações daquele participante. Sons usam eventos explícitos
quando disponíveis e diferenças de lista/estado no protocolo antigo, sem duplicar
avisos. Preferências de volume são restauradas por conta quando necessário.

Navegação informa a sala ao módulo; trocar a sala descarta a lista e os peers
anteriores. Reiniciar a chamada limpa a lista sem esquecer a capacidade do servidor;
desconectar também limpa essa capacidade. Listas/avisos exigem sala correspondente.
Os envelopes atuais de sinalização e os antigos de estado podem omitir `roomId`;
quando presente, uma sala diferente é rejeitada. O módulo não inventa uma geração
remota ausente no protocolo. Sinalização, filas e respostas assíncronas continuam
com as proteções dos donos de peers/sessões. Não há segundo socket ou captura.
`runtime.ts` não mantém outro mapa, flags ou listeners desses eventos; conserva os
adaptadores de navegação, ganho, sons e composição dos snapshots da interface.

`lib/voice/stage.ts` possui apenas preferências de exibição por participante,
colapso de telas remotas, atividade recebida e assinaturas da apresentação. Projeta
os snapshots existentes em participantes, câmeras e telas imutáveis; não cria
streams, tracks, conexões ou capturas. Troca de geração limpa preferências e
operações visuais pendentes. Ganhos usam os donos existentes e deduplicam input/change.
A recuperação considera câmera e tela juntas, para uma câmera saudável não cancelar
a recuperação de uma tela assistida ainda ausente.

`components/voice/call-stage.tsx` renderiza privacidade, lista e estados dos grids.
`participant-card.tsx` possui popover, controles de ganho/exibição, atividade, status
e abertura de perfil por mouse/teclado. Avatares usam o componente React/cliente de
arquivos já compartilhados. O controlador de perfis possui somente a imagem e
variáveis dentro do slot vazio `data-profile-background-slot`; não remove esse nó
React. Respostas antigas de perfil/imagem conservam suas validações de conta/identidade.

`media-tile.tsx` cria um host estável por tipo/participante e usa um portal React
para seus filhos. Docking move o host para o grid ou para um slot vazio do perfil;
o mesmo elemento de vídeo conserva seu srcObject. Tela cheia/maximização impede
movimentação até a saída. Desmontagem pausa/solta a referência do player, sem parar
a trilha emprestada. Prévia, captura, recuperação e idle continuam em seus donos;
`TronoStreamControls` é atualizado e descartado por superfície, sem relógio paralelo.
`media-resize.ts` possui listeners de arraste com descarte por AbortController e
conserva armazenamento/limites do tamanho. Arraste só ocorre fora do hub em janela larga.

`call-stage-runtime.tsx` monta após todos os listeners de `trono:ready`, conservando
os nós observados pelos layouts. Os portais escrevem em containers estáveis;
slots de câmera/tela são vazios para o React, e a movimentação do host é explícita.
`runtime.ts` compõe as fontes/ações e conserva adaptadores públicos e seleção de
camadas SFU. Não possui mais estado de painel/drawer/salas, contadores ou listeners
substituídos. Os layouts e as projeções React usam os mesmos donos tipados.

`lib/voice/navigation.ts` possui abertura/visibilidade do painel, hub, drawer de
texto, silenciamento e não lidas. Conserva somente metadados de voz/texto validados
por `navigation-protocol.ts`; IDs de participação vêm do cliente de rede existente.
Não entra/sai da voz, cria outra lista de mensagens ou toca nas capturas. Atualiza
os donos de sala/roster antes de notificar a apresentação. Texto independente é
preservado ao sair da voz/jogo; eventos de outras salas não substituem seu contexto.
O mapa sem leitores de `gameRoomState` e o timer antigo de limpeza da mesa foram removidos.

`components/navigation/call-navigation.tsx` possui nove botões React: abrir,
minimizar/restaurar, texto, silenciamento, retorno à voz e indicadores. O runtime
monta antes dos layouts; cada botão fica em um host estável com `display: contents`.
As configurações movem o host de Comunicação, conservando seu botão e eventos React.
Os controladores `desktop-shell.js` e `call-workspace.js` foram excluídos; seus handlers não devem ser restaurados.
`navigation-view.ts` é a ponte para classes/visibilidade dos containers que os layouts
legados ainda movem; assina o mesmo estado e possui Escape, breakpoint e foco adiado
do compositor. Fechar, trocar de sala ou descartar cancela o foco. Apenas Ampliar
continua com um botão legado, integrado ao mesmo controlador de mosaico.

`lib/voice/workspace.ts` projeta navegação, layout, cabeçalho por conta e atalhos
para até sete conversas. Consome os donos existentes; não consulta a caixa de
entrada nem duplica mensagens. Eventos do messenger incluem a conta de origem;
a projeção valida o payload, rejeita dados antigos e limpa contatos ao trocar conta.
`workspace-controls.tsx` renderiza título, áreas, botões e contatos em hosts estáveis.
Avatares usam o componente compartilhado; capas ainda usam `profile-files.js`,
restritas a um slot vazio de cada linha React. `workspace-layout.ts` move os mesmos
painéis completos e restaura suas posições ao sair. Só observa a visibilidade
externa do messenger, que ainda é legado; não observa texto renderizado para derivar estado.

`lib/voice/media-layout.ts` ajusta somente as colunas/linhas da grade de telas,
contando tiles diretamente presentes nela. `lib/games/hand-layout.ts` ajusta altura
e sobreposição das cartas no desktop. Os dois usam `lib/layout/observe-layout.ts`
para agrupar medições por frame e liberar observers/frames ao descartar.
`legacy/media-layout.js` e `legacy/call-workspace.js` saíram do manifesto e dos fontes.
Capturas, encoders, players e transporte não pertencem a esses posicionadores.

`lib/voice/media-focus.ts` possui a tela cheia nativa, o fallback por maximização,
Escape, listeners de fullscreen e a operação visual pendente. Fecha o mosaico e
solicita fullscreen no gesto original; só então pede a camada SFU ao dono existente.
Geração/revisão e presença do tile invalidam conclusões antigas: ocultar, remover
ou sair da chamada não pode reabrir o fallback ou promover uma mídia antiga.
A saída devolve a camada e permite ao React restaurar o encaixe do mesmo player.
`stage.ts`, a desmontagem dos tiles e `media-visibility.ts` delegam a liberação
para esse dono; não escrevem outras cópias das classes de foco. O fallback de vídeo
WebKit também remove seu listener de término. Nenhum desses comandos para trilhas.

`lib/voice/floating-panel.ts` possui posição/tamanho persistidos e os listeners de
arraste/redimensionamento do painel flutuante, sem escrever nos seus filhos React.
Consulta a navegação existente; entrar no hub, trocar o breakpoint ou descartar o
controlador cancela o gesto e libera a captura do ponteiro. Valores salvos são
validados e limitados à janela; telas estreitas voltam à geometria do CSS. O botão
Ampliar e a visibilidade do painel ainda se integram à navegação legada.

`components/modals/media-focus-dialog.tsx` possui a grade ampliada em React;
`lib/voice/mosaic.ts` mantém somente abertura e seleção de até seis pessoas.
Assina a projeção de `stage.ts`, sem observer do DOM, listeners de socket ou
novas capturas. Participantes removidos são descartados da seleção; sair ou
substituir a geração da chamada fecha a grade. `borrowed-video.tsx` é compartilhado
com os tiles base: abrir cria apenas players de prévia; fechar/Escape desmonta e
separa `srcObject`, sem parar trilhas. Tela cheia fecha o diálogo nativo no mesmo
evento antes de delegar ao tile original. A ordenação dos tiles base pertence ao
próprio componente. `legacy/media-mosaic.js` foi removido.

`media-dialogs-runtime.tsx` monta depois da preparação dos layouts e instala os
nomes públicos de compatibilidade. O botão Grade é React; o botão Ampliar do
painel flutuante ainda recebe disponibilidade dessa projeção, enquanto sua
navegação permanece no coordenador legado.

`call-audio.ts` possui o contexto compartilhado do microfone, seu listener de estado
e os listeners de gesto/visibilidade que desbloqueiam o áudio. A criação é tardia:
48 kHz, margem solicitada de 40 ms no desktop e `interactive` na web. O contexto
é emprestado ao processador e aos medidores; permanece reutilizável entre chamadas.
`resume`, desbloqueio dos players e dos avisos são chamados sincronamente dentro
do gesto. Retomar em andamento é deduplicado e conclusões antigas não atualizam
players da chamada seguinte. Um contexto substituído perde seu listener.

`call-alerts.ts` possui outro contexto, volume salvo, intervalo de 750 ms por aviso/
participante e osciladores dos sons de entrada, saída, desconexão e mensagem.
Frequências, envelopes, volume padrão de 85% e condições de silêncio foram mantidos;
volume zero de avisos de chamada não silencia o som independente de mensagem.
Ao terminar, os nós são desconectados; uma construção parcial também é descartada.
Roteamento nativo de avisos é serializado e lê a saída atual, sem reabrir capturas.

Ambas as instâncias vivem por página. `dispose` remove listeners, encerra somente
os recursos pertencentes ao módulo e invalida continuações; não deve ser usado
como saída da chamada. Ao desmontar a aplicação, libere a chamada antes do contexto
emprestado pelo processador. Reprodução recebida continua em `audio-playback.ts`,
separada do envio e dos avisos. `runtime.ts` consulta os snapshots e conserva os
adaptadores dos controles, sem contextos, cooldown ou listeners de desbloqueio próprios.

`controls.ts` possui mute/silenciamento, lembrança do mute anterior, ganho,
preferências de supressão/modo leve, dispositivos escolhidos e intenção de abrir
câmera. Não conserva participação, peers, trilhas ou outra cópia das capturas.
As operações usam os donos de microfone/câmera existentes. Mute e silenciamento
não recapturam; voltar a ouvir restaura o mute anterior. Ganho mantém passos de
5% e limite de 300%, com o mesmo validador da reprodução recebida.

Mudanças de processamento são persistidas antes da captura e restauradas em caso
de falha atual. Revisão e geração impedem que uma falha antiga sobrescreva preferências
ou status novos. RNNoise desliga o modo leve; no desktop o modo leve solicita nativo
quando a supressão está ativa. A intenção da câmera pode iniciar a entrada na voz,
mas é invalidada ao sair. Enumeração atrasada não limpa uma seleção mais recente;
lista vazia de câmeras conserva a preferência até existir uma alternativa confirmada.

`components/voice/call-toolbar.tsx` possui os seis controles principais (entrada/saída,
mute, silenciamento, câmera, tela e configurações), seus ícones/textos e o status/
botão de recuperar áudio. `lib/voice/toolbar.ts` projeta participação, intenção,
captura, reprodução e contexto de navegação; possui apenas status visual e assinaturas.
Ações reconsultam a disponibilidade e começam no evento original, preservando a
ativação de mídia. Participação, capturas e preferências não são copiadas para o React.
Abertura/fechamento das configurações vêm do controlador compartilhado, por uma assinatura.

`call-toolbar-runtime.tsx` monta antes de `trono:ready`, quando os posicionadores
registram os locais originais. Cada botão pertence a uma raiz em host estável com
`display: contents`; `control-layout.ts` move esse host entre barra/dock/sidebar,
preservando botão, filhos React e propagação dos eventos. O posicionador não escreve
nos controles convertidos nem os observa para refazer seus ícones. Ele conserva
apenas a decoração do botão legado de soundboard. O CSS do dock usa descendentes
para atravessar os hosts sem criar caixas ou alterar medidas dos botões.

`control-bindings.ts` foi removido. O diálogo de configurações não instala outro
listener no seu botão. O diálogo de opções/confirmação também é React. `runtime.ts`
compõe comandos/snapshots, coordena a classe de participação e publica o evento de
chamada para os layouts, sem pintar os controles. Clipes e soundboard conservam
seus próprios controles/donos; não criar outro estado de mute ou câmera na interface.

`media-interest.ts` possui a seleção de telas assistidas, câmeras ocultas e versões
por participante. O filtro de publicações SFU e os consumidores P2P/recepção consultam
esse mesmo dono. Parar uma tela remove seu áudio e recuperação; SFU fecha somente
tela/áudio de tela. Ocultar câmera altera apenas o vídeo recebido, sem parar a trilha.
Ações pendentes após tela cheia são invalidadas por revisão, geração e intenção nova.
Reset mantém versões monotônicas entre chamadas; desaparecimento da tela limpa a
seleção e invalida assinaturas pendentes, sem tocar na voz.

`media-interest-bindings.ts` foi removido. Os cliques de assistir/ocultar são React.
`media-visibility.ts` conserva apenas a separação do player emprestado e a saída da
tela cheia/maximização antes de ocultar. Procura as telas em todo o painel, incluindo
as encaixadas em perfis, e não para trilhas. Capturas, peers, players de áudio e
assinaturas continuam com seus donos.

`screen-sharing.ts` possui comandos de iniciar/parar/trocar a tela, preferência de
áudio e estado da prévia local. Consulta participação, qualidade, política SFU e
captura existentes; não cria outra trilha ou conexão. Pausar/colapsar a prévia não
interrompe a transmissão. Parar fecha apenas publicações/senders de tela e seu áudio,
preservando voz e câmera. O dono da captura continua em `screen-capture.ts`.

`components/modals/screen-options-dialog.tsx` possui formulário e confirmação
em React, com rascunho em `lib/voice/screen-options.ts`. Abrir/cancelar não persiste
qualidade nem abre capturas; reabrir consulta as preferências do dono. Confirmar
revalida participação, geração e limites SFU, aplica o preset existente, fecha o
diálogo nativo e solicita o picker no mesmo evento, sem espera intermediária.
O aviso de replay fica oculto no desktop por propriedade React; o shell não
escreve no componente. `screen-sharing-bindings.ts` foi removido.
O checkbox das configurações também usa o mesmo dono `screen-sharing.ts`, por
`settings.ts`. Nenhum diálogo cria outro estado persistente de captura ou áudio.

`screen-publication.ts` recebe `ScreenCaptureChange` do dono da captura e coordena
sua publicação em P2P/SFU. Anuncia disponibilidade antes de aguardar transporte,
publica vídeo/áudio separadamente e reutiliza senders/assinaturas ao trocar de fonte.
Reaplica qualidade pelo dono existente; falhas recuperam somente o tipo afetado.
O fim do áudio retira apenas áudio da tela. Geração/validade vêm da captura;
continuações antigas não aplicam qualidade, recuperam ou anunciam uma captura nova.
Não há mapas, trilhas, filas, timers ou conexões próprios nesse adaptador. O fallback
SFU/P2P continua no dono do transporte; ele é reconsultado após a publicação.

`device-publication.ts` coordena publicação/retomada do microfone e publicação/parada
da câmera. Reutiliza senders, filas P2P, qualidade e recuperação SFU existentes;
recebe trilhas emprestadas e não adquire ou encerra dispositivos. Ao trocar microfone,
um peer com falha é recriado pelo seu dono; retomada conserva trilha e sender sem
refazer captura ou qualidade. Falhas SFU de áudio/câmera permanecem independentes.
Resultados obsoletos não recuperam, reconfiguram ou anunciam a chamada posterior.

A reconciliação P2P da câmera reconsulta o snapshot de captura após cada replaceTrack:
um attach/detach atrasado converge na trilha atual. Sair ou retirar o peer encerra
a reconciliação. Parar anuncia a câmera desligada e cancela a intenção pendente sem
aguardar a retirada do transporte. Não há estado, mapa de peers, timers ou captura
paralelos no adaptador. `CameraCaptureChange` descreve seu evento em `types/voice.ts`.

`runtime.ts` conecta os donos tipados. Enumeração, estado de apresentação e ações
dos seletores pertencem a `settings.ts`. Publicação de microfone/câmera pertence
a `device-publication.ts`; tela permanece em `screen-publication.ts`.
Lista, barra e painéis de mídia/diagnóstico são React, com projeções próprias.
Os módulos notificam a composição para anexar áudio, registrar/remover proteção
do receiver, pedir fallback ou atualizar projeções. Não há cópias de estado ou
listeners de negociação. Os campos das configurações são descritos abaixo.
O backend SFU permanece em `server/realtime-sfu.js`; seu protocolo não foi alterado.

`components/files/image-viewer.tsx` mantém um único visualizador React para anexos
do chat e dos consumidores legados. Trocar de conta ou excluir o arquivo invalida
a imagem aberta; URLs atrasadas não reabrem seleções anteriores.

O catálogo de GIFs usa GIPHY com configuração autenticada pelo backend e importação
por link quando a chave pública do cliente está ausente. A validação de créditos
continua aceitando Wikimedia para conservar os perfis existentes.

## Configurações compartilhadas

`lib/settings/controller.ts` possui um único snapshot de abertura/aba, valida os
assuntos disponíveis por plataforma e persiste a seleção. `TronoCallSettings` é
seu adaptador de navegação; `TronoDesktopSettings` conserva a API dos chamadores
anteriores. Nenhum deles mantém outro estado ou captura mídia.

`components/modals/call-settings.tsx` renderiza cabeçalho, abas, painéis, conta e
permissões em React, usando `useSyncExternalStore`. Possui abertura/fechamento,
teclado, foco das abas, eventos do diálogo e observers de dimensionamento, com
limpeza dos listeners/observers. O diálogo nativo preserva backdrop e Escape.
`settings-activity-fields.tsx` renderiza opt-in, aplicativo e nome de atividade
usando `lib/desktop/activity.ts`. O rascunho do nome é confirmado ao sair do campo;
eventos nativos não o substituem durante a edição. A lista aberta conserva suas
opções até perder o foco. IDs e preferência por aparelho foram preservados.

`activity.ts` possui configuração, projeção e publicação de nomes; snapshots nativos
são validados e descartam caminhos, PIDs e campos extras. O envio usa o socket
existente após autenticação e suporte anunciado. Eventos periódicos continuam
renovando a presença; não há um temporizador paralelo. O fallback local de A Lei
do Trono depende do estado e da tela visível e não substitui uma seleção manual.
`activity-runtime.ts` adapta IPC, identidade e observação da tela do jogo.

Configurações nativas são serializadas e mudanças pendentes usam a intenção mais
recente. Eventos novos vencem leitura/respostas antigas; troca de conta invalida
autenticação e trabalho anterior. Sair limpa a presença e configura a detecção
desligada. O descarte remove assinaturas/observer e agenda o opt-out após um
pedido já em andamento. Detecção e processo auxiliar continuam em
`electron/activity.cjs`; `legacy/desktop-activity.js` foi removido.

`call-settings-runtime.tsx` monta uma raiz React no painel existente. Antes dela,
os controladores de perfil/jogos preparam os corpos que ainda possuem. O bootstrap
registra essa montagem depois do shell desktop e antes de atividade/notificações;
ela executa nessa ordem em `trono:ready`. Não antecipar a transferência de perfil
para antes da preparação de `profile-files.js` ao alterar essa sequência.

`components/voice/settings-fields.tsx` renderiza os campos de microfone, câmera,
saída, ganhos de voz, supressão/modo leve, perfil, formato/bitrate/conteúdo da tela
e áudio compartilhado. Esses campos têm valores, disponibilidade e eventos React;
não recebem mais listeners ou pintura dos controladores DOM. IDs e classes usadas
pelos layouts/testes foram preservados. Captura e encoders continuam nos seus donos.

`lib/voice/settings.ts` projeta snapshots dos donos de controles, captura, reprodução,
qualidade e compartilhamento para `useSyncExternalStore`. Preferências permanecem
nesses donos; a projeção não abre dispositivos ou sockets. O módulo possui somente
catálogo de dispositivos e assinaturas da interface, com uma escuta `devicechange`.
Resultados antigos de enumeração são descartados; reconciliação recebe as escolhas
observadas no começo do pedido. Uma saída escolhida depois do pedido não é substituída
pelo fallback daquele resultado. Falha de enumeração conserva o catálogo confirmado.

Ações começam no evento original e atualizam a projeção antes de esperas. Ganhos
iguais são deduplicados para os eventos input/change nativos. Pedidos de qualidade
aplicam os encoders existentes, com revisão/geração para não anunciar a chamada
anterior; bitrate enviado ao SFU respeita o teto do dono de qualidade. O descarte
remove a escuta e invalida continuações sem encerrar mídia emprestada.

`components/voice/audio-preferences.tsx` completa a aba Áudio em React: efeitos,
faixa/volume/status da música, volume/prévia dos avisos e proteção da voz recebida.
`lib/voice/audio-preferences.ts` projeta os donos de áudio, avisos e telemetria;
possui somente assinaturas de interface, sem abrir players ou contextos. Comandos
começam no gesto original; input/change iguais aplicam volume uma vez. O descarte
remove listeners e ignora continuações sem fechar os recursos emprestados.

O player compartilhado com portal/jogos continua em `legacy/audio.js`. Expõe o
status por getter e evento `trono-music-playback`, além de `trono-music-volume`,
`trono-music-track` e `trono-audio-state`. Alterações feitas em outras telas chegam
à projeção; o player não escreve mais nos campos React. `call-alerts.ts` mantém
volume, síntese e contexto dos avisos; `telemetry.ts` mantém proteção/prioridade.
`runtime.ts` somente compõe esses donos e avisa a projeção quando a telemetria muda.

`components/voice/diagnostics.tsx` renderiza a aba Conexão, o indicador do cabeçalho,
o botão desktop e o painel de diagnóstico. O estado de abertura/cópia é único em
`lib/voice/connection-diagnostics.ts`; avaliação de saúde, reprodução, consumo e
formatação estão em `diagnostics-presentation.ts`. São projeções dos donos de
telemetria, qualidade, reprodução, transporte e configuração Realtime, sem coleta,
sockets ou contextos adicionais. Os detalhes visuais permanecem estáveis quando o
painel está fechado ou sem foco; o coletor mantém seus intervalos atuais.

`diagnostics-runtime.tsx` monta as raízes depois que o shell desktop move os hosts
vazios. O shell move o host `voiceDiagnosticsLauncher`, sem escrever no botão React;
`control-layout.ts` usa esse mesmo host como referência para posicionar Pessoas.
Não usar o botão interno como referência de inserção no pai externo. O evento
`trono-telemetry-change` e `TronoSocial.toggleTelemetry` continuam delegando ao dono
compartilhado para os consumidores legados. Escape conserva a prioridade de mídia,
diagnóstico, chat e configurações no coordenador.

Adaptar vídeo configura/aplica o dono de qualidade existente. A cópia coleta uma
amostra antes de chamar o relatório sanitizado, usando IPC desktop ou clipboard web.
Cliques durante uma cópia são deduplicados; troca de geração ou descarte invalida
continuações, impedindo que a chamada anterior copie após uma coleta atrasada ou
altere o resultado da chamada seguinte. Nomes das linhas de recepção são somente
texto local do painel e não entram no relatório. `runtime.ts` conserva a composição
dos dados do relatório, sem pintura, flags ou listeners paralelos do diagnóstico.

Perfil e jogo continuam em slots vazios (`ContentSlot`), preservando
identidade e listeners dos nós. Arquivos e aparência são React em hosts estáveis;
mover os hosts conserva os controles e os rádios de tema/layout. Os campos de
notificações e atividade são filhos React das abas compartilhadas. Os conteúdos
restantes de perfil e jogos ainda serão convertidos por domínio.

`lib/profiles/appearance.ts` possui tema por conta/convidado, catálogo das dez cores
e feedback compartilhado com a restauração de painéis. `appearance-fields.tsx`
renderiza rádios, reset e status; não há outro escritor de `appearanceMessage`.
`lib/layout/panel-preferences.ts` limpa somente as oito dimensões inline do resizer
retirado e a chave `mnPanelLayout:<conta atual ou guest>`. Outras preferências,
variáveis e valores das folhas de estilo permanecem. Tamanhos antigos não são
mais reidratados; não há controles visíveis que permitam ajustá-los no layout atual.
`legacy/panel-layout.js` e `legacy/appearance.js` foram excluídos, assim como os dez
handles ocultos, seus listeners de ponteiro/teclado e CSS exclusivo. O resize do
painel flutuante e dos players é independente e permanece nos donos tipados.

`legacy/desktop-settings.js` foi removido do manifesto e do fonte. `runtime.ts` não
possui mais flags, seleção ou pintura das abas, nem os listeners de abrir/fechar.
Seus métodos públicos delegam ao dono tipado; a prioridade global do Escape ainda
fecha mídia/chat/diagnóstico antes das configurações web. A aba Meus arquivos agora
é aceita pelo validador, sem cair silenciosamente em Áudio.

## Backend

Express e `ws` preservam o protocolo atual. Trocar esse transporte durante a
migração da interface ampliaria o risco sem resolver o acoplamento.

`app.ts` expõe `createApplication()` e `close()`. Cada criação possui canais,
sockets e serviços próprios. Importar o módulo não inicia um servidor nem
registra sinais. `index.ts` valida porta/host e trata o processo.
`runtime.cjs` contém composição e regras de A Lei do Trono ainda por extrair.
Os serviços existentes foram movidos para `server/` e formatados.

`sessions.ts` mantém tickets opacos, aleatórios e guardados no servidor:
12 horas, limite de 500 identidades e validação de apelido. Não são JWTs ou
perfis assinados enviados pelo cliente. A organização não muda esse protocolo.

`ice.ts` solicita credenciais TURN temporárias, mantém cache por instância e
aplica timeout. A autorização continua no gerenciador SFU, antes de consultar
o provedor. Tokens de infraestrutura nunca entram no bundle Next.

Os jogos ainda compartilham regras CommonJS em `src/legacy/`. Mover essas regras
para um módulo compartilhado testável é uma próxima etapa. Supabase/RLS e o
armazenamento de arquivos foram preservados.

## Electron

`electron/` contém main, preload, permissões, preferências, atualizações e
captura. O renderer mantém isolamento de contexto e acesso nativo pelo preload.
O instalador carrega `resources/renderer`; o modo compilado local carrega `out/`.
A política de scripts calcula hashes dos bootstraps do HTML instalado, sem
liberar scripts inline arbitrários.

No Windows, os switches de backgrounding preservam o agendamento do renderer
quando coberto/minimizado. O contexto de envio solicita uma margem de 40 ms no
desktop; isso não é uma medição de latência final. O teste de segundo plano mede
PCM recebido em outro cliente com janelas Windows reais, sem simular visibility.

As regressões nativas importam as fábricas necessárias por
`tests/voice-test-modules.cjs`, compiladas em Node e instaladas somente na página
do teste. Esse helper não é publicado no renderer nem altera sua política de
conteúdo. O teste de layout também verifica a identidade das fachadas da chamada
e a ausência do registro global antigo.

O modo Next de desenvolvimento é explícito, aceita loopback e não funciona em
builds empacotados. Permite atualização de componentes ao salvar.

## Documentação e arquivos

README é o ponto de entrada. Desenvolvimento descreve execução; este documento
registra decisões; MIGRACAO registra pendências. `docs/archive/` conserva as duas
notas usadas na distribuição, instruções do bridge Windows e originais de arte.
Documentos substituídos e capturas antigas podem ser recuperados pelo histórico Git.
Licenças, créditos, modelos de áudio, SQL e recursos de jogos foram mantidos.
Arquivos gerados ficam fora do Git.
