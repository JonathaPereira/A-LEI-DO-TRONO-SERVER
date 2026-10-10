# Publicar correções de texto, voz e transmissão

Esta atualização parte da atualização de comunidade já instalada. Ela modifica
o backend e o frontend para separar a navegação de texto da sala de voz.
Não há nova migração SQL nem novas variáveis de ambiente.

1. Atualize a branch `main` do GitHub com as alterações da branch
   `codex/frontend-refinements` (PR #2). Se aparecer como rascunho, use
   **Ready for review** antes de **Merge pull request**. O backend desta correção altera
   `server.js` e `community.js`; os demais arquivos do projeto devem ser
   preservados. As alterações em `package.json` acrescentam o teste de regressão.
2. No Render, abra o serviço do backend e use **Manual Deploy → Deploy latest
   commit**, se o deploy automático ainda não começou. Aguarde **Live**.
   Os comandos continuam `npm install` e `npm start`.
3. Baixe o ZIP atualizado do GitHub, conectado à conta com acesso ao repositório,
   e extraia-o. Abra a pasta `frontend` dentro do projeto extraído. Publique
   essa pasta completa, incluindo `stream-controls.js`, `network.js`, `game.js`,
   `social.js`, o CSS e `vendor/rnnoise/`.
4. Clique com o botão direito dentro de `frontend` e escolha **Open Git Bash here**.
   Execute:

   ```bash
   surge . a-lei-do-trono.surge.sh
   ```

5. Abra `https://a-lei-do-trono.surge.sh` e recarregue com **Ctrl+F5** em todos
   os computadores. O reinício do backend encerra as chamadas existentes;
   entre novamente na voz para conferir a correção.

Publique o backend **antes** do frontend. A nova interface informa quando
está conectada a um backend antigo, em vez de trocar a voz ao abrir texto.

Não publique a raiz do backend no Surge. Publique a pasta `frontend` completa
para incluir o CSS, a espada dos controles de volume e o modelo RNNoise.
Não remova a pasta `vendor`: ela contém o processamento gratuito do microfone.
Os arquivos da interface usam o identificador de cache `086textvoice`; o protocolo do
backend continua `0.8.0-alpha`.

## Comportamentos para conferir

- Entre em uma sala de voz, ligue a câmera ou compartilhe uma tela e abra um
  canal de texto: somente as mensagens mudam. O microfone, a câmera, a
  transmissão e as streams assistidas continuam na sala de voz original.
  Voltar ao mesmo canal de voz não reconecta a chamada. Escolher outra sala
  de voz continua mudando a chamada para aquela sala.
- Excluir um canal de texto não desconecta quem está em outra sala de voz.
  Excluir a sala de voz encerra aquela chamada e preserva o canal de texto
  aberto. As mensagens e os anexos seguem o canal de texto selecionado.

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
exclusão de canais e limpeza ao desconectar.
O cenário de duas pessoas injeta mídias geradas na entrada dos receptores
para conferir a interface e o ciclo de mídia: o Chromium gerenciado deste
ambiente bloqueia UDP direto, portanto esse cenário não valida transporte RTP
entre dispositivos ou a conexão real com o SFU.

Webcams físicas, permissões do sistema operacional, fullscreen em Safari e
publicação real no Surge precisam da conferência no dispositivo final.
