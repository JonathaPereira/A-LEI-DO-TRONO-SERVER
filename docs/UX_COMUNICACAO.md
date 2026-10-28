# Produto e referência visual

Atualizado em 25/10/2026. Contrato aprovado para a reconstrução. Plano e andamento:
[MIGRACAO.md](MIGRACAO.md). Este arquivo substitui planos visuais separados.

Os três marcos receberam aceite visual humano na conversa em 25/10/2026.
O aceite não substitui as verificações técnicas registradas na migração.

## Experiência

- Após autenticação, abrir comunicação diretamente. Jogos têm área própria.
  Convidados mantêm acesso onde o produto atual permite.
- Referência visual vigente: imagem da Corte enviada pelo usuário nesta retomada.
  Fundo quase preto, dourado discreto, sidebar única, títulos com identidade própria,
  separações sutis e controles compactos. Usar Phosphor Icons na interface nova.
  O Discord orienta interações; sua aparência literal foi substituída.
- Organização: canais/conversas à
  esquerda; conteúdo central; membros/detalhes recolhíveis; entrada pessoal e
  conexão persistentes. Preservar marca própria.
- Desktop/Electron primeiro, com adaptação funcional para janela reduzida,
  tablet e telefone. Controles acessíveis por toque e teclado.
- Preservar o fluxo completo e a aparência dos jogos, incluindo lobbies, regras,
  efeitos, áudio e resultados. Reconstruir o catálogo externo.
- Voltar dos salões da Corte mantém a identidade: conta retorna à comunicação,
  convidado retorna ao catálogo. O formulário de acesso só ocupa a entrada de
  visitante ou um diálogo solicitado, com dimensões próprias fora do shell.
- Navegar entre texto, jogos e configurações conserva a chamada. Entrada, troca
  e saída de voz são ações explícitas.
- Grade/foco: grade inicial automática; quadro escolhido em destaque; demais em
  miniaturas; voltar restaura grade. Nova transmissão não toma o foco.
- A conversa lateral pode ser recolhida sem sair da chamada; o compositor é o
  mesmo da página de texto. Em telas estreitas ela ocupa um painel sobre a grade.
  O destino do texto continua indicado no cabeçalho e respeita o canal selecionado.
- Clicar no próprio quadro, usar Enter ou Espaço alterna seu foco; clicar no
  quadro ampliado volta à grade. Menus e outros controles têm ações próprias.
  Clicar numa transmissão ainda não assistida inicia a recepção e a coloca em foco.
- No foco, miniaturas ocupam uma única faixa horizontal rolável. O cabeçalho
  compacto deixa mais altura para a transmissão, mantendo sua imagem completa.
  Com dez pessoas e duas telas, o desktop usa quatro colunas e três linhas na
  grade; telas menores usam rolagem, mantendo os controles acessíveis.
- Pessoa e transmissão têm quadros separados. Controles de microfone, áudio,
  câmera, compartilhar e sair permanecem acessíveis.
- Desativar áudio silencia também o microfone efetivo; reativar respeita mute
  manual anterior. Volume local não é moderação do servidor.
- Compartilhamento permite escolher fonte e configurar capacidades realmente
  suportadas pela plataforma. Controle de uma stream afeta só essa stream.
- Configurações pessoais categorizadas; administração separada; fechar acessível
  fora da rolagem; Escape fecha e devolve foco ao acionador.
- Preservar perfis, arquivos, notificações, soundboard, clipes, gravação, Remote PC
  e administração. Não apresentar como funcionalidade pronta recursos que o
  backend não oferece.

## Capacidades atuais

A lista de membros fica aberta por padrão e é independente da tela de chamada.
O mesmo painel acompanha texto, mensagens diretas, catálogo e jogos, separando
online/offline conforme a presença recebida. Pode ser recolhido pelo botão do
cabeçalho ou da própria lista; a escolha acompanha a navegação. Trocar de conta
ou reiniciar restaura o padrão aberto. Em telas menores, é uma lateral
sobreposta com fechamento por botão ou Esc; modais, popovers e fullscreen têm
prioridade. O fullscreen próprio dos jogos permanece imersivo. A navegação e a
visibilidade do painel não entram/saem da voz nem recriam mídia.

