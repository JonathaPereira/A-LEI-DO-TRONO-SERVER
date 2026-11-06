# Checkpoint de transferência — Operação Renascimento

O usuário pediu para interromper a continuidade automática neste ponto e entregar uma branch acessível e um prompt para outro desenvolvedor/chat. **Não recomeçar a auditoria nem reimplementar entregas já feitas.**

## Situação de preservação

O usuário autorizou explicitamente criar os commits e fazer push das duas branches de continuidade. A entrega consolidada é `RENASCIMENTO-COMPLETO.zip`: contém as fontes completas dos dois projetos, recursos dos jogos, diretriz original, checklist, evidências selecionadas e prompt. O `MANIFESTO.json` do ZIP registra os commits, os estados remotos verificados e hashes dos arquivos. Não houve merge, PR, deploy ou publicação de release.

| Repositório | Branch de continuidade | Base do desenvolvimento |
| --- | --- | --- |
| `JonathaPereira/A-LEI-DO-TRONO-SERVER` | `codex/renascimento-audit` | `f77449b0ad22cfb4d8f6370306138fa501f8a324` |
| `JonathaPereira/PROJETO-NEXUS` | `codex/renascimento-save-recovery` | `e517fc814541c7c6f1b428e87e1019e0dfbd7a9b` |

A base Nexus veio de `codex/nexus-015`; não usar `main` para substituir o estado do checkpoint. Revisão Nexus preservada: `27768ca126d8e2f93139702656849c561eec0705`. Confira os SHAs finais no manifesto. Nunca faça force-push para resolver diferenças.

Branches de continuidade:
- https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/tree/codex/renascimento-audit
- https://github.com/JonathaPereira/PROJETO-NEXUS/tree/codex/renascimento-save-recovery

## Prompt pronto para o próximo chat

```text
Continue a Operação Renascimento dos três jogos a partir deste checkpoint.

Repositórios e branches de continuidade:
- JonathaPereira/A-LEI-DO-TRONO-SERVER — codex/renascimento-audit
- JonathaPereira/PROJETO-NEXUS — codex/renascimento-save-recovery

Use as fontes completas de RENASCIMENTO-COMPLETO.zip ou clone as duas branches
acima. O ZIP contém PROMPT_PARA_PROXIMO_CHAT.txt e MANIFESTO.json, com revisões e
integridade. Não comece do main nem reaplique patches sobre essas fontes completas.

Antes de editar, leia no repositório principal:
1. AGENTS.md e docs/agents/workflow.md;
2. docs/RENASCIMENTO_CHECKPOINT.md;
3. docs/RENASCIMENTO_DIRETRIZ_ORIGINAL.txt (pedido original integral);
4. docs/RENASCIMENTO.md, especialmente a checklist consolidada e o incremento 11;
5. docs/MIGRACAO.md.
No Nexus, leia godot/ROADMAP.md, CAMPAIGN.md, PROGRESSION.md e BALANCING.md.

O trabalho chegou ao campo Corrente do éter. Fases dos chefes ainda não foram
iniciadas no código. O próximo item recomendado é um chefe com duas fases,
seguido da expansão da campanha Nexus para seis capítulos/48 missões variadas,
vínculos/aquisição/jornadas individuais, progressão permanente de Cinzas e
árvores estratégicas do Atalaia. A diretriz original mantém todas as metas.

Preserve jogos, artes, lore, trios livres e saves. Não recomece os projetos.
Faça entregas pequenas completas com testes de comportamento, build e inspeção
apropriados; atualize a checklist e os documentos donos. Continue pelos itens
pendentes sem depender de prompts repetidos para cada passo. Informe progresso
em português e diferencie código implementado, testes, simulações e aceite humano.

O usuário autorizou commit/push deste checkpoint nas duas branches. Main, merge,
PR, deploy e publicação de release não fazem parte dessa autorização. Renascimento
1.0 ainda não está homologado.
```

## Usar o ZIP consolidado em outro ambiente

Extraia `RENASCIMENTO-COMPLETO.zip`. Os diretórios `A-LEI-DO-TRONO-SERVER/` e `PROJETO-NEXUS/` contêm todos os arquivos de fonte/recurso versionados, incluindo as mudanças deste checkpoint. Não exigem aplicar patches nem obter uma versão anterior para abrir o código.

Leia `LEIA-ME.md` na raiz do ZIP e copie `PROMPT_PARA_PROXIMO_CHAT.txt` para o próximo chat. A diretriz original e a checklist estão nos documentos do repositório principal. Para preservar o histórico Git, prefira clonar as branches indicadas, conferindo os commits com `MANIFESTO.json`.

