# Operação de mídia e painel dos jogos

Guia especializado distribuído junto dos pacotes. Arquitetura, UX e andamento
vigentes ficam nos documentos donos do projeto; o histórico das alterações
permanece no Git. Este caminho é conservado por consumidores do empacotamento.

## Continuidade e apresentação

A Corte tem grade/foco e uma faixa de miniaturas. Durante partidas, o painel
flutuante permite mover, redimensionar, minimizar e reabrir a mesma mídia.
Players emprestam as streams existentes: navegar não recaptura dispositivos nem
encerra a voz. O seletor de layouts Original/Discord foi retirado.

## Transporte e recuperação

O servidor decide o modo da sala. forceRoomP2p muda a sala inteira e mantém
P2P até não haver ninguém na voz; clientes em SFU não recebem sinais SDP de P2P.
O estado compartilhado evita separar a chamada em grupos sem comunicação.

Falhas de câmera, tela ou áudio da tela têm recuperação por publicação e não
mudam a voz saudável para P2P. Microfone tem retentativas antes do fallback.
Falhas globais, limites e indisponibilidade obedecem à política do servidor.
Se apenas a qualidade Alta exceder o orçamento, tenta Equilibrada.

Assinaturas têm filas separadas: até três negociações de áudio e duas de vídeo.
Uma câmera pendente não ocupa a fila de áudio. Pedidos duplicados são reunidos;
publicações substituídas e chamadas encerradas invalidam trabalho antigo. Vídeo
com falhas tem retentativas limitadas; uma nova publicação permite nova tentativa.

P2P permanece como contingência da voz, configuração desligada, limite ou
incompatibilidade irrecuperável. Não existe retorno automático P2P para SFU
numa chamada ativa. Para reavaliar uma sala que caiu para P2P, todos podem sair
da voz e entrar novamente; SFU depende de configuração e orçamento disponíveis.
Voz privada de jogo mantém sua política existente; jogar mantendo a voz de um
canal conserva o transporte desse canal.

## Diagnóstico e verificação

Abra Configurações, Conexão para consultar transporte e diagnósticos. Compare
perda, jitter e amostras reconstruídas na mesma rede e com os mesmos participantes.
Uma troca de transporte pode causar pausa e não prova a causa de voz robótica.

O comando npm test seleciona contratos; --suite browser com --filter
sfu-browser|floating-call-browser|call-controls-browser cobre recuperação,
continuidade, gestos e apresentação. Electron real usa --suite desktop com
--filter desktop-call-layout. Fontes sintéticas exercitam transporte e descarte,
sem comprovar hardware ou qualidade Cloudflare em produção. Resultados da
reconstrução e limitações ficam em MIGRACAO.md no repositório.
