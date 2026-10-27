# Arquitetura e responsabilidades

Este documento registra os donos e contratos vigentes. Produto e referência
visual ficam em [UX_COMUNICACAO.md](UX_COMUNICACAO.md), operação em
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md) e disponibilidade da
reconstrução em [MIGRACAO.md](MIGRACAO.md). Detalhes históricos ficam no Git.

## Composição da aplicação

Next App Router, React e TypeScript estrito exportam a mesma interface estática
para web e Electron. Não há API Routes ou Server Actions: HTTP, contas,
persistência e WebSocket pertencem ao backend Express existente.

`src/components/application.tsx` compõe o shell, a superfície permanente dos
jogos, o visualizador de anexos e a inicialização. `src/app/application-runtime.tsx`
instala os donos uma vez por página, fora da fase de commit, e emite
`trono:ready` depois de preparar suas dependências. A ordem de inicialização
deve conservar conta/rede/arquivos antes dos consumidores.

`src/components/application/` apresenta autenticação, navegação, comunicação e
catálogo novos. `services.ts` publica disponibilidade das fachadas, sem outro
estado de domínio. React observa os snapshots imutáveis por
`getSnapshot`/`subscribe`; assinaturas de apresentação terminam na desmontagem.
Comandos continuam nos donos existentes. `Trono*` são adaptadores desses donos.

A interface externa usa CSS Modules e Phosphor Icons. `src/styles/index.css`
carrega somente a cascata preservada dos jogos, delimitada por
`@scope (#gameSurface)`. Estado visual necessário do body é projetado nesse
escopo. Tokens do shell não dependem da cascata antiga.

A superfície dos jogos permanece montada durante a navegação. Telas podem ser
ocultadas; prompts e efeitos pertencem ao mesmo escopo, inclusive hosts criados
dinamicamente. Trocar tela não recria socket, partida, captura ou player.

O shell mantém um único painel de membros fora da navegação chamada/conversa.
O desktop reserva uma coluna e as telas menores usam uma lateral sobreposta.
Visibilidade é estado local de apresentação, aberta por padrão e restaurada ao
trocar de identidade; os dados vêm somente de `TronoCommunity`. Grupos online e
offline conservam o escopo autorizado do snapshot, inclusive para convidados.
Avatares de DMs reutilizam `Avatar`/`useFileUrl`, observando a conta atual para
mensagens próprias e o contato para as recebidas, sem outro cache ou transporte.
A apresentação da chamada está reintegrada no Marco 2, aprovado em 25/10/2026.
Os recursos avançados do Marco 3 usam os mesmos donos na composição nova. Consulte o checkpoint
da migração para disponibilidade e evidências; fonte existente não comprova QA.

## Navegação, conta e comunicação

| Dono em src/lib                    | Responsabilidade                                                       |
| ---------------------------------- | ---------------------------------------------------------------------- |
| auth/session.ts e auth/forms.ts    | Sessão/restauração, conta/convidado e estados dos formulários.         |
| auth/callback-boot.ts              | Entrada de callback gerada em /auth-boot.js antes da hidratação.       |
| navigation/portal.ts               | Identidade exibida, disponibilidade de nome e tela/intenção principal. |
| navigation/community-navigation.ts | Entrada na comunidade, seleção de texto e troca explícita de voz.      |
| games/library.ts                   | Encaminhamento do catálogo aos controladores dos jogos.                |
| socket/transport.ts                | Uma conexão, correlação, deadlines e fila de autenticação.             |
| socket/client.ts e socket/state.ts | Comandos de rede e participação independente em texto/voz/jogo.        |
| channels/catalog.ts                | Catálogo confirmado, seleção, presença e metadados dos canais.         |
| community/controller.ts            | Presença e diretório da comunidade.                                    |
| chat/composer.ts                   | Rascunho, anexo, progresso, envio e cancelamento de upload.            |
| chat/messages.ts                   | Histórico, paginação, revisão e confirmação de moderação.              |
| messenger/controller.ts            | Amizades, conversa privada, histórico, rascunho e convites.            |
| messenger/client.ts                | Transporte HTTP social autenticado.                                    |
| notifications/controller.ts        | Não lidas, deduplicação, preferências e entrega de avisos.             |
| files/client.ts                    | Uploads e links compartilhados por chat, DM, perfis e soundboard.      |

