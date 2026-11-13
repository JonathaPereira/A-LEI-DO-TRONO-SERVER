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

Similo usa o mesmo socket com serviço autoritativo independente. `similo/rules.ts`
possui distribuição, pistas, votos, capitão alternado e projeção por conta;
`similo-service.ts` possui membros e prazo de revelação/reconexão. Adivinhadores
não recebem segredo/mão e nenhum cliente recebe a pilha. A revisão da sala
serializa configurações e jogadas; a do motor protege conclusões atrasadas.
O capitão confirma unanimidade ou resolve divergência depois de todos votarem.
React observa o controlador; estado local limita-se a seleções ainda não enviadas,
inspeção e HUD. Controles de membros/recursos são portais do shell no cabeçalho,
conservando seus donos e a chamada. As cinco folhas originais são publicadas num
domínio estático separado antes do catálogo, com hashes da mesma entrega.

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
`socket/voice-recovery.ts` possui somente a tentativa de reconexão por até
45 segundos sobre o transport existente. `socket/client.ts` fornece a identidade
atual, reautentica e reaplica o último estado de voz, inclusive uma saída durante
a queda. O welcome e os eventos recebidos antes da confirmação ficam retidos até
restaurar o ID original. Não existe segundo socket nem nova captura de mídia.

`server/socket-gateway.ts` reserva conexões autenticadas que perderam o transporte
inesperadamente enquanto estavam na voz. `channel-service.ts` transfere os membros
para o novo socket, conservando ID, assento, mute, moderação e sessões SFU. A
capacidade aleatória de retomada fica só em memória, requer a mesma conta/sessão
ou o ticket de convidado validado e é renovada após a retomada. Respostas perdidas
podem repetir a confirmação antes do primeiro voice-state, sem duplicar membros.
Revogação inclui reservas; expiração, saída normal e moderação continuam efetivas.
Controle remoto não é retomado automaticamente.

`voice/call-lifecycle.ts` mantém a geração/captura durante `reconnecting` e
`voice/roster.ts` conserva peers e lista de voz. Falha definitiva segue o descarte
existente. O protocolo é anunciado por `voiceResume`; servidores antigos não são
tratados como capazes de retomar. Reservas são voláteis e não sobrevivem a restart.

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
A transmissão de tela prioriza o codec H.264 (`prioritizeH264`) tanto no SFU
(`sfu-session.ts`) quanto em conexões P2P (`p2p-peers.ts`), permitindo que a
codificação por hardware (NVIDIA NVENC / MediaFoundation no Windows) opere em
1–2 ms com 0% de sobrecarga na CPU. O perfil padrão de conteúdo de tela é `motion`,
que aplica `degradationPreference: 'maintain-framerate'` para manter a cadência
e fluidez contínua para jogos e transmissões em 60 FPS, reservando `detail`
(`maintain-resolution`) para documentos e apresentações estáticas. No processo
principal do Electron (`electron/main.cjs`), flags `--enable-gpu-rasterization` e
`--enable-zero-copy` encaminham superfícies DXGI diretamente ao codificador.
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
clones. Web e Electron usam o mesmo replay vinculado à fonte compartilhada.
No Electron, a ponte nativa registra o atalho global somente enquanto o replay
está pronto; a captura independente da tela principal continua desativada.
Preferências controlam qualidade/FPS e habilitação do buffer sem encerrar a fonte.

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


Em Cinzas, `controller.js` possui os mapas de teclado e controle. `Keyboard`
valida snapshots, troca conflitos entre teclas primárias/alternativas e fornece
os nomes exibidos. `game.js` captura a edição, apresenta e persiste a preferência
pelo dono de armazenamento existente; a mesma instância despacha o comando e
alimenta as dicas. A captura de Shift aguarda liberação sem combinação.

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

`validated_file.gd` possui a gravação atômica dos documentos JSON v1, rotação
de cópia saudável, recuperação e conservação dos bytes inválidos. O adaptador
`save_store.gd` valida campanhas por `run.gd`; `strategy_progress.gd` valida
o perfil de árvores e recordes. Os validadores de domínio permanecem separados.
A consulta de conquistas deriva snapshots novos do perfil, sem persistência
ou recompensa adicional. O dono de arquivo verifica versões incompatíveis também antes de substituir
uma fonte alterada durante a sessão. `main.gd` apresenta o aviso de recuperação
e conserva a Sobrevivência quando o recorde não pode ser gravado.

