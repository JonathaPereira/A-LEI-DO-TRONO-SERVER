# Windows 0.2.8 · GIFs do GIPHY

O seletor de avatar, capa e fundo passa a usar GIPHY. A busca integrada oferece tendências, pesquisa e paginação quando uma chave oficial estiver configurada. Sem chave, use **Abrir busca no GIPHY**, escolha um GIF, copie seu link e cole no campo do seletor. Clique em **Pré-visualizar**, escolha a imagem e salve o perfil. GIFs continuam limitados a 10 MB; os créditos antigos do Wikimedia permanecem válidos.

## Preparar Supabase e Render

1. No SQL Editor do Supabase, execute **20261016140000_giphy_profile_credits.sql**, incluído na raiz do ZIP e em `supabase/migrations/` no GitHub. Esta migração atualiza o validador dos créditos. Requer as migrações anteriores de perfis já aplicadas; não apaga nem substitui os perfis existentes.
2. Atualize o backend no Render com o código desta revisão. O endpoint autenticado `/community/gif-provider` fornece a configuração do catálogo.
3. Para resultados dentro do app, crie uma aplicação **API** em [GIPHY Developers](https://developers.giphy.com/dashboard/) e configure a chave fornecida como variável **GIPHY_API_KEY** no backend do Render. Salve e aguarde o redeploy. Não cole a chave no chat nem a grave no Git. Limites de desenvolvimento e aprovação de produção dependem do GIPHY.

A chave de API do GIPHY identifica o cliente e é enviada ao navegador autenticado para consultas diretas ao provedor. Ela não é um segredo de servidor. Nunca use tokens de serviço, Supabase ou credenciais privadas nessa variável. Os pedidos ao GIPHY não recebem o token de sessão do aplicativo.

Você pode publicar sem chave: a importação pelo link continuará disponível. Com um backend anterior, a busca também oferece esse caminho. Sem executar o SQL novo, salvar créditos do GIPHY será recusado pelo banco.

## Baixar e publicar

Na entrega **Pacotes Windows 0.2.8** da compilação aprovada nas [Releases do repositório](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), baixe:

- `MN-Trono-Frontend-0.2.8.zip`: frontend completo, EXE, manifesto e SQL.
- `MN-Trono-0.2.8-Windows.exe`: o mesmo instalador, separado.
- `SHA256SUMS-0.2.8.txt`: hashes para conferência.

Extraia em uma pasta nova, entre na pasta `frontend` e execute no Git Bash:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique a pasta inteira, incluindo `downloads/`. Confira se `https://a-lei-do-trono.surge.sh/downloads/latest.yml` mostra `version: 0.2.8`. Preserve o manifesto e o EXE da mesma entrega; atualize pelo aplicativo ou instale o EXE manualmente.

## Validação

Testes usam respostas controladas do GIPHY para verificar busca, seleção, prévia, erros, ausência de chave e salvamento. A migração é executada em PostgreSQL de teste, incluindo créditos antigos e rejeição de fontes falsas. O acesso ao catálogo real depende da chave oficial do seu aplicativo; não foi ativado com credenciais emprestadas.
