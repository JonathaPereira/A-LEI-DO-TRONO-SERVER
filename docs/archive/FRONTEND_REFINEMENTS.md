# Replay automático no compartilhamento e atalho Windows

Esta atualização modifica o frontend e acrescenta um componente opcional para
Windows. Não exige alteração do backend, novo SQL, dependência de produção no
Render ou variável de ambiente.

## Publicar

1. Baixe e extraia o ZIP desta versão no GitHub.
2. Abra a pasta `frontend` completa pelo Git Bash, incluindo os arquivos
   `clip-desktop.js`, `clip-buffer.js`, `clip-store.js`, `clips.js`, `clips.css`
   e `vendor/rnnoise/`.
3. Execute `surge . a-lei-do-trono.surge.sh` e recarregue com **Ctrl+F5**.
4. Para atalho global, baixe também o ZIP **M&N Clipes Windows x64**, extraia e
   abra `MN-Clipes.exe`. O componente funciona com este frontend atualizado.

A branch `codex/clips-sharing-refinements` contém a mudança para revisão.
Fazer merge atualiza a main; a publicação no Surge é separada. Se o Render estiver
com deploy automático, o merge poderá reiniciar o backend, embora o servidor
continue com o mesmo código.

## Usar o replay

Compartilhe a tela normalmente, com áudio habilitado no seletor do navegador.
O replay é preparado automaticamente usando essa mesma seleção; não há um
segundo seletor ou botão para começar uma gravação separada. O botão **✂ Clipar**
fica na barra inferior, junto aos controles de microfone, câmera e tela.
Enquanto o buffer aquece, ele mostra os segundos já disponíveis.

Cada clique guarda o trecho anterior. **Meus clipes**, na mesma barra, abre a
biblioteca com prévia, salvar e descartar. É possível acumular vários clipes e
escolher depois quais exportar. **Preferências** contém qualidade/FPS, duração,
atalho, pasta e a opção de desativar o replay automático. Mudar essas preferências
reinicia o buffer local, mantendo a transmissão e os clipes já criados.
Se ocorrer falta de espaço, o replay pausa e preserva o clipe na sessão para
salvar/descartar; a transmissão da chamada continua. Depois use **Retomar replay**.

Ao parar de compartilhar ou sair da chamada, o buffer temporário é descartado.
Os clipes criados permanecem no armazenamento do navegador, inclusive após
recarregar ou publicar no mesmo domínio. São separados por conta. Trocar de
navegador/computador/domínio não transfere os clipes; limpar os dados do site ou
a remoção dos dados pelo navegador pode apagar os pendentes.

Escolher a pasta apenas define o destino: cada exportação exige clicar em Salvar.
Sem a API de pasta/arquivo do navegador, usa Downloads. Download solicitado mantém
uma cópia local recuperável porque o site não consegue confirmar a conclusão.
Cancelar o salvamento mantém o clipe. Remover da biblioteca não apaga arquivos
já exportados. Os arquivos são WebM.

## Atalho com o jogo em foco

A página sozinha recebe atalhos quando está em foco. Para usar no jogo sem ir ao
segundo monitor, mantenha o componente Windows aberto e faça a conexão uma vez:

1. No `MN-Clipes.exe`, clique **Copiar código**.
2. Na aba do chat já aberta, acesse **Meus clipes → Preferências**.
3. Cole o código e clique **Conectar ao Windows**.
4. Permita o acesso à rede local se o navegador solicitar.
5. Compartilhe a tela. Aguarde **Atalho global ativo** no componente e volte ao jogo.
6. Aperte o atalho configurado; o clipe é guardado na biblioteca sem trocar o foco.

O padrão é **Ctrl+Shift+X**. O componente usa RegisterHotKey do Windows apenas para
a combinação escolhida. Não monitora outras teclas, não captura vídeo/áudio e
não recebe os arquivos. A conexão é local em `127.0.0.1:32196`, com código
aleatório e origem do site validada. Quando o replay para ou o navegador
desconecta, o atalho é liberado. Atalhos ocupados por outro programa mostram erro.