`keyboard_controls.gd` possui o mapa dos 11 comandos de teclado, validação,
troca de conflitos e nomes exibidos. `main.gd` captura a edição antes dos
controles da interface e usa o mesmo mapa no despacho e nas dicas. A preferência
integra as configurações existentes; testes injetam um caminho próprio e nunca
gravam o arquivo real de preferências.


No Nexus, `main.gd` conserva o resultado pendente da ação durante a apresentação.
O fim normal e `Pular animação` usam o mesmo fechamento, protegido por identidade
e versão de batalha. Pular cancela diretores/áudio e invalida callbacks antes de
aplicar o resultado existente; não recalcula combate nem recompensas. O salto
não é oferecido na fila autoritativa do PvP.

`keyboard_controls.gd` do Nexus possui os nove comandos, validação atômica,
troca de conflitos e nomes. Captura em `keyboard_settings.gd` e despacho de
`main.gd` compartilham a normalização do evento; cartões e dicas consultam
o mesmo mapa. O campo opcional integra `preferences.cfg`, separado do save
de campanha. Testes injetam arquivo próprio antes de montar a interface.

`fighter.gd` possui a pose estável de derrota e sua restauração por snapshot.
O diretor empresta seu Tween rastreado para o movimento fatal; continua dono
da criação e do cancelamento. Impactos animados adiam a pose final até a
reação; pulo, movimento reduzido, ticks e snapshots assentam o estado morto
diretamente. Cancelar uma apresentação reaplica a pose correspondente à vida
apresentada, sem interferir no resultado do combate.

`lessons.gd` possui roteiros, preparação e progresso derivado dos recibos reais
das cinco lições. Main conserva/restaura equipes e opções livres, impede entrada
em PvP e apresenta a lista rolável com foco acompanhado. Campanha, motor e
registros continuam nos seus donos; treinos não concedem progresso persistente.

`pose-regions.json` do Nexus mapeia atlas, âncoras, sequências por fase e tempos
próprios opcionais. Quadros podem selecionar folha/escala próprias; `tierPhases`
opcional escolhe a sequência da habilidade, preservando as fases padrão
e a precedência de suporte/derrota. Rhazen usa esse recurso no supremo.
`Fighter` prepara as folhas no cache existente, resolve os dados e só troca a região quando
muda o quadro. O diretor anima o progresso pelos Tweens que já possui; pulo e
reinício os cancelam junto aos movimentos. Sem sequência própria, os seis
atlas anteriores conservam sua seleção de quadros. Rhazen usa o primeiro
perfil expandido e um desenho de derrota; Cindra acrescenta o segundo perfil.
Oren, Nima, Kira, Vektor, Axion, Astra, Elun, Saira, Veyra, Sylva, Vesper e Auren
ampliam os dados para 14 perfis; Torv, Brin, Bast e Ivo chegam a 18.
Noct, Maura e Riven completam 21; Elyra, Solen e Zaya totalizam os 24.
Todos mantêm a ilustração
de repouso original, sem acrescentar lógica ao motor de combate.
Fighter possui a transformação dos pontos opcionais de emissão, usando a
mesma escala efetiva do quadro desenhado, com fallback à escala do perfil.
Invalida
interpolações de fases anteriores por versão de comando. O diretor consulta
a emissão no lançamento e conserva seus Tweens. Showcase ajusta a profundidade
à altura do palco para reservar margem superior. A aparência de derrota fica
no Fighter, sem multiplicar duas reduções de opacidade.

`mission_boss_phases.gd` valida opções de pressão dos capítulos e aplica
somente overrides locais de técnica no checkpoint de fase. Efeitos negativos
e passagem parcial por escudos usam o motor existente; explicações de
preparação, HUD, técnica e Registro derivam dos mesmos parâmetros.

No Nexus, Hub possui também a continuidade de foco na Coleção: recompõe os
controles usando o modelo atual, reconstitui a opção solicitada e espera o
layout antes de focar. Controles descartados, invisíveis ou substituídos por
nova navegação não recebem foco; uma escolha posterior do usuário prevalece.
A posição anterior é conservada quando o destino continua visível, e ações
que ficam indisponíveis usam o seletor habilitado como alternativa. Campaign conserva
transações, rollback, custos, atributos e o formato do save.

