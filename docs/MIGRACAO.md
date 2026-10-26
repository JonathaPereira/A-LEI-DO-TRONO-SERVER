# Reconstrução do frontend

Checkpoint atualizado em 26/10/2026.

Fonte única do plano e checkpoint. Produto/REA:
[UX_COMUNICACAO.md](UX_COMUNICACAO.md); donos:
[ARQUITETURA.md](ARQUITETURA.md); operação:
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md); contribuição:
[agents/workflow.md](agents/workflow.md). Detalhes históricos ficam no Git.

## Direção e autorização

Reconstruir a apresentação externa aos jogos mantendo backend, regras, recursos,
protocolos e lógica cliente. Next, React, TypeScript e exportação estática
compartilhada com Electron permanecem. Nenhuma migração de banco.

Visitante entra pela tela de login; após autenticação, comunicação diretamente.
Jogos têm catálogo próprio. A Corte usa preto/grafite e dourado, sidebar única
e Phosphor Icons. Discord orienta interações, sem reprodução literal.

Branch: codex/frontend-rebuild. Base original: f343049. Marcos 1 e 2:
e1070da e e170860. Último checkpoint anterior ao fechamento: edb8450.
Preservar alterações existentes e AGENTS/docs de agentes.

Os três marcos receberam aceite visual humano em 25/10/2026. Em 26/10, o
usuário autorizou commit/push desta contribuição, execução de Windows full app e
publicação automática da versão 0.3.5 no Surge após pipeline e instalador
aprovados. Main e PR ficam fora desta execução. Não instalar drivers/aplicativo
neste host; a aceitação do instalador pertence ao runner Windows descartável.

## Plano e entregas

| Etapa      | Conteúdo                                                                                           | Estado                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Preparação | Inventário, referência/regressões dos jogos, isolamento da cascata e inicialização desacoplada.    | Implementada.                                                                                      |
| Marco 1    | Autenticação, shell, canais, presença, chat, amigos/DMs, catálogo e jogos completos.               | Aceito visualmente.                                                                                |
| Marco 2    | Grade/foco, menus, conversa lateral, captura por abas e configurações de mídia.                    | Aceito visualmente; Electron real verificado.                                                      |
| Marco 3    | Perfis/GIF, arquivos, soundboard, clipes, gravação, Remote PC e administração; corte final e docs. | Aceito visualmente; implementação, corte e verificações locais concluídos. Limites nativos abaixo. |

Antes de remover fontes, identificar conteúdo, ações/estado, imports, referências
dinâmicas, fachadas Trono*, IDs/eventos, variáveis CSS e URLs. Grafo estático serve
para escolher candidatos, nunca como prova suficiente. Não criar outra árvore
de frontend legado: recuperação pelo Git.

## Preservação e destinos

Matriz por arquivo: [frontend-preservation.csv](frontend-preservation.csv).
Conserva caminhos/hashes da base e registra decisões/destinos após inspeção.
Assets, vendor, licenças, créditos e documentos distribuídos são fontes protegidas.
out e .next são saídas.

| Área                                                  | Tratamento vigente                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/components/games, src/lib/games, src/styles/games | Fluxos completos preservados: criação/lobby, partida, regras, efeitos, áudio, resultado e reconexão. Catálogo reconstruído.                                                               |
| public/roguelite                                      | Aplicativo Cinzas, assets, persistência e ponte preservados. Nexus mantém integração independente.                                                                                        |
| Elementos compartilhados dos jogos                    | Comunicação flutuante, avisos de turno/influência, cinemática, resultado, tooltips e controles ficam protegidos, mesmo fora das três pastas.                                              |
| Estilos compartilhados                                | Dependências extraídas para games e delimitadas por gameSurface, incluindo overlays. Shell usa CSS Modules próprios. Não apagar regras necessárias aos jogos por não aparecerem no shell. |
| Conta/rede/chat/arquivos/perfis/mídia                 | Donos existentes observados por snapshots; views novas delegam comandos.                                                                                                                  |
| Clipes/gravação/soundboard/Remote PC                  | Mesmos armazenamento, autorização e transportes; apresentação reintegrada. Replay Windows continua suspenso conforme capacidade existente.                                                |
| Backend/Electron/tipos compartilhados                 | Serviços, HTTP/WS/IPC, autorização e persistência preservados. Helpers exigem ambiente nativo.                                                                                            |
| Apresentação externa antiga                           | 30 views/posicionadores finais retirados após revisão individual, além dos cortes anteriores. Destinos reais na matriz; nenhuma árvore legada paralela.                                   |

