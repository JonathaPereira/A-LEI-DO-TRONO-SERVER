# Revisão de proteção e cura — Alpha 0.5

As regras desta revisão permanecem no combate livre da Alpha 0.8. Consulte [Como ler as simulações](SIMULATIONS.md) para os resultados reproduzidos em 19/10/2026, taxas por herói, limites da amostra e exportação dos seus logs.

A Alpha 0.4 somava escudos até 60% da vida, sem expiração. Vesper combinava escudo próprio de 28%, cura de 18% no supremo e dreno de 25%. Oren concedia escudos e regeneração para o trio. A proteção prolongava partidas, incluindo Vesper/Kira/Oren. Saira/Maura/Sylva também mantinham curas, purificação e energia até rodadas avançadas da Fratura.

## Regras revisadas

- Um escudo por personagem, limitado a 25% da vida máxima, por duas ações seguintes do protegido. Mantém o maior; aplicar um menor não renova um maior válido. Quando chega à ação de expiração, um escudo novo substitui o antigo.
- Escudos individuais e coletivos menores, defesa comum com escudo de 6%, regeneração de 4% por ativação, dreno Sombrio de 15% do dano à vida, proteção de Oren com desvio de 25% e Fortificação de 15%.
- Vida e defesa dos tanques reduzidas; ataques ajustados para romper proteção em tempo útil. Kira mantém penetração e função de dano, sem atributos de tanque. [Valores de todos os kits](KITS.md).
- Sangramento reduz **toda cura recebida em 35%**, incluindo cura direta, regeneração, Semente, dreno e efeitos secundários. Purificação remove essa redução. Uma habilidade que cura e purifica primeiro cura, depois limpa; a prévia mostra o valor efetivo.
- Fratura mantém o dano a partir da rodada 12 e também reduz toda cura recebida: **−10% na rodada 12, −20% na 13, até −100% na 21**. Não pode ser purificada. Multiplica a redução de sangramento. Banner, prévia, números flutuantes e registro informam a redução.

A composição continua livre: três suportes e três tanques são permitidos. Sangramento cria uma resposta ofensiva à cura, enquanto a Fratura limita impasses. Não substitui a avaliação de pressão ofensiva, energia, purificação e janelas de recarga.

## Comparação reproduzível

Mesmas equipes, lados e sementes, dificuldade normal, IA em ambos os lados. A referência anterior é o commit `6b60223` (Alpha 0.4). São 156 partidas: 60 variadas com três funções; 30 com Vesper/Kira/Oren; 30 com Saira/Maura/Sylva; 10 com esse trio contra outros suportes; 10 entre trios de tanques; 10 com os três suportes contra trios de dano; e 6 espelhos defensivos de Saira/Maura/Sylva. Nestes seis, ataques sem cura são substituídos por defesa; a técnica de Maura continua disponível por também curar. Os confrontos usam lados espelhados, exceto os espelhos defensivos, que usam seis sementes.

| Amostra | Métrica | Alpha 0.4 | Alpha 0.5 |
| --- | --- | ---: | ---: |
| 60 variadas | Rodadas médias | 16,1 | 11,1 |
| 60 variadas | Partidas com Fratura | 100,0% | 33,3% |
| 60 variadas | Primeira derrota: rodada média | 4,6 | 3,5 |
| 30 com Vesper/Kira/Oren | Rodadas médias | 17,2 | 11,3 |
| 30 com Vesper/Kira/Oren | Partidas com Fratura | 100,0% | 30,0% |
| 30 com Saira/Maura/Sylva | Rodadas médias | 19,2 | 15,7 |
| 30 com Saira/Maura/Sylva | Primeira derrota: rodada média | 12,4 | 6,1 |
| 10 contra outros suportes | Rodadas médias | 22,5 | 18,7 |
| 10 entre trios de tanques | Rodadas médias | 18,1 | 15,6 |
| 10 contra trios de dano | Rodadas médias | 13,6 | 8,0 |
| 6 espelhos defensivos | Última rodada máxima | 24 | 21 |

Todas as 156 partidas terminaram, sem atingir o limite de 400 ações. O trio Saira/Maura/Sylva venceu 26,7% de seus 30 confrontos variados na amostra atual. Esse número descreve a política da IA e esses adversários; não representa a melhor estratégia que uma pessoa pode executar.

Espelhos de suporte ainda são longos e chegam à Fratura. A amostra não prova equilíbrio em PvP, e a IA não explora todas as sinergias. Vitórias de um personagem dependem do trio e do adversário; a taxa isolada não demonstra força individual. Os próximos ajustes devem usar partidas jogadas, além destas regressões.

Para repetir a amostra atual na raiz: `node scripts/balance-report.mjs artifacts/balance-current.json --check`. O arquivo inclui equipes, sementes, duração, vencedor e estatísticas por integrante. O comando verifica término e o limite de 21 rodadas para os seis espelhos defensivos específicos; não promete esse limite para todas as composições possíveis.

O laboratório **Balanço** executa a mesma amostra, com filtros separados para 60 formações variadas e 96 testes de sustentação. Partidas jogadas têm outro filtro. Os resultados ficam em `user://balance-0.5.json`, preservando o histórico da Alpha 0.4 em seu arquivo anterior.
