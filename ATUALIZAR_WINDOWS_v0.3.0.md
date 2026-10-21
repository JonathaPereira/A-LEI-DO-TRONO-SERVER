# Windows 0.3.0 · Ticket to Ride, mapa clássico dos EUA

Esta versão acrescenta Ticket to Ride ao catálogo, com o jogo base dos Estados
Unidos: 36 cidades, 100 rotas, 30 bilhetes, 110 cartas e 45 vagões por pessoa.
Mesas autenticadas aceitam 2–5 pessoas, código de convite e bots opcionais.
Mãos e bilhetes ficam privados até o final. O servidor valida as jogadas e
calcula pontos de rotas, destinos positivos/negativos, maior caminho e desempate.

O mapa vetorial é próprio. Não inclui expansões, túneis, estações ou balsas.
Bots jogam com a própria visão privada. São adversários simples para completar
mesas, sem promessa de nível competitivo.

## Preservação do PR #40

O compartilhamento de PC continua com protocolo 2, controle virtual separado
para o convidado, autorização e revogação pelo anfitrião, perfil de vídeo de
resposta rápida e moderação. Esta versão não altera os módulos de mídia,
controle remoto ou os helpers nativos. A CI mantém as regressões Windows de
dois dispositivos XInput, vídeo e revogação. Jogar Ticket to Ride não troca a
sala de voz, a assinatura de texto ou a sessão de compartilhamento de PC.

## Desenvolvimento e validação

Use Node.js 24. Na raiz:

```bash
npm ci
npm run desktop:install
npm run test:ticket-to-ride
npm test
npm run test:desktop:core
```

No Linux, os testes de navegador aceitam `AUTH_TEST_CHROMIUM=/usr/bin/chromium`.
A CI instala o Chromium do Playwright no Windows. Evidências de navegador ficam
em `artifacts/ticket-to-ride/`. Os testes usam contas locais simuladas e não
alteram dados da comunidade em produção.

## Atualizar e distribuir

1. Publique o backend desta revisão no Render. `/health` deve informar
   `version: 0.14.0-alpha`, `features.ticketToRide: true`,
   `features.remotePcProtocol: 2` e `ticketToRide.available: true`.
   Não há SQL ou novas credenciais nesta versão.
2. Aguarde **Windows full app** da branch `codex/desktop-ticket-to-ride-030`
   concluir os testes, o build e a verificação do aplicativo compilado.
   A execução cria uma release privada em rascunho contendo:
   - `MN-Trono-0.3.0-Windows.exe`
   - `MN-Trono-Frontend-0.3.0.zip`
   - `SHA256SUMS-0.3.0.txt`
3. Baixe EXE e ZIP da mesma execução e confira os hashes. O ZIP contém
   `frontend/`, apenas o instalador atual, `downloads/latest.yml` correspondente
   e instruções para publicar. Extraia em uma pasta nova.
4. Dentro de `frontend/` do ZIP, execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira `downloads/latest.yml`, instale ou atualize os dois aplicativos para
   0.3.0 e abra **Jogos → Ticket to Ride**. Crie uma mesa por código ou preencha
   os lugares com bots. Mantenha dois destinos iniciais e comece a viagem.
6. Confira a chamada e o PC Beta durante a navegação entre mesa e comunidade.
   A instalação opcional do ViGEmBus no anfitrião mantém as instruções da 0.2.12.

O frontend informa que o backend precisa ser atualizado quando um servidor
antigo não anuncia a nova funcionalidade. Mesas vivem na memória do servidor:
reinício ou redeploy encerra as partidas. Uma conexão perdida pode ser retomada
por 90 segundos; saída explícita passa a cadeira a um bot. Não há ranking
persistente ou recuperação após reiniciar o servidor nesta versão.

A branch `backup/main-before-030-20261021` conserva a main anterior à 0.3.0.
O PR e a release em rascunho são entregas para revisão; não efetuam merge ou
deploy no Render/Surge.
