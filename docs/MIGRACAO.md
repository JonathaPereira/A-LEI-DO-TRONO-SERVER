# Estado da migração

Atualizado em 21/10/2026. Este é o checkpoint para continuar sem o histórico do
chat. Responsabilidades e ciclos de vida estão em [ARQUITETURA.md](ARQUITETURA.md);
comandos e ambiente em [DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md).
O histórico detalhado das conversões permanece no Git.

## Branch e limites

- Trabalhar em `codex/next-typescript-structure`; commits locais assinados.
- `main` permanece em `7db2d81`. Upstream incorporado até `8044ec4`, desktop 0.2.10;
  isso não indica uma consulta mais recente ao remoto.
- Não publicar, fazer deploy nem substituir o aplicativo instalado sem pedido
  explícito. O pacote em `artifacts/windows-app/win-unpacked/` é só para conferência.
- Preservar todos os jogos, mensagens, perfis, arquivos, chamadas, clipes e soundboard.
- Continuar com um socket por cliente e um dono por recurso de mídia. Consumidores
  emprestados não encerram o microfone, a tela ou o contexto de outro dono.

## Conversões concluídas

| Área | Onde editar |
| --- | --- |
| Composição frontend | `src/app/`, `src/components/application.tsx` e `src/app/application-runtime.tsx`. Next App Router, React e TypeScript estrito; exportação estática compartilhada com Electron. |
| Transporte, canais e chat | `src/lib/socket/`, `lib/channels/`, `lib/chat/`; interfaces nos componentes dos respectivos domínios. Transporte, identidade e participação únicos. |
| Conta, arquivos e perfis | `lib/auth/`, `lib/files/`, `lib/profiles/`, `lib/community/`, `lib/messenger/`; formulários, editor, biblioteca e conversas em React. |
| Chamadas | `lib/voice/` possui captura, publicação, P2P, SFU, recuperação, reprodução e diagnóstico. Painéis e configurações em React. |
| Jogos | `lib/games/` possui regras e controladores tipados de A Lei do Trono, Azul, Splendor e Love Letter; componentes em `components/games/`. Cinzas continua independente em `public/roguelite/`. |
| Clipes e gravação | `lib/clips/` e `lib/recording/` possuem buffer, worker, armazenamento, mixer, encoder, exportação e ponte Windows; controles/bibliotecas em React. |
| Áudio e soundboard | `lib/audio/` e `lib/soundboard/` possuem efeitos, player, decode, recorte e envio. Worklets tipados em `lib/voice/worklets/`; recursos e ganhos anteriores preservados. |
| Shell e preferências | `lib/desktop/`, `lib/preferences/`, `lib/settings/`, `lib/notifications/` e componentes dos domínios possuem layout, atividade, avisos e atualização. |
| Backend | Todos os módulos de `server/` são TS estritos, sem DOM. `app.ts` compõe serviços; `index.ts` inicia o processo; `socket-gateway.ts` possui conexão, identidade, dispatch e heartbeat. |
| Estilos | `src/styles/index.css` explicita a cascata de domínio, importada pelo layout raiz após `globals.css`. Next compila e distribui o CSS. |
| Electron | `electron/` possui janela, preload, permissões, arquivos e auxiliares nativos. Desenvolvimento e testes usam identidade/perfil separados da instalação. |

`src/legacy/`, o manifesto de scripts, `legacy-runtime.tsx` e `server/runtime.cjs`
foram removidos. Não há controladores de domínio JS carregados pelo renderer nem
módulos JS/CJS restantes em `server/`. As fachadas `Trono*` ainda consumidas apontam
para os mesmos donos; não devem ganhar cópias de estado ou listeners.

Os serviços do backend possuem validação de entrada, autorização, projeções
privadas, cancelamento e descarte por instância. Filas capturam a identidade e
revalidam operações quando necessário. Os adapters de testes são portas explícitas
da composição; não alteram exports de produção. Conta continua obrigatória e os
serviços externos não foram reconfigurados.

`supabase/install.sql` ordena os 13 SQL existentes e recusa bases já instaladas.
`database:prepare` gera um arquivo revisável; `test:database` instala o mesmo
conteúdo em PGlite vazio. Isso não equivale a aplicar migrações num Supabase real.

## Últimos checkpoints

- `8f57f84`: remove o runtime JS do servidor e conclui composição/gateway tipados.
- `33ea00e`: importa a cascata pelo Next, remove manifesto/cópias CSS estáticas e
  divide o antigo `base/style.css` em 14 arquivos de domínio, sem reordenar declarações.
  Oito regras exatamente repetidas foram removidas mantendo a última ocorrência
  no mesmo contexto. Temas Original/Discord e URLs locais de imagens/fontes permanecem.
- A auditoria posterior habilita `noUnusedLocals`/`noUnusedParameters` no frontend
  e backend, remove argumentos/opções privados sem leitura e a fachada
  `TronoAppearance` sem consumidores. Posições obrigatórias de callbacks usam `_`.
  Títulos da chamada têm hosts React vazios e um único dono de conteúdo, sem
  `replaceChildren()` para disputar texto com o componente estático.
- A varredura estática de imports não encontrou módulos TS de `src/`/`server/`
  fora do grafo das entradas de produção. Rotas, boot e worklets foram tratados
  como entradas próprias. É evidência auxiliar; não autoriza apagar recursos
  distribuídos ou APIs externas por ausência de um import estático.

## Validação local

