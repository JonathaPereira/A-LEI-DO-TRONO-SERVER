# Análise do painel e do fallback de mídia

## O que foi encontrado

O painel fora da comunidade ainda dependia do layout antigo, com regras diferentes das usadas no espaço central da chamada. Reservava área para um mosaico sem mídia e deixava avatares e imagens crescerem de forma incompatível com o painel. Havia alternância Completa/Flutuante, um segundo botão para o mosaico ampliado, maximização de cada vídeo e cópias de câmera junto às cadeiras da mesa. A janela compacta é útil durante uma partida; os controles e cópias extras repetiam funções.

No transporte, erros de publicação da câmera ou da tela chamavam diretamente `fallbackToP2p`. Uma falha em qualquer publicação podia derrubar todas as mídias. Erros repetidos de assinatura de vídeo também podiam pedir fallback da voz. Um temporizador de cinco segundos fazia outra tentativa de mudar a sala quando a lista mostrava um participante em P2P, mesmo com o backend já responsável por coordenar o modo. A fila única de assinaturas aguardava cada negociação, permitindo que um vídeo lento atrasasse o áudio de outra pessoa.

No backend, `forceRoomP2p` muda a sala inteira, limpa as sessões SFU e mantém P2P até não haver ninguém na voz. O estado é intencionalmente compartilhado: clientes em SFU não recebem os sinais SDP de quem está em P2P. Essa política impede uma chamada dividida em dois grupos, mas tornava as decisões excessivas do cliente muito mais amplas e persistentes.

## Por que isso pode afetar a chamada

Trocar de SFU para P2P fecha transportes e exige novas negociações. Isso pode causar uma pausa. Em P2P, cada participante envia mídia diretamente aos demais; a carga de envio e processamento pode crescer com o número de pessoas. O SFU permite uma publicação de origem com distribuição aos assinantes. Não há evidência, só por essa análise, de que o fallback por si só explique a voz robótica de um computador específico. A correção do Electron da 0.2.9 foi preservada.

## Alterações da 0.2.10

- Uma apresentação compacta durante o jogo, com tamanho responsivo e avatares limitados. Ampliar abre o mesmo mosaico; não muda a sala, os dispositivos ou a chamada. As cópias de câmera ao redor da mesa foram retiradas. Redimensionar a janela não fecha o painel por uma regra destinada ao chat.
- Recuperação por publicação: falhas de câmera, tela ou áudio da tela não trocam a voz saudável para P2P. O microfone tem retentativas antes do fallback. Erros globais de disponibilidade ou limites ainda respeitam a política do servidor.
- Se o orçamento bloquear apenas a qualidade Alta, a publicação tenta novamente em Equilibrada, sem abandonar o SFU por esse motivo.
- Filas de assinatura separadas: até três negociações de áudio e duas de vídeo simultâneas. Uma câmera pendente não ocupa os lugares reservados ao áudio. Requisições duplicadas são reunidas, e publicações substituídas ou chamadas encerradas invalidam o trabalho antigo.
- Vídeo com falhas deixa de ser tentado indefinidamente. Uma nova sessão de publicação permite novas tentativas. A interface informa a falha da mídia mantendo a voz.
- O cliente deixa de forçar P2P por um temporizador baseado em uma lista possivelmente atrasada. Mensagens autoritativas `voice-mode` do backend continuam sendo obedecidas.
- Uma falha transitória na consulta inicial de disponibilidade tem uma segunda tentativa; a aplicação não assume disponibilidade sem confirmação nem ignora o freio de consumo.

## O que permanece deliberadamente

P2P é contingência para falhas reais da voz, configuração desligada, limite de segurança ou incompatibilidade que não pôde ser recuperada. A política de modo por sala foi mantida. Não foi acrescentado retorno automático P2P → SFU durante uma chamada ativa: isso exige preparar os novos transportes de todos antes de desligar os antigos, com confirmação coordenada, para evitar silêncio ou áudio duplicado. Trocar o modo periodicamente sem essa preparação poderia piorar a continuidade.

Para uma sala que já caiu para P2P, todos podem sair da voz por um instante e entrar novamente. A escolha volta a preferir SFU quando configurado, habilitado e permitido pelo orçamento. A voz privada de salas de jogo continua seguindo a política P2P existente; participar de um jogo mantendo a voz de um canal da comunidade conserva o transporte desse canal.

## Evidência e limites

Testes com falhas controladas verificam a permanência em SFU diante de câmera/tela com erro, voz recuperada, câmera de assinatura com oferta inválida, lista atrasada e encerramento lento de uma sessão antiga. Também verificam que uma falha persistente do microfone ainda aciona fallback, preservando a captura, e que o backend coordena toda a sala. O layout é verificado no Chromium em quatro tamanhos e nos dois layouts, incluindo uma preferência de tamanho legada exagerada.

Os testes de sinalização não equivalem a uma medição da Cloudflare em produção. Para confirmar a qualidade em uma chamada real, compare o transporte informado, perda, jitter e amostras reconstruídas antes/depois, com a mesma rede e participantes. Não foi alterado o orçamento nem solicitado acesso a credenciais de produção.
