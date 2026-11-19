# Deploy Independente: Backend no Render e Frontend Estático no Surge

O monorepo separa explicitamente o backend Node.js/WebSocket (`apps/server`) do frontend estático Next.js (`apps/web`), permitindo atualizar um serviço sem reconstruir ou republicar o outro.

## 1. Backend no Render (`apps/server`)

O serviço do Render executa o servidor Express + WebSocket + `CloudflareRealtimeSfuService`, mantendo compatibilidade integral com as variáveis de ambiente de produção já configuradas.

### Configuração do Serviço no Render

- **Build Command:** `npm ci && npm run build:server`
- **Start Command:** `npm run start:server` (ou `npm --workspace=@trono/server run start`)
- **Node Version:** `>= 24.12.0` (definido em `package.json` → `engines.node`)

### Variáveis de Ambiente do Backend

#### Servidor e Rede

| Variável           | Obrigatória            | Descrição                                                              |
| ------------------ | ---------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`         | Sim (prod)             | `production` ativa validações rígidas de autenticação e origem         |
| `PORT`             | Não (padrão `10000`)   | Porta HTTP/WebSocket atribuída pelo Render                             |
| `HOST`             | Não (padrão `0.0.0.0`) | Interface de escuta do servidor                                        |
| `APP_URL`          | Sim (prod)             | URL pública base da aplicação (ex.: `https://a-lei-do-trono.surge.sh`) |
| `TRUST_PROXY_HOPS` | Não                    | Número de proxies reversos confiáveis (ex.: `1` no Render)             |

#### Autenticação, Banco e Storage (Supabase + Cloudflare R2)

| Variável                                                                 | Obrigatória          | Descrição                                                                   |
| ------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------- |
| `SUPABASE_URL`                                                           | Sim (prod)           | URL do projeto Supabase                                                     |
| `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`)                      | Sim (prod)           | Chave pública do Supabase para verificação de sessão                        |
| `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)                   | Sim (prod)           | Chave de serviço usada pelas rotas administrativas/persistência             |
| `AUTH_REQUIRED`                                                          | Não (padrão fechado) | `false` apenas para rollouts controlados/testes locais                      |
| `AUTH_ALLOWED_ORIGINS`                                                   | Recomendado          | Lista separada por vírgula das origens autorizadas (ex.: Surge + localhost) |
| `TURNSTILE_SECRET_KEY`                                                   | Opcional             | Chave secreta Cloudflare Turnstile quando habilitado no login               |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Opcional             | Credenciais do bucket Cloudflare R2 para anexos/arquivos                    |
| `GIPHY_API_KEY`, `REDIS_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`            | Opcional             | Integrações opcionais de GIFs, rate limit distribuído e push mobile         |

#### Cloudflare Realtime SFU, TURN e Política de Consumo (`UsagePolicy`)

| Variável                          | Padrão                                    | Descrição                                                          |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `CLOUDFLARE_REALTIME_ENABLED`     | `false`                                   | Habilita o SFU Cloudflare Realtime (`true` / `1`)                  |
| `CLOUDFLARE_REALTIME_APP_ID`      | `""`                                      | App ID da aplicação Cloudflare Calls / Realtime                    |
| `CLOUDFLARE_REALTIME_API_TOKEN`   | `""`                                      | Token Bearer da API `/v1/apps/{appId}/sessions/...`                |
| `CLOUDFLARE_TURN_ENABLED`         | `false`                                   | Habilita geração de credenciais TURN efêmeras via `TurnIceService` |
| `CLOUDFLARE_TURN_KEY_ID`          | `""`                                      | Key ID TURN na Cloudflare                                          |
| `CLOUDFLARE_TURN_API_TOKEN`       | `""`                                      | Token da API TURN na Cloudflare                                    |
| `CLOUDFLARE_TURN_TTL_SECONDS`     | `21600`                                   | TTL (600s a 172800s) do cache de credenciais ICE/TURN              |
| `REALTIME_MONTHLY_SOFT_LIMIT_GB`  | `800`                                     | Limite suave mensal de alerta de consumo                           |
| `REALTIME_ULTRA_DISABLE_GB`       | `800`                                     | Limiar para desativar qualidade ultra                              |
| `REALTIME_HIGH_DISABLE_GB`        | `850`                                     | Limiar para rebaixar qualidade máxima de `high` para `balanced`    |
| `REALTIME_SCREEN_DISABLE_GB`      | `900`                                     | Limiar para bloquear novas transmissões de tela                    |
| `REALTIME_MONTHLY_HARD_LIMIT_GB`  | `950`                                     | Limiar rígido para forçar `economy` e frear consumo                |
| `REALTIME_MONTHLY_BASE_GB`        | `0`                                       | Consumo acumulado prévio no mês (carry-over entre restarts)        |
| `REALTIME_MAX_PARTICIPANTS`       | `32`                                      | Teto de participantes simultâneos na sala SFU (2 a 32)             |
| `REALTIME_ESTIMATE_SAFETY_FACTOR` | `1.5`                                     | Fator de segurança (1 a 4) aplicado à estimativa de tráfego        |
| `REALTIME_USAGE_FILE`             | `/tmp/a_lei_do_trono_realtime_usage.json` | Caminho de persistência local do medidor mensal                    |

## 2. Frontend Estático no Surge (`apps/web`)

O frontend é compilado via Next.js Static Export (`output: 'export'`) para a pasta `apps/web/out/` e publicado diretamente no domínio estático sem dependência de servidor Node.js no Surge.

### Passo a Passo de Build e Publicação

1. Instale dependências e compile os pacotes compartilhados (`@trono/protocol` e `@trono/voice-engine`):

   ```bash
   npm ci
   npm run build:web
   ```

   O script `build:web` executa em sequência:
   - `npm run build:packages` (gera `dist/` de `@trono/protocol` e `@trono/voice-engine`)
   - `node scripts/prepare-renderer.cjs` (compila worklets e `callback-boot` via `apps/web/tsconfig.renderer.json` para `apps/web/public/`)
   - `npm --workspace=@trono/web run build` (gera exportação estática em `apps/web/out/`)
   - `node scripts/prepare-static-html.cjs` (ajusta `referrer-policy` nas páginas em `apps/web/out/`)

2. Publique o diretório `./apps/web/out` no Surge:

   ```bash
   npm run deploy:surge
   ```

   Ou manualmente apontando para outro subdomínio autorizado:

   ```bash
   npx --yes surge@0.46.0 ./apps/web/out seu-subdominio.surge.sh
   ```

> [!IMPORTANT]
> Certifique-se de que o domínio do Surge publicado esteja incluído em `APP_URL` e `AUTH_ALLOWED_ORIGINS` no serviço do Render para que WebSocket, CORS e sessões funcionem sem bloqueios.

## 3. Empacotamento Desktop (`apps/desktop`)

O host Electron em `apps/desktop/` consome a mesma saída estática gerada por `build:web` em `apps/web/out/`. Para preparar pacotes e artefatos desktop/site de download:

```bash
npm run build:web
npm run desktop:package
```

O script `scripts/desktop/package-site.cjs` verifica a versão em `apps/web/out/index.html`, limita o tamanho do site estático abaixo de 190 MiB e copia os guias atualizados (`docs/DEPLOY_RENDER_SURGE.md` e `docs/ARQUITETURA.md`) junto aos artefatos SQL necessários.
