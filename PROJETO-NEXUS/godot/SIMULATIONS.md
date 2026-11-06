# Simulações atuais e histórico

A revisão atual usa regras **0.11.0**, laboratório de **216 partidas** e comparação ampliada de **900 partidas**. [Método, taxas e limites atuais](SIMULATIONS-0.11.md). Os números abaixo são o registro histórico da Alpha 0.8 e não descrevem o balanceamento atual.

# Como ler as simulações — Alpha 0.8

Relatório reproduzido em **19/10/2026** com o motor de combate de referência. As regras e os atributos do combate livre continuam na versão **0.5.0**; a Alpha 0.8 melhora a apresentação e amplia os engastes da campanha. Gemas, minions e o chefe da história **não participam desta amostra**.

Os números abaixo são de **IA contra IA**, com equipes e sementes definidas em código. Não são telemetria de jogadores. Não recebemos um arquivo de simulações do seu computador nesta solicitação; os arquivos disponíveis neste ambiente vieram das verificações e capturas do desenvolvimento.

## Resultado atual

As **156 partidas terminaram**, com **9.543 ações**, sem alcançar o limite de segurança de 400 ações por partida. Os dois filtros respondem a perguntas diferentes:

| Filtro | Partidas | Rodadas médias | Faixa de rodadas | Partidas com Fratura | Rodada média do primeiro KO |
| --- | ---: | ---: | ---: | ---: | ---: |
| Formações variadas | 60 | 11,13 | 7–17 | 20/60 — 33,3% | 3,53 |
| Testes de sustentação | 96 | 14,17 | 7–21 | 58/96 — 60,4% | 7,40 |

As 60 variadas usam trios com tanque, suporte e dano, alternando afinidades e espelhando os lados. Isso é uma escolha da amostra: **a montagem de equipe no jogo continua livre**. Os 96 testes de sustentação colocam em foco escudos, três suportes e três tanques. Misturar os dois filtros em um único ranking favorece os personagens e confrontos escolhidos com mais frequência.

O primeiro KO mede quando alguém cai, enquanto a duração total mede quando o trio perde. Rodadas não são segundos de animação: deixar um ataque mais detalhado ou lento não altera esses resultados do motor.

### Confrontos dirigidos

| Grupo | Partidas | Rodadas médias | Máximo | Partidas com Fratura |
| --- | ---: | ---: | ---: | ---: |
| Vesper / Kira / Oren contra formações variadas | 30 | 11,30 | 19 | 9/30 — 30,0% |
| Saira / Maura / Sylva contra formações variadas | 30 | 15,73 | 20 | 26/30 — 86,7% |
| Saira / Maura / Sylva contra outros trios de suporte | 10 | 18,70 | 20 | 10/10 — 100,0% |
| Vesper / Oren / Elun contra outros trios de tanques | 10 | 15,60 | 19 | 7/10 — 70,0% |
| Saira / Maura / Sylva contra trios de dano | 10 | 8,00 | 9 | 0/10 — 0,0% |
| Espelhos de suporte com política defensiva | 6 | 21,00 | 21 | 6/6 — 100,0% |

- Vesper / Kira / Oren venceu **15 de 30** confrontos variados: **50,0%**.
- Saira / Maura / Sylva venceu **8 de 30** confrontos variados: **26,7%**. Perdeu os **10** confrontos contra trios de dano desta amostra.
- Nos seis espelhos defensivos, a IA usa suporte ou defesa no lugar de ataques sem cura; a técnica de Maura permanece disponível porque também cura. Esses seis casos terminam na rodada 21. Esse limite é uma verificação destes casos específicos, não uma garantia para qualquer equipe possível.

Os grupos de suporte contra suporte e tanque contra tanque incluem, cada um, dois confrontos com a mesma composição nos dois lados. A tabela mede duração e Fratura por partida; não converte esses espelhos em evidência de superioridade de uma composição.

### Taxa por herói nas 60 formações variadas

Cada herói tem **24 aparições** neste filtro. Uma aparição conta a presença na equipe; a vitória pertence ao trio inteiro.

| Herói | Função | Vitórias / aparições | Taxa |
| --- | --- | ---: | ---: |
| Vesper | Tanque | 24/24 | 100,0% |
| Rhazen | Tanque | 22/24 | 91,7% |
| Riven | Dano | 16/24 | 66,7% |
| Cindra | Suporte | 14/24 | 58,3% |
| Vektor | Suporte | 14/24 | 58,3% |
| Maura | Suporte | 14/24 | 58,3% |
| Veyra | Dano | 12/24 | 50,0% |
| Astra | Dano | 12/24 | 50,0% |
| Sylva | Suporte | 10/24 | 41,7% |
| Nima | Dano | 10/24 | 41,7% |
| Kira | Dano | 10/24 | 41,7% |
| Saira | Suporte | 8/24 | 33,3% |
| Oren | Tanque | 6/24 | 25,0% |
| Elun | Tanque | 6/24 | 25,0% |
| Axion | Tanque | 2/24 | 8,3% |

