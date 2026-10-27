# Distribuição web e Windows

A interface é compilada com `npm run build`. A saída publicável é `out/`;
`src/` contém fontes e `public/` contém entradas estáticas. Não publique essas
pastas de fontes como se fossem o aplicativo compilado.

O empacotamento Windows usa `electron/package.json` e inclui `out/` em
`resources/renderer`. O script `scripts/desktop/prepare-downloads.cjs` prepara
o site com um único instalador e seu manifesto de atualização, mantendo a pasta
`frontend/` dentro do ZIP para compatibilidade com a distribuição existente.

O [guia único de atualizações](ATUALIZACOES.md) acompanha a raiz do ZIP. O workflow
Windows valida o build antes de preparar os downloads. A versão do desktop fica
em `electron/package.json`; sincronizar os fontes não publica nem instala uma nova
distribuição.

## Publicar pelo GitHub

Execute **Actions → Windows full app → Run workflow** na branch desejada.
`publish_surge` vem ligado: um único runner Windows verifica tipos/core e os
fluxos essenciais web/Electron, compila e empacota uma vez e aceita a instalação.
Depois a própria execução publica a entrega no Surge.
Pushes em `main` também publicam automaticamente. Contribuições disparadas apenas
por push continuam como validação; para publicá-las, use o disparo manual.

A versão vem de `electron/package.json`; a tag exata passa diretamente do pacote
para a publicação, sem copiar IDs ou procurar versões. O repositório precisa do
secret `SURGE_TOKEN`. A release privada mantém EXE, ZIP e hashes da mesma entrega.
A publicação confere o commit e o job Validate and package Windows aprovado na tentativa de origem,
os hashes do ZIP/EXE e o manifesto. Depois confere o manifesto publicado e o
metadado de versão da página. Falhas de validação bloqueiam publicação.

Se somente o envio ao Surge falhar, execute **Publish approved frontend** na mesma
branch/commit. Deixe `release_tag` vazio para selecionar automaticamente a entrega
Windows validada correspondente. Isso não recompila nem repete os testes Windows.
Uma tag explícita continua disponível para escolher outra tentativa aprovada do
mesmo commit. A ausência de `SURGE_TOKEN` aparece como falha, não como publicação
bem-sucedida.

O perfil de entrega está em tests/release.json e pode ser reproduzido com
npm test -- --suite browser --profile release e --suite desktop --profile release.
Contratos de regras, backend e autorização continuam completos. Matrizes visuais,
estresse de dez pessoas e regressões extensas permanecem nas suítes completas;
marque extended_browser para incluí-las. Testes de driver/hardware exigem o ambiente
específico do guia de desenvolvimento e não são substituídos por fixtures.

Cada alteração distribuída ao desktop precisa de uma versão superior à instalada.
A versão atual está em `electron/package.json`; atualize também seu lockfile e o
cabeçalho de `LEIA-ME-WINDOWS.txt` ao preparar uma nova entrega. A automação elimina
a seleção manual do pacote, mas não modifica versões nem publica código por conta
própria. No aplicativo, **Configurações → Aplicativo** busca a atualização e permite
reiniciar quando pronta.

Como alternativa manual, baixe o ZIP `MN-Trono-Frontend-<versão>.zip` da release
validada, extraia numa pasta nova e abra um terminal dentro de `frontend/`:

```powershell
npx --yes surge@0.46.0 . a-lei-do-trono.surge.sh
```

Autentique-se na conta do domínio e envie `frontend/` inteira, inclusive
`downloads/`; preserve o EXE e `latest.yml` da mesma entrega.

O layout exporta essa versão no metadado `mn-desktop-version`, e o botão de download
usa a mesma fonte. O empacotador verifica a versão antes de substituir saídas;
uma exportação ausente ou de outra versão exige executar `npm run build` novamente.
O botão é montado pelo React no cliente, sem reescrever HTML ou chunks do Next para
trocar seu link depois da compilação.

Antes de atualizar uma instalação antiga, confira os
[pré-requisitos de GIFs](ATUALIZACOES.md#gifs-do-giphy): SQL de créditos, endpoint
do backend e chave pública `GIPHY_API_KEY`. Sem chave, a importação por link continua
disponível.

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

Os limites de consumo e participantes continuam em `server/realtime-sfu.ts`,
com variáveis `REALTIME_*`. A estimativa local de tráfego não substitui a medição
do provedor. Preserve esses valores e a configuração de persistência de uso ao
atualizar uma instalação existente.

Os SQL legados ficam em `supabase/*.sql` e as migrações datadas em
`supabase/migrations/`. Aplique somente as mudanças ausentes na base de destino;
notas de versão antigas não comprovam o estado atual de outro banco. Para uma base
nova, use o roteiro `supabase/install.sql` descrito em
[Instalação nova do banco](DESENVOLVIMENTO_DESKTOP.md#instalação-nova-do-banco).

Para comandos locais e pré-requisitos, consulte
[Desenvolvimento desktop](DESENVOLVIMENTO_DESKTOP.md). Para critérios de validação,
consulte [Contribuição](../CONTRIBUTING.md).