No Atalaia, Run calcula a aura de marcha do Arauto a partir das fontes vivas
e posições no início de cada passo. A associação é temporária; não amplia
o formato de save. Catálogo possui alcance/multiplicador, e Enemy desenha
o mesmo alcance e a insígnia, sem alterar o estado do combate.

No Atalaia, Run também possui o pulso periódico do chefe final: consulta
pública somente de leitura, aplicação de interferência e relógio opcional
`pulse_started_at` por inimigo. Catálogo possui período/aviso/raio/duração;
SaveSchema valida contexto e timestamp antes de carregar. Avisos recuperam
sua janela completa em passos grandes. Board desenha círculo/contador do
snapshot inclusive com efeitos reduzidos; Main apresenta preparação e
anúncio/resolução. Nenhum temporizador cosmético decide combate ou é salvo.

Run também possui a escolta do Guardião da escória na fase 24: a transição
não letal existente convoca uma vez os dois tipos definidos no catálogo.
`enraged` já persistido impede reconvocar, inclusive ao reabrir saves antigos
sem escoltas. `protection_radius` é a consulta comum à mitigação e à Board;
Enemy recebe somente o raio de apresentação e invalida seu desenho ao morrer.
Proteção não acumula nem protege a própria fonte; os caminhos existentes de
dano contínuo/perfuração continuam atravessando-a. Run captura os inimigos
da iteração e os destinatários de cada ataque em área antes de resolver
danos, impedindo aplicação retroativa aos convocados. Não há novo campo
de save, estado paralelo de proteção ou regra de combate no renderer.

Em Cinzas, Engine.update também possui a ordem da resolução terminal. Dano
fatal interrompe fases posteriores do mesmo quadro antes de conceder novos
acertos, abates ou cura; créditos anteriores permanecem. Game consome a fila
de eventos depois desse resultado, apresenta o encerramento e delega ao
mesmo protocolo de armazenamento/remoção do checkpoint. A correção não usa
estado paralelo, rollback de um quadro inteiro ou novo formato persistido.

Em Cinzas, Levels também posiciona o condutor na arena final sem consumir RNG.
Core possui o ciclo ambiental de colunas, compartilhado com a Horda; sua origem
identifica quais avisos/colunas o condutor pode cancelar. O estado de destruição
fica no objeto do mapa, sem flag duplicada ou novo formato de save. Renderer
apresenta estrutura/cristal/fraturas; Game apresenta o evento tático e solicita
salvamento pelo mesmo dono. Ataques do chefe permanecem no seu controlador.

Em Cinzas, Levels posiciona a urna opcional sem consumir RNG adicional.
Engine possui dano, recompensa e IDs consumidos em `brokenObjects`, campo
opcional do checkpoint por marcos. O probe valida antes de substituir a
sessão. Renderer desenha o objeto; eventos existentes ligam aviso e áudio.

## Host Android

`android/` é o host Capacitor 8, Java 21, SDK 36 e Android 8+ (API 26).
Empacota a mesma exportação Next localmente, com origem `https://localhost` e
backend de produção explícito. Não carrega código remoto com a ponte nativa.
`src/lib/mobile/android.ts` adapta permissões, avisos e sessão AES-GCM no
Android Keystore; `android-host.ts` possui somente a concessão do serviço, sem
socket, captura ou estado paralelo de chamada. O ciclo da voz aguarda a permissão
nativa antes de adquirir seu microfone existente. Cancelamento envia a concessão
correta e callbacks de permissão cancelados não podem iniciar o serviço.

`CallService` usa foreground service de microfone/reprodução, aviso permanente e
wake lock apenas durante a chamada. Não reinicia chamadas ao morrer o processo.
Minimizar conserva a WebView; sair da voz/conta, encerrar a tarefa ou destruir o
host libera o serviço. Reinício forçado do Android não equivale à reconexão de
socket já implementada. Câmera, Bluetooth, Doze e áudio físico exigem aceite em
aparelhos; o serviço não promete imunidade às políticas dos fabricantes.

