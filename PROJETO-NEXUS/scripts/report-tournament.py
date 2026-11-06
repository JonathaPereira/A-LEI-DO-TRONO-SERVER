"""Render a saved PvP tournament without running additional battles.

Usage: python3 scripts/report-tournament.py artifacts/tournament-014 docs/balance-014
Requires numpy and matplotlib. Statistical resampling uses complete paired
matches; the targeted finalist games never enter individual hero win rates.
"""
import gzip
import json
import shutil
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import numpy as np

source, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
report = json.loads((source / 'summary.json').read_text())
balanced_gems = report['gems'] == ['ember', 'pulse', 'sap']
gem_note = 'Uma gema de ataque, energia e vida por herói.' if balanced_gems else 'Sem gemas equipadas.'
for filename in ['summary.json', 'replays.ndjson.gz', 'heroes.csv', 'trios.csv']:
    shutil.copyfile(source / filename, output / filename)

heroes = report['heroes']
index = {hero['id']: i for i, hero in enumerate(heroes)}
blocks = {}
with gzip.open(source / 'replays.ndjson.gz', 'rt') as stream:
    for line in stream:
        match = json.loads(line)
        if match['phase'] != 'exploration':
            continue
        block = blocks.setdefault(match['pairId'], np.zeros((2, len(heroes))))
        for side, team in enumerate(match['teams']):
            for hero in team:
                block[0, index[hero]] += 1
                block[1, index[hero]] += side == match['winner']
block_data = np.array(list(blocks.values()))
assert len(block_data) == 300
assert np.all(block_data[:, 0].sum(axis=0) == 180)
rng = np.random.default_rng(report['seed'])
counts = rng.multinomial(len(block_data), np.full(len(block_data), 1 / len(block_data)), size=5000)
rates = 100 * (counts @ block_data[:, 1]) / (counts @ block_data[:, 0])
lower, upper = np.percentile(rates, [2.5, 97.5], axis=0)
leader_samples = np.argmax(rates, axis=1)
uncertainty = {'method': '5,000 bootstrap samples of 300 complete side-swapped exploration pairs; conditional on this discovery sample, not a global strength probability', 'heroes': [dict(id=h['id'], ci95=[float(lower[i]), float(upper[i])], leaderShare=float(np.mean(leader_samples == i))) for i, h in enumerate(heroes)]}
(output / 'uncertainty.json').write_text(json.dumps(uncertainty, indent=2) + '\n')

background, ink, muted = '#0a1220', '#edf4ff', '#93a6bc'
colors = {'Dano': '#ff936b', 'Tanque': '#66cee3', 'Suporte': '#94d7a0'}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'figure.facecolor': background, 'axes.facecolor': background, 'text.color': ink, 'axes.labelcolor': muted, 'xtick.color': muted, 'ytick.color': ink, 'axes.edgecolor': '#28384b', 'font.size': 11})
fig, ax = plt.subplots(figsize=(12, 11))
fig.subplots_adjust(left=.17, right=.91, top=.84, bottom=.18)
y = np.arange(len(heroes))
observed = np.array([h['winRate'] for h in heroes])
ax.barh(y, observed, color=[colors[h['role']] for h in heroes], height=.65)
ax.errorbar(observed, y, xerr=np.vstack([np.maximum(0, observed-lower), np.maximum(0, upper-observed)]), fmt='none', ecolor=ink, capsize=2, alpha=.6, linewidth=.9)
ax.set_yticks(y, [h['name'] for h in heroes]); ax.invert_yaxis()
ax.set_xlim(0, 90); ax.set_xticks(range(0, 91, 10), [f'{i}%' for i in range(0, 91, 10)])
ax.axvline(50, color=muted, linewidth=1, linestyle='--', alpha=.55)
ax.grid(axis='x', color='#29384a', alpha=.5); ax.set_axisbelow(True)
for i, h in enumerate(heroes):
    ax.text(84, i, f"{h['winRate']:.1f}%".replace('.', ','), ha='right', va='center', fontweight='bold', color=ink)