O ZIP exclui `.git`, segredos, dependências instaladas, caches, modelos TTS e exports gerados. Instale dependências pelos lockfiles e recompile quando necessário. As gravações, artes e demais recursos necessários ao jogo estão incluídos. O manifesto contém SHA-256 das fontes; a integridade do arquivo é verificada antes da entrega.

## Estado funcional entregue

### Repositório principal

- Cinzas: 15 capítulos/três regiões preservados; checkpoint de campanha separado da horda, retomada em marcos, backup v2 compatível com v1, confirmação de substituição e conservação de recompensas/objetos consumidos.
- Atalaia: 15 ondas preservadas; validação estrita/atômica de save e estado de RNG, backup rotativo verificado, recuperação automática com aviso, preservação de arquivo danificado e falha de gravação sem encerrar a partida.
- `scripts/godot-process.cjs` trata `SCRIPT ERROR`/`ERROR:` como falha mesmo com saída zero.
- Host/frontend existente preservado; seus aceites anteriores não homologam o audiovisual novo dos jogos.

### Nexus

- 24 heróis originais ativos/seis afinidades, quatro Lumi restaurados com índices originais. Os vinte kits anteriores ficaram iguais.
- Regras livres/PvP **0.16.0**: Ígneo → Natural → Técnico → Arcano → Sombrio → Lumi → Ígneo. Sombrio/Ígneo agora é neutro.
- Campanha ainda tem **três capítulos/nove missões**, todas preservadas por IDs estáveis. Não há 48 missões implementadas.
- Objetivos: acólito até rodada 4; defesa do trio por três rodadas; comandante até rodada 6; portador escolhido no primeiro espaço do trio; duas ondas na escadaria das marés; campo de energia na guardiã da memória.
- Portador pode ser qualquer herói. Morte dele falha antes da vitória por eliminar rivais; o automático prioriza apoio útil quando ele está em risco.
- Ondas preservam vida, energia, baixas, recargas/condições e expiração de escudos. Reforços começam nova rodada. Recompensa só após a última onda; duas/três ondas testadas.
- Campo Corrente do éter: básicos +4 EN, técnicas +5 EN de custo para os dois lados; ultimates inalterados. Combina com treinos e persiste nos reforços.
- Oficina: Arma/Proteção/Relíquia, três patamares, especializações, fragmentos, transferências e conservação de gemas/investimento.
- Gemas I/II/III: fabricação escolhida e fusão de três livres; equipadas protegidas; orçamento de campanha e teto opcional de nove gemas III testados.
- Nível comum 1–6 e maestria por participação com marcos 10/30/60, bônus limitados e tela Evolução. Quem cai ainda recebe participação na vitória do trio.
- 72 formas treináveis: Ímpeto (+15% fator/+10 EN), Economia (−10% fator/−10 EN), Ritmo (−10% fator/+4 EN de básico). Conservam efeitos/combos; livre/PvP usa o kit original.
- 24 fichas com história/conexões/citação; 96 falas sintéticas de protótipo. As 80 gravações anteriores foram preservadas exatamente; 16 novas adicionadas. `lumi-three.png` isola Elyra/Solen/Zaya com referência ao atlas; Auren preserva arte/poses. Aceite artístico humano pendente.
- PvP foi validado com servidor local compatível. O hash mudou com 24 heróis/regras 0.16; o servidor publicado precisa acompanhar. Nenhum deploy realizado.

## Donos e contratos importantes no Nexus

- `src/data.js`, `src/kits.js`, `src/balance.json`: catálogo e regras compartilhados. Depois de alterá-los, `npm run sync:godot`; não editar manualmente os JSON gerados de catálogo/regras/hash PvP.
- `godot/scripts/campaign.gd`: missões, equipe, progressão, IO e recibos de vitória. `LEGACY_ORDER/LEGACY_REWARDS` são congelados para migrar históricos; não reinterpretar progresso pela ordem atual da tela.
- Save atual: **schema 8**, caminho `user://campaign-0.7.json`. Migra 1–7 com cópias exatas `.vN.bak`; recupera `.bak`, preserva danificados e bloqueia sobrescrita de dados futuros/desconhecidos.
- Estoques/saldo derivam de histórico e investimentos; recompensas novas usam tentativa real e recibo único. Edições revertem em falha de IO; vitória não salva fica pendente em memória com aviso, sem duplicar.
- `equipment.gd`, `gem_forge.gd`, `progression.gd`, `ability_training.gd`: modelos independentes, parâmetros nos respectivos JSON em `godot/data/`.
- `mission_objectives.gd`, `mission_waves.gd`, `mission_field.gd`: regras transitórias de encontro, sem aumentar o formato do save.
- `Campaign._checkpoint(state, engine, boundary)` resolve falhas/objetivos antes de pedir reforços. O motor possui o reagendamento: callback retorna `true` para começar uma nova rodada. Não duplicar a ordem dos turnos no controlador.
- `combat.gd` usa snapshots `actor.campaignActions` para treino/campo; catálogo original permanece intacto. `impactUnits` registra o impacto antes de mudanças posteriores/efeitos de turno.
- `hub.gd` apresenta coleção/evolução; prévias fora da missão são base. `combat_ui.gd` mostra custo/ganho efetivos.
- Laboratório/logs usam arquivos **0.16**, preservando os 0.15; 282 simulações, tabelas e filtros com 24 heróis.

