# M&N · A Lei do Trono

Aplicativo de comunicação e jogos, com interface Next.js + React + TypeScript,
desktop Electron e backend Express/WebSocket. O foco de validação é Windows.

A integração da main traz o desktop **0.2.8**, com os ajustes de chamada, chat e
GIPHY adaptados à arquitetura desta branch. Veja as
[notas da versão](docs/archive/ATUALIZAR_WINDOWS_v0.2.8.md).

## Começar

Requer Node.js **24.12 ou superior** e npm. Na raiz:

```powershell
npm ci
npm run desktop:install
npm run build
npm run desktop:start
```

Esse fluxo usa a interface deste checkout e o backend publicado, com as contas
existentes. As ações de chat e perfil usam dados reais do serviço.

Para desenvolvimento com atualização ao salvar, veja
[Desenvolvimento desktop](docs/DESENVOLVIMENTO_DESKTOP.md).

## Organização

```text
src/app/                   Página, layout e estilos globais do Next.js
src/components/chat/       Mensagens, painel e compositor React
src/components/channels/   Canais e presença
src/components/voice/      Painel de chamada
src/components/modals/     Autenticação, perfis e configurações
src/components/games/      Telas dos jogos existentes
src/components/navigation/ Navegação e avisos
src/lib/socket/            Comandos tipados usados pelo compositor
src/lib/voice/             Organização dos controles de chamada
src/types/                 Tipos do domínio
src/legacy/                Controladores DOM ainda em conversão e estilos existentes
server/                    HTTP, WebSocket, canais, persistência e jogos
  app.ts                   Composição tipada, reutilizável nos testes
  index.ts                 Porta, entrada do processo e encerramento
  ice.ts                   STUN/TURN e credenciais temporárias
  sessions.ts              Tickets e ciclo de vida dos convidados
  runtime.cjs              Composição existente, isolada por instância
electron/                  Janela, preload, permissões e auxiliares nativos
public/                    Imagens, áudio, manuais, fornecedores e jogo Cinzas
scripts/                   Desenvolvimento, mídia e empacotamento
tests/                     Regressões e integrações
supabase/                  SQL e migrações existentes
docs/                      Arquitetura, desenvolvimento e andamento da migração
docs/archive/              Notas usadas na distribuição e originais de arte
```

`out/`, `.next/`, `artifacts/` e os JS/CSS gerados na raiz de `public/` são saídas
locais. Edite os fontes em `src/`; os arquivos gerados não são versionados.

## Estado da migração

As telas são TSX e o desktop usa a exportação estática do Next. O compositor
trata os eventos em React; anexos, mídia, rede e jogos ainda usam controladores
de compatibilidade. A conversão desses controladores para módulos TypeScript
independentes **ainda está em andamento**.

O mapa de responsabilidades está em [Arquitetura](docs/ARQUITETURA.md).
O que falta e o próximo trabalho estão em [Migração](docs/MIGRACAO.md),
para continuidade sem depender deste chat.

## Verificar alterações

```powershell
npm run typecheck
npm run format:check
npm run build
npm test
npm run test:server:lifecycle
npm run test:desktop:core
npm run test:ui
npm run test:desktop:layout
```

Os testes de navegador precisam de `npx playwright install chromium`. Os testes
de integração usam provedores locais simulados e não precisam das credenciais de
produção. Consulte [Contribuição](CONTRIBUTING.md) e
[Publicação](docs/PUBLICAR_SURGE_LEVE.md).