Após autenticação, o portal abre comunicação. Abrir texto usa a entrada
`textOnly` e não seleciona uma chamada. Retornar ao Trono consulta a partida e
retoma setup, lobby ou mesa existentes. Tela aberta, destino do compositor e
participação em voz/jogo são estados distintos.

Trocar conta/canal incrementa a geração relevante, cancela trabalho pendente e
impede respostas antigas de publicar dados no escopo novo. O cache de arquivos é
por conta, deduplica pedidos e invalida links expirados/excluídos. Histórico não
restaura mensagens apagadas ao receber uma página antiga. Paginação preserva a
posição de leitura. Permissões exibidas não substituem autorização do servidor.

Protocolos recebem dados desconhecidos, validam páginas completas, identidade,
revisão e campos necessários antes de publicar snapshots. O transporte valida o
envelope; cada domínio valida o conteúdo. Não enviar dados privados por
projeções públicas ou confiar em metadados editáveis para privilégios.

## Jogos preservados

`src/components/games/` contém hosts e apresentações;
`src/lib/games/` contém regras, controladores, protocolos e coordenação;
`src/styles/games/` contém os estilos próprios e dependências compartilhadas
extraídas. Efeitos, tooltips, áudio e comunicação usados nas partidas também
permanecem protegidos, mesmo quando seus módulos estão fora dessas pastas.

A Lei do Trono separa lobby, partida online, motor local, escolhas, mão, mesa,
assentos, histórico, revelações privadas, efeitos, controles e navegação.
`throne-rules.ts` e o planejador de leis são compartilhados com o servidor.
Cada controlador expõe comandos/snapshots; fachadas não duplicam estado. Somente
o participante autorizado vê mãos/revelações privadas. Uma substituição de
estado não descarta uma revelação já enfileirada.

Azul, Splendor, Love Letter e Ticket to Ride mantêm motores puros compartilhados,
controle cliente e serviços autoritativos por jogo. Comandos verificam revisão,
ator, turno e jogada; projeções por espectador escondem cartas e escolhas privadas.
Reconexão atualiza presença sem repetir jogadas ou resultados. Persistência de
ranking usa identidade idempotente da partida e resultados calculados pelo motor.

Love Letter mantém o estado autoritativo recebido em `room` e uma projeção temporal
em `displayState`. O controlador enfileira anúncios e resultados de revisões
consecutivas; React só apresenta esses snapshots. O Guarda anuncia ator, alvo e
palpite por dois segundos antes de mostrar eliminação, placar ou encerramento da
rodada. Presença não repete efeitos; desconexão, troca de conta/mesa, navegação e
descarte cancelam a fila. As animações usam somente a projeção pública do jogador;
trocas e comparações não revelam as mãos, e o Padre conserva sua revelação privada.

Ticket to Ride usa `ticket-to-ride-track-layout.ts` como calibração da arte:
309 centros, tangentes e comprimentos dos espaços impressos, separados por via.
O SVG normaliza a inclinação e o enquadramento das peças antes de aplicar a rotação
do trilho. Cliques e vagões usam a mesma geometria; cidades, regras e pagamentos
continuam no grafo autoritativo, independente da imagem.

Cinzas do Abismo conserva o aplicativo em `public/roguelite/`, sua persistência,
assets, áudio e ponte de integração. Nexus conserva a integração com
`electron/nexus.cjs`; a configuração pública única fica em `electron/nexus-config.cjs`
e é importada também pelo frontend. O Windows abre o jogo
na sessão isolada do jogo; o site mantém o iframe sob demanda. URLs públicas, manuais, cartas, mapas, fontes, sons,
licenças e créditos não são saídas descartáveis do build.