Revisão do corte: artifacts/frontend-reset/finish-removal-review.json.
Inventários e evidências anteriores são artefatos auxiliares, não outra fonte
de instruções.

## Interfaces e invariantes

- Um socket por cliente e um dono por recurso. Assinaturas de apresentação
  terminam na desmontagem; consumidores emprestados nunca encerram tracks.
- Tela aberta, destino do compositor e participação em voz/jogo são distintos.
  Navegar entre chamada, chat, jogos e configurações conserva players.
- Conta/sala invalidam operações antigas. Captura concluída atrasada é descartada.
  Sair cancela seleção/encoder/persistência pendente da gravação.
- Fachadas delegam ao mesmo dono; nenhum novo contrato de backend.
- Fullscreen nativo pertence a desktop/window. Atualizador e avisos inicializam
  sem depender da casca antiga. Atualização exige prontidão e reinício explícito.
- Somente a superfície ativa abre a confirmação de moderação. Escape respeita
  overlays superiores. Avisos não cobrem os controles de chamada.

## Testes e comandos

Um único comando: npm test, com --suite core|browser|desktop|all e --filter.
tests/suites.json é a classificação; CI usa o mesmo dispatcher. Não adicionar
aliases por cenário. Fazer build antes de consumir out.

Reutilizar node:test, Playwright e fixtures. TDD nos limites aprovados:
comandos/snapshots, HTTP/WS, navegador e Electron. Prioridades: conta/isolamento;
permissões; histórico/envio/anexos/retry; partidas/reconexão; continuidade de voz;
cancelamento/descarte; perfil; soundboard; clipes/gravação; controle remoto;
teclado, foco, Escape, rolagem e responsividade.

Fixtures dos layouts Original/Discord foram migradas para a Corte. A escolha de
layout e o cabeçalho colapsável foram aposentados. Continuam as asserções úteis
de transporte, mídia, identidade, gestos do painel dos jogos e controles.
Mapeamentos ficam em artifacts/frontend-reset/finish-test-consolidation.json
e finish-desktop-consolidation.json. Não retirar cobertura para deixar CI verde.

### Evidência vigente

