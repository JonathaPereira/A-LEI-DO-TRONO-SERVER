# Distribuição web e Windows

A interface é compilada com `npm run build`. A saída publicável é `out/`;
`src/` contém fontes e `public/` contém entradas estáticas. Não publique essas
pastas de fontes como se fossem o aplicativo compilado.

O empacotamento Windows usa `electron/package.json` e inclui `out/` em
`resources/renderer`. O script `scripts/desktop/prepare-downloads.cjs` prepara
o site com um único instalador e seu manifesto de atualização, mantendo a pasta
`frontend/` dentro do ZIP para compatibilidade com a distribuição existente.

As notas por versão necessárias ao pacote ficam em `docs/archive/`. O workflow
Windows valida o build antes de preparar os downloads. A branch acompanha o
desktop 0.2.10; sincronizar os fontes não publica nem instala uma nova distribuição.

O GIPHY exige a migração `supabase/migrations/20261016140000_giphy_profile_credits.sql`
no banco de destino e o endpoint autenticado `/community/gif-provider` do backend.
`GIPHY_API_KEY` é a chave pública do cliente GIPHY, enviada ao navegador autenticado;
nunca use uma credencial privada de serviço nessa variável. Sem ela, a importação
por link continua disponível. Veja as [notas da 0.2.8](archive/ATUALIZAR_WINDOWS_v0.2.8.md).

## Configuração do backend

Os valores ficam no ambiente do processo; segredos não entram no bundle Next.
Estes grupos consolidam as configurações antes espalhadas nas notas antigas:

| Recurso                             | Variáveis                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Processo e origem                   | `PORT`, `HOST`, `APP_URL` (HTTPS), `AUTH_ALLOWED_ORIGINS`, `AUTH_REQUIRED=true`                                 |
| Contas                              | `SUPABASE_URL` (HTTPS), `SUPABASE_PUBLISHABLE_KEY`                                                              |
| Persistência e diretório de membros | `SUPABASE_SECRET_KEY`, somente no backend                                                                       |
| Arquivos em R2                      | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`                                        |
| SFU opcional                        | `CLOUDFLARE_REALTIME_ENABLED`, `CLOUDFLARE_REALTIME_APP_ID`, `CLOUDFLARE_REALTIME_API_TOKEN`                    |
| TURN opcional                       | `CLOUDFLARE_TURN_ENABLED`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, `CLOUDFLARE_TURN_TTL_SECONDS` |

O processo publicado usa `npm start`, Node 24.12+ e `HOST=0.0.0.0` quando precisa
aceitar conexões externas. O exemplo local usa loopback. Preserve configurações
já existentes de autenticação, SMTP, R2 e mídia ao atualizar somente o código.
Os links de confirmação e recuperação precisam apontar para o frontend correto;
confira a [configuração de URLs do Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Os limites de consumo e participantes continuam em `server/realtime-sfu.js`,
com variáveis `REALTIME_*`. A estimativa local de tráfego não substitui a medição
do provedor. Preserve esses valores e a configuração de persistência de uso ao
atualizar uma instalação existente.

Os SQL legados ficam em `supabase/*.sql` e as migrações datadas em
`supabase/migrations/`. Aplique somente as mudanças ausentes na base de destino;
notas de versão antigas não comprovam o estado atual de outro banco. Uma rotina
única de instalação nova reproduzível ainda está pendente na migração do projeto.

Para comandos locais e pré-requisitos, consulte
[Desenvolvimento desktop](DESENVOLVIMENTO_DESKTOP.md). Para critérios de validação,
consulte [Contribuição](../CONTRIBUTING.md).
