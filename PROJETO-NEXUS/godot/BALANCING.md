# Onde balancear o NEXUS

Os heróis e os parâmetros globais têm fontes editáveis separadas. O catálogo e as fórmulas usados pelo Godot são gerados dessas fontes. Não é necessário procurar números na interface para mudar o combate.

| Quero mudar | Arquivo editável | Ponto de entrada |
| --- | --- | --- |
| Vida, ataque, defesa e velocidade de um herói | `src/kits.js` | `KITS.<id>.stats`, com `hp`, `attack`, `defense` e `speed` identificados |
| Dano, cura, escudo, efeitos e combos de uma habilidade | `src/kits.js` | `basic`, `skill`, `ultimate` do herói |
| Custo/recarga de uma habilidade específica | `src/kits.js` | Campos opcionais `cost` e `cooldown` na ação |
| Custo/recarga padrão herdados pelo elenco | `src/data.js` | Montagem de `ALL_HEROES`: técnica 30 EN/2 turnos; supremo 80 EN |
| Nome, afinidade, arma, índice de arte e descrição base | `src/data.js` | Entrada do herói em `roster`; `CLASSES` define a ordem do ciclo |
| Crítico, mitigação, duração, energia, debuffs, Fratura | **`src/balance.json`** | Parâmetros globais, detalhados abaixo |
| Uma regra nova ou a sequência da fórmula | `src/engine.js` **e** `godot/scripts/combat.gd` | Motores equivalentes; valide a paridade após editar ambos |
| Gemas, cópias, engastes e bônus da campanha | `godot/scripts/campaign.gd` | `GEMS`, `SLOT_COUNT`, `STARTING_COPIES`, `bonuses()` e `battle()` |
| Peças, patamares, especializações, custos e fragmentos | `godot/data/equipment.json` | Validação e bônus em `equipment.gd`; aplicação em `campaign.loadout_stats()` |
| Minions, chefe e dificuldade das missões | `godot/scripts/campaign.gd` | `register_enemies()` e `MISSIONS[].scale` |
| Tipo de objetivo, alvo e prazo | `godot/scripts/campaign.gd` | `MISSIONS[].objective`; resolução em `mission_objectives.gd` |
| Prioridade de alvo, risco de aliados e reserva de energia na campanha | `godot/data/campaign-tactics.json` | Pesos `targetDamageWeight`, `ultimateReserveWeight`, `endangeredHealthRatio`; não usados no livre/PvP |
| Entender os testes simulados | `godot/SIMULATIONS.md` | Amostras, filtros, limitações e exportação |

`godot/data/catalog.json` e `godot/data/combat-rules.json` são **cópias geradas**: alterações manuais neles serão substituídas na sincronização. Os 20 heróis ativos vêm de `KITS`; os quatro arquivados mantêm seus dados e índices de arte. Não renumere o elenco para remover um personagem da seleção.

## Amostra reproduzível dos objetivos de campanha

No diretório raiz, com Godot 4.6.3 e diretório de usuário descartável:

```sh
XDG_DATA_HOME="$PWD/artifacts/objective-matrix/data" godot --headless --path godot --script res://tests/objective_matrix.gd
```

O script simula quatro trios, três sementes por encontro e os três objetivos,
sem gemas equipadas, usando a política automática real da campanha. Escreve
`objective-matrix-basic.json` no diretório de usuário isolado informado no resultado.
Registra vitória/derrota, motivo, ações, vida, dano, cura e escudo por unidade.
É uma amostra de 36 cenários; não representa taxa de vitória humana ou equilíbrio
competitivo. Uma derrota registrada permanece derrota; o relatório não a
transforma em teste aprovado de viabilidade.

Os testes `mission_objectives.gd` verificam as condições, ordem dos efeitos e a
interface; `two_d.gd` verifica as nove missões com o trio inicial. Ambos fazem
parte de `npm run test:godot`. Não edite o catálogo ou as fórmulas geradas para
fazer um objetivo passar.

## Parâmetros globais: `src/balance.json`

