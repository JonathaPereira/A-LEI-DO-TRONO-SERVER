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

1. Suba a contribuição para sua própria branch e aguarde o workflow
   **Windows full app** terminar com sucesso. Uma alteração apenas local não gera
   um pacote remoto. Para a entrega atual, o desktop deve declarar **0.3.4**.
2. Na execução aprovada, abra o resumo **Downloads Windows 0.3.4** e copie a tag
   exata da release privada: `desktop-v0.3.4-run-<id>-attempt-<tentativa>`.
3. Em **Actions → Publish approved frontend → Run workflow**, selecione a branch
   cujo código corresponde à entrega aprovada e cole a tag em `release_tag`.
   Se a contribuição já estiver integrada e corresponder ao pacote, use `main`.
   O repositório precisa ter o secret `SURGE_TOKEN` configurado.
4. Execute e confira as etapas **Publish the verified directory to Surge** e
   **Verify published version**. Esse workflow reutiliza os pacotes aprovados e
   verifica seus hashes, sem repetir a suíte Windows nem gerar outro instalador.
5. Confira `version: 0.3.4` em
   <https://a-lei-do-trono.surge.sh/downloads/latest.yml>. No aplicativo instalado,
   busque a atualização pelo rodapé e reinicie quando o download estiver pronto.

Para publicação manual, baixe `MN-Trono-Frontend-0.3.4.zip` da mesma release,
extraia numa pasta nova e abra um terminal dentro de `frontend/`:

```powershell
npx --yes surge@0.46.0 . a-lei-do-trono.surge.sh
```

Autentique-se na conta que pode publicar nesse domínio. Envie a pasta `frontend/`
inteira, inclusive `downloads/`; preserve o EXE e `latest.yml` da mesma entrega.
Publicar o pacote 0.3.2 não atualiza automaticamente uma instalação 0.3.3.

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
