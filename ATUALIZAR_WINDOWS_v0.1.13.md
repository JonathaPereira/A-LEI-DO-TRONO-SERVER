# M&N · Windows 0.1.13 — artes aprovadas de Azul

As artes aprovadas foram aplicadas ao jogo: peças e expositores vêm da prancha original; moldura, encaixes, chão e bônus vêm do cartão mural. As células continuam sendo interativas e redimensionáveis. A pontuação, as animações e as regras são as mesmas. O catálogo e a entrada de Azul mostram a capa baseada na referência enviada, e a partida usa um fundo de madeira.

## Publicar

1. Faça merge do PR com Windows full app verde.
2. Abra https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases, conectado à sua conta. Na entrega mais recente de Windows 0.1.13, baixe **MN-Trono-Frontend-0.1.13.zip**.
3. Extraia em uma pasta nova. frontend/downloads contém somente **MN-Trono-0.1.13-Windows.exe** e **latest.yml**.
4. Abra o Git Bash dentro da pasta frontend e publique:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: **version: 0.1.13**. No app instalado, clique na versão do rodapé para verificar a atualização. Ele baixa internamente e permite reiniciar para instalar.

O EXE já está dentro do frontend; não é necessário publicá-lo em outro repositório. Preserve o manifesto e seu SHA-512 e use os arquivos da mesma entrega. O tamanho exato aparece em TAMANHO-E-DOWNLOAD.json. Os backups conservam a versão atual e uma anterior; o site contém apenas o instalador atual.

**Não há SQL novo nem mudança no backend.** A migração anterior do Azul e o backend 0.10.0-alpha continuam válidos. Contas, preferências, permissões, chat, chamada e ranking são preservados. Clipes permanecem suspensos.

## Conferência

Abra Jogos e confira a capa do Azul. Comece uma mesa e confira as peças, expositores, placa de nome, paredes e penalidades. Complete uma rodada e acompanhe os pontos. Teste Original/Discord, janela pequena, monitor vertical e tela cheia. Alterne ao chat e volte: a chamada permanece conectada.
