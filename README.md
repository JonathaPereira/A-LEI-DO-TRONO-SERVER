# A Lei do Trono — v0.8.0 Alpha + atualização da comunidade

Cadastro, login e recuperação são integrados ao Supabase. Convidados podem jogar e usar texto e voz da mesa; acesso ao M&N, anexos e operações SFU exige autenticação. Antes do deploy, siga ATUALIZAR_v0.8.0.md e execute supabase/upgrade-v080.sql depois do SQL da v0.7.9. Instalações novas precisam de schema.sql, upgrade-v079.sql, upgrade-v080.sql, upgrade-community.sql e upgrade-chat-history.sql, nessa ordem. Preserve as configurações de Supabase/SMTP, R2 e Realtime/TURN já utilizadas.

Backend autoritativo do jogo + WebSocket + ponte segura para Cloudflare Realtime SFU.

O frontend da v0.8.0 enviado pelo criador está em `frontend/`, com seleção de
qualidade/FPS, cargos, canais, galeria de anexos, efeitos sonoros e mosaico de
até seis pessoas. Consulte [COMMUNITY_UPDATE.md](COMMUNITY_UPDATE.md) para
atualizar o Supabase, o backend e a publicação no Surge.

## Desenvolvimento local

```bash
npm ci
npm test
npm run test:frontend
npm run test:clips
npm start
```

Em outro terminal, execute `npm run start:frontend`. O backend usa a porta 10000
e o servidor estático usa 8080 (`FRONTEND_PORT` pode alterá-la). O frontend usa
o backend local ao abrir em localhost; a publicação usa o Render configurado
em `frontend/network.js`. Não existe etapa de compilação do frontend.

Os testes de navegador usam Chromium em `/usr/bin/chromium`, ou no caminho
informado em `AUTH_TEST_CHROMIUM`. Usam mídia artificial e simulam os serviços
externos. Para login e armazenamento reais, configure Supabase/R2 no backend;
o jogo como convidado pode ser validado sem essas credenciais.

## Arquivos obrigatórios
- `server.js`
- `auth.js`
- `files.js`
- `chat-history.js`
- `community.js`
- `community-management.js`
- `roles.js`
- `soundboard.js`
- `supabase/schema.sql` (executar no Supabase)
- `supabase/upgrade-v079.sql` (perfis e anexos)
- `supabase/upgrade-v080.sql` (diretório de membros para o backend)
- `supabase/upgrade-community.sql` (cargos, canais e efeitos sonoros)
- `supabase/upgrade-chat-history.sql` (mensagens persistentes)
- `realtime-sfu.js`
- `package.json`

Ao atualizar o GitHub/Render para v0.8.0, envie também `realtime-sfu.js`. O App ID e o API Token nunca devem ser gravados no repositório.

## Variáveis de contas

Veja `.env.example` e `ATUALIZAR_v0.8.0.md`: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_URL e AUTH_REQUIRED=true. A autenticação usa a chave pública; os anexos exigem também SUPABASE_SECRET_KEY (somente no backend) e as quatro variáveis R2 descritas no guia.

## Variáveis do Render
Obrigatórias para o SFU:
- `CLOUDFLARE_REALTIME_APP_ID`
- `CLOUDFLARE_REALTIME_API_TOKEN`
- `CLOUDFLARE_REALTIME_ENABLED=false` durante o primeiro deploy/teste

Freio de segurança configurado pelo projeto:
- `REALTIME_MONTHLY_SOFT_LIMIT_GB=800`
- `REALTIME_MONTHLY_HARD_LIMIT_GB=950`
- `REALTIME_ULTRA_DISABLE_GB=800 (legado: sem efeito de perfil Ultra)`
- `REALTIME_HIGH_DISABLE_GB=850`
- `REALTIME_SCREEN_DISABLE_GB=900`

