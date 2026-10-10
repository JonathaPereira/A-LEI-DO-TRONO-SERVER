# Publicar o modo leve para jogar

Esta versão modifica apenas o frontend. O backend e a migração do histórico
continuam iguais à correção de mensagens já publicada. Não há SQL, dependências
ou variáveis novas.

O navegador não permite reservar CPU ou memória do computador para o chat.
Esta atualização reduz o trabalho do próprio chat, sem prometer eliminar cortes
causados pelo jogo, por drivers de áudio ou pela rede.

## Publicação

1. Baixe o ZIP desta atualização no GitHub e extraia-o.
2. Abra a pasta `frontend` extraída e use **Open Git Bash here**.
3. Publique a pasta completa, incluindo `vendor/rnnoise/`:

   ```bash
   surge . a-lei-do-trono.surge.sh
   ```

4. Recarregue o site com **Ctrl+F5** em cada computador.
5. Quem está jogando deve abrir **Configurações da chamada → Áudio** e ligar
   **Modo leve para jogar**. O botão vale apenas para este navegador/aparelho
   e a preferência continua após recarregar a página.

A branch `codex/voice-light-mode` guarda a atualização para revisão no GitHub.
A publicação desta versão exige somente o frontend no Surge. Se você fizer
merge e o Render estiver com deploy automático, ele poderá reiniciar o backend,
embora não haja mudança de código do servidor.

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

Os arquivos da interface usam o cache `089voicelight`.

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
`node --test tests/noise-processing.js`
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

Webcams físicas, permissões do sistema operacional, fullscreen em Safari e
publicação real no Surge precisam da conferência no dispositivo final.
