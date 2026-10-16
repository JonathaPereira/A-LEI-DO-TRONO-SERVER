# Chat M&N / A Lei do Trono — v0.7.8-alpha

Esta versão acrescenta contas ao código da v0.7.7: cadastro com apelido, e-mail e senha, confirmação de e-mail, login, recuperação e saída. O chat e as salas passam a exigir autenticação no backend. O nome é obtido do perfil da conta, sem aceitar substituição pelo nome enviado pelo navegador.

Senhas de cadastro e redefinição precisam de pelo menos 8 caracteres, minúscula, maiúscula, número e símbolo. A interface mostra o cumprimento de cada requisito e exige confirmação da senha. Supabase guarda e verifica as senhas; o servidor do chat não armazena senhas nem usa uma chave administrativa do Supabase.

**Antes de publicar, siga `CONFIGURAR_LOGIN_v0.7.8.md`.** Execute o SQL, configure a mesma regra de senha no Supabase, habilite confirmação de e-mail, configure SMTP e preencha as variáveis no Render. Sem isso, o acesso às salas fica bloqueado por padrão.

Os três pacotes entregues são equivalentes: o completo inclui frontend, backend, testes e guia; os separados servem para atualizar Surge e Render. As telas em `qa/` foram capturadas do frontend entregue. Os arquivos da v0.7.7 permanecem no seu pacote anterior.

## Testes

```bash
npm ci --prefix backend
npm test --prefix backend
node tests/run.js
```

O teste opcional de navegador é `node tests/auth_browser_v078.js`, com Playwright instalado e Chromium disponível. `AUTH_TEST_CHROMIUM` pode indicar um executável local. Os testes de contas utilizam um provedor simulado em `backend/tests/auth-fixture.js`; não usam credenciais reais. A verificação de políticas SQL usa PostgreSQL via PGlite e pode ser executada com `node tests/auth_profiles_v078.js` quando `@electric-sql/pglite` estiver instalado.

Os testes locais não substituem a confirmação do recebimento real dos e-mails e da voz/stream nos aparelhos. Nenhum deploy foi realizado nesta entrega.
