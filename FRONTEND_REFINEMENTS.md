# Publicar os refinamentos do frontend

Esta atualização parte da atualização de comunidade já instalada. Modifica
somente o frontend e seus testes: não é necessário repetir o SQL no Supabase
nem trocar as configurações do Render.

1. Baixe o ZIP da branch `codex/frontend-refinements` no GitHub, conectado à
   conta com acesso ao repositório, e extraia-o.
2. Abra a pasta `frontend` dentro do projeto extraído. Ela contém `index.html`,
   `refinements.css` e todos os arquivos e assets necessários.
3. Clique com o botão direito dentro dessa pasta e escolha **Open Git Bash here**.
4. Execute:

   ```bash
   surge . a-lei-do-trono.surge.sh
   ```

5. Abra `https://a-lei-do-trono.surge.sh` e recarregue com **Ctrl+F5**.

Não publique a raiz do backend no Surge. Publique a pasta `frontend` completa
para incluir o CSS e a espada dos controles de volume. Os arquivos da
interface usam o identificador de cache `082refinements`; o protocolo do
backend continua `0.8.0-alpha`.

## Comportamentos para conferir

- O portal mostra as duas mulheres, os textos e os botões em desktop e celular.
- ⛶ e clique duplo abrem a câmera/tela em tela cheia; Esc volta à chamada.
  A grade fecha automaticamente ao escolher uma mídia em tela cheia.
- Grade · até 6 permite marcar/desmarcar pessoas; Tela e Câmera estão
  identificadas por pessoa. Assistir inicia uma transmissão ainda não aberta.
- Efeitos fica no canto inferior direito, com miniaturas e volume pessoal.
  Adicionar efeito permite recortar áudios longos para até 15 segundos,
  ouvir o trecho e enviar apenas esse trecho.
- Configurações → Vídeo permite escolher a entrada da câmera. A captura antiga
  é liberada antes da troca; sair da chamada cancela capturas pendentes.
- Volumes ficam abaixo dos rótulos, com a espada no seletor; barras de rolagem
  usam as cores do site e o indicador de presença fica fora do avatar.

## Validação de desenvolvimento

Execute `npm ci` e `npm run test:frontend` na raiz do projeto, com Chromium
instalado (`AUTH_TEST_CHROMIUM` permite indicar seu executável). Os cenários
usam backend local e serviços simulados; a câmera e a tela usam fontes de
teste. Os testes verificam a API nativa de tela cheia, fallback na janela,
limite da grade, liberação/cancelamento da câmera, recorte PCM estéreo exato,
upload validado pelo backend, volume pessoal e layouts desktop/celular.

Webcams físicas, permissões do sistema operacional, fullscreen em Safari e
publicação real no Surge precisam da conferência no dispositivo final.