Mensagens diretas e seu cabeçalho usam os avatares de perfil existentes: foto
enviada ou ícone predefinido. Mensagens próprias observam o perfil da conta atual;
as recebidas usam o perfil do interlocutor. Permissões e cache de arquivos
permanecem associados à conta.

Atalaia Godot 0.2 apresenta núcleo, ouro e onda em blocos nomeados, com ícones
vetoriais e barras finas. A geometria do cenário usa escala uniforme; atores
e caminhos ficam recortados pelo campo. Detalhes/evolução da torre e relatório
ficam na lateral; o arsenal continua abaixo do mapa. Ouro e dano têm transições
legíveis, sem substituir os valores autoritativos usados nas compras. Os saves
e as regras da campanha Godot são preservados. A referência web 0.6.1 possui
mais conteúdo; a mudança visual não implica paridade com essa versão.

No Love Letter, toda a mesa acompanha carta, autor, alvo e resultado em uma
apresentação sobre a mesa, sem precisar consultar o histórico. O Guarda mostra
também o palpite e aguarda dois segundos antes de revelar se acertou. Rei, Príncipe,
Barão e Padre identificam os envolvidos; mãos trocadas/comparadas e informações
privadas continuam ocultas aos demais. A última carta fica ilustrada no centro.
Movimento reduzido preserva as mensagens e o suspense, com transições estáticas.

O resultado da rodada distingue favor por vitória e bônus da Espiã. Este bônus
não exige vencer a comparação de cartas: somente uma pessoa ainda na rodada pode
ter jogado ou descartado Espiã. Duas sobreviventes que a usaram anulam o bônus;
usar ambas as Espiãs pela mesma pessoa concede no máximo um favor extra.

Manter contratos existentes: chat de canal com 300 caracteres, DM com 2.000 e
um anexo por envio. O servidor rejeita mensagens em canal exclusivamente de voz.
Qualquer expansão desses contratos é outra entrega. Histórico, IDs, arquivos,
cargos e perfis são preservados.

## Discord com REA

A preparação anterior observou o Discord Web autenticado em 24/10/2026 no
Chrome Windows, com REA para capturas/inspeção e Playwright para navegação.
Foram observados amigos, canais e configurações de voz: coluna compacta de
navegação, canais separados do conteúdo, compositor no rodapé e configurações
com categorias laterais.

Captura de canais registrada no chat:
`ev_424e88949823e044ff7060f48053403bb20c69c0cd2a291489c102b316085136`.
É referência histórica da preparação; um ID de sessão não garante que o
registro ainda esteja recuperável. Não há pacote de evidências exportado neste
checkout. Não usar capturas pessoais como dados de demonstração do produto.

O CLI 6.7.0 confirmou registro Codex alinhado; o MCP continua ausente nesta
sessão. A janela isolada anterior foi recuperada para o Marco 2, conservando a
sessão Discord. Em 24/10/2026, inspect_web_page via CLI registrou a página de
canais autenticada: ev_d4dbe4f3da8c189a6a9e3997452c1129ee4e3020af4e987a640ec9a6e403dd3b.
A inspeção reteve acessibilidade, sem valores de armazenamento ou corpos de
rede. É observação passiva da página de canais, sem chamada ativa; não
comprova grade, foco ou compartilhamento. Evidência completa em
artifacts/frontend-reset/rea-marco2-inspection.json.

A tentativa inicial de cenário encontrou a introdução do Chrome e falhou; esse
resultado não é contado como captura concluída. A inspeção passiva posterior,
já no alvo Discord, é a evidência bem-sucedida acima.

### Chamada ativa observada para o Marco 2

