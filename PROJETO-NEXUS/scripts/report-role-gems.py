"""Publish charts and a Portuguese report from simulate-role-gems.mjs outputs.
Usage: python3 scripts/report-role-gems.py artifacts/roles-gems-014 docs/roles-gems-014
Requires matplotlib and numpy; does not run additional game simulations.
"""
import json
import shutil
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

source, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
r = json.loads((source / 'summary.json').read_text())
for file in ['summary.json', 'roles.csv', 'gems.csv', 'matches.ndjson.gz', 'replay-samples.ndjson.gz']:
    shutil.copyfile(source / file, output / file)
groups = {g['id']: g for g in r['groups']}
profiles = {p['id']: p for p in r['profiles']}
mixed = r['mixedRanking']
final = {row['id']: row for row in r['finals']}
selected = {row['group']: row for row in r['selected']}
controlled = {(row['group'], row['profile']): row for row in r['controlResults']}
phases = {row['phase']: row for row in r['phases']}

def pct(value):
    return f'{value:.1f}%'.replace('.', ',')

def number(value):
    return f'{value:,}'.replace(',', '.')

def short(group):
    return '+'.join(f'{group[k]}{letter}' for k, letter in [('d', 'D'), ('t', 'T'), ('s', 'S')] if group[k])

background, ink, muted = '#0a1220', '#edf4ff', '#9aacc2'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'figure.facecolor': background, 'axes.facecolor': background, 'text.color': ink, 'axes.labelcolor': muted, 'xtick.color': muted, 'ytick.color': ink, 'axes.edgecolor': '#28384b', 'font.size': 11})

def save(fig, name):
    fig.savefig(output / f'{name}.png', dpi=150)
    fig.savefig(output / f'{name}.svg')
    plt.close(fig)

fig, ax = plt.subplots(figsize=(14, 10))
fig.subplots_adjust(left=.32, right=.94, top=.79, bottom=.19)
y = np.arange(len(mixed))
ax.barh(y-.18, [row['winRate'] for row in mixed], height=.31, color='#65cce0', label='Trios e gemas variados · 1.800 aparições por grupo')
ax.barh(y+.18, [final[row['id']]['winRate'] for row in mixed], height=.31, color='#ff966e', label='Final com uma equipe selecionada por grupo · 360 aparições')
ax.set_yticks(y, [row['name'] for row in mixed]); ax.invert_yaxis()
ax.set_xlim(0, 110); ax.set_xticks(range(0, 101, 20), [f'{v}%' for v in range(0, 101, 20)])
for i, row in enumerate(mixed):
    for offset, value in [(-.18, row['winRate']), (.18, final[row['id']]['winRate'])]:
        ax.text(value+1, i+offset, pct(value), va='center', fontsize=10)
ax.grid(axis='x', color='#29384a', alpha=.5); ax.set_axisbelow(True)
for spine in ['top', 'right', 'left']:
    ax.spines[spine].set_visible(False)
ax.legend(loc='lower left', bbox_to_anchor=(0, 1.02), frameon=False, labelcolor=ink, fontsize=10)
fig.text(.07, .95, 'NEXUS / Combinações de funções no PvP', fontsize=23, fontweight='bold')
fig.text(.07, .905, f"{number(r['total'])} combates · dez distribuições de funções · receitas individuais de gemas", color=muted)
fig.text(.07, .055, 'Cada grupo enfrenta os outros nove com a mesma frequência, sempre trocando os lados.\nA final seleciona heróis, gemas e adversários; a diferença entre barras não mede apenas o efeito das gemas.\nIA atual do jogo; vitórias da equipe, sem bônus de campanha.', color=muted, fontsize=10, linespacing=1.7)
save(fig, 'funcoes')

fig, ax = plt.subplots(figsize=(18, 10))
fig.subplots_adjust(left=.29, right=.92, top=.80, bottom=.20)
profile_ids = list(profiles)
matrix = np.array([[controlled[(row['id'], profile)]['winRate'] for profile in profile_ids] for row in mixed])
image = ax.imshow(matrix, vmin=0, vmax=100, cmap='RdYlGn', aspect='auto')
ax.set_yticks(range(10), [row['name'] for row in mixed])
ax.set_xticks(range(len(profile_ids)), [profiles[p]['name'].replace(' + ', '\n').replace('Sem gemas', 'Sem\ngemas') for p in profile_ids], fontsize=10)
ax.tick_params(length=0, pad=10)
for i in range(10):
    for j in range(len(profile_ids)):
        value = matrix[i, j]
        ax.text(j, i, pct(value), ha='center', va='center', color='white' if value<20 or value>80 else '#162031', fontsize=11, fontweight='bold')
