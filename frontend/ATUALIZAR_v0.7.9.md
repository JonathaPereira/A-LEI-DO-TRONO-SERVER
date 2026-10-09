# Atualizar o chat para v0.7.9

Esta versão implementa anexos, apelido editável e ícones de perfil; restaura o canal após F5; sincroniza P2P/SFU por sala; altera a reprodução amplificada para corrigir o silêncio acima de 100%.

O código está pronto para configurar e publicar. Os anexos e as fotos de perfil só serão ativados depois de executar o SQL e configurar o R2 no Render. Seus usuários, senhas, confirmação de e-mail e SMTP atuais continuam no mesmo Supabase.

## 1. Atualizar as tabelas no Supabase

1. Abra seu projeto atual no Supabase.
2. Entre em **SQL Editor → New snippet**.
3. Abra `backend/supabase/upgrade-v079.sql` deste pacote (ou `supabase/upgrade-v079.sql` no ZIP apenas do backend), copie todo o conteúdo, cole no editor e clique em **Run**.
4. O resultado esperado é **Success. No rows returned**. Essa atualização adiciona colunas e funções; preserva os cadastros existentes. Pode ser executada novamente.

Use o SQL de atualização, pois seu banco já tem o `schema.sql` da versão anterior. Em uma instalação do zero, execute primeiro `schema.sql` e depois `upgrade-v079.sql`.

## 2. Criar um bucket privado no Cloudflare R2