Em 25/10/2026, Chrome Windows 156, Discord Web autenticado na janela isolada:
o usuário preparou quatro participantes e duas telas. REA CLI inspecionou e
capturou os estados; Playwright clicou nas superfícies para trocar o foco.
Não houve recarga, entrada/saída de chamada ou alteração de volume pelo agente.

| Evidência em artifacts/frontend-reset                                                                      | Fato observado                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| rea-call-focus.json — ev_ae13efbb331a217513e4d12ff0b43380f755397df52b20121a80a1bb723ab522                  | Grade com pessoas e transmissões como superfícies distintas; controles persistentes no rodapé.                |
| rea-call-selected.json — ev_a82807579dfc6a41da32ad499f50b5629be91500d3fd7cd5085c7fadd8539e0d               | Tela em foco com proporção preservada e miniaturas; prévia local pode pausar enquanto a transmissão continua. |
| rea-call-participant-screen.json — ev_8c6cd9afa93969bb9cbafecb49381682fde3f93f435a00558fda7605f90fa3e8     | Troca do foco para um participante.                                                                           |
| rea-call-stream-restored-screen.json — ev_98a16f9d92b2ddd357dace81ead78d4e9b36c9be521bc624b49d211291f5be21 | Retorno à transmissão por clique.                                                                             |

O usuário também forneceu duas capturas dos menus contextuais: pessoa tem
volume da voz e ações locais separadas da moderação; transmissão tem volume
próprio, silenciar e parar de assistir. Essas capturas são fornecidas pelo usuário,
não uma inspeção REA dos menus. Não transportar nomes, mensagens ou imagens
pessoais para fixtures ou assets do produto.

Adaptações escolhidas para a Corte: cartões próprios em carvão/dourado,
Phosphor, foco manual estável, pessoa e tela separadas, volumes independentes,
acesso à conversa sem sair da voz. Escape retorna à grade no nosso produto.
O experimento no Discord não demonstrou Escape como retorno à grade; essa é
uma decisão nossa. Oferecer somente ações suportadas pelos contratos atuais.

Lacunas: referência não comprova qualidade do transporte, captura física,
cancelamento de seletor nativo, popout ou permissões do Electron. Não foi observado
um novo início de compartilhamento pelo seletor do Discord. A integração nativa
do projeto precisa de seu próprio teste real.

Em 25/10, a janela já não respondia em CDP 9333; foi reaberta com o mesmo perfil.
Inspeção autenticada atual: rea-resume-inspection.json —
ev_ae32caf332c54b5c975b6744a81905e41b398a89f2922d17e3685546fd178044.
Reabrir uma referência não equivale a reproduzir automaticamente a chamada
anterior. As evidências acima permanecem a base observada do desenho.

Use a skill reverse-engineer-anything para a referência distribuída/runtime.
Código deste repositório é inspecionado por ferramentas normais. Ausência do MCP
de REA não significa ausência de uma instalação; diagnosticar conforme a skill,
sem reinstalação preventiva nem alterações de configuração não autorizadas.

## Configurações e recursos do Marco 3

A apresentação em implementação conserva a identidade Corte e Phosphor. Meu perfil
abre pela área pessoal persistente. Trocar abas conserva o rascunho; salvar usa a
validação atual e descartar recupera o perfil confirmado. Em telas estreitas, Ver prévia alterna a área de edição para o cartão sem
perder o rascunho; Voltar à edição recupera os controles. GIF, emoji, viewer e diretório administrativo
fecham primeiro seu próprio diálogo/popover com Escape.

Cores das mesas personalizam os jogos compatíveis por conta/aparelho; o shell
conserva sua paleta. Música, efeitos e créditos ficam em Jogos. Permissões, lembrar
sessão e atividade aparecem segundo as capacidades reais do aplicativo Windows.
Gerenciamento e cargos só aparecem para contas autorizadas.

Soundboard permanece na chamada e na sidebar. Clipes, Compartilhar PC e gravação
ficam em Configurações → Recursos, também acessível a partir dos jogos. Navegação não inicia outra captura ou encerra uma chamada.
A gravação apresenta início/cancelamento/finalização e salva depois de encerrar os
recursos próprios. Replay segue disponível na web e suspenso no Windows conforme
a política existente; a interface informa essa diferença. Remote PC conserva
convite e consentimento explícitos para entrada remota.