for spine in ['top', 'right', 'left']:
    ax.spines[spine].set_visible(False)
fig.text(.17, .95, 'NEXUS / Heróis no PvP', fontsize=23, fontweight='bold')
fig.text(.17, .915, '600 combates de exploração · 180 aparições por herói · IA × IA', color=muted)
fig.text(.17, .065, 'Taxa de vitória da equipe que escolheu o herói; não mede duelos individuais.\nBarras finas: intervalo de 95% por bootstrap de pares completos.\n' + gem_note + f" Semente: {report['seed']}.", color=muted, fontsize=10, linespacing=1.7)
ax.legend(handles=[Patch(facecolor=c, label=r) for r, c in colors.items()], loc='lower center', bbox_to_anchor=(.5, 1.02), ncol=3, frameon=False, labelcolor=ink)
fig.savefig(output / 'herois.png', dpi=150); fig.savefig(output / 'herois.svg'); plt.close(fig)

finalists = report['headToHead']
confirmed = {row['key']: row for row in report['confirmation']}
fig, ax = plt.subplots(figsize=(13, 8))
fig.subplots_adjust(left=.30, right=.94, top=.80, bottom=.16)
y = np.arange(len(finalists))
ax.barh(y-.18, [confirmed[row['key']]['winRate'] for row in finalists], height=.31, color='#66cee3', label='Adversários variados (60 jogos por trio)')
ax.barh(y+.18, [row['winRate'] for row in finalists], height=.31, color='#ff936b', label=f"Entre finalistas ({finalists[0]['games']} jogos por trio)")
ax.set_yticks(y, [row['name'] for row in finalists]); ax.invert_yaxis()
ax.set_xlim(0, 109); ax.set_xticks(range(0, 101, 20), [f'{i}%' for i in range(0, 101, 20)])
for i, row in enumerate(finalists):
    for offset, value in [(-.18, confirmed[row['key']]['winRate']), (.18, row['winRate'])]:
        ax.text(value+1.1, i+offset, f'{value:.1f}%'.replace('.', ','), va='center', fontsize=10)
ax.grid(axis='x', color='#29384a', alpha=.5); ax.set_axisbelow(True)
for spine in ['top', 'right', 'left']:
    ax.spines[spine].set_visible(False)
fig.text(.08, .94, 'NEXUS / Trios finalistas', fontsize=23, fontweight='bold')
fig.text(.08, .895, f"{report['total']:,} combates na bateria · mesmos adversários na confirmação · lados invertidos".replace(',', '.'), color=muted)
ax.legend(loc='lower left', bbox_to_anchor=(0, 1.015), frameon=False, labelcolor=ink, fontsize=10)
fig.text(.08, .045, 'Boa taxa contra o elenco variado não garante vantagem contra os outros líderes.\nOs oito finalistas se enfrentaram 20 vezes por confronto; decisões da IA atual.', color=muted, fontsize=10, linespacing=1.7)
fig.savefig(output / 'trios.png', dpi=150); fig.savefig(output / 'trios.svg'); plt.close(fig)
for svg in output.glob('*.svg'):
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')

def pct(value):
    return f'{value:.1f}%'.replace('.', ',')

def number(value):
    return f'{value:,}'.replace(',', '.')

