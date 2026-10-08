# Ativar contas no Chat M&N — v0.7.8

O código já contém cadastro, login por e-mail e senha, confirmação de e-mail, recuperação, renovação de sessão e saída da conta. Para funcionar no seu site, primeiro configure o Supabase e o envio de e-mails, depois publique os dois pacotes. Cerca de 30 usuários cabem na franquia de autenticação mencionada na conversa.

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com/dashboard e crie um projeto no plano gratuito.
2. Guarde a senha do banco de dados. Ela NÃO é a senha dos participantes e NÃO deve ser colocada no frontend.
3. Nas configurações do projeto, copie a **Project URL** (`https://....supabase.co`) e a chave **publishable** (`sb_publishable_...`). A chave antiga **anon** também é aceita.
4. Este projeto não precisa de chave `service_role` nem `sb_secret_...` para as contas. Não use essas chaves no lugar da publishable.

## 2. Criar a tabela de perfis

No Supabase, abra **SQL Editor**, crie uma consulta, cole TODO o arquivo `backend/supabase/schema.sql` e execute.

Ele cria a tabela `profiles`, o apelido único e o vínculo automático entre uma nova conta e seu perfil. A pessoa só pode ler o próprio perfil; não recebe permissão de criar, editar ou excluir perfis diretamente. O apelido é reservado mesmo com o usuário offline, sem diferenciar maiúsculas/minúsculas, e será fixo nesta versão.

Execute antes de permitir cadastros. O script é para um projeto novo, sem usuários do chat já cadastrados. Se houver contas anteriores, faça a migração de seus perfis antes de usá-las; não apague usuários para resolver isso.

## 3. Configurar autenticação e regra de senha

Nas configurações de **Authentication**:

- Habilite cadastro e entrada por e-mail/senha.
- Mantenha **Confirm email** habilitado. Este código exige e-mail confirmado para entrar.
- Defina o comprimento mínimo da senha como **8**.
- Em caracteres obrigatórios, selecione **letras minúsculas, maiúsculas, números e símbolos**. Essa regra no Supabase também impede que alguém contorne a validação do nosso site usando a API diretamente.
- Esta versão não implementa OAuth, contas anônimas ou convites sem apelido; mantenha esses caminhos desabilitados para este projeto.

O site mostra cinco requisitos durante cadastro e redefinição. A senha também é conferida no backend. Espaço não conta como símbolo; as categorias de letras correspondem a `a–z` e `A–Z`. O limite superior é 72 bytes UTF-8 para compatibilidade com o armazenamento de senhas do provedor; senhas nunca são truncadas pelo nosso código.

## 4. Configurar endereço do site

Em **Authentication → URL Configuration**:

1. Defina **Site URL** como o endereço HTTPS atual do site, por exemplo `https://SEU_SITE.surge.sh/`.
2. Na lista de **Redirect URLs**, autorize esse endereço e `https://SEU_SITE.surge.sh/?auth=recovery`.
3. Use o endereço real do site e evite curingas para outros domínios.

Se posteriormente mudar para domínio próprio, atualize essas URLs e a variável `APP_URL` do Render. O frontend continua podendo estar no Surge.

## 5. Habilitar envio de e-mails

Configure **Custom SMTP** nas configurações de autenticação. Você pode usar o Resend ou outro serviço SMTP. O envio padrão do Supabase é restrito a testes e não atende os participantes do chat.

Para Resend:

1. Crie sua conta em https://resend.com.
2. Adicione e verifique um domínio seu seguindo os registros DNS indicados pelo serviço. O domínio pode servir apenas para e-mail; o endereço do site pode continuar no Surge.
3. Crie a chave e copie as configurações SMTP mostradas pelo Resend.
4. Informe o servidor, porta, usuário, senha SMTP, endereço remetente verificado e nome **Chat M&N** no **Custom SMTP** do Supabase. Essas credenciais ficam no Supabase; não vão no frontend nem no ZIP.
5. Verifique os limites de envio no serviço e em **Authentication → Rate Limits**. A franquia gratuita do Resend tem limite diário, além do mensal.

Pode manter os modelos padrão de **Confirm signup** e **Reset password**, incluindo `{{ .ConfirmationURL }}`. O código aceita o retorno padrão do Supabase e também links com `token_hash`. Os links são removidos do endereço antes de a página carregar o restante dos recursos.