`schemaVersion: 1` descreve o formato; `rulesVersion: "0.11.0"` identifica as regras atuais. A Alpha 0.11 aplica novas identidades e reworks. A ordem de resolução e o arredondamento são iguais nos dois motores.

Valores `Ratio` são frações da quantidade indicada: `0.25` = 25%. Um `Multiplier` multiplica a quantidade: `0.85` significa receber/produzir 85%, uma redução de 15%. Durações são contadas em turnos/ações pessoais, não em rodadas da equipe.

| Grupo | Campos e valores atuais | Efeito |
| --- | --- | --- |
| `affinity` | `advantageMultiplier: 1.25`, `resistanceMultiplier: 0.85`, `neutralMultiplier: 1` | Vantagem, resistência e neutralidade do ciclo de afinidades |
| `critical` | `chance: 0.1`, `damageMultiplier: 1.4` | 10% de chance; 140% do dano no crítico |
| `damage` | `defenseBaseline: 100`, `defenseWeight: 0.5`, `minimumHit: 1` | Curva de mitigação por defesa e piso do golpe |
| `energy` | `initial: 40`, `maximum: 100`, `basicGain: 24`, `guardGain: 25` | Recursos iniciais, limite e ganhos das ações básicas |
| `shield` | `maxHpRatio: 0.25`, `durationRounds: 2` | Teto total de escudo; camadas somam, expiram separadamente no início da rodada de concessão + 2 e absorvem das mais antigas para as mais novas |
| `guard` | `shieldMaxHpRatio: 0.06`, `incomingDamageMultiplier: 0.65` | Escudo da defesa e mitigação até o próximo turno |
| `status` | `durationTurns: 2` | Duração padrão de buffs e debuffs aplicados |
| `status` | `burnMaxHpRatio: 0.065`, `bleedMaxHpRatio: 0.065`, `regenMaxHpRatio: 0.04` | Dano de queimadura/sangramento e regeneração no início do turno |
| `status` | `bleedHealingMultiplier: 0.65` | Toda cura recebida com sangramento é reduzida em 35% |
| `status` | `weakenAttackMultiplier: 0.8`, `empowerAttackMultiplier: 1.2`, `exposeDefenseMultiplier: 0.75` | Ataque enfraquecido, ataque fortalecido e defesa exposta |
| `status` | `fortifyIncomingDamageMultiplier: 0.85`, `focusDamageMultiplier: 1.25` | Fortificação e amplificação do próximo golpe pelo Selo |
| `status` | `coverRedirectRatio: 0.25`, `seedHealMaxHpRatio: 0.1` | Parcela interceptada pelo protetor e cura da Semente |
| `status` | `mirrorDamageRatio: 0.2`, `riposteAttackRatio: 0.3` | Reflexão do dano à vida e contra-ataque baseado no ataque |
| `classPassives` | `arcanoDefenseMultiplier: 0.75`, `sombrioDrainRatio: 0.15` | Arcano considera 75% da defesa; Sombrio drena 15% do dano efetivo à vida |
| `fracture` | `startRound: 12`, `initialMaxHpRatio: 0.04`, `perRoundMaxHpRatio: 0.025`, `maxHpRatioCap: 0.85` | Fratura começa com 4% da vida máxima, cresce 2,5 pontos por rodada e limita em 85% |
| `fracture` | `healingReductionPerRound: 0.1` | Cura reduzida em mais 10 pontos percentuais por rodada desde a primeira Fratura |
| `difficulty.enemyStatMultiplier` | `easy: 0.82`, `normal: 1`, `hard: 1.15` | Multiplica vida e ataque da equipe adversária no combate livre |
| `ai` | `supportPriority: 1.18`, `damagePriority: 1.08`, `killBonus: 700`, `healValue: 1.35`, `shieldValue: 0.8` | Pesos da avaliação de alvos, finalizações, cura efetiva e escudo adicional; não mudam atributos nem consomem RNG |

