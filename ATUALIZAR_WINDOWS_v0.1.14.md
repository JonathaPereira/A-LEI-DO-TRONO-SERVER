# M&N · Windows 0.1.14 — mercado do Azul e telas menores

O mercado do Azul ocupa uma parte maior da mesa, e os murais ficam limitados a 410 px. Nas telas largas, os expositores circulam o centro entre os murais. Nos monitores verticais, o mercado vai para cima dos murais; nas janelas estreitas, os expositores ficam em três colunas para manter peças maiores. A disposição considera a largura disponível depois dos controles de voz e das barras laterais. Em monitores de 720 px de altura, o mercado cabe acima dos controles da chamada.

As artes, as regras, o ranking e a contagem animada continuam funcionando. Alternar entre jogo e comunidade mantém a chamada conectada.

## Publicar

1. Faça merge do PR com Windows full app verde.
2. Abra https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases, conectado à sua conta. Na entrega mais recente de Windows 0.1.14, baixe **MN-Trono-Frontend-0.1.14.zip**.
3. Extraia em uma pasta nova. frontend/downloads contém somente **MN-Trono-0.1.14-Windows.exe** e **latest.yml**.
4. Abra o Git Bash dentro da pasta frontend e publique:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: **version: 0.1.14**. No app instalado, clique na versão do rodapé para verificar a atualização. Ele baixa internamente e permite reiniciar para instalar.

O tamanho exato aparece em TAMANHO-E-DOWNLOAD.json. O site contém um instalador atual; as entregas de backup conservam a versão atual e uma anterior. Use instalador e manifesto da mesma entrega.

**Não há SQL novo nem mudança no backend.** A migração anterior do Azul e o backend 0.10.0-alpha continuam válidos. Contas, preferências, permissões, chat, chamada e ranking são preservados. Clipes permanecem suspensos.

O roguelite não faz parte deste pacote: sua integração depende do fornecimento da versão final do jogo, que não estava neste repositório.