1. Abra [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Entre em **Storage & databases → R2 → Overview**. Se o R2 ainda não estiver ativo, conclua a ativação que o painel solicitar.
3. Clique em **Create bucket**.
4. Use o nome `mn-chat-anexos` ou outro nome que você preferir.
5. Selecione **Standard** como classe de armazenamento e a localização automática. Esta versão usa o endpoint global; não selecione uma jurisdição especial EU/US/FedRAMP.
6. Mantenha o bucket privado, sem **Public Development URL** e sem domínio público.

Use um bucket vazio e exclusivo deste chat. O bloqueio de 8 GB considera os arquivos registrados pela aplicação; arquivos enviados manualmente pelo painel não entram nessa conta. Evite exclusões manuais no painel: use a opção **Excluir** do chat/perfil para manter o contador correto.

## 3. Obter as credenciais do R2

1. Em **R2 → Overview**, localize **Account Details → API Tokens → Manage**.
2. Clique em **Create Account API token** ou **Create User API token**, conforme estiver disponível na sua conta.
3. Dê um nome como `mn-chat-render`.
4. Escolha **Object Read & Write** e **Apply to specific buckets only**, selecionando seu bucket.
5. Conclua a criação e guarde **Access Key ID** e **Secret Access Key**. A chave secreta é mostrada uma vez.
6. Copie também o **Account ID**, exibido no resumo da conta/R2. O endpoint deve ter o formato `https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com`.

Os envios passam pelo backend; ele verifica o tamanho e envia em fluxo ao R2. Os downloads usam links assinados de cinco minutos. Não é necessário configurar CORS ou domínio próprio no bucket para esse fluxo.

## 4. Obter a chave secreta do Supabase para os anexos

1. No seu projeto Supabase, entre em **Settings → API Keys**.
2. Copie uma **Secret key**, que começa com `sb_secret_`. Se necessário, crie uma chave para o backend.
3. Essa chave vai somente no Render. Ela permite que o servidor registre arquivos e faça a reserva compartilhada de espaço.

Também há compatibilidade com a chave legada `service_role`, usando a variável `SUPABASE_SERVICE_ROLE_KEY`. Prefira a nova `SUPABASE_SECRET_KEY`. Não use a chave pública nessa variável e não coloque chaves secretas em arquivos enviados ao GitHub, frontend ou conversa.

## 5. Adicionar as variáveis no Render

Abra seu serviço atual **a-lei-do-trono-server → Environment** e adicione:

| Nome da variável | Valor |
| --- | --- |
| `R2_ACCOUNT_ID` | Account ID do Cloudflare, sem URL |
| `R2_BUCKET` | Nome exato do bucket, por exemplo `mn-chat-anexos` |
| `R2_ACCESS_KEY_ID` | Access Key ID do token R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key do token R2 |
| `SUPABASE_SECRET_KEY` | Secret key do projeto Supabase atual |

Preserve as variáveis existentes, incluindo `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL`, `AUTH_REQUIRED=true` e as configurações Cloudflare Realtime/TURN. Mantenha `APP_URL=https://a-lei-do-trono.surge.sh/` enquanto esse for o endereço do site. Não há necessidade de comprar domínio para esta atualização.

## 6. Publicar primeiro o backend

1. Extraia `A_Lei_do_Trono_v0.7.9_Backend_Render.zip`.
2. Atualize os arquivos do repositório que o Render já utiliza, incluindo `server.js`, `auth.js`, `files.js`, `realtime-sfu.js`, `package.json`, `package-lock.json` e a pasta `supabase`.
3. Respeite a estrutura atual do repositório: se `package.json` já está na raiz, coloque os arquivos do ZIP nessa raiz. Se ele fica em `backend/`, mantenha nessa pasta.
4. No Render, faça **Manual Deploy → Deploy latest commit**, se o deploy automático não iniciar. Build: `npm ci`; Start: `npm start`. A pasta raiz do serviço deve ser a que contém `package.json`.
5. Abra [o health do backend](https://a-lei-do-trono-server.onrender.com/health). Confira `version: "0.7.9-alpha"`, `auth.configured: true` e `files.configured: true`.

`files.configured: true` confirma que as variáveis estão presentes. Um upload real confirma que as credenciais, permissões e tabelas funcionam.

## 7. Publicar o frontend no Surge

1. Extraia `A_Lei_do_Trono_v0.7.9_Frontend.zip` numa pasta.
2. Publique a pasta que contém `index.html` e `assets/`, usando seu procedimento atual do Surge. Com o CLI, dentro dessa pasta:

```bash
surge . a-lei-do-trono.surge.sh
```

3. Depois da atualização, os participantes devem recarregar com **Ctrl+F5** para usar a nova versão. Atualize frontend e backend juntos: versões antigas não participam da nova sincronização de áudio da sala.

## 8. Conferir no site

1. Entre com uma conta existente e abra o chat. Use **Perfil** para alterar o apelido e escolher entre 16 ícones. Apelidos duplicados são recusados.
2. Envie uma foto pelo perfil. O site faz recorte central e converte para PNG de 256 × 256 pixels. Clique em **Salvar perfil**.
3. Abra o chat de texto, clique no clipe, escolha uma imagem/PDF ou outro arquivo e clique em enviar. Vídeos MP4/WebM têm reprodução sob demanda; outros arquivos têm download.
4. Verifique um arquivo pequeno real em outra conta, incluindo imagem, PDF e vídeo. Esse teste valida a integração com seu R2.
5. Arquivos acima de 10 MB são bloqueados; MP4/WebM acima de 100 MB também. O servidor verifica a assinatura do formato para aplicar o limite de vídeo. Os limites usam unidades decimais: 1 MB = 1.000.000 bytes.
6. Recarregue com F5: a conta e o canal devem voltar. O microfone permanece desligado até clicar em **Entrar na voz**.
7. Em uma chamada com duas pessoas, teste volume de 100%, 150% e 300%, além de **Silenciar voz**. Quando for necessário retornar a P2P, a sala inteira muda de modo. Redes restritivas ainda dependem de uma configuração TURN válida.
8. No perfil, **Meus arquivos** mostra os envios e permite excluir seus próprios arquivos para liberar espaço. Troque seu ícone antes de excluir a foto que está em uso. Se uma exclusão falhar, o espaço continua reservado até o R2 confirmar a exclusão.

O limite total é 8 GB compartilhados, incluindo anexos, fotos e envios reservados. O contador fica no Supabase e sobrevive a reinícios do Render; reservas simultâneas passam por uma transação no banco. Uploads interrompidos são limpos periodicamente após 20 minutos. Não apague a tabela `chat_files`, pois ela controla o espaço.

Os arquivos ficam no R2 e os metadados ficam no Supabase. O histórico de texto continua temporário como na base anterior: até 50 mensagens por sala, apagado quando a sala fica vazia ou o backend reinicia. Arquivos enviados permanecem disponíveis para o proprietário em **Meus arquivos** até serem excluídos.

## Referências oficiais

- [Cloudflare: criação do bucket e credenciais S3](https://developers.cloudflare.com/r2/get-started/s3/)
- [Cloudflare: tokens R2](https://developers.cloudflare.com/r2/api/tokens/)
- [Supabase: chaves públicas e secretas](https://supabase.com/docs/guides/getting-started/api-keys)
