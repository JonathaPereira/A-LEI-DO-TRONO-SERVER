# Atualizar para v0.8.0 — convidado, presença e avisos da voz

Esta atualização inclui os anexos e perfis da v0.7.9. Para seu projeto atual, o SQL da v0.7.9 já foi aplicado e as cinco variáveis R2/Supabase já foram adicionadas ao Render. Preserve essas configurações e as de autenticação, Realtime e TURN. Não é necessário comprar domínio nem criar outro projeto Supabase.

## 1. Executar o novo SQL

No mesmo projeto Supabase, abra **SQL Editor → New snippet**, cole o conteúdo de `upgrade-v080.sql` e clique em **Run**. O arquivo também está em `backend/supabase/upgrade-v080.sql` no pacote completo, ou `supabase/upgrade-v080.sql` no pacote do backend.

O resultado esperado é **Success. No rows returned**. O script cria uma função para o servidor listar apelidos e ícones das contas confirmadas, inclusive quando estão offline. Não remove contas, senhas ou arquivos; pode ser executado novamente. Apenas a chave de serviço do backend pode executar essa função. E-mails e senhas não aparecem no painel de pessoas.

Em instalação nova, a ordem é `schema.sql`, `upgrade-v079.sql` e `upgrade-v080.sql`. Seu banco atual precisa apenas do último.

## 2. Atualizar o backend

1. Extraia `A_Lei_do_Trono_v0.8.0_Backend_Render.zip`.
2. Atualize o repositório usado pelo Render com todos os arquivos do pacote. Inclua o novo `community.js`, além de `server.js`, `auth.js`, `files.js`, `realtime-sfu.js`, `package.json`, `package-lock.json`, `supabase/` e `tests/`.
3. Mantenha a estrutura existente: os arquivos precisam ficar na pasta em que o serviço procura `package.json`. Evite criar uma pasta duplicada `backend/backend`.
4. Preserve as variáveis que você já configurou. Não envie arquivos com segredos ao GitHub. `.env.example` contém somente exemplos.
5. No Render, use **Manual Deploy → Deploy latest commit**, caso o deploy automático não inicie. Build: `npm ci`; Start: `npm start`.
6. Abra [o health do backend](https://a-lei-do-trono-server.onrender.com/health). Confira `version: "0.8.0-alpha"`, `auth.configured: true`, `files.configured: true` e `presence.directoryReady: true`.

A primeira consulta do diretório é assíncrona; aguarde até 30 segundos e atualize o health. Se `directoryReady` continuar falso, confira o SQL desta versão e se `SUPABASE_SECRET_KEY` pertence ao mesmo projeto. `files.configured` confirma a presença das variáveis; um envio real ainda precisa validar credenciais e permissões do R2.

## 3. Publicar o frontend

Extraia `A_Lei_do_Trono_v0.8.0_Frontend.zip`. Publique a pasta que contém `index.html` e `assets/` no endereço atual do Surge. Com o CLI, execute dentro dessa pasta:

```bash
surge . a-lei-do-trono.surge.sh
```

Use o frontend desta versão, que já inclui a v0.7.9. Após a publicação, peça aos usuários para recarregar com **Ctrl+F5**.

## 4. Conferir com duas pessoas

1. Em uma janela anônima, clique em **Jogar como convidado**, escolha um nome livre e entre em uma mesa. O visitante recebe uma identificação de convidado e pode jogar, conversar por texto na mesa e entrar na voz do jogo.
2. Tente abrir o M&N como convidado: o site deve solicitar login. O servidor também bloqueia salas, mensagens, anexos e operações SFU do M&N para esse visitante. Anexos e fotos de perfil exigem conta.
3. Dê F5 na janela do convidado: a identidade de visitante deve voltar. Isso não recupera o assento de uma partida em andamento; volte a entrar na mesa. O microfone exige uma nova ação para entrar na chamada.
4. Entre no M&N com uma conta confirmada. Abra **Pessoas**: confira nomes, ícones, online/offline e a sala atual. As salas mostram pequenos ícones dos participantes; o indicador de voz informa quem entrou na chamada.
5. Faça a segunda pessoa entrar, sair pelo botão e depois fechar a janela enquanto estiver na chamada. Confira os sons e os avisos distintos de entrada, saída e desconexão.
6. Em **Configurações**, ajuste o volume dos avisos e use o botão de teste. O padrão é 85%; 100% aumenta o aviso e 0% silencia. A opção geral de efeitos sonoros também é respeitada.
7. Confira o painel no celular pelo botão **Pessoas**, e o M&N no computador com a lista lateral aberta.
8. Com contas autenticadas, teste um envio real de imagem, PDF e vídeo e abra em outra conta. Permanecem os limites de 10 MB por arquivo, 100 MB por vídeo MP4/WebM e 8 GB compartilhados, incluindo fotos de perfil. Teste também voz entre as duas pessoas e ganho de 100%, 150% e 300%.

## Como a presença funciona

Online significa que o navegador mantém uma conexão válida com o servidor; a pessoa pode estar no portal, na mesa ou no M&N. Estar online não significa que o microfone está ativo. O painel indica a sala e a participação na voz separadamente.

O servidor atualiza a presença ao entrar/sair e consulta o diretório periodicamente. Fechar a página normalmente gera aviso imediato. Uma queda silenciosa de rede depende do heartbeat para ser percebida e pode levar cerca de 30 a 60 segundos. Os avisos de voz são enviados aos participantes da mesma sala.

Contas confirmadas continuam na lista quando estão offline. Convidados recentes são identificados à parte e ficam temporariamente na memória do servidor. A sessão de convidado dura até 12 horas na mesma aba e termina se o backend reiniciar. Convidados veem somente participantes online das mesas do jogo, sem o diretório offline nem a localização das contas no M&N.

O histórico de texto mantém o comportamento anterior: até 50 mensagens por sala, apagado quando a sala fica vazia ou o backend reinicia. Anexos continuam no R2 até serem excluídos pelo proprietário. Não exclua manualmente `chat_files` nem arquivos pelo painel R2, para preservar o controle de espaço.

## O que foi validado

Passaram testes locais de permissões, recuperação da identidade de convidado após F5, partidas e voz na mesa, presença, avisos, volume, SQL e layout desktop/celular. Os testes de regressão de contas, perfis, anexos e ganho de áudio também passaram. Supabase, R2 e SMTP foram simulados nos testes; a publicação e os testes reais das suas credenciais e de áudio entre redes diferentes ainda precisam ser feitos.
