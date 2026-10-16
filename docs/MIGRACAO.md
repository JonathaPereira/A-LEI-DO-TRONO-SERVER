# Andamento da migração

Base: `7db2d81`. Branch: `codex/next-typescript-structure`.
Preservar jogos, clipes, soundboard, perfis, mensagens e chamadas.
Atualize este arquivo para permitir continuidade sem o histórico do chat.

## Entregue nesta etapa

- Next.js, React e TypeScript estrito com exportação estática.
- Telas TSX por domínio e compositor com eventos React.
- Controles de chamada em TypeScript, mantendo a identidade dos nós.
- Backend em `server/`, composição reutilizável e entrada do processo separadas.
- Sessões de convidados e configuração ICE extraídas com tipos explícitos.
- Electron em `electron/`, consumindo o renderer gerado pelo Next.
- Comandos de desenvolvimento, formatação, tipagem e build.
- Documentos históricos fora da raiz e caminhos de CI/empacotamento atualizados.

## Conversão ainda necessária

Os controladores em `src/legacy/` continuam em JavaScript. Eles não se tornaram
React ou TypeScript apenas porque a marcação foi convertida. O transporte de rede
e a captura WebRTC permanecem nesses controladores. `server/runtime.cjs` ainda
reúne regras de A Lei do Trono e coordenação de canais. Módulos JS existentes
ainda não recebem a verificação estrita de tipos dos módulos TS.

## Próximas alterações, em ordem

1. Extrair de `legacy/network.js` um transporte tipado em `lib/socket/`.
   Preservar uma conexão por sessão, correlação de requisições, autenticação
   serializada e independência entre texto, voz e jogo. Converter consumidores
   por fluxo e apagar o transporte antigo quando não houver usos.
2. Extrair envio/estado de mensagens e anexos de `legacy/social.js`.
   Substituir `chat-actions.ts` e converter listas de mensagens e canais para
   estado React. Validar anexos, histórico e moderação.
3. Extrair captura, peers, sinalização e descarte para `lib/voice/`.
   A chamada deve sobreviver à navegação e troca de layout. Validar microfone,
   câmera, tela, áudio de aplicativo e fallback SFU/P2P.
4. Converter perfis/configurações e jogos. Cada controlador convertido perde
   sua entrada no manifesto e seus listeners DOM.
5. Extrair regras e coordenação de `server/runtime.cjs`, mantendo a interface
   de `createApplication`. Converter os módulos JS por domínio.
6. Consolidar estilos por domínio após retirar os controladores. A ordem atual
   contém sobreposições necessárias para estados de chamada não visíveis no início.

## Critérios por fluxo convertido

- Um único dono de estado, listeners e recursos.
- Tipos nas entradas/saídas e validação dos dados externos em execução.
- Remoção do código substituído e da documentação que deixou de valer.
- Regressões do fluxo e teste no Electron quando houver layout, permissão ou mídia.
- Build estático e tipagem sem erros.

## Validação e limites

Verificado em Windows em 15/10/2026:

| Verificação                                             | Resultado                                             |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Tipagem, inclusive sem next-env.d.ts previamente gerado | Passou                                                |
| Formatação e build estático Next.js                     | Passaram                                              |
| npm test                                                | 4 integrações e 79 testes passaram                    |
| test:server:lifecycle                                   | 3 testes passaram                                     |
| test:desktop:core                                       | 27 testes passaram                                    |
| test:ui                                                 | Compositor React, layouts e perfis passaram           |
| test:desktop:layout                                     | Chamada com dois Electron e mídia simulada preservada |
| Helper C++ no novo diretório                            | Compilou com Visual Studio 2026                       |
| Pacote Windows e tests/desktop-packaged.js              | Executável e recursos locais passaram                 |
| Next dev dentro do Electron                             | Atualização de TSX ao salvar conferida                |
| Empacotamento, retenção e Cinzas                        | 21 testes de apoio passaram                           |
| Imports CommonJS relativos movidos                      | Todos resolvidos                                      |

A suíte antiga `test:frontend` precisa ser atualizada para a interface atual.
Sua primeira falha foi reproduzida também com os fontes originais de `7db2d81`:
espera `#chatOnlyScreen` visível, mas esse elemento usa `display: contents` e o
retângulo visível pertence a `#callWorkspace`. A suíte não foi silenciada nem
marcada como ignorada. A aceitação atual está em `test:ui`; modernizar o restante
das expectativas antigas é trabalho pendente. A evidência local é
`artifacts/migration-frontend-baseline.log` (gerada e não versionada).

Integrações usam serviços simulados e as verificações de chamada usam mídia
sintética. Não provam entrega de e-mail, conectividade TURN real ou um deploy.
Não foi alterada infraestrutura remota. Deploys precisam de Node 24.12+ e devem
usar `npm start`; comandos externos fixados em `node server.js` precisam ser
atualizados antes de uma publicação.
