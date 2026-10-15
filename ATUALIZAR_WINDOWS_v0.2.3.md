# Windows 0.2.3 — chamadas e perfis

O instalador inclui a interface do PR #29: chamada como área principal, jogos separados, canais e mensagens diretas à esquerda, controles inferiores com rótulos no Original e ícones no Discord. O editor de perfil oferece prévia ao vivo, avatar/capa/fundo em imagem ou GIF, identidade, bio, interesses, links e ajustes de aparência. O miniperfil abre ao clicar no avatar. A lista de e-mails é exclusiva do criador e não consulta senhas.

## Publicar

1. Confirme que o backend da revisão do PR #29 foi publicado no Render. Os perfis dependem dessas rotas. A migração `20261015145458_member_profiles.sql` já foi aplicada no projeto chat-mn; não execute novamente nessa base.
2. Baixe `MN-Trono-Frontend-0.2.3.zip` da compilação Windows aprovada no GitHub. Extraia numa pasta nova.
3. Dentro de `frontend/downloads`, mantenha somente `MN-Trono-0.2.3-Windows.exe` e `latest.yml` desta mesma entrega.
4. No Git Bash, dentro de `frontend`, execute `npx surge . a-lei-do-trono.surge.sh`.
5. Confira se `https://a-lei-do-trono.surge.sh/downloads/latest.yml` mostra `version: 0.2.3`. O botão de download da página aponta para o EXE incluído.
6. Quem já usa o app pode verificar a atualização, baixar e reiniciar para instalar. Para instalação manual, execute `MN-Trono-0.2.3-Windows.exe`. Conta, preferências e permissões são mantidas.

Não edite o SHA-512 de `latest.yml`: ele identifica os bytes exatos do instalador aprovado. O pacote inclui o site inteiro e apenas este instalador, dentro do limite preventivo de tamanho do empacotador.

O processo Windows executa verificações do runtime e do aplicativo compilado antes de produzir o instalador. A conferência humana do visual/responsividade e uma chamada real entre duas pessoas continuam recomendadas após a publicação.