colorbar = fig.colorbar(image, ax=ax, fraction=.035, pad=.03)
colorbar.set_label('Vitórias da equipe avaliada'); colorbar.set_ticks([0, 25, 50, 75, 100], labels=['0%', '25%', '50%', '75%', '100%'])
fig.text(.07, .95, 'NEXUS / Funções × receitas de gemas', fontsize=24, fontweight='bold')
fig.text(.07, .895, '180 jogos por célula · só mudam os engastes da equipe avaliada · rival sempre com uma gema de cada tipo', color=muted)
fig.text(.07, .055, 'A receita da coluna é equipada em cada um dos três heróis. Mesmos adversários, heróis e sementes entre colunas.\nCada gema: ATQ = +4% de ataque; VIDA = +5% de vida máxima; EN = +8 de energia inicial.\nPequenas diferenças de taxa podem ser variação amostral; o máximo da coluna não é uma build universal.', color=muted, fontsize=11, linespacing=1.7)
save(fig, 'gemas')

order = r['finals']
matchups = {row['id']: {foe['id']: foe for foe in row['opponents']} for row in r['matrix']}
matrix = np.full((10, 10), np.nan)
for i, row in enumerate(order):
    for j, foe in enumerate(order):
        if i != j:
            entry = matchups[row['id']][foe['id']]
            matrix[i, j] = 100 * entry['wins'] / entry['games']
fig, ax = plt.subplots(figsize=(15, 10))
fig.subplots_adjust(left=.34, right=.93, top=.82, bottom=.17)
cmap = plt.get_cmap('RdYlGn').copy(); cmap.set_bad('#263247')
image = ax.imshow(matrix, vmin=0, vmax=100, cmap=cmap, aspect='auto')
ax.set_yticks(range(10), [row['name'] for row in order])
ax.set_xticks(range(10), [short(groups[row['id']]) for row in order], rotation=35, ha='right')
for i in range(10):
    for j in range(10):
        value = matrix[i, j]
        ax.text(j, i, '—' if np.isnan(value) else pct(value), ha='center', va='center', fontsize=9, color='white' if np.isnan(value) or value<20 or value>80 else '#162031')
fig.colorbar(image, ax=ax, fraction=.035, pad=.03).set_label('Vitórias da linha contra a coluna')
fig.text(.07, .95, 'NEXUS / Confrontos da final entre funções', fontsize=23, fontweight='bold')
fig.text(.07, .895, 'Uma equipe selecionada por grupo · 40 combates por confronto · lados invertidos', color=muted)
fig.text(.07, .045, 'D = Dano · T = Tanque · S = Suporte. Cada célula usa os heróis e as gemas selecionados para a final.\nA diagonal não entra nas taxas: esta comparação enfrenta grupos de funções diferentes.', color=muted, fontsize=10, linespacing=1.7)
save(fig, 'confrontos')

for svg in output.glob('*.svg'):
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')

champ = mixed[0]
best = r['finals'][0]
lines = [
    '# Nexus 0.14 — funções e combinações de gemas', '',
    f"**{number(r['total'])} combates completos, {number(r['actions'])} ações e {number(r['coveredTrios'])} trios de heróis cobertos.** Com a IA atual, a distribuição dominante foi **{champ['name']}**: {champ['wins']}/{champ['games']} vitórias ({pct(champ['winRate'])}) na etapa com gemas individuais variadas. Na final com uma equipe selecionada por grupo, essa distribuição fez {best['wins']}/{best['games']} ({pct(best['winRate'])}).", '',
    '## Comparação principal: heróis e engastes variados', '',
    'Cada grupo tem 1.800 aparições e enfrenta os outros nove grupos com a mesma frequência. Os trios vêm de baralhos completos embaralhados; cada herói recebe uma das dez receitas válidas independentemente. Os lados são invertidos. Essa população dá o mesmo peso a cada distribuição de funções, independentemente de quantos trios existem dentro dela.', '',
    '| Funções | Vitórias / aparições | Winrate | Intervalo 95% por pares |',
    '| --- | ---: | ---: | ---: |',
]
for row in mixed:
    lines.append(f"| {row['name']} | {row['wins']}/{row['games']} | {pct(row['winRate'])} | {pct(row['ci95']['lower'])}–{pct(row['ci95']['upper'])} |")
