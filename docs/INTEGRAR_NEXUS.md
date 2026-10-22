# Nexus no Trono — Windows 0.2.15 e site

A versão Windows 0.2.15 atualiza a integração 0.2.14 já mesclada na `main` para o novo upload do Nexus 0.15 no itch.io. Mantém os jogos, o compartilhamento de PC e a chamada existentes.

O catálogo ganhou **Jogos → Nexus** com capa, instruções de PvP e carregamento sob demanda. O jogo fica em https://semchakra10.itch.io/nexus-mn. ZIP, PCK e WASM não são copiados para o Trono. A integração acrescenta aproximadamente 140 KB de capa e código, antes de compressão HTTP.

## Publicar

1. No GitHub Actions, abra a compilação Windows aprovada. Aguarde todos os testes e o empacotamento Windows passarem.
2. Baixe o pacote **MN-Trono-Frontend-<versão>.zip** da entrega validada. Não publique um pacote de uma execução que falhou.
3. Extraia em uma pasta nova. Entre na pasta `frontend` extraída e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Abra o site e confira **Jogos → Nexus → Jogar Nexus**. O jogo abre dentro da página, com tela cheia e acesso alternativo à página oficial no itch.io.
5. Confira `/downloads/latest.yml`. No aplicativo instalado, busque a atualização e reinicie; também é possível instalar o EXE da mesma entrega.
6. No aplicativo atualizado, **Jogar Nexus** abre uma janela própria, dentro do aplicativo. Clicar novamente traz essa janela de volta, sem iniciar outra cópia. A chamada permanece no Trono.

A integração não exige mudança no backend do Trono, SQL ou novas chaves. Para quem ainda não publicou o backend da 0.2.12+, o requisito anterior de redeploy para Compartilhar PC Beta e Ticket to Ride continua válido.

## Abrir dentro da página do site

O iframe fornecido pelo proprietário já está configurado: `https://itch.io/embed-upload/19926871?color=333333`. Se uma nova publicação alterar o upload, atualize da seguinte forma.

1. Entre na sua conta do itch.io e abra as opções de incorporação **Embed game** do Nexus. Copie o código `<iframe ...>` do jogo HTML5. Não use o widget de compra ou download.
2. Copie somente o valor de `src` para `embedUrl` em `src/lib/games/nexus-config.ts` (e sincronize `electron/nexus.cjs`). São aceitos HTTPS em `itch.io/embed-upload/ID` ou `html-classic.itch.zone/html/ID/index.html`.
3. Suba a alteração, aguarde a compilação validada e publique o novo pacote. Caso a versão atual já tenha sido distribuída, incremente a versão Windows ao gerar outro instalador.

Com `embedUrl` vazio, o botão continua funcionando pela página oficial. Com um endereço válido, o site cria o iframe somente após o clique em Jogar. O botão **Abrir no itch.io** continua disponível na tela inicial do Nexus. Não insira chaves Supabase nem a URL WebSocket como endereço de iframe.

O aplicativo usa uma sessão exclusiva `persist:mn-nexus`, sem o bridge do Trono, sem microfone/câmera/captura e sem acesso às credenciais da sessão principal. A política de frames da janela principal permanece restrita a conteúdo local. O jogo possui seus próprios controles de áudio.

## Começar o PvP

O Nexus 0.15 mudou as regras e o fingerprint. No serviço separado `nexus-pvp` do Render, publique a branch `codex/nexus-015` do PROJETO-NEXUS junto com o ZIP novo no itch.io. Atualizar somente o Trono não atualiza esse servidor. Isso não exige redeploy do backend do Trono nem SQL novo.

1. Abra o Nexus no Trono e escolha **PvP online**.
2. Se o jogo pedir o servidor, use `wss://nexus-pvp.onrender.com/pvp`. A exportação Nexus 0.15 já inclui esse endereço e migra o domínio antigo salvo no jogo.
3. Escolha três heróis e seus engastes. As gemas do PvP são ilimitadas para os testes de balanceamento.
4. Um jogador cria a sala e envia o código ao adversário, que escolhe entrar na sala.
5. Os dois confirmam suas equipes. A batalha começa quando ambos estiverem prontos.

Se o PvP recusar a conexão com HTTP 403, confira no Render a variável `PVP_ALLOWED_ORIGINS`: ela deve aceitar `https://html-classic.itch.zone,https://itch.io` (e a origem real do iframe, se diferente). A origem da conexão é a do jogo hospedado, mesmo quando aberto dentro do Trono. Não coloque `/pvp` nessa variável nem exponha a service role no frontend.

Se a instância gratuita do Render estiver suspensa, aguarde sua inicialização e tente conectar novamente. Não há matchmaking público nem integração automática de contas nesta entrega. Os logs de balanceamento continuam no servidor PvP existente.

O progresso local do Nexus é separado da conta do Trono e depende do navegador, dispositivo e permissões de armazenamento. Abrir no navegador externo pode usar outro save. Dentro do site, a partida e o áudio continuam ao navegar para outra área; volte à tela Nexus ou use **Fechar jogo**. Fechar uma aba/janela em uma batalha pode causar derrota por desconexão.

## Validação

`node --test tests/nexus.js tests/nexus-browser.js` verifica a abertura sob demanda, navegação, preservação da chamada e o isolamento da janela. O teste de incorporação usa uma página remota simulada; a publicação real no itch.io deve ser conferida no navegador, pois o acesso a esse domínio está bloqueado no ambiente de desenvolvimento.