Os limiares de `ai` mudam a política dos bots, não a força de uma habilidade. Isso pode alterar bastante o resultado das simulações. As constantes do gerador aleatório e a ordenação por velocidade permanecem no motor; não são ajustes de balanceamento.

## Exemplo: ajustar um personagem

Em `src/kits.js`, procure `"kira":`. Para reduzir apenas o ataque dela, altere `"attack": 265` para `"attack": 255` dentro de `"stats"`. Os campos `"hp": 1030`, `"defense": 73` e `"speed": 108` permanecem identificados ao lado. Para reduzir somente a técnica, altere o `power` de `Sobrecarga` de `1.65` para `1.55`; atualize também o texto de `165%` para `155%`.

Cada ação é um objeto separado em `basic`, `skill` ou `ultimate`, com campos identificados `name`, `kind`, `power` e `description`. Adicionar `"cost": 35` e `"cooldown": 3` dentro dessa habilidade substitui os padrões somente dela. Outros campos já usados no elenco: `effect`, `extraEffect`, `combo`, `secondary`, `pierce`, `shieldScale`, `executeThreshold` e `executeMultiplier`. Preserve os campos existentes quando adicionar uma substituição.

`speed` define a ordem de iniciativa. `defense` entra na curva de mitigação; não corresponde diretamente a uma porcentagem de redução. O primeiro tanque da formação concede Cobertura aos outros aliados por `tankProtection.openingTurns` (2 turnos pessoais de cada aliado). Não acumula protetores. AoE ignora Cobertura. A posição não impede escolher alvos. Vesper provoca por 2 turnos pessoais e recebe o multiplicador `status.tauntDefenseMultiplier: 0.75` na própria defesa durante a postura. O indicador vermelho `tauntRisk` deriva da provocação; não é um debuff purificável separado.

## Exemplo: ajustar uma fórmula global

Para reduzir o teto das barreiras para 22%, altere **somente** `shield.maxHpRatio` de `0.25` para `0.22` em `src/balance.json`, depois sincronize. Para mudar o crítico para 12%, edite `critical.chance` para `0.12`.

Os motores leem esses mesmos parâmetros. No JavaScript, `RULES` é exportado por `src/engine.js`; no Godot, cada instância expõe `combat.rules`. O alias `combat.SHIELD_CAP` corresponde a `rules.shield.maxHpRatio`.

Descrições de habilidades em `src/kits.js` são editoriais: revise os textos relacionados quando mudar uma duração ou efeito global. A descrição compartilhada da Defesa em `src/data.js` é derivada dos parâmetros automaticamente. Crítico, Fratura, vantagens, estados e limites de escudo do HUD e da ajuda são derivados dos parâmetros por `godot/scripts/rules_text.gd` e `combat_ui.gd`. Um poder escrito no texto não controla a fórmula. A interface deve mostrar o resultado dos recibos do combate, que continuam sendo a fonte do dano efetivamente aplicado.

## Onde fica a fórmula de dano

`act()` no JavaScript e `act()` no Godot seguem a mesma sequência:

```text
ofensiva = ataque × enfraquecimento × fortalecimento × poder
           + escudo convertido × conversão da habilidade
defesaEfetiva = defesa × exposição × passiva arcana
mitigação = damage.defenseBaseline
            / (damage.defenseBaseline + defesaEfetiva × damage.defenseWeight)
golpe = arredondar(ofensiva × mitigação × afinidade × defesa ativa
                   × fortificação × combos × crítico)
```

O golpe é limitado por `minimumHit`. Cobertura divide esse total; perfuração define a parte que atravessa a barreira; o restante consome escudo e depois vida. O dano aplicado à vida é limitado à vida restante. Dreno usa esse dano efetivo à vida, nunca a parcela absorvida pelo escudo. Espelho e Riposta geram reações sem criar uma cadeia infinita de contra-ataques.

Cura é limitada à vida ausente e recebe as reduções de sangramento e Fratura **multiplicadas**. No início do turno, Fratura resolve antes dos danos periódicos e da regeneração. Ao chegar a zero de vida, o personagem não recebe cura e não revive. Não altere a posição dos arredondamentos ao reorganizar a fórmula: isso muda os resultados mesmo mantendo os números.