Esta seção descreve a implementação em QA. Aceite visual do Marco 3 permanece
pendente; não estende a aprovação dos marcos anteriores.

### Polimento solicitado em 25/10

A seleção da sidebar representa a tela aberta. Participação em voz usa indicador
próprio; biblioteca, amigos e canal não ficam selecionados ao mesmo tempo. Amigos
mostra apenas amizades aceitas; Convites reúne solicitações e Comunidade permite
encontrar as demais pessoas. A seta decorativa junto à marca foi retirada.

A entrada sem identidade é uma tela exclusiva, com restauração de sessão antes
de mostrar o formulário. Não apresenta catálogo/canais atrás de um modal. Contas
autenticadas em transição exibem progresso, sem pedir login novamente.

No desktop, campos e prévia ocupam painéis irmãos com rolagens independentes;
o cartão não possui uma segunda rolagem interna. Assim, editar enquadramento,
cor ou fundo conserva o cartão à vista. O rodapé de salvar/descartar é separado,
sem cobrir conteúdo; bio conserva o limite de 300 caracteres e sua exibição remove espaços
nas extremidades e excesso de linhas vazias. Cores das mesas usa cartões de cor;
a explicação distingue essa preferência da identidade visual da Corte. Foco por
teclado permanece discreto; cliques e campos não recebem o contorno grosso.

O nome na área pessoal abre um cartão com edição, visualização do perfil,
configurações e saída. Gravação, clipes e Remote PC ficam na aba Recursos das
configurações; o menu de reticências foi retirado. Áudio rápido
e soundboard abrem junto aos controles por hover no desktop e por clique/toque;
hover não rouba foco nem inicia áudio. Soundboard tem acesso na chamada e na
sidebar; áudio rápido fica somente na sidebar.
O seletor nativo oferece Aplicativos e Tela inteira conforme as fontes reais;
não inventa uma aba de dispositivos que o contrato atual não oferece.

Referência: novas imagens fornecidas pelo usuário. Discord reaberto com o perfil
existente e inspecionado autenticado via REA: `rea-polish-inspection.json`,
`ev_536c558fa8fd3c5cdd054556ab6dcbf3d2f22f9536fa41abef58ee78143a0753`.
Essa inspeção confirma abas de pessoas e acesso à conta. A tentativa adicional
de abrir o cartão por cenário REA falhou; uma tentativa com Playwright
encontrou o alvo invisível. Não atribuir
à inspeção atual prova de hover ou captura ativa: essas referências vêm das fotos
e das observações anteriores, e a implementação da Corte é verificada separadamente.

## Avaliação

O agente executa QA com navegador/Playwright e corrige defeitos antes de apresentar
cada marco. O usuário aprova Marco 1, depois Marco 2, depois Marco 3. Não avançar
o marco seguinte antes do aceite. Escolher poucas regressões visuais duráveis
após aprovar o desenho. O usuário confirmou a direção visual do Marco 1 em
24/10/2026; modal cortado e retorno indevido ao login apontados nessa avaliação
foram corrigidos e verificados no navegador e Electron real. O Marco 2 passou na
validação local documentada na migração e recebeu aceite visual humano em
25/10/2026, após os ajustes de espaço, foco por clique e cenário com dez pessoas.
O Marco 3 está autorizado para implementação e ainda depende de aceite próprio.

### Revisão dos seletores e da área de voz

Após novo feedback de 25/10, GIFs usam galeria compacta com alturas de miniatura
consistentes, busca e fechamento fixos, créditos discretos e acesso por link em
uma seção recolhível. A prévia não duplica a cena de fundo nem recorta seções.
Interesses, links, créditos e data permanecem acessíveis no painel da prévia,
com uma única rolagem quando o conteúdo exceder a altura disponível.

