# M&N · A Lei do Trono

Atualização desktop **0.2.10** integrada: painel de chamada compacto e recuperação
independente de mídias SFU. Veja a [política de recuperação](docs/ANALISE_SFU_E_JANELA_FLUTUANTE.md)
e o [guia de atualizações](docs/ATUALIZACOES.md).

Aplicativo de comunicação e jogos, com interface Next.js + React + TypeScript,
desktop Electron e backend Express/WebSocket. O foco de validação é Windows.

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
src/components/auth/       Formulários de conta e convidado
src/components/channels/   Canais e presença
src/components/voice/      Painel de chamada
src/components/modals/     Perfis, mídia e configurações
src/components/games/      Telas dos jogos existentes
src/components/navigation/ Navegação e avisos
src/lib/socket/            Transporte, comandos e estado compartilhado
src/lib/auth/              Sessão, renovação e validação de conta
src/lib/voice/             Captura, WebRTC e ciclo de vida da chamada
src/types/                 Tipos do domínio
src/styles/                Estilos por domínio, importados por index.css no Next
server/                    HTTP, WebSocket, canais, persistência e jogos
  app.ts                   Composição tipada, reutilizável nos testes
  index.ts                 Porta, entrada do processo e encerramento
  ice.ts                   STUN/TURN e credenciais temporárias
  sessions.ts              Tickets e ciclo de vida dos convidados
  socket-gateway.ts        Conexões, identidade, dispatch e heartbeat
electron/                  Janela, preload, permissões e auxiliares nativos
public/                    Imagens, áudio, manuais, fornecedores e jogo Cinzas
scripts/                   Desenvolvimento, mídia e empacotamento
tests/                     Regressões e integrações
supabase/                  SQL existentes e roteiro único de instalação nova
docs/                      Arquitetura, desenvolvimento, atualizações e migração
docs/archive/previews/     Originais de arte preservados
```

`out/`, `.next/`, `artifacts/` e os JS/CSS gerados na raiz de `public/` são saídas
locais. Edite os fontes em `src/`; os arquivos gerados não são versionados.

## Estado da migração

O frontend usa módulos TypeScript e interfaces React; o desktop usa a exportação
estática do Next. `src/legacy/` e o runtime JavaScript do servidor foram removidos.
Todos os módulos de `server/` têm tipagem estrita; os estilos de domínio entram
na compilação do Next. As suítes frontend/desktop foram atualizadas e passam
completas. Voz e transmissão já foram confirmadas pelo usuário com amigos na versão
local; o aceite complementar está registrado em Migração. Fachadas `Trono*`
encaminham aos donos existentes, preservando um socket e os recursos de mídia.

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
npm run test:styles
npm run test:desktop:layout
```

Os testes de navegador precisam de `npx playwright install chromium`. Os testes
de integração usam provedores locais simulados e não precisam das credenciais de
produção. Consulte [Contribuição](CONTRIBUTING.md) e
[Publicação](docs/PUBLICAR_SURGE_LEVE.md).
