# M&N · Windows 0.1.12 — Azul e publicação com um único instalador

O Azul recebeu tabuleiros e peças de cerâmica, fábricas centrais, layout responsivo, tela cheia, pontuação detalhada e efeitos sonoros. Voz, ranking, temas e configurações continuam funcionando. Não há SQL novo nem mudança no backend.

## Publicar tudo de uma vez

1. Faça merge do PR desta correção e abra o link de downloads indicado no PR. Entre na conta GitHub e baixe **MN-Trono-Frontend-0.1.12.zip**.
2. Extraia numa pasta nova. A pasta **frontend** já contém o EXE atual em downloads/ e seu latest.yml. Nenhuma versão antiga do instalador vem junto.
3. No Git Bash, entre na pasta frontend extraída e publique:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: version: 0.1.12. Confira também o botão Baixe a versão desktop no login.
5. No aplicativo instalado, clique na versão no rodapé para buscar a atualização. Ele baixa o instalador do próprio Surge e permite reiniciar para instalar; conta, permissões e preferências são mantidas.

**Não precisa publicar o EXE em outro repositório.** O pacote completo tem aproximadamente 154 MB, incluindo somente o instalador atual. O ZIP inclui TAMANHO-E-DOWNLOAD.json com os tamanhos e digest. Preserve latest.yml e seu SHA-512.

O EXE avulso da entrega privada é opcional para instalação manual. Para publicar o site, basta o ZIP com a pasta frontend completa. O canal de atualização permanece o mesmo das versões anteriores. A versão anterior fica apenas nos backups, fora do frontend publicado.

## Conferir o jogo

Entre numa chamada e abra Jogos → Azul. Escolha uma cor e uma linha destacada. Ao fechar a rodada, acompanhe as peças indo para a parede, os pontos, o chão e os bônus. Concluir contagem mostra imediatamente a mesa atual. Teste tela cheia e Escape, e alterne entre jogo e chat: a mesma chamada continua. Em telas estreitas, as fábricas ficam compactas e os tabuleiros são acessíveis por rolagem.