`server/mobile-push.ts` autentica registro de dispositivos pelo mesmo gateway e
envia avisos genéricos via FCM HTTP v1 após mensagens privadas/pedidos de amizade
confirmados. Falha de push não desfaz mensagem confirmada. Tokens ficam na tabela
privada `mobile_push_devices`, sem acesso anon/authenticated, com registro por RPC
restrita à service_role. A conta vem do JWT validado, nunca do corpo. Registros
expiram da seleção após 30 dias; endpoint inválido é removido. Preferência desligada
é sincronizada. Mutes e desligamento também são aplicados imediatamente no nativo.
Registros HTTP são serializados na troca de conta; a identidade lembrada é
restaurada antes de consumir um clique. O Android confere a conta local antes de
exibir e limpa avisos na
troca/logout. O payload FCM não contém texto nem anexos da conversa. Menções de
canais continuam pelo socket enquanto o processo está ativo; push de canais ainda
não está integrado. Firebase e assinatura são configuração operacional, não
credenciais embarcadas no frontend. O segredo de serviço fica só no backend.


### Captura local de clipes e avaliação dos encoders

`clips/local-capture.ts` possui somente a fonte escolhida explicitamente para
clipes locais; o replay continua possuindo seus clones/recorder/worker. A captura
não participa da chamada nem publica tracks. Inicia desligada em cada sessão,
sem restaurar `desktopAuto` antigo. Cancelamento, troca de conta, pagehide,
encerramento da fonte e falha de preparação invalidam permissões tardias e
liberam somente a fonte própria. O motivo do replay é passado ao stop local e
preservado; ended da fonte usa callback próprio, sem passar o Event como texto.
Durante uma captura local, notificações de nova transmissão não substituem sua
fonte. Desligar a captura não inicia outra fonte
implicitamente; para mudar o modo, o usuário escolhe/inicia uma nova captura.

O replay possui dois caminhos. Compatível usa MediaRecorder/WebM e o worker
existente. Automático prefere NVENC após codificação real de teste; NVENC
explícito falha com mensagem se indisponível. `clips/native-session.ts` envia
somente clones da fonte escolhida como BGRA e PCM. TrackProcessor fornece
quadros sem depender de um vídeo desenhado na janela. Dois envios podem ficar
pendentes; o leitor busca o próximo quadro somente após receber crédito, deixando
o TrackProcessor manter o quadro recente. Buffers de pixels são reutilizados
após a confirmação. Sem TrackProcessor, há fallback de vídeo. Não inicia outra captura de monitor. O main valida origem, ID,
dimensões, tamanho e timestamps de cada pacote. O framing
Matroska toma emprestado o payload e usa escrita vetorizada sem concatená-lo. `electron/replay-native.cjs`
possui processos FFmpeg, buffer fMP4 limitado a 256 MiB e até dois exports MP4
por remux sem recodificação. Cada sessão informa ao controlador a capacidade de
pedidos pendentes: dois no nativo e quatro no compatível. O excesso mantém a
captura ativa e pede que o usuário aguarde. O leitor monta cada box uma vez e
valida o tamanho no cabeçalho, inclusive quando ele chega fragmentado.
`snapshotParts` retém referências estáveis aos fragmentos; exportar escreve esse
iterável assincronamente, inclusive se a captura parar ou o buffer expirar.
Não concatena todo o replay no main.
H.264 nunca passa pelo parser WebM. Temporários
são privados, apagados após exportar e limpos na abertura após falha. Navegação
ou crash para o encoder ativo; encerrar o app termina seus processos.

`clips/audio.ts` possui contexto, mistura e microfone adquirido fora da chamada.
Na chamada, empresta diretamente o track disponível sem clonar/habilitar/parar,
respeitando mute. Eventos de chamada/mídia trocam a entrada mantendo a saída
misturada. Sair da chamada adquire uma entrada própria enquanto houver captura
autorizada; falha encerra o replay com mensagem. Sem som não pede microfone,
remove somente clones de áudio e respeita Sem áudio do seletor nativo. O sinal
de cancelamento libera clones/microfone imediatamente durante a preparação;
permissões tardias são descartadas. O dispositivo preferido é lido do dono das
configurações de voz, sem recriar outro armazenamento de preferências. Falhas de
abertura, ausência, permissão e restrição da entrada têm orientação específica,
sem recaptura automática nem fallback silencioso para outro dispositivo.