## Voz, captura e recursos avançados

`src/lib/voice/runtime.ts` integra os donos existentes. Microfone,
processamento de ruído, peers/P2P, SFU, reprodução, compartilhamento, qualidade e
áudio por aplicativo mantêm suas responsabilidades. `microphone.ts` possui
dispositivo/track; `application-audio.ts` possui grafos e jobs de áudio por
aplicativo; `noise-processors.ts` carrega os processadores locais.
Protocolos P2P/SFU validam SDP, ICE, respostas e catálogos antes de negociar.

`voice/navigation.ts` possui apresentação/rota da chamada e atividade de texto.
`voice/stage.ts` projeta grade/foco e preferências de exibição por participante.
`voice/stream-controls.ts` controla cada transmissão. Projetores de configurações
delegam aos donos de captura/reprodução; não abrem outra mídia.

O foco manual pertence ao stage por par participante/tipo (pessoa ou tela).
Abrir chat/chamada pertence à navegação; isso não entra nem sai da voz.
O shell mantém uma única conversa/compositor e a superfície da chamada montados.
Os cartões reservam slots; o mesmo MediaTile transfere seu contêiner entre esses
slots e os hosts do Trono, conservando o BorrowedVideo e sua stream. O evento
local trono:call-hosts apenas avisa que os slots estão disponíveis.
Os artigos dos cartões também são permanentes: portais conservam seu conteúdo
quando o host muda entre grade, quadro em foco e faixa de miniaturas. moveBefore
preserva o estado DOM onde disponível; o fallback restaura o foco de teclado.
A seleção chama os comandos existentes de interesse/foco no gesto original.

settings/initialize.ts prepara o controlador antes da voz, sem montar a view
antiga nem adquirir dispositivos. media-settings.tsx apresenta os controles dos
donos existentes em CSS Modules. O seletor desktop conserva o único wrapper
getDisplayMedia e a ponte nativa; somente sua apresentação foi reconstruída.
Escape fecha primeiro o menu/diálogo ou a tela cheia; outro Escape pode retornar
à grade. O dono media-focus também encerra explicitamente fullscreen nativo.

Há um dono por recurso. Consumidores emprestados não param tracks ou fecham
contextos. Saída, cancelamento e troca de identidade invalidam operações antigas;
uma captura que termina atrasada é descartada pelo dono. A tentativa de chamada
guarda sua própria identidade de sala, mesmo que a navegação já tenha mudado.
Navegar conserva a chamada; entrar/trocar/sair da voz são ações explícitas.

`settings/controller.ts` possui abertura/aba de configurações. Perfis usam
`profiles/client.ts` para consultas e donos separados para viewer, editor,
busca de GIF e contas registradas. Biblioteca de arquivos e soundboard reutilizam
o cliente de arquivos. O editor possui rascunho, mídia pendente e salvar/descartar.

`clips/store.ts` mantém IndexedDB trono-local-clips v1, lojas clips/settings
e índice owner. Não recriar ou limpar registros ao reconstruir a apresentação.
Preferências conservam tronoClips:<owner> v2; `preferences/personal.ts` conserva
mn-personal:<id>. Troca de conta limpa a projeção e invalida trabalhos anteriores.

Gravação manual e replay possuem seus próprios recursos; bibliotecas e janelas
flutuantes emprestam comandos/streams. A gravação só confirma no commit da
persistência. Não criar recorder, buffer ou captura adicional ao navegar. Troca de conta ou saída de convidado cancela seleção, encoder ativo e persistência ainda não confirmada da gravação, sem encerrar o microfone emprestado da chamada. O sinal de cancelamento atravessa o salvamento: após cada operação de pasta/arquivo a identidade é revalidada; um writable aberto é abortado e o fallback de download é suprimido. Um arquivo já confirmado não é apagado.
Remote PC conserva transporte, autorização de controle e ponte nativa existentes.