lines += ['', 'Os intervalos usam 2.000 reamostragens dos pares completos, estratificados por confronto de funções. São condicionais aos adversários e às decisões da IA amostrados. Não incluem jogos contra o mesmo grupo de funções; não são uma previsão do winrate de uma fila humana.', '', '![Comparação das funções](funcoes.png)', '',
    '## Efeito das gemas em condições controladas', '',
    'O rival equipa uma Brasa, uma Seiva e um Pulso em cada herói. Só os engastes da equipe avaliada mudam. Os mesmos heróis, adversários e sementes são usados para cada receita; os lados são invertidos. Cada receita é aplicada aos três heróis da equipe e tem 180 partidas por grupo.', '',
    'Gemas disponíveis no PvP atual: **Brasa/vermelha = +4% ATQ; Seiva/verde = +5% VIDA; Pulso/azul = +8 de energia inicial**. Os bônus iguais somam antes do arredondamento. Três Brasa dão +12% ATQ; três Seiva dão +15% VIDA; três Pulso dão +24 EN inicial. Energia inicial não significa regeneração por turno.', '',
    'São dez receitas de três gemas por herói. Permutações de posição nos engastes não alteram os atributos. Os três heróis podem combinar receitas diferentes, resultando em 1.000 alocações possíveis por trio; essa combinação individual é amostrada na etapa principal, não varrida exaustivamente. O controle adicional sem gemas fica separado.', '',
    '| Funções | Maior taxa observada nas receitas uniformes | Vitórias |', '| --- | --- | ---: |',
]
for row in mixed:
    recipes = [c for c in r['controlResults'] if c['group'] == row['id'] and c['profile'] != 10]
    highest = max(c['wins'] for c in recipes)
    leaders = [c for c in recipes if c['wins'] == highest]
    lines.append(f"| {row['name']} | {'; '.join(c['profileName'] for c in leaders)} | {highest}/180 · {pct(leaders[0]['winRate'])} |")
lines += ['', 'Esses máximos são taxas observadas, não prova de que uma receita seja superior por poucos pontos. O objetivo é verificar se mudar engastes muda a hierarquia das funções. **Três danos continuou forte em todas as dez receitas preenchidas; nenhuma receita tornou três tanques ou três suportes dominantes nessa amostra.**', '',
    '![Matriz de receitas de gemas](gemas.png)', '',
    '### Exemplos que mudam a interpretação das gemas', '',
    '- Três danos teve empate de 174/180 (96,7%) com uma gema de ataque + duas de vida, três de vida e duas de vida + uma de energia em cada herói. Três gemas de ataque ficou em 169/180 (93,9%). Gemas de vida também podem beneficiar atacantes.',
    '- Três suportes teve seu maior valor com três gemas de vida por herói: 65/180 (36,1%). Três de energia teve 51/180 (28,3%).',
    '- Três tanques teve seu maior valor com três gemas de energia por herói: 28/180 (15,6%). Três gemas de vida ficou em 19/180 (10,6%).',
    '- A energia realmente alterou o uso de supremos nesta IA: em três tanques, três gemas de energia produziram média de 3,62 supremos por equipe/partida; três gemas de vida, 1,81. Mais supremos não garantiu vitórias suficientes para competir com três atacantes.', '',
    '## Final com equipes e gemas selecionadas', '',
    f"Na etapa principal, foram selecionados três trios candidatos por grupo pela margem inferior de Wilson, totalizando 30 trios. Eles receberam receitas equilibradas, ataque, vida, energia, a melhor receita uniforme do grupo e uma receita por herói estimada na amostra de treinamento. Receitas duplicadas foram removidas, restando {len(r['candidateResults'])} builds.", '',
    'Cada build enfrentou 18 adversários novos compartilhados dentro de seu grupo (dois de cada uma das nove funções rivais), com lados invertidos: 36 jogos. A melhor candidata de cada grupo avançou. Essa escolha é amostral e não esgota todas as possibilidades de heróis/gemas. Todos os dez selecionados então se enfrentaram com 20 sementes novas, nos dois lados: 40 partidas por confronto e 360 por grupo.', '',
    '| Funções | Trio selecionado | Gemas por herói | Vitórias na final |', '| --- | --- | --- | ---: |',
]
for row in r['finals']:
    build = selected[row['id']]
    allocation = '; '.join(f"{hero}: {profiles[recipe]['name']}" for hero, recipe in zip(build['team'], build['recipe']))
    lines.append(f"| {row['name']} | {build['name']} | {allocation} | {row['wins']}/{row['games']} · {pct(row['winRate'])} |")
