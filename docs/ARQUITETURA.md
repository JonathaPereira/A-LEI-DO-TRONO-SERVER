# Arquitetura e responsabilidades

## Interface

Next.js usa App Router em `src/app/`, React e TypeScript estrito. A exportação
estática permite a mesma interface na web e no Electron. Não há Server Actions,
API Routes ou cookies do servidor Next: conta, dados e WebSocket pertencem ao
backend existente.

`components/application.tsx` compõe as telas por domínio. As telas preservam IDs
e hierarquia relevantes dos controles anteriores. `chat-composer.tsx` trata envio
e teclado em React; `lib/socket/chat-actions.ts` delega ao controlador que mantém
o estado do upload. Não há um segundo socket ou uma segunda captura de mídia.

## Compatibilidade durante a conversão

`src/legacy/manifest.json` define a ordem dos estilos e controladores.
`scripts/prepare-renderer.cjs` prepara JS/CSS públicos antes de iniciar ou compilar
Next. Os arquivos copiados são descartáveis, com um único fonte.

`legacy-runtime.tsx` carrega os controladores uma vez, após hidratação, e dispara
`trono:ready`. Isso substitui a dependência de `DOMContentLoaded`, que pode ocorrer
antes da hidratação. Worklets mantêm os caminhos relativos existentes.

Os controladores podem mover ou reescrever seus elementos. Enquanto um controlador
for dono de uma subárvore, evite renderizações React reativas dentro dela. Para
converter um fluxo, transfira estado e eventos juntos e remova o listener antigo.
Renomear extensões não constitui uma conversão de arquitetura.

`lib/voice/control-layout.ts` é o único responsável por posicionar controles.
Move os mesmos nós e não abre dispositivos, clona elementos ou renegocia peers.
A captura e o ciclo de vida WebRTC ainda estão em `legacy/social.js`.

## Backend

Express e `ws` preservam o protocolo atual. Trocar esse transporte durante a
migração da interface ampliaria o risco sem resolver o acoplamento.

`app.ts` expõe `createApplication()` e `close()`. Cada criação possui canais,
sockets e serviços próprios. Importar o módulo não inicia um servidor nem
registra sinais. `index.ts` valida porta/host e trata o processo.
`runtime.cjs` contém composição e regras de A Lei do Trono ainda por extrair.
Os serviços existentes foram movidos para `server/` e formatados.

`sessions.ts` mantém tickets opacos, aleatórios e guardados no servidor:
12 horas, limite de 500 identidades e validação de apelido. Não são JWTs ou
perfis assinados enviados pelo cliente. A organização não muda esse protocolo.

`ice.ts` solicita credenciais TURN temporárias, mantém cache por instância e
aplica timeout. A autorização continua no gerenciador SFU, antes de consultar
o provedor. Tokens de infraestrutura nunca entram no bundle Next.

Os jogos ainda compartilham regras CommonJS em `src/legacy/`. Mover essas regras
para um módulo compartilhado testável é uma próxima etapa. Supabase/RLS e o
armazenamento de arquivos foram preservados.

## Electron

`electron/` contém main, preload, permissões, preferências, atualizações e
captura. O renderer mantém isolamento de contexto e acesso nativo pelo preload.
O instalador carrega `resources/renderer`; o modo compilado local carrega `out/`.
A política de scripts calcula hashes dos bootstraps do HTML instalado, sem
liberar scripts inline arbitrários.

O modo Next de desenvolvimento é explícito, aceita loopback e não funciona em
builds empacotados. Permite atualização de componentes ao salvar.

## Documentação e arquivos

README é o ponto de entrada. Desenvolvimento descreve execução; este documento
registra decisões; MIGRACAO registra pendências. `docs/archive/` conserva as duas
notas usadas na distribuição, instruções do bridge Windows e originais de arte.
Documentos substituídos e capturas antigas podem ser recuperados pelo histórico Git.
Licenças, créditos, modelos de áudio, SQL e recursos de jogos foram mantidos.
Arquivos gerados ficam fora do Git.