desktop/window.ts possui a assinatura nativa da janela e deduplica fullscreen
pendente. O botão da Corte delega a esse dono; F11/menu atualizam o mesmo
snapshot. Sua inicialização independe do shell. desktop/update-runtime.tsx
prepara o controlador de atualização sem montar views. Aplicativo apresenta
buscar/status; o aviso oferece reinício somente após prontidão e ação explícita.

application/notices.tsx observa os donos de mensagens/comunidade. Expiração,
pausa, mute, unread e isolamento permanecem nos donos. Visibilidade de canal usa
o compositor atual e seu destino: aviso atrasado do canal em foco não adiciona
unread. Moderação compartilha controller entre chat e jogo; somente a superfície
ativa abre o diálogo. Emoji respeita Escape de modal/popover sobreposto.

## Backend e persistência

`server/app.ts` compõe serviços isolados por aplicação; `server/index.ts` é
a entrada operacional. Express e ws mantêm os contratos HTTP/WebSocket atuais.
`server/http-api.ts` centraliza origem, CORS, autenticação, JSON limitado e
erros públicos. Contextos de conta/credenciais permanecem privados por request.

Serviços de canais coordenam participação em texto/voz/jogo. Chat possui buffer,
revisões, limites e histórico; persistência e moderação compartilham a fila por
sala. Broadcast ocorre depois da confirmação da persistência. Social publica
mensagens privadas somente para as duas contas participantes. Operações revalidam
socket, sala e identidade depois de IO. Mutação já aceita termina no escopo do
serviço; stop cancela pendências e impede publicação tardia.

Serviços de arquivos, storage e upload validam reserva, confirmação, quota e
autorização. Anexos privados exigem autorização explícita; object_key não é
público. Excluir confirma remoção do objeto antes de liberar quota/notificar.
PUT não confirmado conserva reserva pendente até a limpeza confirmada.
Adaptadores privilegiados não enviam segredos ao renderer.

Regras/validações compartilhadas em src continuam protegidas mesmo quando
importadas pelo servidor. Não alterar contratos, armazenamento ou autorização
como efeito colateral da reconstrução. Nenhuma migração de banco está prevista.
SQL de instalação e contratos operacionais existentes permanecem em suas fontes.

## Electron e distribuição

Main/preload possuem permissões, captura, áudio nativo, atalhos, atualizações e
integrações do SO. O renderer usa a ponte com isolamento de contexto.
O pacote carrega resources/renderer; desenvolvimento compilado usa out.
A política de scripts confere hashes dos bootstraps instalados.

O metadado mn-desktop-version vem de electron/package.json; download e pacote
devem corresponder. A instalação mantém com.jonatha.mn.trono; desenvolvimento
usa com.jonatha.mn.trono.development e perfil separado. Desenvolvimento não
instala nem atualiza automaticamente o produto distribuído.

Capacidades ausentes devem aparecer como indisponíveis. Fixtures de mídia/IPC
não comprovam hardware, segundo plano, captura ou instalação reais.
Contratos de distribuição estão em [ATUALIZACOES.md](ATUALIZACOES.md) e no guia
de desenvolvimento. Instalação, commit, publicação e deploy obedecem à autorização
do usuário; são operações separadas da implementação local.

## Composição dos recursos do Marco 3

`profiles/initialize.ts` prepara editor, GIFs, contas, aparência e biblioteca
uma vez sobre a sessão e os clientes existentes. `application/profile-settings`
apresenta esses donos; não cria outra sessão. Fechar configurações descarta o
rascunho e invalida o seletor de GIF; trocar abas conserva os mesmos campos.
Os diálogos aninhados usam modalidade nativa e fecham seu próprio controlador.

`application/resources.tsx` mantém os hosts de soundboard, clipes, Remote PC e
avisos de gravação montados. Depois da publicação dos serviços, prepara os
consumidores uma vez. Gravação, clipes e Remote PC ficam permanentemente
montados na aba Recursos das configurações, mesmo quando ela está fechada.
Nos jogos, um acesso abre essa aba. Não há transferência de DOM entre sidebar
e jogos. Sair de uma tela não encerra captura.
Gravação possui sua captura; replay toma emprestada a transmissão e possui seus
clones. O Electron conserva a suspensão de replay definida na ponte nativa.