Opcionais:
- `REALTIME_MONTHLY_BASE_GB=0` — uso do mês já ocorrido antes do processo atual. Recomendado atualizar com o valor real do painel da Cloudflare antes de futuros redeploys/restarts, porque o disco `/tmp` do Render não é persistência de faturamento.
- `REALTIME_MAX_PARTICIPANTS=8` — teto de segurança de participantes simultâneos no transporte SFU dos três canais de voz. O chat de texto continua sem esse teto.


### TURN opcional (recomendado para celular / redes restritivas)
O SFU normalmente tenta STUN direto. Para redes móveis, CGNAT e firewalls restritivos, configure também o Cloudflare TURN com uma TURN Key separada:
- `CLOUDFLARE_TURN_ENABLED=true`
- `CLOUDFLARE_TURN_KEY_ID=<Token ID da TURN Key>`
- `CLOUDFLARE_TURN_API_TOKEN=<API token da TURN Key>`
- `CLOUDFLARE_TURN_TTL_SECONDS=21600`

Essas credenciais ficam somente no Render. O backend gera credenciais TURN curtas para o navegador; o segredo de longa duração não é exposto ao frontend.

## Sequência segura de ativação do SFU

Para a atualização de contas, prepare também a autenticação antes de publicar os dois pacotes. Se o SFU já está funcionando, preserve sua configuração atual; os passos abaixo são para sua primeira ativação.
1. Deploy deste backend mantendo `CLOUDFLARE_REALTIME_ENABLED=false`.
2. Abra `/health` e confirme `version: 0.8.0-alpha`, `realtime.configured: true` e `realtime.enabled: false`.
3. Publique o frontend v0.8.0 e teste o Salão Livre; com o kill switch desligado ele deve continuar em P2P.
4. Só então mude `CLOUDFLARE_REALTIME_ENABLED=true` no Render e faça novo deploy.
5. Teste primeiro 2 participantes, depois 3. Observe o cartão de infraestrutura no painel de Configurações.
6. Em qualquer anomalia de consumo/mídia, volte `CLOUDFLARE_REALTIME_ENABLED=false` e redeploy.

## Freio de consumo
O backend mantém uma estimativa conservadora de egress a partir das assinaturas ativas e bitrates máximos configurados. Essa estimativa não é a fatura oficial da Cloudflare.

Política padrão:
- 0–799 GB: normal
- 800 GB: aviso de consumo (Ultra já removida)
- 850 GB: Alta bloqueada (máximo Equilibrada)
- 900 GB: novos compartilhamentos de tela bloqueados
- 950 GB: novas operações SFU bloqueadas

O kill switch é independente desses números.

## Escopo v0.8.0
O SFU é experimental e aceita `chat-livre`, `chat-jogos` e `chat-conversa`, com mídia isolada por sala. A comunicação durante a partida continua P2P nesta versão. Se o SFU estiver desativado ou falhar na inicialização, o cliente retorna ao P2P.

## Anexos e perfis v0.8.0

Consulte ATUALIZAR_v0.8.0.md. Adicione SUPABASE_SECRET_KEY e as quatro variáveis R2 da .env.example somente no Render. SQL mantém a reserva de 8 GB; uploads em fluxo limitam arquivos a 10 MB e vídeos MP4/WebM a 100 MB. Credenciais nunca vão ao frontend. Perfis usam uma função SQL autenticada, sem permissão de atualização livre na tabela. O backend escolhe um transporte por chamada; fallback para P2P vale para todos até a chamada esvaziar.

## Convidados e presença v0.8.0

O backend valida a identidade temporária de convidado e restringe suas operações à mesa do jogo. O diretório de contas confirmadas é obtido por uma função SQL exclusiva da chave de serviço; não inclui e-mails ou senhas. O health informa `presence.directoryReady`. Eventos de voz diferenciam entrada, saída e desconexão. Veja ATUALIZAR_v0.8.0.md para validar o fluxo completo.

## Texto independente e histórico persistente

Abrir um canal de texto mostra as mensagens como área principal e mantém a
chamada na sala de voz original, com controles compactos. As mensagens de
texto/mistos são gravadas no Supabase antes de serem transmitidas. O histórico
sobrevive a deploys e à saída de todos do canal; páginas de 50 mensagens podem
ser carregadas pelo botão Mensagens anteriores. As mensagens da mesa do jogo
continuam temporárias e convidados não acessam o histórico da comunidade.

