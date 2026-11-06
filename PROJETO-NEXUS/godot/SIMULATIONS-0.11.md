# Simulações — regras 0.11.0

Reproduzido em 20/10/2026 com `node scripts/simulate-classes.mjs`. O relatório completo, com equipes, sementes e vencedores, é escrito em `artifacts/classes-0.11-balance.json`.

IA × IA, 150 pares de trios mistos (tanque, suporte e dano de classes diferentes) e 300 pares dirigidos aos cinco retornos. Cada par usa a mesma semente com lados invertidos. Gemas desativadas. Taxas por aparição da equipe, dependentes de composição e IA; não medem duelos individuais nem PvP humano.

Todas as **900 partidas** terminaram antes de 400 ações. Média de **14,05 rodadas**; **721** chegaram à Fratura. Os grupos dirigidos incluem composições sem dano ou com dois tanques; por isso a duração geral é maior que a de um conjunto apenas ofensivo.

| Herói | Especialidade | Aparições | Vitórias | Taxa |
| --- | --- | ---: | ---: | ---: |
| Veyra | Detonadora | 134 | 69 | 51,5% |
| Rhazen | Retaliação ígnea | 338 | 118 | 34,9% |
| Cindra | Artilharia de apoio | 234 | 141 | 60,3% |
| Torv | Demolidor crítico | 262 | 166 | 63,4% |
| Sylva | Cura por agressão | 238 | 115 | 48,3% |
| Oren | Guardião de raízes | 344 | 152 | 44,2% |
| Nima | Caçadora de feridas | 322 | 155 | 48,1% |
| Brin | Purificador | 240 | 102 | 42,5% |
| Axion | Supressão defensiva | 230 | 114 | 49,6% |
| Kira | Atiradora perfurante | 326 | 149 | 45,7% |
| Bast | Interceptador | 240 | 100 | 41,7% |
| Vektor | Engenheiro de energia | 350 | 132 | 37,7% |
| Astra | Explosão em área | 218 | 111 | 50,9% |
| Elun | Espelho elemental | 246 | 120 | 48,8% |
| Saira | Amparo elemental | 322 | 167 | 51,9% |
| Ivo | Manipulador de aflições | 240 | 111 | 46,3% |
| Vesper | Provocador de duelo | 322 | 216 | 67,1% |
| Maura | Drenagem vital | 336 | 179 | 53,3% |
| Noct | Executor de marcas | 224 | 144 | 64,3% |
| Riven | Duelista de feridas | 234 | 139 | 59,4% |

Torv e Noct tiveram sua explosão reduzida após a primeira rodada; Elun passou a proteger outros aliados e a conceder uma barreira à equipe após converter seu escudo. Bast recebeu Fortificação no aliado interceptado, Brin teve cura ajustada e Vektor ganhou fortalecimento no Drone.

Vesper, Noct e Torv continuam com taxas elevadas nesta amostra. Brin, Bast, Rhazen e Vektor merecem observação nas composições e contrapartidas de jogadores. Não se busca igualar todos os percentuais desta tabela: os adversários e os parceiros têm distribuições diferentes. O objetivo desta entrega é disponibilizar os kits e medir seu comportamento para a próxima rodada de ajustes.

## Laboratório no Godot

Abra **Extras → Simulações / logs → Simular 216 partidas**. São sessenta formações variadas, noventa e seis testes de sustentação e sessenta com os retornos. Os filtros separam as sessenta variadas dos 156 casos de sustentação e retornos. JSON inclui os recibos completos; CSV resume os vinte heróis. A suíte nativa reproduz os logs exportados no motor JavaScript.

Os resumos atuais usam `user://balance-0.11.json` e o último lote detalhado usa `user://simulations-0.11.json`. Os arquivos de versões anteriores continuam preservados e não são misturados aos atuais. Campanha e gemas ficam fora destas estatísticas.