Logs e imagens ficam em artifacts/frontend-reset. A rodada remota atual é
[40402075694](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/actions/runs/40402075694),
commit aa254a9. Core, quatro grupos browser, job Windows, executável empacotado e NSIS aprovados.
A entrega foi bloqueada por falso positivo do filtro PowerShell (# skipped 0),
corrigido com regressão que também exige rejeição de skips reais. Nova rodada
necessária; a publicação permanece bloqueada até aprovação integral.

| Limite | Evidência concluída |
| --- | --- |
| Core, tipos e formatação | 1.411/1.411 no job Types, formatting and backend da rodada atual; tipos e formatação aprovados. |
| Navegador completo | 164 aprovados, zero falhas e dois skips de codec externo nos quatro grupos da rodada atual; mais duas variações da ponte desktop aprovadas. |
| Mídia e recursos Windows | Job Real Windows media and desktop aprovado na rodada atual: helpers MSVC, chamada/captura, sessão, atualização, XInput/SendInput, PCM em segundo plano, Cinzas e runtime. Loopback sem endpoint de saída foi pulado no runner. |
| Compilação nativa local | Visual Studio Community 2026/SDK instalados pelo usuário; windows-native-local-installed.log aprovado. |
| Aplicativo empacotado local | windows-packaged-local-approved.log aprovado; não comprova aceitação do instalador. |
| Fixtures ajustadas | windows-call-arrival-budget.log: oito casos aprovados com dois núcleos, incluindo dez clientes e ciclo de vida da mídia. |
| Pacote, instalação e Surge | Executável e atualização NSIS aprovados em 40402075694; publicação aguarda a correção do filtro de skips do workflow. Última versão pública confirmada: 0.3.4. |

Capturas aceitas: artifacts/workspace/corte-*.png, final-polish-qa e call-qa.
Os dois skips de codec externo decorrem de FFmpeg/FFprobe ausentes; decode,
replay e seek pelo Chromium passaram. Loopback por aplicativo passou localmente
em windows-native-local-final.log, sem alegar sucesso desse caso no CI.
Navegador com ponte simulada não comprova Electron real. Câmeras, microfones e
transmissões sintéticos não comprovam equipamento físico, qualidade em produção
ou o serviço SFU de destino. Assinatura de distribuição não foi declarada aprovada.

## Distribuição automática e tempo de CI

Windows full app divide os mesmos 56 arquivos browser em quatro grupos por
--shard. O dispatcher verifica partição completa sem duplicatas; a agregação
obrigatória falha se qualquer grupo falhar. Core e browser não são repetidos no
job nativo; permanecem os limites reais de captura, XInput, SendInput e PCM.
O navegador serial anteriormente atingiu 15 minutos. Registrar o tempo completo
apenas após pacote, instalação e publicação concluídos.

A entrega reutiliza os helpers validados na mesma execução, testa o executável
empacotado, gera NSIS e verifica instalação/atualização com o app na bandeja em
runner descartável. Só depois gera EXE/ZIP/hashes e passa a tag à publicação.
O publicador exige o mesmo commit e os quatro jobs aprovados, verifica hashes e
manifesto e confere o site publicado. Publish approved frontend pode repetir
somente o envio, resolvendo a entrega aprovada sem seleção manual de tag.
Operação: [PUBLICAR_SURGE_LEVE.md](PUBLICAR_SURGE_LEVE.md).

## Correções e limites das fixtures

- Lobby usa alinhamento seguro em janela curta. QuickPanel mantém dimensões
  fracionárias e limites do viewport; ResizeObserver é liberado na desmontagem.
- Preload recebe a versão de app.getVersion; não mantém número fixo independente.
- Captura silenciosa de BrowserWindow não exige loopback; áudio por aplicativo
  conserva sua verificação própria. Os seletores usam as telas atuais da Corte.
- Restauração da conta/sala e operações de captura aguardam conclusão pública;
  a primeira entrada em voz termina antes da navegação seguinte.
- Ganho é medido por PCM no AudioWorklet por meio segundo, sem depender de picos
  amostrados por requestAnimationFrame.
- Dez clientes conservam contextos e peers reais, quatro câmeras e duas telas.
  Fontes sintéticas são 320×180/640×360 a 5 FPS; um falante e nove ouvintes são
  mutados pelos controles reais. Só a interface observada é renderizada. É
  regressão de comportamento/layout, não benchmark HD ou dez falantes simultâneos.
- Entrega remota das telas aguarda até 15s, como a chegada de frames. A primeira
  ativação fria do supressor por clique aguarda até 20s e captura diagnóstico se
  falhar; asserções de processamento, tracks, cancelamento e descarte permanecem.

## Revisão e próximos passos

Implementação e corte do Marco 3 concluídos. Revisão de padrões/especificação
corrigiu clique do atualizador e cancelamento de persistência ao sair. Regressões
conservam permissões tardias, mãos/decisões privadas da Corte e soundboard entre
clientes. O teste de cache tolera ENOTEMPTY transitório sem mudar produção.

1. Conferir os quatro grupos browser e limites nativos da rodada atual. Falha
   concreta exige diagnóstico e regressão; não retirar cobertura para obter CI verde.
2. Após aprovação, conferir pacote, aceitação NSIS e publicação automática. Confirmar
   downloads/latest.yml, metadado da página e instalador da mesma entrega.
3. Registrar resultado/tempo reais neste checkpoint e retirar pendências resolvidas.
   Hardware físico e SFU no ambiente de destino continuam verificações próprias.

A aparência geral do chat e maior diferenciação estética do Discord foram adiadas
pelo usuário. Preservar os aceites; não reabrir esses escopos no fechamento.

## Documentação e conclusão

README é a entrada; AGENTS roteia; arquitetura guarda donos; desenvolvimento
operação; UX comportamento/referência/aceites; este arquivo execução; workflow
contribuição. Atualizar a fonte dona e consumidores, sem criar MD por ajuste.
Preservar docs de jogos, licenças e distribuição; histórico detalhado fica no Git.

Encerrar com três aceites, recursos com destino/evidência, corte concluído,
comandos/CI consolidados, docs coerentes e checks pertinentes concluídos com
limitações reais declaradas. Aceite visual não comprova hardware ou CI remoto.
