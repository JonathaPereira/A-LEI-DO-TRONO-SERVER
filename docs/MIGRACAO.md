# Estado da migração

Atualizado em 20/10/2026. Este documento registra o estado atual e as pendências;
os detalhes de responsabilidade e ciclo de vida ficam em [ARQUITETURA.md](ARQUITETURA.md).
O histórico das etapas anteriores permanece no Git.

## Base e limites de contribuição

- Branch de trabalho: `codex/next-typescript-structure`.
- Base inicial: `7db2d81`. Alterações upstream incorporadas até `8044ec4`, desktop 0.2.10.
  Isso não significa que houve uma consulta mais recente ao remoto.
- `main` permanece em `7db2d81`. Commits são locais e assinados; publicação exige
  pedido explícito do usuário. Não instalar nem atualizar o aplicativo distribuído
  como parte dos testes.
- Preservar todos os jogos, mensagens, perfis, chamadas, arquivos, clipes e soundboard.
  A migração não autoriza remover funcionalidades para reduzir o trabalho.

## O que já tem dono em TypeScript/React

| Área | Responsabilidade atual |
| --- | --- |
| Estrutura | Next App Router em `src/app/`, componentes por domínio e exportação estática compartilhada com Electron. |
| Rede e canais | `lib/socket/` possui um transporte, identidade e participação; `lib/channels/` possui catálogo, seleção e gestão. |
| Chat e arquivos | `lib/chat/` possui compositor, histórico, paginação e moderação; `lib/files/` possui transporte HTTP, cache e biblioteca. |
| Perfis e comunidade | `lib/profiles/`, `lib/community/` e `lib/messenger/` possuem leitura/edição, presença, conversas e anexos; interfaces em React. |
| Notificações | `lib/notifications/` possui preferências, contadores, deduplicação e entrega web/nativa. |
| Chamada | `lib/voice/` possui captura, publicação, P2P, SFU, recuperação, reprodução, diagnóstico, navegação e controles. Configurações e painéis em React. |
| Jogos | Controladores, mesa, navegação, escolhas e motor local de A Lei do Trono convertidos. Azul, Splendor, Love Letter e host de Cinzas têm controladores tipados; alguns motores compartilhados ainda são JS. |
| Clipes | `lib/clips/` possui buffer WebM, worker, sessão, armazenamento, exportação, preferências, coordenação e ponte Windows; biblioteca e controles em React. |
| Gravação manual | `lib/recording/` possui captura, mixer, encoder e escrita; `components/recording/` possui controles e runtime único. |
| Preferências/layout | `lib/preferences/` possui preferências por conta; layout, aparência, shell desktop, atividade e controles de atualização possuem donos tipados. |
| Backend | `server/app.ts` compõe instâncias, `index.ts` inicia o processo; sessões e ICE já foram extraídos. Jogos importam regras/nomes compartilhados de `lib/games/`. Restam serviços JS e `runtime.cjs`. |
| Electron | `electron/` contém janela, preload, permissões e captura. Desenvolvimento/testes usam identidade e perfis separados da instalação. |

As fachadas `Trono*` ainda necessárias encaminham aos mesmos donos; não devem
receber cópias de estado ou listeners. O núcleo independente de Cinzas e seus
recursos em `public/roguelite/` foram preservados.

## Remoções mais recentes

- `clips.js`, `clip-buffer.js`, `clip-store.js` e `clip-desktop.js`: responsabilidades
  transferidas para os módulos de clipes; assets antigos podados pelo build.
- `recording.js`: gravação manual e controles convertidos. Encerrar a captura libera
  tela/mixer antes de aguardar escolha de pasta ou escrita; microfone emprestado
  da chamada não é encerrado.
- `personal-prefs.js` e `rtc-config.js`: preferências e defaults RTC consolidados,
  preservando chaves existentes, STUN e pool de quatro candidatos.
- `bot-names.js`: sequência compartilhada em `lib/games/bot-names.ts`, importada
  pelos serviços e pelo protótipo local, sem global. A remoção inicial havia deixado
  esse consumidor local sem import; o teste nativo expôs a falha e agora verifica
  também os quatro nomes. O teste do pacote consulta o manifesto atual em vez de
  exigir scripts já removidos.
- `profile-data.js` e `server/profile-customization.js`: validação de escrita
  compartilhada em `lib/profiles/validation.ts`, com entrada HTTP tipada como
  `unknown` em `server/profile-customization.ts`. Leitura tolerante de registros
  antigos continua separada; erros, defaults e regras de gravação foram preservados.