## Campanha e dados das simulações

Equipamentos, gemas e multiplicadores das missões são aplicados em `campaign.battle()` sobre cópias dos atributos de combate. O elenco base não é alterado. Combate livre, duelo local e laboratório continuam usando os atributos base, sem engastes; as partidas de campanha não entram na tabela de equilíbrio livre.

Três gemas iguais somam os bônus antes de arredondar uma vez: três gemas de ataque dão +12% do ataque base, não três multiplicações sucessivas de 1,04. A vida adicional também aumenta valores baseados em vida máxima, incluindo o teto de escudo; avalie sustentação junto com dano e tempo até a eliminação.

Ao mudar valores de verdade, crie uma nova versão das regras e mantenha os resultados históricos separados. Os identificadores usados nos relatórios estão em `godot/scripts/simulation_log.gd`; o armazenamento dos resumos fica em `godot/scripts/lab.gd`. Não misture partidas antigas e novas sob o mesmo número de versão. A versão atual é `0.11.0`, com resumos em `balance-0.11.json` e logs em `simulations-0.11.json`; os arquivos anteriores são preservados.

## Rotina depois de editar

Na pasta raiz `PROJETO-NEXUS`:

```sh
npm run sync:godot
npm test
npm run test:godot
npm run check
```

A sincronização atualiza o catálogo e copia os parâmetros globais para o Godot. Os testes JavaScript cobrem regras e invariantes; a suíte Godot compara partidas completas, IA, recibos e logs exportados com o motor JavaScript. Asserções que mencionam valores antigos devem ser revisadas junto com uma mudança intencional de regras, preservando a cobertura do comportamento.

Abra o Godot, confirme a habilidade alterada e rode uma nova bateria no laboratório. Compare primeiro o mesmo conjunto de adversários e sementes. Leia N, dano à vida, dano ao escudo, cura, proteção e duração das partidas junto do win rate; uma amostra pequena ou formada só por contrapartidas favoráveis não prova dominância.

O protótipo web importa `src/balance.json` como módulo JSON e precisa ser servido por HTTP com `Content-Type: application/json`; o servidor do projeto já faz isso. `npm run build` inclui o arquivo na versão estática. `npm run build:pages` publica os arquivos do protótipo web e deve ser usado somente quando essa publicação fizer parte da entrega.

## Campos da Alpha 0.11

- `specialty`: especialidade exibida na ficha.
- `duration`: duração personalizada de efeitos principais e adicionais (Vesper usa 1).
- `combo.statuses`: lista de alternativas; aplica o bônus e consome no máximo uma aflição. `combo.status` continua aceito.
- `secondary.whenStatuses`: alternativas que ampliam um efeito secundário, sem multiplicar por quantidade de estados.
- `criticalChance`: pontos adicionais de chance para aquela habilidade, além da base e do bônus ígneo.
- `spread`: copia uma queimadura, sangramento ou marca para um outro inimigo, sem estender duração ou trocar autoria.
- `darkmark`, `elementalWard`, `sentinel`: marca drenante, mitigação contra vantagem e supressão do agressor. Veja [regras completas](CLASSES.md).

A marca usa `status.darkmarkMaxHpRatio: 0.035` e `darkmarkDrainRatio: 0.6`; Égide usa `elementalWardIncomingMultiplier: 0.8`. Ígneo soma `igneoCriticalChance: 0.05`; tanques e suportes ígneos refletem `igneoReflectRatio: 0.1` do dano direto à vida. Reações não geram reações.


## Equipamentos de campanha — incremento Renascimento

Parâmetros próprios em `data/equipment.json`; validação, investimento e bônus em `scripts/equipment.gd`. Equipamentos e gemas somam percentuais sobre o atributo base antes de um único arredondamento. Defesa também entra na prévia; energia inicial usa os limites das regras compartilhadas. Trocar especialização devolve a gema antes de calcular o novo conjunto. Nenhum desses bônus é aplicado ao modo livre/PvP ou registrado no laboratório de equilíbrio livre.

