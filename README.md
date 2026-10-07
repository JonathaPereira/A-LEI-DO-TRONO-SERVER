# A Lei do Trono — Backend v0.6.2 Alpha

Backend autoritativo do jogo + WebSocket + ponte segura para Cloudflare Realtime SFU.

## Arquivos obrigatórios
- `server.js`
- `realtime-sfu.js`
- `package.json`

Ao atualizar o GitHub/Render para v0.6.2, envie também `realtime-sfu.js`. O App ID e o API Token nunca devem ser gravados no repositório.

## Variáveis do Render
Obrigatórias para o SFU:
- `CLOUDFLARE_REALTIME_APP_ID`
- `CLOUDFLARE_REALTIME_API_TOKEN`
- `CLOUDFLARE_REALTIME_ENABLED=false` durante o primeiro deploy/teste

Freio de segurança configurado pelo projeto:
- `REALTIME_MONTHLY_SOFT_LIMIT_GB=800`
- `REALTIME_MONTHLY_HARD_LIMIT_GB=950`
- `REALTIME_ULTRA_DISABLE_GB=800`
- `REALTIME_HIGH_DISABLE_GB=850`
- `REALTIME_SCREEN_DISABLE_GB=900`

Opcionais:
- `REALTIME_MONTHLY_BASE_GB=0` — uso do mês já ocorrido antes do processo atual. Recomendado atualizar com o valor real do painel da Cloudflare antes de futuros redeploys/restarts, porque o disco `/tmp` do Render não é persistência de faturamento.
- `REALTIME_MAX_PARTICIPANTS=8` — teto de segurança de participantes simultâneos no transporte SFU do Salão Livre. O chat de texto continua sem esse teto.

## Sequência segura de ativação
1. Deploy deste backend mantendo `CLOUDFLARE_REALTIME_ENABLED=false`.
2. Abra `/health` e confirme `version: 0.6.2-alpha`, `realtime.configured: true` e `realtime.enabled: false`.
3. Publique o frontend v0.6.2 e teste o Salão Livre; com o kill switch desligado ele deve continuar em P2P.
4. Só então mude `CLOUDFLARE_REALTIME_ENABLED=true` no Render e faça novo deploy.
5. Teste primeiro 2 participantes, depois 3. Observe o cartão de infraestrutura no painel de Configurações.
6. Em qualquer anomalia de consumo/mídia, volte `CLOUDFLARE_REALTIME_ENABLED=false` e redeploy.

## Freio de consumo
O backend mantém uma estimativa conservadora de egress a partir das assinaturas ativas e bitrates máximos configurados. Essa estimativa não é a fatura oficial da Cloudflare.

Política padrão:
- 0–799 GB: normal
- 800 GB: Ultra bloqueada
- 850 GB: Alta bloqueada (máximo Equilibrada)
- 900 GB: novos compartilhamentos de tela bloqueados
- 950 GB: novas operações SFU bloqueadas

O kill switch é independente desses números.

## Escopo v0.6.2
O SFU é experimental e fica restrito ao `chat-livre`. A comunicação durante a partida continua P2P nesta versão. Se o SFU estiver desativado ou falhar na inicialização, o cliente retorna ao P2P.
