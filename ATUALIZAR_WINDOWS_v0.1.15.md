# M&N · Windows 0.1.15 — Cinzas do Abismo v0.5

O catálogo reúne A Lei do Trono, Azul e **Cinzas do Abismo v0.5 — Túneis, Especiais e Horda**. O roguelite tem capa animada ao passar o mouse, campanha de 15 capítulos, horda, controles de teclado/joystick/touch, tela cheia, música e efeitos. As regras, fases, cartas, imagens e músicas da versão enviada foram preservadas.

A chamada continua conectada durante o jogo. Ao voltar à comunidade ou minimizar a página, a partida pausa e a renderização é interrompida. Ao retornar, o jogo mantém a partida e permite continuar. Música começa mutada e o modo gráfico Leve é o padrão da integração para reduzir a disputa de recursos com a voz; essas opções ficam em Controles dentro do jogo.

## Publicar e atualizar

1. Faça merge do PR com **Windows full app** aprovado.
2. Abra https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases, conectado à sua conta. Na entrega mais recente de Windows 0.1.15, baixe **MN-Trono-Frontend-0.1.15.zip**.
3. Extraia em uma **pasta nova**. Use a pasta frontend completa: ela inclui o jogo, todos os recursos e downloads/ com apenas **MN-Trono-0.1.15-Windows.exe** e **latest.yml**.
4. Abra o Git Bash na pasta frontend e publique:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: **version: 0.1.15**. No app instalado, clique na versão no rodapé para buscar a atualização interna.

Publique o frontend completo antes de abrir o roguelite no app atualizado: na primeira utilização, o Windows guarda as artes e músicas publicadas em /roguelite/assets/. Depois do preparo, o cache pode ser usado sem conexão. Se o download for interrompido, Tentar novamente reaproveita os arquivos já verificados.

## Tamanho e armazenamento

O jogo enviado tem aproximadamente **19,95 MB**. Com a nova capa e o manifesto, a integração ocupa aproximadamente **22,38 MB** no site. O valor final do frontend e do instalador aparece em **TAMANHO-E-DOWNLOAD.json**, incluindo rogueliteBytes e frontendWithoutInstallerBytes.

O site contém os recursos completos; o EXE contém o código/interface do jogo e usa um cache local verificado para artes/músicas. Isso evita duplicar cerca de 22 MB no instalador e no site. A proteção do empacotador é de **190 MiB**, abaixo de 200 MB decimais. O pacote contém apenas o instalador atual; as entregas de backup conservam a versão atual e uma anterior.

O cache fica na pasta de dados do M&N, em game-assets/. Somente arquivos de imagem, áudio e dados listados no manifesto são aceitos, com tamanho e SHA-256 conferidos. JavaScript e HTML continuam exclusivamente no pacote instalado.

## Progresso do roguelite

Recordes e checkpoints da horda são **locais ao dispositivo**, conforme a versão original. A horda salva entre ondas; morrer encerra o save da run. Exportar backup e Importar backup no menu permitem transferir o progresso. O navegador e o app têm armazenamentos separados. A campanha em andamento é preservada ao alternar para o chat na mesma sessão.

**Não há SQL novo nem mudança no backend.** O ranking permanente do Azul e o backend 0.10.0-alpha continuam válidos. Contas, permissões e preferências do M&N são mantidas. Clipes permanecem suspensos.

A integração limita os menus a 12 FPS e a partida no modo Leve a 30 FPS, deixando mais tempo de processamento para a voz e os controles do aplicativo. Os modos Alta/Ultra permitem até 60 FPS; a página independente mantém o ritmo original.