`channels/management-runtime` permite preparar os donos sem montar a antiga
apresentação. `application/community-settings` apresenta canais, cargos e anexos
usando os mesmos comandos e diálogos. Permissões vêm dos snapshots de conta;
autoridade final permanece no servidor. Não há novo endpoint ou migração.

`application/quick-panel.tsx` possui apenas ancoragem, hover e descarte do popover.
`quick-audio.tsx` usa o mesmo VoiceSettings; os dois acessos não criam captura,
AudioContext ou transporte. Os dois gatilhos do soundboard delegam ao mesmo dono;
hover usa diálogo não modal sem mover foco. A aba Recursos preserva um único host de gravação. A tela de entrada espera Auth.ready e
projeta a identidade atual, sem alterar o contrato de restauração da sessão.

GIFs e soundboard possuem CSS próprio, sem a grade e os cartões do antigo dock.
A galeria de GIFs rola entre cabeçalho/rodapé fixos. No soundboard, só a biblioteca
rola; abrir o editor troca a região rolável pela edição, sem recriar seus campos.
Hover usa painel não modal; abrir pelos Recursos usa um diálogo modal aninhado
para continuar interativo sobre configurações. Busca e compactação pertencem à
apresentação; reprodução, arquivo e autorização continuam nos donos existentes.

A apresentação Corte reutiliza ParticipantBackground/DirectProfileBanner e o
cache compartilhado de profiles/decorations para fundos da chamada e capas
laterais. URLs continuam no cliente de arquivos, vinculadas à época da conta;
nenhum novo dono de rede ou mídia. O roster privado fornece accountId para os
participantes da voz; IDs públicos sem correspondência não são convertidos por
nome. Decoração fica atrás dos controles e de qualquer vídeo emprestado.

MemberCard possui estilos locais e variantes card/full; o editor e o viewer usam
a mesma apresentação dos dados. O editor mantém campos/prévia em painéis irmãos,
rodapé separado e alternância de apresentação em janelas estreitas, sem outro
rascunho/controlador. Modais atuais externos aos jogos declaram closedby=any:
o navegador encaminha clique externo ao cancelamento nativo já tratado pelos
donos, conservando bloqueios, descarte e a ordem dos modais. Não há listener
global novo para forçar fechamento nem alteração dos prompts protegidos dos jogos.


Atalaia tem o projeto original em `games/atalaia`; `scripts/build-atalaia.cjs`
exporta o jogo com o toolchain fixado por `scripts/prepare-godot.cjs`.
`src/lib/games/atalaia.ts` possui apenas estado/comandos de abertura, e a tela
React apresenta seu snapshot. O catálogo delega ao mesmo dono. No navegador,
uma aba própria preserva o armazenamento do jogo sem depender de permissões de
terceiros. O Electron reutiliza o lançador isolado de `electron/nexus.cjs`, com
partição, origem, título e confirmação exclusivos; somente Atalaia permite os
CSVs de relatório. URLs públicas ficam em `electron/atalaia-config.cjs`.
Os bytes Godot ficam em um pacote próprio da entrega e em `atalaia-mn.surge.sh`,
separados do site principal/EXE. A publicação confere hash, commit e versão dos
dois pacotes; falha no jogo impede a atualização do catálogo. Nenhum recurso de
chamada, conta ou socket pertence ao jogo.

No projeto Godot, `main.gd` projeta os recursos e o painel da torre; ícones
vetoriais ficam em `hud_icon.gd`. `board.gd` mantém atores/efeitos e recorta o
campo por um Control com escala uniforme. `terrain.gd` compõe os fundos com
as estradas pintadas, usando a mesma geometria das rotas, sem reamostrar as
regras de movimento. A camada do terreno só é reconstruída na troca de região.
A contagem animada de ouro é apresentação; compras usam o saldo em `run.gd`.