Execute `supabase/upgrade-chat-history.sql` antes de publicar esta versão do
backend. Reutiliza `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (ou a chave legada de
serviço), sem depender do R2 para texto. Tabela e RPCs são acessíveis somente
pelo backend; ele valida autenticação e associação ao canal em cada leitura.
`/health` informa `chatHistory.configured` e `chatHistory.ready` após uma operação.
Veja [FRONTEND_REFINEMENTS.md](FRONTEND_REFINEMENTS.md) para publicar SQL,
backend e frontend, nessa ordem. A migração não recupera mensagens que só
estavam na memória do backend antigo.

## Correção das confirmações de mensagens e estado de áudio

O backend aceita HTTP 204 sem JSON ao gravar mensagens pelo RPC que retorna
`void` no Supabase. Leituras continuam exigindo histórico válido e erros reais
não são confirmados como envio. Os testes de SQL e WebSocket reproduzem a
resposta vazia e verificam entrega e persistência após reiniciar o backend.

O estado privado da chamada inclui `deafened`, separado de `muted`; os perfis
mostram ícones de microfone e fone cortados aos membros da chamada. A escuta
silenciada não muda o estado do microfone. O compositor mantém anexar, emoji,
texto e enviar na mesma linha em desktop/celular. Esta correção não altera
a migração SQL nem exige novas variáveis: atualize Render e depois Surge.

## Modo leve para jogar

Em Configurações da chamada → Áudio, o modo leve opcional solicita a supressão
nativa do navegador em vez do RNNoise, reduz medidores para cerca de 5 Hz e
coleta diagnóstico a cada 10 segundos com o painel fechado. O modo normal
mede fala a cerca de 10 Hz; os indicadores não redesenham as câmeras e ficam
sem leituras/atualizações quando a página está oculta. A coleta de estatísticas
é serializada. O modo preserva mute e ganho e é salvo só no navegador local.

O navegador não reserva CPU/memória nem controla a prioridade do jogo. Esta
redução de trabalho pode ajudar, mas não garante áudio sem cortes sob carga
nem substitui diagnóstico de CPU, drivers ou rede. Esta versão exige apenas
publicar o frontend; não há migração SQL ou mudança do backend.

## Clipes de replay locais

O botão **Clipes** abre a captura dos últimos 15, 30, 60 ou 120 segundos da
tela/janela escolhida no navegador. Qualidade (720p, 1080p ou 1440p), FPS
(30/60) e atalho são pessoais. Vários clipes ficam pendentes em IndexedDB,
por conta e site, com prévia, salvar e descartar. Escolher uma pasta não salva
automaticamente; cada clipe precisa de confirmação. Downloads mantêm a cópia
local porque o site não consegue confirmar a conclusão do download.

A captura é separada da chamada, não liga o microfone e não envia vídeos ao
servidor. O atalho funciona apenas com a página ou janela de clipes em foco,
sem atalho global do Windows. O buffer de vídeo codificado tem limite de
64 MiB, sem reencodar ao clipar; a duração depende dos quadros completos e pode
ser menor em qualidades altas. Se faltar espaço no navegador, a captura para
e preserva o clipe na sessão para exportar/descartar antes de fechar.
Limpar os dados do site pode excluir os pendentes. Consulte
[FRONTEND_REFINEMENTS.md](FRONTEND_REFINEMENTS.md) para uso e publicação.
Só é necessário publicar o frontend; não há novo SQL ou configuração do backend.

`npm run test:clips` exige Chromium, `ffmpeg` e `ffprobe` no PATH. Os testes
usam MediaRecorder real com vídeo/áudio gerados, decodificam os WebMs exportados,
verificam recorte recente, limite de memória, persistência, salvamento,
cancelamento, falta de espaço e isolamento do microfone da chamada. A escolha
de monitor, áudio do jogo e desempenho sob carga devem ser conferidos no PC.