Compatibilidade: no formato 5, custos e taxas de fragmentos fazem parte do contrato de persistência. Para alterá-los ou reinterpretar os marcos históricos, crie uma migração versionada que preserve o investimento já conquistado; não rebalanceie a economia editando somente o JSON. Bônus de atributos permanecem parâmetros próprios da campanha.

A economia concede 72 fragmentos nas nove primeiras vitórias, cobrindo exatamente nove peças no patamar III: 9 × (3 + 5). Repetições vitoriosas concedem 2 e não geram gemas. O teste de campanha começa vazio, completa as nove missões usando o motor real e melhora o trio gradualmente, chegando ao teto sem repetição obrigatória. Isso verifica um caminho com o trio inicial, não a campanha ampliada nem todos os heróis.

Amostra reproduzível de 108 cenários: quatro trios × três sementes × três objetivos, comparando peças básicas, padrão III e Canalizador/Bastião/Âncora III. Sem gemas. Básico: **30/36** vitórias; padrão III: **30/36**; alternativas III: **27/36**; zero erros de resolução. Todos completaram ritual e defesa; as derrotas foram no Guardião do relé por prazo. O conjunto alternativo sacrifica ataque/vida por defesa/energia e não melhora automaticamente a política de reserva de supremo. Não equivale a uma recomendação de equipar a mesma especialização nos três integrantes, nem a equilíbrio final aprovado. Ajustes por herói, decisões manuais e campanha ampliada continuam pendentes.

Reprodução: `godot --headless --path godot --script res://tests/objective_matrix.gd -- basic`, substituindo o último argumento por `assault` ou `channel`. Usar diretórios XDG isolados. O relatório identifica parâmetros, conjunto, sementes e recibos; evidências desta execução em `artifacts/renascimento-equipment/matrix`.


## Fabricação e fusão — economia e amostra

`data/gem-forge.json` define três cópias I por fragmento, fusão 3→1, teto III e bônus 4/5/6% ATQ, 5/6,5/8% VIDA e 8/10/12 EN inicial. Custos e receitas são contrato do save 6; alterações econômicas exigem migração que conserve investimento. `gem_forge.gd` deriva o estoque, verifica cada nível e protege cópias equipadas.

`tests/gem_forge.gd` completa as nove missões com nove gemas básicas protegidas e peças melhoradas, sem fabricação obrigatória. Depois simula 12 vitórias reais repetidas, 24 lotes escolhidos e fusões até nove gemas III. Mantém os engastes antigos até cada substituição, termina sem dívida e conserva as nove cópias substituídas. Mede um teto opcional: não representa minutos humanos, nem campanha expandida.

Matriz de 108 cenários com equipamento padrão III: quatro trios × três sementes × três objetivos, comparando uma gema de cada tipo por herói nos níveis I, II e III. Estoque, receitas e orçamento de cada conjunto passam pela validação real. Resultado: **33/36 vitórias em cada nível**, zero erros; médias de **15,03 / 14,92 / 14,81 ações**. As três derrotas continuam por prazo no Guardião. Não prova equilíbrio universal nem elimina a necessidade de escolhas manuais e testes humanos.

Reprodução: `godot --headless --path godot --script res://tests/objective_matrix.gd -- assault --gems=1`, trocando o último valor por 2 ou 3. Evidências em `artifacts/renascimento-gems/matrix`.


## Nível comum e maestria — incremento seguinte

`data/progression.json` separa a curva de campanha das regras livres. Nível 1–6 com 0/100/250/450/700/1000 EXP; primeiras vitórias rendem 100, repetições 25. Cada nível após o primeiro soma 2% VIDA, 1% ATQ e 1% DEF base, com teto explícito. Vitórias históricas contam para o treinamento comum. Maestria só registra participação conhecida: 10 pontos por integrante que iniciou uma missão vencida, marcos 10/30/60 e teto 60. Dano ganha até 1,5% ATQ, tanque 3% VIDA e suporte 3 EN inicial; nenhum valor cresce após o teto.