- `azul-rules.js` e `azul-presentation.js`: motor e passos de pontuação tipados em
  `lib/games/`, importados diretamente. Servidor conserva autoridade e pilhas
  privadas; não há mais globais de regras/apresentação no renderer.
- `love-letter-rules.js`: motor tipado em `lib/games/`, com estado privado separado
  da projeção pública por jogador. Mãos, Padre e escolhas do Chanceler preservados;
  fixture determinística usa aleatoriedade por sala, sem alterar exports globais.
- `splendor-data.js` e `splendor-rules.js`: catálogo clássico e motor compartilhado
  em TypeScript. Baralhos e reservas passam pela projeção pública por jogador;
  pagamentos, ranking e licença dos dados permanecem preservados.

O desktop mantém a política existente de replay web suspenso: não cria
`TronoClips`, controles web ou ponte web de clipes no Electron. A gravação manual
continua disponível. Não reativar captura automática como efeito da migração.

## Trabalho restante

### 1. Retirar os scripts ainda ativos, por domínio

O inventário de execução é `src/legacy/manifest.json`. Permanecem:

- Conta e plataforma: `auth-boot.js`, `auth.js`, `desktop-platform.js`.
- Áudio: `audio.js`, `application-audio.js`, `light-noise.js`,
  `noise-suppression.js` e os worklets correspondentes.
- Soundboard: `soundboard-client.js`.

`call-controls-layout.js` já é gerado do módulo TypeScript
`lib/voice/control-layout.ts`; sua presença no manifesto não indica um controlador
JS ainda por converter. `scripts/prepare-renderer.cjs` compila esse módulo e poda
assets estáticos obsoletos somente após compilação bem-sucedida.

Todos os motores compartilhados dos jogos saíram de `src/legacy/`. Próximo recorte:
transferir o adaptador de áudio de aplicativos e os worklets para os donos tipados,
com regressões de recursos e Electron real. Depois seguir por áudio compartilhado,
soundboard e conta, sem mudar captura/encoders incidentalmente.

### 2. Backend e contratos externos

- Extrair regras de A Lei do Trono e coordenação de canais de `server/runtime.cjs`,
  preservando `createApplication()` e o isolamento por instância.
- Converter serviços JS por domínio, mantendo autorização e persistência.
- Completar validação dos payloads externos com seus consumidores. Jogos e alguns
  comandos de consumo SFU ainda não possuem validação completa.
- `tsconfig.server.json` verifica módulos TS estritamente; não torna os serviços JS
  existentes estritos por estarem na mesma pasta.

### 3. Estilos e limpeza final

Consolidar CSS por domínio depois de retirar os respectivos controladores.
A ordem atual contém sobreposições necessárias para estados de chamada fora da
vista inicial. Não apagar `src/legacy/` inteira quando seus scripts terminarem:
a pasta ainda contém estilos utilizados. Remover adaptadores apenas sem consumidores.

`public/` na raiz contém também recursos originais. Somente JS/CSS gerados na raiz,
`out/`, `.next/` e `artifacts/` são saídas regeneráveis; não tratar todos os assets
como temporários. Licenças, créditos, modelos de áudio, SQL, manuais distribuídos
e recursos dos jogos permanecem necessários. Evidências em `artifacts/` podem ser
apagadas quando não forem mais úteis; builds/testes as recriam conforme necessário.

### 4. Instalação nova do banco

Documentar e testar uma ordem única para SQL legados e migrações datadas em uma
base vazia. Não reaplicar esse roteiro em bases existentes. Preservar RLS,
permissões, privacidade de e-mails e idempotência onde o contrato já exige.

## Como continuar um recorte

1. Localizar consumidores, eventos, estado e recursos antes de mover o código.
2. Transferir o dono completo e validar dados externos; manter um socket e um dono
   por recurso. Troca de conta/fonte e descarte devem invalidar trabalho pendente.
3. Remover fonte substituído, entrada no manifesto e adaptadores sem consumidores.
4. Executar tipagem, formatação, build e regressões relevantes. Testes de interface
   consomem `out/`; alterações de mídia também exigem Electron real.
5. Atualizar as pendências deste documento e a responsabilidade em ARQUITETURA;
   criar commit local assinado na branch de contribuição.

Não parar o microfone ou a tela da chamada ao encerrar um consumidor emprestado,
replay, exportação ou gravação. Navegação, layouts e configurações devem preservar
as mesmas trilhas e players. Captura só ocorre pela ação autorizada do usuário.

