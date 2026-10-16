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
P2P valida SDP, ICE e comandos em `lib/voice/peer-protocol.ts`. Payloads de jogos
e operações SFU ainda são opacos e serão convertidos com seus consumidores;
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
O callback legado ainda escolhe a renegociação P2P ou o retry SFU, com a tolerância
anterior de 8 s para assinaturas em início de recepção.

`social.js` conserva coordenação da chamada, seleção ICE/TURN e de transporte,
negociação SFU, regras de qualidade, players/ganhos, métricas de recepção, contextos
de áudio e interface. O módulo de recepção notifica esse controlador quando deve
anexar áudio, registrar/remover proteção do receiver ou renderizar. A voz ainda
não foi toda convertida; streams, listeners e timers de recepção não estão duplicados.

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