FFmpeg LGPL compartilhado é distribuído separado com DLLs substituíveis,
licenças e fontes/receita referenciados. `prepare-ffmpeg.cjs` fixa release e
SHA-256; não há download de binário em runtime. O rótulo ativo depende de vídeo
codificado recebido. Não se garante consumo irrisório: cópia/conversão de
frames e competição com o jogo ainda exigem medição no PC. AMF/QSV permanecem
avaliados, sem integração nesta entrega.

Para um backend nativo, os encoders H.264 existentes no FFmpeg são:

| Hardware | Encoder | Pré-requisito para elegibilidade |
| --- | --- | --- |
| NVIDIA | `h264_nvenc` | Inicialização/codificação real com driver e GPU compatíveis. |
| AMD | `h264_amf` | Runtime AMF e codificação real bem-sucedida. |
| Intel | `h264_qsv` | Dispositivo Quick Sync acessível e codificação real bem-sucedida. |

Fontes oficiais inspecionadas: [NVENC](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/nvenc_h264.c),
[AMF](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/amfenc_h264.c) e
[QSV](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/qsvenc_h264.c).
Listar o encoder compilado ou identificar a GPU não comprova disponibilidade.
A escolha automática deve comparar probes reais na mesma resolução/FPS, medir
frames perdidos, latência e consumo sob jogo, e tentar o próximo candidato se o
dispositivo falhar. Não existe ordem universal NVIDIA > AMD > Intel: em um PC
com duas GPUs, o encoder integrado pode aliviar a GPU ocupada pelo jogo.

Perfil inicial recomendado para comparar: 1080p/30 FPS, 30 s e keyframes
regulares. O nativo mantém teto de memória e exports MP4 reproduzíveis/seekable.
No Linux, contratos reais usam FFmpeg local. O teste Windows sem NVIDIA usa
Media Foundation, identificado como teste e permitido apenas no Electron não
empacotado com fixture local; isso não comprova NVENC físico. O pacote final
mantém o probe NVENC real e verifica a presença do binário/DLLs/licenças.

Equipamento informado para a avaliação: Windows 11, Ryzen 7 5700X3D,
RTX 3060 Ti e 32 GB de RAM. Nesse equipamento o candidato nativo é NVENC H.264;
Quick Sync requer uma GPU Intel compatível, e AMF requer GPU AMD compatível.
O processador AMD sozinho não habilita AMF. A escolha desse candidato não é
evidência de desempenho ou medição no equipamento. A próxima prova deve comparar
1080p/30 e 1080p/60 no equipamento, com jogo aberto, verificar frames perdidos e
impacto no jogo, exportação reproduzível com áudio e liberação da captura.

O PCM dos clipes mantém até um segundo de blocos enquanto espera confirmação do
encoder (24 blocos de 2048 frames a 48 kHz, cerca de 384 KiB, além do bloco em voo).
O arranque com 500 ms de atraso não descarta amostras nem cria chiado. Um bloqueio
prolongado encerra a captura com mensagem, sem unir silenciosamente áudio descontínuo.
A ponte nativa dos clipes possui o registro do atalho global, repete uma falha
temporária enquanto a captura continua e cancela a repetição ao desligar. O
estado indisponível é mostrado junto do atalho; nenhuma falha fica mascarada
como disponibilidade global. O evento de clipar independe do foco do aplicativo.


Ao criar um clipe, falha de persistência pausa o replay e conserva o blob em memória.
A biblioteca passa o mesmo motivo ao replay e à captura local; o atalho não alterna
a captura nem elimina o clipe. Retomar exige salvar ou descartar a cópia em memória.

O diagnóstico de vídeo calcula deltas por estatística/conexão, com baselines
independentes e descartados na troca de peer ou reset. Tempos acumulados usam as
unidades de WebRTC Stats: codificação/decodificação por quadro; fila de envio por
pacote. A cópia do relatório permite apenas direção e campos numéricos anônimos,
sem IDs de tracks, peers ou endereços. Os dados são somente leitura e não alteram
parâmetros de envio ou reprodução. FPS medido zero é preservado; configurações da
fonte são usadas apenas quando o contador não está disponível.