champ = report['winner']
direct = report['headToHead'][0]
broad = report['broadOpponentWinner']
hero = heroes[0]
phase_counts = {phase['phase']: phase['matches'] for phase in report['phases']}
lines = [
    '# Nexus 0.14 — simulação de equilíbrio PvP', '',
    f"**{number(report['total'])} combates completos e {number(report['actions'])} ações.** O trio que liderou os confrontos entre finalistas foi **{champ['name']}**: {direct['wins']}/{direct['games']} vitórias ({pct(direct['winRate'])}). Contra adversários variados, venceu {champ['wins']}/{champ['games']} ({pct(champ['winRate'])}).", '',
    f"O herói com a maior taxa observada foi **{hero['name']}**, com {hero['wins']}/{hero['games']} ({pct(hero['winRate'])}) na amostra de exploração. Cada um dos 20 heróis teve exatamente 180 aparições nessa etapa. Os jogos dirigidos aos finalistas não entram nesse ranking, para evitar favorecer os heróis escolhidos para a final.", '',
    '## Condições e alcance', '',
    '- Motor autoritativo do servidor PvP e IA atual dos dois lados; atributos normais e sem bônus de campanha.',
    ('- Cada herói equipa uma Brasa (+4% ATQ), um Pulso (+8 EN inicial) e uma Seiva (+5% VIDA). Não há otimização de engastes nesta bateria.' if balanced_gems else '- Nenhum herói equipa gemas nesta bateria.'),
    '- São permitidos papéis e classes repetidos. Formação fixa: tanques, suportes e danos; ordem alfabética dentro do papel. A posição por si só não obriga o rival a atacar o tanque.',
    '- Cada confronto é repetido com a mesma semente e lados invertidos. Os resultados de um par são correlacionados.',
    '- 600 jogos exploratórios cobrem 600 composições distintas. As 1.140 combinações possíveis são enumeradas para auxiliar a pré-seleção; não foram todas comparadas exaustivamente.',
    '- Um modelo regularizado de força dos heróis sugere dez candidatos. Outros dez vêm de resultados inesperadamente bons na exploração. Esse modelo escolhe candidatos; os winrates publicados vêm de combates executados.',
    f"- Os 20 candidatos enfrentam cinco adversários compartilhados, nos dois lados ({phase_counts['screening']} jogos). Os {len(finalists)} candidatos com taxa igual ou superior à terceira colocação avançam.",
    f"- Os {len(finalists)} finalistas enfrentam 30 adversários novos compartilhados, nos dois lados ({phase_counts['confirmation']} jogos). Depois jogam todos contra todos: dez pares de sementes por confronto ({phase_counts['head-to-head']} jogos).",
    '- O plano inicial tinha cerca de 1.000 jogos. Os empates exigiram ampliar a final. O líder da final é definido pelo winrate no todos contra todos; a taxa contra adversários variados é apresentada separadamente.',
    '- Esta é uma busca amostral e adaptativa com IA; não prova o melhor trio global nem o maior winrate de jogadores humanos. Outras gemas e formações podem mudar os resultados. Não foi aplicada mudança de balanceamento.', '',
    '## Trios', '',
    f'| Trio | Contra adversários variados | Entre os {len(finalists)} finalistas |',
    '| --- | ---: | ---: |',
]
for row in finalists:
    c = confirmed[row['key']]
    lines.append(f"| {row['name']} | {c['wins']}/{c['games']} · {pct(c['winRate'])} | {row['wins']}/{row['games']} · {pct(row['winRate'])} |")
lines += ['', f"**{broad['name']}** teve a maior taxa contra adversários variados ({pct(broad['winRate'])}), mas não liderou os confrontos entre finalistas. A diferença de uma vitória nessa confirmação é pequena; essa taxa sozinha não define dominância.", '', '![Comparação dos trios](trios.png)', '', '### Confrontos do campeão', '', '| Adversário | Vitórias do campeão |', '| --- | ---: |']
matrix = next(row for row in report['headToHeadMatrix'] if row['team'] == champ['key'])
for row in matrix['opponents']:
    foe = next(f for f in finalists if f['key'] == row['opponent'])
    lines.append(f"| {foe['name']} | {row['wins']}/{row['games']} |")
lines += ['', '## Heróis — somente exploração equilibrada', '', '| Herói | Classe | Função | Vitórias / aparições | Winrate | Sem espelho do herói |', '| --- | --- | --- | ---: | ---: | ---: |']
for h in heroes:
    lines.append(f"| {h['name']} | {h['class']} | {h['role']} | {h['wins']}/{h['games']} | {pct(h['winRate'])} | {h['nonMirrorWins']}/{h['nonMirrorGames']} · {pct(h['nonMirrorWinRate'])} |")