Esses bônus somam com peças/gemas antes do arredondamento. O snapshot da batalha encerrada não é reescrito ao receber recompensas. `tests/mastery.gd` verifica os três papéis em uma vitória real, troca de trio antes do recibo, crédito idêntico, migração, recuperação, falha de disco, limites e UI. O nível comum evita repetir a evolução básica ao experimentar outro herói. Nenhum parâmetro entra no PvP/laboratório livre.

Amostra de 108 cenários por preparo: básico com nível comum; peças III/gemas I; peças III/gemas III/maestria III. Quatro trios × três sementes × três objetivos. **30/36, 33/36 e 33/36** vitórias; médias **17,08 / 14,75 / 14,39 ações**, zero erros. Os estágios combinam fatores de progressão e não isolam causalmente um bônus específico. As derrotas por prazo permanecem; variedade de composições e controle manual continuam a exigir avaliação. Relatórios em `artifacts/renascimento-mastery/matrix`. O argumento `--mastery=3` ativa o marco final da amostra.

## Habilidades treináveis — incremento Renascimento

`data/ability-training.json` define Ímpeto (fator ×1,15, +10 EN), Economia (fator ×0,90, −10 EN) e Ritmo (fator ×0,90, +4 EN por básico), por marcos I/II/III. Técnica de energia sem poder principal ajusta a transferência. Restante do kit preservado; livre/PvP seguem originais. As 60 formas alternativas são executadas na suíte `ability_training.gd`, com prévia pública igual aos recibos.

108 cenários: peças III/gemas I/maestria III sem alternativas, mesmo preparo com as três alternativas, e peças III/gemas III/alternativas. Quatro trios × três sementes × três objetivos; **33/36** vitórias em cada grupo, médias **14,64 / 13,75 / 13,75 ações**, zero erros. As três derrotas por prazo persistem. Não é prova de equilíbrio de todos os kits, nem recomendação de ativar as três opções simultaneamente. Relatórios em `artifacts/renascimento-training/matrix`; `--training` habilita a amostra.

## Retorno Lumi — regras 0.16.0

Auren protege/purifica um aliado e enfraquece em área; Elyra cura antes de limpar e acrescenta barreiras pequenas; Solen abre enfraquecimento e o consome no supremo; Zaya distribui cura/energia limitadas, sem reviver. A afinidade acrescenta o elo Sombrio → Lumi → Ígneo, tornando Sombrio/Ígneo neutro. Os vinte kits anteriores ficaram idênticos. Não foi adicionada uma passiva Lumi oculta.

A matriz `--lumi` acrescenta Auren/Solen/Elyra, Auren/Zaya/Veyra e Solen/Saira/Axion aos quatro trios anteriores. Sete trios × três sementes × três objetivos: **48/63** vitórias com peças básicas/gemas I/nível comum; **51/63** com peças III/gemas III/maestria III e treinamento. Médias **18,76 / 17,11 ações**, zero erros. Os três novos trios vencem 6/9 cenários cada; as três derrotas de cada um são por prazo no relé. A evolução não resolve todas as composições; exige revisar pressão/prazo e escolhas da IA, além de controle manual e playtests. Relatórios em `artifacts/renascimento-lumi/matrix`.

O laboratório inclui os seis elos de afinidade e nove retornos, totalizando 282 partidas (72 variadas, 102 de sustentação e 108 de retornos em lados invertidos). Saves de laboratório 0.16 não sobrescrevem os 0.15. O hash PvP mudou com catálogo/regras; testes usam servidor local compatível, sem presumir atualização do servidor publicado.

## Proteção de um portador — incremento Renascimento

