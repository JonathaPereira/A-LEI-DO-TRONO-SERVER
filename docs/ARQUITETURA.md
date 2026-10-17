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
respostas antigas não reaparecem em uma linha reutilizada. A contagem
de não lidas e os sons continuam em `legacy/social.js`, pelo evento `onChatActivity`.
Esse controlador não escreve mais na lista, no compositor ou no diálogo de moderação.
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
silenciamento e não lidas. `legacy/notifications.js` ainda possui os contadores,
preferências e avisos; publica mudanças e expõe `getChannelState()` sem escrever
nos botões React. `legacy/community.js` mantém apenas os ícones das mesas de jogo.
`lib/profiles/icons.ts` contém os desenhos e o catálogo único de avatares.
`avatar.ts` conserva `avatarHtml`/`hydrate` para perfis e jogos não convertidos;
as imagens antigas são invalidadas ao trocar de conta ou excluir um arquivo.
O componente React usa o mesmo catálogo e cliente de arquivos, sem hosts de
renderização imperativa no chat ou nos canais. `legacy/avatar-icons.js` foi removido.

A navegação do hub e a troca de chamada continuam em `legacy/game.js` e
`legacy/social.js`. Os cliques React delegam a esse fluxo, que consulta o catálogo
tipado; ele não conserva outra lista nem listeners DOM de seleção de canais.
O gerenciamento de canais e seus diálogos permanecem em `legacy/community-admin.js`.

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
edição/visualização de perfis e galeria, mas perdeu transporte, cache e renderizadores.

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

`legacy/social.js` cria uma instância pelas fábricas de compatibilidade instaladas
pelo Next. Conserva preferências e intenção dos controles; delega aquisição, mute,
ganho e encerramento físico ao módulo. Seu callback publica a nova trilha nos peers
ou SFU, verificando se o pedido continua válido entre operações assíncronas.

`screen-capture.ts` possui a fonte de tela e seu clone de saída, os listeners de
encerramento e o descarte de capturas atuais, atrasadas e em substituição. O pedido
de captura considera a maior resolução/FPS entre chamada e replay; o módulo não
aplica constraints às trilhas clonadas, pois compartilham a fonte com os clipes.
O cancelamento do seletor conserva a fonte anterior. Sua liberação após uma troca
aguarda a publicação, mas sair da chamada descarta também as fontes em retirada.
O acesso ao par fonte/saída é emprestado; consumidores não devem encerrar suas trilhas.

`social.js` deriva o estado de compartilhamento desse módulo, sem outra cópia de
streams, geração ou listeners. Continua publicando as trilhas em P2P/SFU e avisando
o controlador de clipes sobre a fonte original.

`camera.ts` possui captura, qualidade do dispositivo, listener de encerramento,
pedido pendente e descarte da câmera. O snapshot imutável contém uma referência
emprestada à fonte/trilha. O módulo adiciona e remove somente sua trilha no stream
AV da chamada; não encerra microfone ou tela. Uma troca libera a webcam anterior
antes de abrir outra, pois alguns dispositivos aceitam apenas uma captura.
O fallback relaxa qualidade mantendo o dispositivo escolhido; só passa à câmera
padrão após confirmar que a entrada salva não existe mais.

Parar ou sair invalida a geração do pedido sem aguardar permissão/publicação.
Uma captura atrasada é encerrada; callbacks antigos não limpam o estado de um
pedido posterior. `social.js` deriva `cameraOn` do snapshot, conserva preferências
e intenção do botão e anuncia disponibilidade antes de aguardar publicação.
Seu callback de parada anuncia e inicia o desligamento dos senders imediatamente.
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

`social.js` adapta seleção de trilha, preferências persistidas e controles ao
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
nova. Falhar na construção também desconecta os nós parciais. `social.js` recebe
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
A consulta não possui capturas, peers ou outro socket. `social.js` conserva a pintura
na tela e aplicação da política aos controles, sem cache/listener/timer paralelos.

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
Mensagens de outra sala não encerram a chamada. `social.js` instala esse listener
antes de seus listeners de apresentação, para que eles já vejam participação
encerrada. O controlador conserva somente ganchos de interface, composição da
lista de descarte dos donos existentes e conexão SFU/P2P. Não há outro socket ou
captura, nem cópias de fase, geração ou promessa no controlador.

`social.js` conserva escolha e fallback do
transporte, aplicação dos limites à mídia, regras de qualidade/adaptação,
contextos do microfone/avisos e interface. Os módulos notificam esse
controlador para anexar
áudio, registrar/remover proteção do receiver, pedir fallback ou renderizar.
A voz ainda não foi toda convertida; não há cópias de estado/listeners de negociação.
O backend SFU permanece em `server/realtime-sfu.js`; seu protocolo não foi alterado.

`components/files/image-viewer.tsx` mantém um único visualizador React para anexos
do chat e dos consumidores legados. Trocar de conta ou excluir o arquivo invalida
a imagem aberta; URLs atrasadas não reabrem seleções anteriores.

O catálogo de GIFs usa GIPHY com configuração autenticada pelo backend e importação
por link quando a chave pública do cliente está ausente. A validação de créditos
continua aceitando Wikimedia para conservar os perfis existentes.

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

O modo Next de desenvolvimento é explícito, aceita loopback e não funciona em
builds empacotados. Permite atualização de componentes ao salvar.

## Documentação e arquivos

README é o ponto de entrada. Desenvolvimento descreve execução; este documento
registra decisões; MIGRACAO registra pendências. `docs/archive/` conserva as duas
notas usadas na distribuição, instruções do bridge Windows e originais de arte.
Documentos substituídos e capturas antigas podem ser recuperados pelo histórico Git.
Licenças, créditos, modelos de áudio, SQL e recursos de jogos foram mantidos.
Arquivos gerados ficam fora do Git.