## Validação local mais recente

Executada em Windows em 20/10/2026, após os recortes acima:

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck`, `npm run format:check`, `npm run build` | Passaram. |
| `npm test` | Cadeia completa de backend, jogos e modelos passou após a conversão de Azul e correção do import dos bots locais. |
| Azul tipado | Paridade exata em 120 partidas (8.433 jogadas/601 replays); 25 regressões de regras/controle/SQL/WS e três casos de interface passaram. |
| Love Letter tipado | Paridade em 100 partidas (6.728 jogadas/464 novas rodadas e visões privadas); 26 regressões e partida completa na interface passaram. Electron real e pacote também passaram sem global antigo. |
| Splendor tipado | Paridade em 120 partidas/10.294 jogadas e catálogo completo; 26 regressões e três casos de interface passaram. Chamada no Electron e pacote passaram sem globais antigos. |
| `npm run test:clips` | 55 verificações passaram; inclui persistência, quota, exportação, encoder, ponte e descarte. |
| `npm run test:recording` | 14 verificações passaram; inclui cancelamento, mixer, finalização e arquivo decodificado. |
| `npm run test:settings` | 137 verificações passaram após consolidar preferências. |
| `npm run test:notifications:ui` | Três fluxos passaram. |
| Perfis após validação compartilhada | 13 verificações de contrato/SQL/mídia, autenticação HTTP/WebSocket e três casos de edição nos layouts web/desktop passaram. |
| `tests/call-controls-browser.js` | 13 verificações passaram após retirar o coordenador antigo de clipes. |
| `npm run test:desktop:layout` | Cenário completo com dois Electron reais passou, incluindo gravação manual e política de clipes. |
| Pacote Windows sem instalador + `tests/desktop-packaged.js` | Executável real, recursos locais e RNNoise passaram com perfil temporário. |

Evidências ignoradas pelo Git: `artifacts/clip-coordinator-*`, `clip-bridge-*`,
`manual-recording-*`, `personal-preferences-*`, `bot-names-*`, `profile-validation-*`
e `azul-core-*`/`love-letter-core-*`/`splendor-core-*`. As primeiras execuções nativas de `azul-core-desktop*` registram
a regressão do import dos bots; `azul-core-desktop-fixed.log` registra a correção.
O executável local de conferência está em
`artifacts/windows-app/win-unpacked/MN Trono.exe`; não substitui a instalação.

Para comandos/ambiente completos, veja [DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).
Os testes de navegador deste ambiente usam Edge pelos parâmetros
`CHROMIUM_EXECUTABLE_PATH` e, nas suítes antigas, `AUTH_TEST_CHROMIUM`.
Exportação e decodificação exigem `ffmpeg`/`ffprobe` no PATH; a cópia portátil local
fica em `artifacts/ffmpeg/extracted/`. Testes nativos dependem do Electron instalado
em `electron/node_modules` e do helper C++ compilado quando o fluxo o utiliza.

## Limites e regressões antigas conhecidas

- `test:frontend` ainda espera `#chatOnlyScreen` visível apesar de usar
  `display: contents`; a área visível é `#callWorkspace`. A primeira falha também
  foi reproduzida em `7db2d81`. A aceitação atual está em `test:ui`; a suíte antiga
  não foi silenciada. Evidência: `artifacts/migration-frontend-baseline.log`.
- `tests/desktop-browser.js` teve seis casos aprovados e dez falhas nas expectativas
  antigas de entrada automática em voz/fechamento de configurações. O mesmo
  resultado foi reproduzido em `9ed1162`; a verificação de replay suspenso passou.
  Evidências: `artifacts/clip-buffer-desktop-policy-ui.log` e
  `artifacts/clip-buffer-desktop-policy-baseline.log`. Modernizar essas expectativas
  permanece pendente; não foram ignoradas para declarar sucesso.
- Mídia dos testes é sintética. Eles não medem 60 fps em jogos reais, conectividade
  TURN em produção, entrega de e-mail ou um deploy. A gravação usa encoder e mixer
  reais, mas destino de arquivo simulado; não prova o seletor/escrita do Windows.
- Fechar a página durante gravação não garante a exportação; parar explicitamente
  continua necessário. O teste de janela flutuante web simula uma janela de mesma
  origem e não valida a API nativa de Picture-in-Picture.
- Nenhum serviço remoto ou configuração de infraestrutura foi alterado. Publicação
  exige Node 24.12+ e `npm start`; comandos externos antigos com `node server.js`
  precisam ser atualizados antes do deploy.