Fechar a janela recolhe o componente à bandeja; **botão direito no ícone → Sair**
encerra. Reiniciar o componente gera outro código: copie e reconecte.
**Abrir chat** é opcional e abre uma nova aba com o código preenchido; para
preservar a chamada existente, prefira conectar na aba atual.
O ZIP é portátil para Windows 10/11 x64 e inclui .NET; não exige instalação do
SDK ou privilégios de administrador. Instruções também em `desktop/LEIA-ME-WINDOWS.txt`.

## Qualidade e recursos

O padrão agora é **1080p/60 FPS**, com objetivo de **24 Mbps de vídeo e 192 kbps
de áudio** no MediaRecorder. As opções são 720p (6/9 Mbps em 30/60 FPS), 1080p
(16/24 Mbps) e 1440p (28/42 Mbps). O resultado depende da resolução/FPS fornecidos
pela tela/janela e da capacidade de codificação do computador. As preferências
antigas passam ao novo padrão, preservando 1440p se já estava escolhido.

A captura local alimenta clones separados para replay e transmissão. Os limites
de resolução/FPS e bitrate da chamada são aplicados à transmissão; o replay usa
a fonte local antes da compressão enviada. Assim, aumentar a qualidade do arquivo
não muda o teto de bitrate enviado à chamada. Configure a qualidade desejada
antes de compartilhar para pedir a fonte com essa resolução/FPS. A captura não
inventa detalhes acima da resolução da tela/janela.

O áudio da origem entra automaticamente quando o navegador o fornece. Não há
uma segunda captura de microfone. Se o usuário/navegador não incluir áudio no
compartilhamento, o replay informa que ficou sem áudio; não promete gravar o que
não recebeu. O site pede exclusão do próprio áudio da chamada, mas o suporte
depende do navegador e da fonte escolhida.

O buffer existe apenas na memória local, em Worker, com limite calculado entre
64 e 256 MiB conforme qualidade e duração. Retém quadros codificados dos segundos
recentes, em vez de uma gravação inteira. Ao clipar, monta um WebM a partir de um
quadro completo e ajusta os tempos de vídeo/áudio sem reencodar. Pode haver alguns
segundos extras, ou trecho menor se atingir o limite. Os clipes criados usam o
armazenamento local do navegador, fora desse buffer.

**O buffer e os clipes não são enviados à Cloudflare, Supabase ou R2.** O
compartilhamento continua usando a infraestrutura normal da chamada. O componente
Windows envia somente comandos locais. Gravar/codificar vídeo usa CPU/GPU/memória
no computador; qualidade alta e 60 FPS podem pesar durante o jogo. O modo leve
reduz o trabalho do chat, sem reservar CPU ou garantir voz sem cortes sob carga.

## O que o modo leve faz

- Usa o supressor nativo do navegador no lugar do RNNoise enquanto estiver
  ligado. O controle de supressão continua podendo ser desligado. A interface
  informa quando o navegador não fornece supressão nativa; não simula proteção.
- Reduz os medidores de fala para aproximadamente 5 atualizações por segundo.
  No modo normal são aproximadamente 10, em vez de acompanhar os quadros da tela.
  Com a página oculta, não lê os medidores nem atualiza seus indicadores; o
  processamento e a transmissão da voz continuam ativos.
- Atualiza só os indicadores de fala; não redesenha os participantes e as câmeras
  a cada mudança de quem está falando. Isso vale também no modo normal.
- Reduz a coleta automática de diagnóstico para a cada 10 segundos quando o
  painel estiver fechado, evita coletas simultâneas e reduz animações da chamada.
  Abrir o diagnóstico continua oferecendo atualizações frequentes.
- Preserva o mute, o volume do microfone e a conexão com a sala. Desligar o modo
  restaura a preferência normal de supressão, incluindo RNNoise se estiver ligado.

Os arquivos da interface usam o cache `091sharingclips`.

Se a voz ainda cortar ao jogar, limite o FPS do jogo para deixar folga de
processamento e teste o microfone também fora do navegador. Isso ajuda a separar
sobrecarga do computador, problema do dispositivo/driver e conexão de rede.

## Comportamentos para conferir