lines += ['', 'A final compara uma equipe selecionada de cada grupo, não a média de todos os trios daquela função. Também muda os heróis e adversários; a diferença para a etapa principal não pode ser atribuída apenas às gemas.', '',
    '![Confrontos finais](confrontos.png)', '',
    f"Exemplo de contra-composição na final: {selected['0D3T0S']['name']} ganhou {matchups['0D3T0S']['2D1T0S']['wins']}/{matchups['0D3T0S']['2D1T0S']['games']} jogos de {selected['2D1T0S']['name']}. Isso descreve esse confronto de heróis e engastes; a taxa geral de três tanques continua sendo a da tabela.", '',
    '## Leitura para o balanceamento', '',
    '- A vantagem de três atacantes persistiu com gemas uniformes, receitas diferentes por herói e adversários selecionados por função. O problema não ficou restrito à configuração equilibrada do relatório anterior.',
    '- Duas fontes de dano com um suporte foi a segunda distribuição nas duas etapas. Equipes com dois tanques ou sem atacante tiveram dificuldade, embora existam confrontos específicos favoráveis.',
    '- A melhoria de vida mantém a pressão ofensiva dos atacantes e aumenta sua sobrevivência. Para tanques e suportes competirem, vale investigar o tempo de entrada da proteção, a eficiência das ações defensivas, o controle e as decisões da IA, além dos atributos.',
    '- Esta simulação não separa causalmente todas essas mecânicas nem modela decisões de jogadores humanos. As taxas altas vêm de uma população igualmente distribuída entre dez funções; uma fila cheia de três atacantes teria outro winrate de referência.', '',
    'Nenhum atributo, habilidade, gema ou comportamento da IA foi alterado. Os resultados não são enviados aos logs de jogadores, Render, Supabase ou saves da campanha.', '',
    '## Protocolo e auditoria', '',
    '| Etapa | Combates | Ações |', '| --- | ---: | ---: |',
]
labels = {'controlled': 'Receitas controladas', 'mixed': 'Engastes individuais variados', 'selection': 'Seleção independente de candidatas', 'final': 'Final de funções selecionadas'}
for phase in r['phases']:
    lines.append(f"| {labels[phase['phase']]} | {number(phase['matches'])} | {number(phase['actions'])} |")
lines += ['',
    '- Todos os combates usam o motor autoritativo do servidor PvP, com atributos normais e a IA atual para os dois lados.',
    '- São permitidas classes repetidas, sem herói duplicado dentro da equipe. Formação fixa: tanque, suporte, dano; ordem alfabética dentro da função. A posição não força um ataque contra o tanque.',
    f"- Foram verificados vida, energia e escudo após cada uma das {number(r['actions'])} ações. Nenhum combate ficou incompleto. Catálogo, regras e gemas correspondem aos arquivos do Godot.",
    f"- {r['replaySamples']} replays completos distribuídos entre as fases foram reconstruídos: mesma escolha da IA, comandos, vencedor e hash final.",
    '- Os registros de partidas guardam as duas equipes na ordem original; `swap: 1` indica inversão ao executar o jogo. `winner` é normalizado à ordem original, e `side0Won` é o lado real. Os replays completos já armazenam a ordem de execução.',
    '- Os testes controlados repetem os mesmos adversários e sementes entre receitas, favorecendo comparações pareadas. Essas repetições não são observações independentes para comparar receitas.', '',
    '```bash', f"node scripts/simulate-role-gems.mjs --output artifacts/roles-gems-014 --seed {r['seed']}", 'python3 scripts/report-role-gems.py artifacts/roles-gems-014 docs/roles-gems-014', '```', '',
    f"Cliente 0.14; regras `{r['rulesVersion']}`; PvP `{r['pvpVersion']}`; revisão base `{r['commit']}`. A versão das regras permanece 0.11.0 porque as atualizações visuais não alteraram o combate.", '',
    f"Impressão do motor: `{r['build']}`.", '',
    '- [Resumo estruturado e todas as candidatas](summary.json)', '- [Ranking de funções em CSV](roles.csv)', '- [Receitas de gemas em CSV](gems.csv)', '- [Sementes, equipes, gemas, resultados e hashes de todos os jogos](matches.ndjson.gz)', '- [Amostras com comandos completos para replay](replay-samples.ndjson.gz)', '',
]
(output / 'README.md').write_text('\n'.join(lines))
print(json.dumps({'total': r['total'], 'output': str(output), 'dominantRole': champ['name'], 'winRate': champ['winRate']}, ensure_ascii=False))