Sidebar de 280px no desktop, com bloco de voz separado: conexão/sala à esquerda,
áudio rápido e desconectar à direita; câmera/tela/soundboard na linha seguinte.
Na faixa da conta ficam mic, fones e configurações. Sair fica no cartão da conta.
Na chamada a ordem é mic, fones, soundboard, câmera, tela e sair;
a configuração redundante de reticências foi retirada. Opções de cada participante
continuam no próprio quadro.

Soundboard tem busca local, cartões curtos com nomes limitados a duas linhas e
prévia/exclusão discretas. Só a biblioteca rola; o editor de recorte tem sua
própria área durante a edição. Hover não toma foco nem toca um som. A referência
desta revisão são as oito fotos fornecidas pelo usuário; QA usa bibliotecas com
24 itens e fontes ilustrativas identificadas, não conteúdo pessoal do Discord.

A preferência Aparência também deve contemplar o chat: essa ampliação fica
explicitamente adiada a pedido do usuário. A implementação atual de cores das
mesas não deve ser tratada como conclusão dessa necessidade de produto.

A revisão seguinte aplica preto/carvão neutro e dourado aos modais, campos e
controles, retirando os tons de verde/oliva das superfícies. Cores semânticas de
presença, fala e ações destrutivas continuam distinguindo estados.
Fundos pessoais decoram os quadros dos participantes sem cobrir câmera ou tela.
Capas decoram conta, minicartão, DMs e membros online; na lista de voz, usa-se a
identidade de conta confirmada pelo roster da chamada atual. Identidades sem
correspondência e convidados conservam a apresentação neutra, sem inferência por
nome. Zoom/posição da capa e escurecimento/desfoque do fundo usam os dados atuais.
Fora da voz, a conta tem contorno superior e cantos completos; conectada, integra
um bloco com os controles de voz. Imagens decorativas não interceptam ações.

DMs ficam num grupo recolhível da sidebar: seis conversas inicialmente, opção
Mostrar todas/Mostrar menos e manutenção da conversa selecionada à vista. A
sidebar conserva sua rolagem e os controles pessoais permanecem fora da lista.
Avatares têm dimensão fixa e nomes possuem seu próprio espaço, sem seletores
baseados na posição dos filhos.

O perfil compacto usa capa de largura inteira, avatar sobreposto e ações num
rodapé separado. Ver perfil completo abre uma composição maior, com identidade
e detalhes em colunas no desktop, reunidas no telefone. Ambos preservam bio,
interesses, links, créditos e data. Ausência de descrição recebe um estado vazio.
Modais externos aos jogos permitem fechar pelo fundo usando o cancelamento
nativo; clique interno ou arraste iniciado dentro não fecha. Apenas o modal de
cima é dispensado. Salvar em andamento conserva seu bloqueio de fechamento.


Atalaia aparece no catálogo com captura do próprio jogo e indicação de tower
defense solo para mouse/teclado. A tela apresenta controles e salvamento local.
Jogar só carrega o Godot após o clique: abre aba própria na web e janela própria
no Windows, onde F11 alterna tela cheia. Navegar pelo Trono mantém a chamada.
A campanha é separada da conta do Trono e não é sincronizada entre dispositivos.

## Similo

O protótipo local recebeu aceite visual do usuário. A integração solicitada usa
mesa escura, baralhos de adivinhadores/pistas independentes com até dois temas
cada e capitão alternado por rodada. Todos confirmam votos antes da decisão;
o capitão resolve divergência ou confirma unanimidade. O informante não vota.
Pistas ficam numa faixa separada, sem cobrir a mesa. Membros/recursos da Corte
ficam no cabeçalho do jogo, conservando a abertura padrão da lateral.

Informações de época, trama e características ficam num texto flutuante por
mouse/foco, com expansão pelo “i” para teclado e toque. As informações são
públicas e não mudam conforme o segredo. Layout estreito usa rolagem vertical,
sem cortar os controles; movimento reduzido desativa animações. O aceite do
protótipo não substitui a revisão humana desses ajustes integrados.