- Entre em uma sala de voz, ligue a câmera ou compartilhe uma tela e abra um
  canal de texto: as mensagens ocupam a área principal, sem o painel de câmeras.
  A chamada fica conectada em segundo plano, com controles compactos abaixo
  das mensagens e um botão para voltar à sala de voz. O microfone, a câmera, a
  transmissão e as streams assistidas continuam na sala de voz original.
  Voltar ao mesmo canal de voz não reconecta a chamada. Escolher outra sala
  de voz continua mudando a chamada para aquela sala.
- Excluir um canal de texto não desconecta quem está em outra sala de voz.
  Excluir a sala de voz encerra aquela chamada e preserva o canal de texto
  aberto. As mensagens e os anexos seguem o canal de texto selecionado.
- As novas mensagens sobrevivem a reinícios/deploys do backend e à saída de
  todos do canal. O chat mostra as últimas 50 mensagens e **Mensagens anteriores**
  carrega as páginas anteriores, sem excluir o histórico salvo. A conta autora
  continua identificada após recarregar. Anexos excluídos continuam marcados
  como excluídos ao ler o histórico. Se não for possível salvar uma mensagem,
  ela não é transmitida como entregue; o rascunho de texto é restaurado quando
  o campo está vazio e o mesmo canal continua aberto.

- O portal mostra as duas mulheres, os textos e os botões em desktop e celular.
- ⛶ e clique duplo abrem a câmera/tela em tela cheia; Esc volta à chamada.
  A grade fecha automaticamente ao escolher uma mídia em tela cheia.
- Ao assistir uma transmissão, os controles, o nome e o cursor somem após
  três segundos sem interação, tanto na prévia quanto na tela cheia. Mover o
  mouse sobre aquela transmissão ou tocar nela traz os controles de volta;
  mover o mouse em outros painéis não os revela. Usar Tab para focar a
  transmissão revela os controles, que permanecem disponíveis durante o
  uso por teclado. Convites para assistir e prévias minimizadas continuam
  com seus botões disponíveis. O vídeo e o áudio continuam reproduzindo.
- Grade · até 6 permite marcar/desmarcar pessoas; Tela e Câmera estão
  identificadas por pessoa. Assistir inicia uma transmissão ainda não aberta.
- Quando há compartilhamento, as transmissões ocupam a área principal e as
  câmeras ficam nos cartões dos participantes. Ao parar o compartilhamento,
  as câmeras voltam à área de mídias. Tela cheia continua funcionando.