A estrada das cinzas mantém ID/recompensa e ganha proteção do primeiro integrante do trio, escolhido livremente. Ele deve sobreviver à eliminação dos rivais. Outras baixas são permitidas; queda do portador tem prioridade sobre matar o último oponente. Também funciona em objetivos de sobrevivência. O HUD nomeia o herói capturado ao preparar a batalha. Abaixo de 50% de vida, o automático procura cura/escudo/purificação útil para ele; pesos ficam em `campaign-tactics.json`, e previsão não muda estado/RNG. Após terminar, nenhuma nova ação é oferecida.

22 verificações específicas e **404 verificações pertinentes** passaram, incluindo a campanha real e conservação de itens/XP. Matriz de 168 cenários em sete trios/quatro objetivos: **69/84** vitórias no preparo básico e **72/84** no evoluído, médias **20,79 / 18,54 ações**, zero erros. O portador foi protegido em **21/21** em cada preparo. As derrotas por prazo dos outros objetivos permanecem. Relatórios em `artifacts/renascimento-escort/matrix`. Não equivale à aprovação final das composições ou da campanha ampliada.

## Ondas — incremento Renascimento

A escadaria usa dois grupos dos mesmos três arquétipos: VIDA/ATQ a 65%/90% e 75%/100% do encontro base. Reinforços entram em uma nova rodada; o trio conserva perdas, energia e condições. Escudos expiram pela fronteira normal. O motor mantém a propriedade da ordem dos turnos e aceita o pedido de reagendamento do controlador. A morte por efeito periódico pode encerrar uma onda; derrota do trio tem prioridade sobre reforços. Vitória/recompensa é da tentativa completa.

**32 verificações específicas** cobrem entradas inválidas/atômicas, duas/três ondas, reagendamento, escudos, baixas, recompensa única, resultado prematuro, reabertura e apresentação. Suíte completa e paridade livres passaram (36 partidas/2.018 ações; 282 logs/17.730 ações). Os caminhos reais de nove missões e orçamento de equipamento/gemas continuam concluíveis pelo trio padrão.

Matriz de 210 cenários (sete trios × três sementes × cinco encontros, dois preparos): **90/105 e 93/105** vitórias, médias **22,88 / 20,16 ações**, zero erros. Ondas: **21/21** em cada preparo, médias **31,24 / 26,67 ações**. As derrotas anteriores por prazo persistem. Web completou duas ondas com Auren/Solen/Elyra em perfil descartável de nível 3: 10 rodadas/41 ações; a gravação concedeu uma primeira vitória e +10 maestria aos três participantes, mesmo com Elyra derrotada. Não é avaliação humana de equilíbrio. Evidências em `artifacts/renascimento-waves`.

## Campo de energia — checkpoint

Corrente do éter na guardiã da memória: básicos +4 EN recuperados, técnicas +5 EN de custo para as duas equipes; supremos inalterados. Treinamentos combinam uma vez (Ritmo 32 EN, Ímpeto 45 EN, Economia 70 EN), com limites e validação atômica antes de alterar qualquer ator. Previews fora da missão são identificados como base; HUD/cartões mostram o campo real. Dados de preparação e catálogo livre permanecem intactos.

**168 verificações específicas**, incluindo os 24 heróis, os rivais, custos efetivamente pagos, limites, negativos, atomicidade, composição com treino/ondas e HUD. **601 verificações pertinentes** considerando as regressões de ondas, portador, equipamentos, gemas, maestria, treino e campanha/coleção. A suíte completa/paridade do incremento de ondas já passou; após adicionar o campo, foram executadas essas regressões pertinentes, sem alegar uma nova execução completa.

Matriz de 252 cenários: **111/126 e 114/126** vitórias, médias **25,90 / 22,60 ações**, zero erros. O encontro com campo venceu 21/21 em cada preparo, médias 41,05 / 34,76 ações. Condições ficam registradas por cenário; não se deve comparar totais de amostras de tamanhos diferentes como efeito causal do campo. Web inspecionado em 1600×900/1280×720: Veyra com Pulso e treino começa em 48 EN, vê básico +32, técnica 45 e supremo 70; após o uso da técnica, o restante da equipe mostra básico +28/técnica 35. Evidências em `artifacts/renascimento-field`.
