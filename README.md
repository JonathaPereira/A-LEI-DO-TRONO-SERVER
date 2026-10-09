# A Lei do Trono — Backend v0.8.0 Alpha

Cadastro, login e recuperação são integrados ao Supabase. Convidados podem jogar e usar texto e voz da mesa; acesso ao M&N, anexos e operações SFU exige autenticação. Antes do deploy, siga ATUALIZAR_v0.8.0.md e execute supabase/upgrade-v080.sql depois do SQL da v0.7.9. Instalações novas precisam de schema.sql, upgrade-v079.sql e upgrade-v080.sql, nessa ordem. Preserve as configurações de Supabase/SMTP, R2 e Realtime/TURN já utilizadas.

Backend autoritativo do jogo + WebSocket + ponte segura para Cloudflare Realtime SFU.

## Arquivos obrigatórios
- `server.js`
- `auth.js`
- `files.js`
- `community.js`
- `supabase/schema.sql` (executar no Supabase)
- `supabase/upgrade-v079.sql` (perfis e anexos)
- `supabase/upgrade-v080.sql` (diretório de membros para o backend)
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