- Ao compartilhar uma janela, o site pede somente o áudio daquela janela.
  Também pede para excluir o áudio da própria página da captura do sistema,
  evitando retransmitir as vozes da chamada quando o navegador suporta isso.
  Essas opções dependem do navegador: use Chrome/Edge atualizado e confira
  o seletor de áudio. Se ainda houver retorno, desmarque Compartilhar áudio;
  isso preserva o microfone da chamada. A captura física de áudio de jogo no
  Windows precisa de conferência após publicar, pois as fontes do teste são geradas.
  Referências: [opção windowAudio](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
  e [restrictOwnAudio](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/restrictOwnAudio).
- Ocultar câmera / Mostrar câmera funciona por participante, no cartão ou na
  grade. Só muda o que você vê, mantendo a voz e a transmissão da pessoa.
  No SFU, interrompe a assinatura daquela câmera; em P2P, oculta localmente
  sem prometer economia de rede. A preferência dura até sair da chamada.
- Configurações → Áudio → Supressor ativa o RNNoise no seu próprio microfone.
  O modelo roda localmente a 48 kHz, antes de enviar a voz. O botão confirma
  RNNoise ativo, redução do navegador, processamento pausado ou indisponível.
  O primeiro uso baixa cerca de 3,6 MB do modelo do próprio site, sem API ou
  mensalidade. Se RNNoise falhar, tenta a redução nativa; se ela não estiver
  disponível, mantém o microfone e informa a falta de supressão.
- Efeitos fica no canto inferior esquerdo, sem botão duplicado na barra central,
  com miniaturas menores, quatro colunas em larguras comuns e volume pessoal.
  Adicionar efeito permite recortar áudios longos para até 15 segundos,
  ouvir o trecho e enviar apenas esse trecho. Clicar e digitar no nome do áudio
  mantém o submenu aberto, inclusive depois de rolar o formulário.
- Perfil → Aparência permite escolher roxo, verde/preto, preto/vermelho,
  azul/preto ou amarelo/preto. A escolha é individual: aplica na hora, fica
  salva por conta neste navegador e não altera o tema dos outros na chamada.
- Arraste as bordas ou os cantos dos painéis de canais, mensagens e pessoas
  para mudar largura/altura; a borda inferior da chamada muda a altura central.
  As laterais ajustam a largura disponível para a chamada. No celular, a faixa
  de canais permite ajustar a altura. As medidas ficam salvas por conta neste
  navegador. Perfil → Voltar ao padrão restaura todas as medidas e mantém o tema.
  Também é possível focar uma borda com Tab e usar as setas; Home restaura
  a dimensão daquela borda.
- Configurações → Vídeo permite escolher a entrada da câmera. A captura antiga
  é liberada antes da troca; sair da chamada cancela capturas pendentes.
- Volumes ficam abaixo dos rótulos, com a espada no seletor; barras de rolagem
  usam as cores do site e o indicador de presença fica fora do avatar.

## Validação de desenvolvimento

Execute `npm ci`, `npm test`, `npm run test:frontend` e
`npm run test:clips`, além de `node --test tests/noise-processing.js`
na raiz do projeto, com Chromium
instalado (`AUTH_TEST_CHROMIUM` permite indicar seu executável). Os cenários
usam backend local e serviços simulados; a câmera e a tela usam fontes de
teste. Os testes verificam a API nativa de tela cheia, fallback na janela,
limite da grade, liberação/cancelamento da câmera, recorte PCM estéreo exato,
upload validado pelo backend, volume pessoal, edição do nome sem fechar o
submenu, temas individuais persistentes, redimensionamento/restauração dos
painéis, navegação de texto durante a voz, mídia preservada, controles de stream
ocultados por inatividade, câmeras nos cartões, ocultação individual, efeitos compactos e layouts
desktop/celular. O teste de áudio mede a saída real do RNNoise com ruído
determinístico e fala sintética, para conferir redução sem silenciar a fala.
Ele não estabelece um percentual de redução em todos os microfones reais.
Os testes do servidor conferem as duas associações independentes na mesma
conexão autenticada, sinalização de voz, presença, mensagens, acesso a anexos,
exclusão de canais e limpeza ao desconectar. Os novos testes reiniciam o
processo real do backend com um provedor de banco simulado que conserva os
dados, e executam a migração real em PostgreSQL/PGlite para verificar
permissões, páginas e reaplicação sem perda de mensagens.
O cenário de duas pessoas injeta mídias geradas na entrada dos receptores
para conferir a interface e o ciclo de mídia: o Chromium gerenciado deste
ambiente bloqueia UDP direto, portanto esse cenário não valida transporte RTP
entre dispositivos ou a conexão real com o SFU.

Os testes de clipes exigem também `ffmpeg` e `ffprobe` no PATH. Usam
MediaRecorder real no Chromium com tela/áudio gerados, verificam os trechos
recentes e decodificam o vídeo exportado inteiro. Conferem fronteiras EBML
fragmentadas, quadros completos, limite de memória, múltiplos pendentes,
prévia/seek, pasta escolhida (via handle real do armazenamento privado do
navegador), Downloads, persistência após reload, cancelamento, falta de espaço,
descarte durante indisponibilidade do banco local e captura sem alterar a voz.
O seletor físico de monitores e pastas, áudio de jogos, janela flutuante, tecla
global em jogos e desempenho durante a jogatina ainda exigem conferência no PC.

O workflow `windows-clips.yml` compila o componente portátil e testa a ponte
local no Windows. O teste nativo registra um atalho e usa entrada de teclado
para verificar a entrega de WM_HOTKEY sem uma página em foco. Isso não substitui
o teste no computador com seu jogo, seus drivers e o navegador em execução.

Webcams físicas, permissões do sistema operacional, fullscreen em Safari e
publicação real no Surge precisam da conferência no dispositivo final.