| Verificação | Resultado / alcance |
| --- | --- |
| `npm run typecheck`, `format:check`, `build` | Passaram com TS estrito e detecção de código sem uso. |
| `npm test` | Cadeia completa de backend, jogos e modelos passou; inclui os três contratos estáticos de estilos. |
| `test:server:lifecycle` | 150 casos de composição, identidade, serviços, filas, cancelamento, privacidade e shutdown passaram no fechamento do backend. |
| `test:database` | Seis casos com instalação dos 13 SQL, 12 tabelas com RLS, funções e privacidade em PGlite passaram. |
| Estilos compilados | Comparação com a versão anterior e com o grafo atual passou em 14 estados, com cerca de 15,2 milhões de propriedades por execução. Layout/conta/portrait (10 casos), jogos (17), perfis/mensagens/soundboard e clipes (10) passaram. |
| CSS em desenvolvimento | Alterar um estilo de domínio atualizou o Next dev sem recarregar a página, trocar a identidade da conexão ou encerrar o microfone sintético. Fonte temporário restaurado após o teste. |
| Electron após CSS | Pacote Windows reconstruído, chamada completa com dois Electron e relay WebRTC real através do backend tipado passaram (três casos). Não houve instalação. |
| Limpeza final | 30 modelos de motor local/escolhas/mãos/ciclo de vida/aparência e oito casos de layout/aparência/editor/chamada nativa passaram, além da cadeia completa `npm test`. Evidências em `artifacts/final-cleanup-*`. |
| Paridade | Jogos, efeitos, worklets, WAV, assinatura de arquivos e protocolos foram comparados durante cada conversão. Resultados detalhados e commits anteriores permanecem no Git; nenhuma qualidade de captura/codec/bitrate foi reduzida nesta limpeza. |

Testes de interface consomem `out/`; execute build antes. Neste ambiente, Edge usa
`CHROMIUM_EXECUTABLE_PATH` e as suítes antigas também `AUTH_TEST_CHROMIUM`.
Exportação/decodificação requerem `ffmpeg` e `ffprobe` no PATH; a cópia portátil
fica em `artifacts/ffmpeg/extracted/`. Clipes passaram após corrigir esse ambiente.

Evidências ignoradas: `artifacts/style-next-*`, `final-cleanup-*`,
`final-source-imports.json`, `styles-before-next.json`, `style-foundation-split.json`
e `style-deduplication.json`. Os logs antigos dos serviços usam os prefixos
`storage-owner-*`, `realtime-manager-*`, `throne-service-*`, `channel-service-*`,
`chat-service-*`, `voice-soundboard-*` e `socket-gateway-*`.
Essas saídas podem ser apagadas quando não forem mais úteis. Código/testes e o
checkpoint no Git permitem retomar; não depender de um arquivo de artifacts.

## O que ainda falta

1. Atualizar as expectativas das três suítes antigas abaixo para os fluxos atuais,
   mantendo suas verificações relevantes. As regressões atuais por domínio e
   Electron passam, mas essas suítes antigas ainda não devem ser declaradas verdes.
2. Concluir o aceite físico e externo. A conversão dos módulos está concluída;
   o aceite completo da migração permanece aberto até esses resultados.

### Suítes antigas a revisar

- `tests/frontend-browser.js` (`test:frontend`): espera `#chatOnlyScreen` visível,
  embora use `display: contents`; a área visível atual é `#callWorkspace`. A primeira
  falha foi reproduzida em `7db2d81`. Referência: `migration-frontend-baseline.log`.
- `tests/desktop-browser.js`: seis casos passaram e dez falharam nas expectativas
  antigas de entrada automática em voz/fechamento de configurações, também em
  `9ed1162`. Referências: `clip-buffer-desktop-policy-ui.log` e
  `clip-buffer-desktop-policy-baseline.log`. Não trocar participação de texto por
  voz automaticamente só para satisfazer o teste antigo.
- `tests/court-browser.js`: presume entrada automática em voz antes da partida;
  a falha também foi reproduzida com o runtime anterior. Escolhas, lobby e partidas
  já têm regressões atuais por domínio. Revisar o preparo da chamada desse fluxo.

### Aceite físico e externo

- `tests/desktop-audio.js` esgotou 70 s sem concluir PCM no helper C++.
  `tests/desktop-runtime.js` avançou por atividade, seletor e arquivos, mas esgotou
  160 s aguardando microfone em `saved media permissions`. Com `--mute-audio`, o
  fluxo completo e o pacote passaram. O PCM físico continua inconclusivo; não há
  evidência para atribuir causa ao driver. Logs `native-helper-path-*`.
- Conferir microfone/loopback real e compartilhar um jogo com efeitos a 60 fps
  entre computadores. Os testes sintéticos não medem esse desempenho nem a rede
  real. Comparar recepção, áudio, recuperação e preservação da chamada ao navegar.
- Conferir TURN/SFU, confirmação/recuperação por e-mail e banco no ambiente de
  desenvolvimento apropriado. Fixtures locais/PGlite não aprovam serviços reais.
- Gravação usa mixer/encoder reais, mas simula o destino de arquivos; conferir
  seletor e escrita no Windows. Parar explicitamente antes de fechar a janela:
  o fechamento não garante exportação de uma gravação em andamento.

## Como retomar

Confira branch/status e este documento. O próximo recorte útil é modernizar os
três testes antigos; comece por `test:frontend`, usando os controles visíveis
atuais e participação explícita na chamada. Compare qualquer falha nova com a
referência anterior antes de alterar produção ou enfraquecer uma asserção.

Após mudanças: tipagem, formatação, build, regressões relevantes e Electron real
quando houver mídia. Atualize este checkpoint e crie commit local assinado.
Não editar `out/`, `.next/` nem JS/CSS gerados na raiz de `public/`. `public/assets`,
`public/vendor`, `public/manual`, Cinzas, SQL, licenças e notas distribuídas são
recursos originais e continuam necessários.
