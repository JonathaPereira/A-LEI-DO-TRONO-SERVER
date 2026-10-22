# Compartilhar PC · Beta (Windows 0.2.12)

A beta oferece um monitor compartilhado com uma pessoa da mesma chamada, com mouse/teclado ou um controle Xbox virtual autorizado separadamente. O participante pode continuar ouvindo e falando normalmente. O vídeo remoto usa sua própria conexão WebRTC; a voz mantém o transporte que já estava usando, inclusive SFU. Encerrar o PC não encerra a voz.

## Como usar

1. Atualize os aplicativos Windows dos dois participantes para 0.2.12 ou superior (o convidado pode usar o site atualizado). Os dois participantes entram em suas contas e na mesma sala de voz.
2. No HUD da chamada, abra **Compartilhar PC · Beta**, escolha a pessoa e clique em **Escolher monitor e convidar**. Leia o aviso e selecione um monitor inteiro.
3. A outra pessoa recebe um convite e escolhe **Aceitar e assistir**. Pode assistir no aplicativo ou em navegador compatível com WebRTC.
4. Para interagir, ela usa **Pedir controle**. O dono do computador confirma na janela nativa do Windows; negar mantém somente a visualização.
5. O dono pode **Retirar controle** mantendo o vídeo, ou **Encerrar compartilhamento**. O atalho local **Ctrl + Alt + Shift + F12** encerra a sessão. Uma faixa do Windows permanece indicando o compartilhamento e oferece encerramento.

O teclado atua quando o convidado clica no vídeo. Esc libera o foco do teclado. Há uma opção de tela cheia. A beta não oferece bloqueio exclusivo de teclado nem captura de atalhos reservados do sistema.

## Vídeo, som e rede

O perfil inicial solicita 720p/60 FPS, até 6 Mbps, para priorizar resposta. Há
uma opção 1080p/60 até 12 Mbps. Resolução e bitrate diminuem quando o encoder
relata limitação ou a rede fica congestionada. A recepção solicita buffer mínimo.
Esses valores dependem do computador e da rede. As métricas da sessão separam
RTT da rede, processamento e buffer; não representam uma medição completa de
atraso entre controle, jogo e tela. O WebRTC prefere H.264 quando disponível.
A beta ainda usa a captura e o encoder do Electron/Chromium.

Para dois jogadores com gamepads, consulte [o guia de atualizações](ATUALIZACOES.md).
O anfitrião precisa do driver opcional ViGEmBus 1.22.0. O projeto foi encerrado;
o botão abre a versão oficial para instalação consciente. O convidado usa
um gamepad padrão ou teclado como gamepad. Conecte o gamepad local antes,
libere o virtual e pressione Start para entrar no jogo. O modo de desktop
continua oferecendo um único cursor e teclado compartilhado.

O vídeo prefere uma conexão direta. Se a rede exigir, usa os servidores TURN configurados no backend. Sem TURN disponível, algumas combinações de NAT/firewall podem não conectar. Isso não altera a seleção de SFU/P2P da voz. O backend só coordena convites e sinalização; não codifica o vídeo e não encaminha os comandos de teclado.

O áudio do jogo é opcional e usa a captura isolada por aplicativo existente no Windows 11/Windows build compatível. Escolha o aplicativo na captura. Áudio do computador inteiro é desabilitado nesta função para reduzir eco das vozes da chamada. Não há microfone adicional para a sessão remota.

## Limites desta beta

- Uma pessoa e um monitor por sessão; mouse, teclado e roda ou um controle Xbox virtual separado. Sem transferência de arquivos, área de transferência compartilhada ou acesso sem supervisão.
- Jogos que exigem mouse relativo/raw input, anti-cheat específico ou acesso elevado podem não responder corretamente. A beta não injeta em processos elevados nem contorna proteções do Windows.
- Sessões exigem contas diferentes e participantes na mesma voz. Não há links públicos de controle. Sair da voz, desconectar, trocar de conta, remover o monitor ou expirar a sessão encerra o acesso.
- Perda de comunicação revoga o controle. Estados de gamepad perdidos são neutralizados após 500 ms; o dispositivo é desconectado ao revogar o acesso. O helper libera teclas e botões pendentes no encerramento ou quando deixa de receber sinais de atividade. O atalho de encerramento é registrado localmente e precisa estar livre.
- O teto de bitrate não substitui controle de consumo. O contador de tráfego do SFU existente não contabiliza este transporte separado. Tráfego TURN depende do provedor e do plano já configurados; monitore o consumo no provedor ao testar.

## Publicação

**É necessário atualizar o backend no Render**, além de publicar o frontend no Surge e instalar o Windows 0.2.12 ou superior no computador que será compartilhado. Não exige migração SQL nova. Frontend novo em backend antigo informa que a beta requer atualização do servidor.

O helper `MN-Remote-Input.exe` é compilado no Windows e incluído no aplicativo. Sua comunicação é por pipe local com o processo principal do Electron; não abre porta ou serviço de acesso remoto. As permissões são temporárias e não são salvas entre sessões.

## Validação

Os testes verificam autorização, participantes e sala, isolamento do modo SFU da voz, convites expirados, sinalização inválida, revogação e liberação de teclas. O navegador testa convite, HUD responsivo e preservação do microfone. A CI Windows também verifica WebRTC real, vídeo recebido, negação e concessão de controle e entrada nativa em uma janela de teste.

O ambiente Linux gerenciado bloqueia WebRTC UDP; nele, a parte de mídia direta do teste é marcada como pulada. A parte correspondente deve passar no Windows antes da entrega. Isso não substitui testes entre redes reais nem estabelece equivalência de desempenho com o Parsec.