Não é necessário comprar uma caixa postal ou contratar Google Workspace apenas para mandar esses e-mails automáticos. O remetente precisa ser autorizado no serviço escolhido.

## 6. Adicionar variáveis no Render

No serviço existente, abra **Environment** e adicione:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable do projeto |
| `APP_URL` | URL HTTPS exata do site, com `/` no final |
| `AUTH_REQUIRED` | `true` |
| `TRUST_PROXY_HOPS` | `1` para o serviço atual no Render |

Se estiver usando chave antiga, use `SUPABASE_ANON_KEY` em vez de `SUPABASE_PUBLISHABLE_KEY`. Preserve todas as variáveis Cloudflare/TURN que o chat já utiliza. Não crie a variável `AUTH_TEST_LOCAL` em produção: ela existe exclusivamente para testes locais.

`AUTH_ALLOWED_ORIGINS` é opcional e só serve para outros endereços legítimos do frontend, separados por vírgula e sem barra no final. `APP_URL` já autoriza a origem principal.

## 7. Publicar

1. Atualize TODO o backend com o conteúdo de `backend/`, incluindo `auth.js`. O comando de início permanece `npm start`; não foi adicionada dependência de produção.
2. Publique TODO o conteúdo de `frontend/`, incluindo `auth-boot.js`, `auth.js`, `auth.css` e o novo `index.html`.
3. Confira o `/health` do backend: versão `0.7.8-alpha`, `auth.required: true` e `auth.configured: true`.
4. Recarregue com **Ctrl+F5** nos aparelhos.

Autenticação é obrigatória por padrão. Sem configuração, a página pode ser vista, mas a entrada autenticada nas salas fica indisponível. Não publique o novo pacote antes de preparar Supabase e SMTP. `AUTH_REQUIRED=false` só existe para uma implantação deliberadamente sem bloqueio e para as regressões antigas: **não use para liberar este login**.

## 8. Testar com duas contas

1. Crie uma conta com apelido, e-mail e senha válida.
2. Tente entrar antes de confirmar o e-mail: o acesso deve ser recusado.
3. Confirme o e-mail e entre. Confira o apelido no portal e nas mensagens.
4. Tente criar outra conta com o mesmo apelido: deve ser recusada.
5. Use **Esqueci minha senha**, abra o e-mail e escolha uma senha nova.
6. Confira que a senha antiga deixou de funcionar e a nova funciona.
7. Use **Sair** e confira que não consegue entrar na sala sem login.
8. Com dois participantes autenticados, confira texto, voz e compartilhamento de tela.

A sessão fica na aba e pode ser restaurada ao recarregar. Senhas não são salvas no navegador. Encerrar a aba normalmente exige novo login; navegadores que restauram abas podem preservar o armazenamento de sessão. A recuperação usa um token temporário em memória. Redefinir a senha encerra as conexões anteriores da conta nesta instância do backend.

Cada conta pode ocupar uma sala por vez, como na regra de nomes já existente. Se abrir uma segunda aba ou aparelho e tentar entrar em outra sala, o site pede para sair da primeira sala.

## Validação e limites desta entrega

- Testes HTTP/WebSocket com autenticação obrigatória e provedor Supabase simulado: cadastro, confirmação, login, token adulterado, nome da conta, renovação, recuperação, link inválido/reutilizado, redefinição, encerramento de sessões, logout, origem e excesso de tentativas.
- Fluxos testados em Chromium com o frontend real e o backend real contra o provedor simulado; telas conferidas em desktop e mobile.
- Regressões anteriores continuam cobrindo portal, áudio, SFU, stream e canais. Os testes antigos usam explicitamente `AUTH_REQUIRED=false`; os novos usam `true`.
- Esta entrega não criou projeto na sua conta Supabase, não configurou SMTP e não publicou no Surge/Render. Ainda é necessário testar recebimento real dos e-mails e as chamadas entre seus aparelhos após ativar.
- Anexos de fotos e vídeos ficam para a próxima etapa.

Fontes oficiais: https://supabase.com/docs/guides/auth/passwords , https://supabase.com/docs/guides/auth/password-security , https://supabase.com/docs/guides/auth/auth-smtp , https://supabase.com/docs/guides/getting-started/api-keys e https://resend.com/docs/dashboard/domains/introduction .
