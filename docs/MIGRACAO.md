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

Os três marcos receberam aceite visual humano na conversa em 25/10/2026.
O usuário desistiu de preparar distribuição intermediária: finalizar o Marco 3
primeiro. O fechamento original ficou local. Em 26/10, o usuário autorizou executar a
pipeline Windows e automatizar/publicar no Surge. Commit/push da contribuição
são necessários para executar o código atual no runner; main continua intacta.
Não instalar ferramentas/driver neste host; compilação será conferida no runner.

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

### Evidência de fechamento

Logs e imagens em artifacts/frontend-reset, sem novo Markdown por rodada.

| Verificação                             | Evidência atual                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core                                    | 1.408/1.408 em finish-core-verified.log, incluindo cancelamento em cinco fronteiras de persistência.                                                                     |
| Dono de fullscreen e contratos da Corte | 19/19 em finish-native-window-core.log.                                                                                                                                  |
| Navegador completo                      | 164 aprovados, zero falhas e dois skips de codec externo em finish-browser-approved.log (166 casos). Clipes portátil revalidado em finish-clips-portable.log.            |
| Electron: chamada/captura e sessão      | 10/10 em finish-desktop-final.log: sessão, chamada/captura, janela e contratos de atualização. Microfone sintético; captura real de BrowserWindow controlada.            |
| Dois Electron reais                     | finish-native-peers-restored.log: frames/peers/players, navegação, troca de fonte, fullscreen, mãos privadas/Reserva e permissões tardias. Fontes sintéticas animadas.   |
| Tipos/build/formatação                  | Tipos, formatação de fontes e exportação estática aprovados no código final: finish-types.log, finish-format-check.log e finish-build.log.                               |
| Cinzas e smoke de runtime               | Cinzas/Splendor/Love Letter com backend descartável em finish-native-extra.log; permissões, IPC, HTTPS, filesystem, PCM e bandeja em finish-native-runtime-verified.log. |
| Auxiliares nativos                      | finish-native-build.log: compilação indisponível sem Visual Studio/MSVC. Atividade nativa falhou por helper ausente, não foi aprovada.                                   |

Fixtures não comprovam microfone físico, loopback por aplicativo, driver de
controle remoto, qualidade em produção ou instalador. FFmpeg/FFprobe também
não estão disponíveis. Não instalar ferramentas/driver para esconder pendências.
Pacote, instalação, assinatura e pipeline remoto não foram executados nesta etapa.

## Fechamento e pré-distribuição

Implementação do Marco 3 encerrada, com os aceites visuais preservados. Build,
tipos, formatação, core, navegador completo e regressões Electron compatíveis
com este ambiente passaram. Matriz de destinos, links canônicos e sintaxe das
fixtures foram conferidos; revisão final tratou os achados. O CI agora executa
core e browser completos, sem aliases por cenário. O pipeline remoto não foi rodado.

Antes da distribuição, continuam os pré-requisitos de ambiente:

1. Em Windows com MSVC/SDK e helpers compilados, executar a suíte desktop completa
   e o pipeline de pacote/instalador. Atividade nativa segue pendente neste host;
   a detecção dedicada conserva a falha por helper ausente. Pacote, instalação e
   assinatura ainda precisam de sua própria evidência.
2. Conferir equipamento, loopback por aplicativo, driver de controle remoto e
   serviço SFU no ambiente pertinente. Fixtures não substituem essa verificação.
3. Publicação fica com o usuário. Nenhum commit, push, PR, pacote, instalação ou
   deploy foi feito neste fechamento.

As lacunas encontradas na revisão foram tratadas: o aviso de atualização conserva
clique; somente avisos passivos ignoram ponteiro; logout aborta gravação ainda não
confirmada e impede download. Regressões preservam soundboard entre dois clientes,
permissões tardias e mãos/decisões privadas entre dois Electron. A limpeza do teste
de cache usa repetição limitada para ENOTEMPTY transitório do Windows, sem alterar
o cache de produção. Trinta rodadas passaram após reproduzir a falha.

Capturas inspecionadas: artifacts/workspace/corte-*.png (desktop, tablet, telefone e
paisagem curta), final-polish-qa (perfis) e call-qa (dez pessoas/duas telas). Os nomes
web/bridge identificam navegador e ponte simulada; somente os logs declarados
Electron comprovam execução no runtime nativo.

A aparência geral do chat e maior diferenciação estética do Discord foram
adiadas pelo usuário; não reabrir esses escopos durante o fechamento.

## Revisão do fechamento

| Eixo          | Resultado                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Padrões       | Corrigidos clique do atualizador e cancelamento da persistência; nova leitura não encontrou defeito concreto nesses limites.                                                                                                |
| Especificação | Recuperadas permissões tardias, fluxos privados da Corte e soundboard entre clientes; startup nativo migrou da rail retirada para a Corte. Regressões locais passaram; pacote/instalador aguardam ambiente de distribuição. |

## Documentação e conclusão

README é a entrada; AGENTS roteia; arquitetura guarda donos; desenvolvimento
guarda operação; UX guarda comportamento/referência/aceites; este arquivo guarda
execução; workflow guarda contribuição. Atualizar a fonte dona e consumidores,
sem criar MD por ajuste. Preservar docs de jogos, licenças e distribuição.

Encerrar com três aceites, recursos com destino/evidência, corte concluído,
comandos/CI consolidados, docs coerentes e checks pertinentes concluídos com
limitações reais declaradas. Aceite visual não comprova hardware ou CI remoto.

## Distribuição automática — em execução

Nova autorização: rodar Windows full app no GitHub e encadear Surge sem seleção
manual de tag. Versão preparada: 0.3.5 (Surge ainda servia 0.3.4 na inspeção).
O atualizador precisa de incremento para oferecer o novo instalador. A publicação
reutiliza o pacote do mesmo commit/tentativa com os quatro jobs aprovados. A
reexecução independente de Publish approved frontend resolve a tag automaticamente.
Resultado remoto será registrado aqui após concluir; checks locais anteriores não
substituem o runner nem comprovam publicação. Ferramentas nativas existem no
ambiente de destino segundo o usuário; sua ausência local não invalida esse host.

A primeira rodada Windows confirmou compilação MSVC/helpers, tipos e core, mas
revelou lobby inacessível em 1024×680, seletor antigo no teste de Remote PC e
seleção implícita de loopback numa janela QA silenciosa. Corrigidos: alinhamento
seguro do lobby com reprodução antes/depois, seletor semântico/aba correta e
captura QA com vídeo real/microfone emprestado (loopback conserva teste próprio).

O navegador serial atingiu 15 minutos no runner. A pedido do usuário, a pipeline
agora divide os mesmos 56 arquivos em quatro grupos paralelos por --shard, com
agregação obrigatória antes da entrega. Teste do dispatcher verifica partição
completa, estável e sem duplicatas; não foram retirados cenários. TAP expõe erros
antes do resumo final. Tempo efetivo e resultado remoto ainda aguardam execução.