## Verificação já concluída

- Principal: core **1.475 aprovados** na fundação; Cinzas/Atalaia e browsers pertinentes aprovados. Atalaia: 194 validações de schema, 32 de armazenamento e 24 regras/UI, vitória completa real de 15 ondas.
- Principal, no fechamento: `npm run typecheck`, `npm run format:check`, `npm run build` aprovados.
- Nexus: **55 testes JS/PvP**, sintaxe; browser original seis testes e escolha/persistência adicional de Elyra.
- Última suíte Godot completa, após ondas: **1.301 checks integrados / 1.272 de UI**, mais suites específicas; paridade de **36 partidas / 2.018 ações**, replay de **282 logs / 17.730 ações**.
- Após campo: **168 checks específicos / 601 pertinentes**, incluindo 24 heróis e rivais, custos pagos, invariantes, treino/ondas, campanha, itens/XP e coleção. Não foi executada outra suíte completa após adicionar o campo.
- Matriz atual do campo: 252 cenários; **111/126 e 114/126** vitórias, zero erros. Persistem derrotas por prazo no Guardião do relé. Não é equilíbrio final aprovado.
- Web real: habilidades/fusão/persistência, Lumi, portador, ondas e campo inspecionados em 1600×900 e 1280×720. Ondas: vitória real e IndexedDB com uma recompensa final/+10 maestria para cada participante.
- Screenshots/logs locais são evidência temporária, não snapshots permanentes aprovados nem aceite humano. Hardware físico/Electron Windows/sessões prolongadas e homologação final continuam pendentes.

## Preparar e verificar no novo ambiente

Node **24**; `npm ci` em cada repositório. Godot **4.6.3 Standard**, templates Web da mesma versão. Modelos Kokoro não são necessários para jogar ou compilar: as gravações prontas já estão nas fontes.

Use `GODOT_EXECUTABLE` no Nexus e `GODOT_BIN` no build Atalaia. `XDG_DATA_HOME`, `XDG_CONFIG_HOME` e `XDG_CACHE_HOME` precisam ser caminhos absolutos e isolados nos testes; nunca use `$HOME` como variável de trabalho. Importar o projeto antes de scripts diretos evita falsos erros de recursos.

```sh
# Principal
npm run typecheck
npm run format:check
npm run build
node scripts/test.cjs --suite core
node --test tests/atalaia.cjs tests/atalaia-browser.cjs
node scripts/build-atalaia.cjs

# Nexus
npm test
npm run check
npm run sync:godot    # somente se catálogo/regras foram alterados
npm run test:godot
npm run build:game
npm run test:browser
npm run test:pvp:godot
npm run test:pvp:web
```

Build antes de testes Web que consomem exports. Suítes nativas usam Chromium/Godot e portas locais. Detecte erro de script no log, além do código de saída. Reexecute verificações proporcionais às próximas mudanças; não repetir todo o conjunto por alterações só de texto.

## Próxima entrega recomendada

Ainda não existe módulo de fases de chefe. Começar pelo Arconte da fornalha, com testes falhando pelo comportamento antes da implementação. Sugestão a avaliar, não requisito já implementado: segunda fase abaixo de 50% de vida, janela de defesa menor e padrão ofensivo diferente, com aviso de preparação/HUD/resultado.

Invariantes: não reviver ao cruzar limiar, não reaplicar bônus indefinidamente, não alterar o golpe que já atingiu o chefe retroativamente, preservar limites de escudo/energia e recargas, manter combinações de campo/treino e resolver derrota antes de transição. Modificar ator/snapshot, jamais o catálogo compartilhado. Confirmar no combate real e na campanha de nove missões antes de expandir conteúdo.

Depois seguir a checklist de `RENASCIMENTO.md`: Nexus 6×8 missões mais secundárias, variedade de campos/ondas/chefes, vínculos/aquisição/jornadas, progressão permanente de Cinzas (meta cinco regiões) e Atalaia (cinco atos/30 fases, árvores e seis torres novas), audiovisual, balanceamento, performance e homologação. Não reduzir as metas da diretriz original nem declarar 1.0 por terminar uma fatia.