**Vesper, Rhazen e Axion merecem investigação dirigida.** O intervalo de 100% a 8,3% é real nesta amostra; ainda precisamos separar o efeito do kit, aliados, afinidades e decisões da IA. No filtro de sustentação, Vesper fica em **33/58 — 56,9%**, enquanto Axion fica em **10/18 — 55,6%**. Rhazen chega a **18/18 — 100%**, mas em adversários selecionados para esses testes. Essas diferenças mostram por que uma taxa sozinha não deve definir um ajuste.

## O que a tabela do jogo mede

- **N / aparições:** presenças do herói nas equipes, incluindo os dois lados quando há espelho. Não representa N duelos independentes.
- **Vitórias:** a equipe que continha o herói venceu. Os três integrantes recebem a vitória, mesmo quando um deles caiu antes do fim.
- **Dano à vida** e **dano ao escudo:** valores efetivos separados. Dano absorvido pelo escudo não é dano retirado da vida.
- **Cura:** vida efetivamente recuperada, depois das reduções de sangramento e Fratura.
- **Proteção efetiva:** dano absorvido por escudos mais dano desviado pela proteção. Conceder um escudo que ninguém quebra não infla essa coluna pelo seu valor nominal.
- **Energia** e **combos:** recursos fornecidos e ativações registradas pelo motor. Compare com a função do personagem; um suporte não precisa liderar dano para cumprir seu papel.

O laboratório destaca amostras com **N menor que 30**. Alcançar N = 30 também não prova equilíbrio: repetir as mesmas equipes e sementes aumenta o histórico, mas não acrescenta confrontos novos. As aparições compartilham aliados e adversários e, portanto, não devem ser tratadas como observações independentes para uma conclusão estatística simples.

O próximo passo de balanceamento é testar um herói de cada vez com os mesmos dois aliados, adversários e sementes, espelhar os lados e comparar as ações do log. Isso ajuda a distinguir um kit dominante de uma sinergia específica ou de uma escolha ruim da IA. Também precisamos de partidas jogadas por pessoas; a política automática não explora todas as estratégias.

## Como exportar os seus resultados

1. Abra **Simulações / logs** no menu ou **Balanço** no combate e clique em **Simular 156 partidas**.
2. Escolha **IA × IA · formações variadas** e clique em **Exportar logs JSON**.
3. Salve o arquivo. Depois selecione **IA × IA · testes de sustentação** e exporte um segundo JSON.
4. Envie os dois arquivos para analisarmos as partidas. Para consultar no Excel ou em outra planilha, use também **Exportar tabela CSV**.

O JSON inclui versão das regras, filtro, equipes, semente, estado inicial, ações e alvos, dano/cura/escudo/estados, efeitos do próximo turno, vencedor e estatísticas finais. Assim podemos reproduzir uma sequência exata, em vez de inferir o problema somente pela taxa de vitória.

As ações completas são do **último lote simulado**: 60 ou 96 partidas conforme o filtro exportado. O arquivo também contém os **resumos históricos** do filtro, que podem incluir vários lotes. Compare `fullLogMatches` com `summaryMatches` para saber a cobertura de cada parte. Simular novamente substitui o último lote detalhado; arquivos JSON já exportados continuam disponíveis.

O filtro **Partidas jogadas** mantém resumos e permite CSV; não oferece o mesmo registro completo de cada ação. A campanha fica separada das estatísticas do combate livre, evitando comparar heróis com gemas a heróis com atributos básicos.

## Como reproduzir pelo código

Na raiz do repositório, com Node.js disponível:

```sh
node scripts/balance-report.mjs artifacts/balance-alpha08.json --check
```

O relatório salva equipes, sementes, grupo, vencedor, duração, primeiro KO, ocorrência de Fratura e estatísticas por integrante. O `--check` exige término de todas as partidas e confirma o máximo de 21 rodadas nos seis espelhos defensivos. **Não testa igualdade de taxas de vitória.** O JSON desse comando é um resumo de referência; o JSON exportado no jogo contém também a sequência completa de ações.

Fontes para conferir a metodologia:

- [`scripts/balance-report.mjs`](../scripts/balance-report.mjs): composição da amostra e métricas do relatório.
- [`scripts/lab.gd`](scripts/lab.gd): a mesma amostra no jogo, filtros, médias e exportação.
- [`scripts/simulation_log.gd`](scripts/simulation_log.gd): sementes e ações completas do último lote.
- [`BALANCE.md`](BALANCE.md): mudanças de escudo, cura e Fratura que originaram as regras atuais.
- [`KITS.md`](KITS.md): atributos, habilidades e sinergias dos heróis.