lines += ['', '“Sem espelho” exclui jogos em que o mesmo herói está nas duas equipes. O ranking principal usa todas as aparições e sempre mede vitória da equipe, não a força isolada em 1 contra 1.', '', f"O intervalo de 95% por reamostragem de pares para {hero['name']} foi {pct(lower[0])} a {pct(upper[0])}. Os intervalos dos primeiros colocados se sobrepõem: a liderança pontual não demonstra superioridade estatística sobre todos os demais heróis.", '', '![Winrate dos vinte heróis](herois.png)', '', '## Diagnóstico', '',
    '- Nima expõe a defesa e aplica sangramento. Veyra aproveita sangramento/queimadura e tem dano em área. Riven combina sangramento, execução e roubo de vida. O trio tem velocidades 114, 112 e 107, permitindo pressão antes de muitos suportes e tanques.',
    '- Sangramento reduz a cura recebida em 35%. A redução da defesa e os bônus de execução ajudam a transformar essa pressão em eliminações. Esses mecanismos existem nas regras; esta bateria não isola a contribuição causal de cada um.',
    '- Composições com três atacantes foram as melhores na exploração. Isso merece revisão da utilidade de proteção e da IA defensiva antes de ajustar apenas o dano de um herói.', '', '| Composição por função | Vitórias / aparições | Winrate |', '| --- | ---: | ---: |']
for row in report['roleCompositions']:
    lines.append(f"| {row['composition']} | {row['wins']}/{row['games']} | {pct(row['winRate'])} |")
final_phase = next(p for p in report['phases'] if p['phase'] == 'head-to-head')
lines += ['', f"Nas finais, o lado 0 venceu {final_phase['side0Wins']}/{final_phase['matches']} jogos ({pct(100*final_phase['side0Wins']/final_phase['matches'])}). O desempate atual de velocidade prioriza esse lado; finais com heróis repetidos são sensíveis a isso. A inversão de lados dá a cada trio o mesmo número de partidas em cada lado. O efeito específico do desempate ainda exige um teste isolado; este número também inclui o restante da dinâmica da IA e da aleatoriedade.", '',
    'Prioridades para um próximo ajuste: verificar a iniciativa/desempate; melhorar decisões de proteção e o tempo de entrada dos tanques; revisar Vektor e Rhazen; repetir a bateria antes/depois com as mesmas sementes e depois testar engastes e jogadores humanos.', '',
    '## Reproduzir e auditar', '',
    '```bash', 'node scripts/tournament-pvp.mjs --output artifacts/tournament-014 --seed 20261021 --gems balanced', 'python3 scripts/report-tournament.py artifacts/tournament-014 docs/balance-014', '```', '',
    'A primeira linha executa os combates. A segunda gera este relatório e os gráficos com NumPy e Matplotlib. Os logs simulados são gravados em arquivos separados; não são enviados ao Render ou ao Supabase nem alteram os saves da campanha.', '',
    f"Regras `{report['rulesVersion']}`; PvP `{report['pvpVersion']}`; combate da revisão `{report['commit']}`. O número 0.14 é a versão do cliente: a atualização gráfica não mudou a versão das regras.", '',
    f"Impressão do motor: `{report['build']}`.", '',
    '- [Resumo estruturado](summary.json)', '- [Ranking dos heróis em CSV](heroes.csv)', '- [Ranking dos trios em CSV](trios.csv)', f"- [Comandos, sementes, atributos finais e hashes dos {number(report['total'])} jogos](replays.ndjson.gz)", '- [Incerteza estatística da amostra de heróis](uncertainty.json)', '',
    f"Verificações do simulador: os {number(report['total'])} jogos terminaram; os recursos foram checados após cada ação; catálogo, regras e gemas coincidem com o Godot; 11 replays de fases diferentes foram reconstruídos com escolha da IA e hash final idênticos. Reexecuções de verificação não aumentam a amostra estatística.", '',
]
(output / 'README.md').write_text('\n'.join(lines))
print(json.dumps({'output': str(output), 'hero': hero['name'], 'hero_ci95': [float(lower[0]), float(upper[0])], 'bootstrapLeaderShare': uncertainty['heroes'][0]['leaderShare'], 'total': report['total']}, ensure_ascii=False))
