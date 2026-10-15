# Interface de chamadas e perfis

A chamada M&N ocupa sua própria área. A navegação Call / Jogos mantém a biblioteca separada. Os dois layouts compartilham os mesmos controles e elementos de mídia: Original usa uma barra inferior discreta com rótulos curtos; Discord usa ícones. Canais e mensagens diretas ficam à esquerda. Em janelas menores, os painéis podem ser recolhidos; o menu de canais vira uma gaveta no celular.

O botão Original / Discord no cabeçalho troca o layout durante a chamada. Câmeras, seleção de telas, grade, configurações e efeitos continuam usando os controladores existentes. O botão Pessoas abre a presença sob demanda.

## Perfil

Abra Perfil para editar nome, @usuário exclusivo, bio, status e emoji, até 12 interesses e 8 links HTTPS. Avatar, capa e fundo aceitam PNG, JPG, WebP ou GIF de até 10 MB. GIFs preservam a animação. Ajustes de cor, escurecimento, desfoque e opacidade aparecem na prévia ao vivo. O fundo fica restrito ao perfil/miniperfil. Clique no avatar de um participante para abrir o miniperfil e escolha Ver perfil completo para ampliá-lo.

## Área do criador

Contas no cabeçalho, ou Área do criador na edição do perfil, mostra nomes, e-mails de cadastro e confirmação, em páginas de 50. Apenas a conta criadora com e-mail confirmado pode acessar. Admins e membros são recusados no backend e no banco, inclusive por RPC direto. Perfis e eventos de presença não carregam os e-mails da lista. Nenhuma senha ou hash é consultado ou exibido.

## Publicação

A migração `20261015145458_member_profiles.sql` **já foi aplicada no projeto chat-mn** durante esta atualização. Ela preserva contas, canais, mensagens e arquivos existentes. Não execute novamente nessa base.

1. Publique o backend desta revisão, incluindo `profile-customization.js`. As rotas novas estão em `community-management.js`; o salvamento usa `auth.js`.
2. Publique a pasta `frontend` desta mesma revisão no Surge. Abra o Git Bash dentro dela e use `npx surge . a-lei-do-trono.surge.sh`.
3. O aplicativo Windows precisa de uma nova compilação com este frontend para receber a interface. Um EXE antigo continua com sua interface empacotada anterior. Esta entrega de código não substitui um instalador.

Para outra base, aplique o SQL novo depois das atualizações existentes de comunidade e anexos diretos.

## Verificação

- `npm test`: suíte completa do backend passou.
- `npm run test:profiles`: validação de entradas e permissões SQL passou; cobre persistência, atualização atômica, unicidade do @usuário, imagens pertencentes ao usuário, bloqueio de exclusão de mídia em uso, negação de e-mails a membros/admins/anônimos e ausência de e-mail no perfil público.
- Os 54 scripts frontend passaram pela análise de sintaxe. Os dois CSS novos foram analisados sem erro.
- Checagem de DOM sem renderização passou para prévia/salvamento do perfil, miniperfil e preservação dos mesmos botões ao trocar layout e navegar.
- Teste de navegador do projeto tentou executar, mas não pôde iniciar: `/usr/bin/chromium` não existe neste ambiente. **Não houve validação visual renderizada das quebras responsivas nem teste de chamada real com duas pessoas nesta revisão.**
- O banco online confirmou RLS ativo, bloqueio para anônimos e recusa de consulta de e-mails para membro. Os avisos de segurança existentes do projeto não apontaram novos objetos desta atualização.

O código está em uma branch separada; publicar frontend/backend ainda depende da integração dessa revisão.
