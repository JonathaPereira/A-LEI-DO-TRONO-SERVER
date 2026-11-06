"""Compare the preserved 0.14 study with a fresh 0.15 run, including schedule checks."""
import gzip
import json
import shutil
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

old_dir=Path('docs/roles-gems-014')
new_dir=Path('artifacts/roles-gems-015')
out=Path('docs/balance-015')
out.mkdir(parents=True,exist_ok=True)
old=json.loads((old_dir/'summary.json').read_text())
new=json.loads((new_dir/'summary.json').read_text())
def schedule(directory):
    with gzip.open(directory/'matches.ndjson.gz','rt') as file:
        return [(r['phase'],r['seed'],r['swap'],r['groups'],r['loadouts']) for line in file if (r:=json.loads(line))['phase'] in ['controlled','mixed']]
assert schedule(old_dir)==schedule(new_dir), 'The controlled and mixed phases must use identical teams, gems, seeds and side reversals.'
for name in ['summary.json','roles.csv','gems.csv','matches.ndjson.gz','replay-samples.ndjson.gz']:
    shutil.copyfile(new_dir/name,out/name)
before={r['id']:r for r in old['mixedRanking']}
after=new['mixedRanking']
fig,ax=plt.subplots(figsize=(10,6))
y=list(range(len(after)))
ax.barh([i-.18 for i in y],[before[r['id']]['winRate'] for r in after],height=.34,label='0.14',color='#64748b')
ax.barh([i+.18 for i in y],[r['winRate'] for r in after],height=.34,label='0.15',color='#0d9bb5')
ax.set_yticks(y,[r['name'] for r in after]);ax.invert_yaxis();ax.set_xlim(0,100)
ax.set_xlabel('Vitórias (%) · 1.800 aparições por grupo / versão')
ax.set_title('Mesmas formações, gemas e sementes · IA × IA')
ax.legend();ax.grid(axis='x',alpha=.18);ax.set_axisbelow(True)
fig.tight_layout();fig.savefig(out/'roles-before-after.png',dpi=160);plt.close(fig)
pct=lambda n:f'{n:.1f}%'.replace('.',',')
table='\n'.join(f"| {r['name']} | {pct(before[r['id']]['winRate'])} | {pct(r['winRate'])} |" for r in after)
selected={r['group']:r for r in new['selected']}
final='\n'.join(f"| {r['name']} | {selected[r['id']]['name']} | {pct(r['winRate'])} ({r['wins']}/{r['games']}) |" for r in new['finals'])
text=f'''# Balanceamento 0.15: proteção, risco e decisões

Regras `{new['rulesVersion']}` · fonte `{new['commit']}` · fingerprint `{new['build']}`.

Foram concluídos **{new['total']:,} combates**, com **{new['actions']:,} ações** e todos os 1.140 trios cobertos. O script verifica que os 19.800 confrontos controlados e os 9.000 mistos usam exatamente as mesmas equipes, gemas, sementes e inversões de lado da amostra 0.14. A política da IA mudou junto com o balanceamento; estes resultados medem o pacote completo, sem atribuir o efeito a uma mudança isolada.

## Regras aplicadas

- Escudos: camadas independentes por 2 rodadas globais, limite total preservado em 25% da vida. Uma aplicação na rodada 1 vence no início da 3; outra na 2 vence na 4. Novas aplicações não renovam camadas antigas. Golpes consomem primeiro as antigas.
- Vesper: provocação e riposta por 2 turnos pessoais. O tanque provocador perde 25% da própria defesa durante a postura. A penalidade termina com ela e não pode ser purificada isoladamente. Ataques individuais são restringidos aos provocadores vivos; área continua atingindo os adversários.
- Tanques: ataque base cerca de +8%, refletido nos básicos, habilidades ofensivas e ripostas. O primeiro tanque na formação dá Cobertura aos outros aliados por 2 turnos pessoais deles na abertura. Desvia 25% do golpe individual ao protetor vivo, sem empilhar múltiplos protetores ou bloquear área.
- Dano: vida base cerca de −6%, com arredondamento por herói. Ataque e poderes ofensivos preservados.
- Suportes: atributos e habilidades preservados.
- IA: avalia dano estimado, finalizações, prioridade de suporte, afinidade, escudos, cobertura, combos, cura efetiva e proteção de aliados vulneráveis. Respeita provocação, custo e recarga; não consome o RNG ao planejar.

## Amostra mista comparável

Cada grupo joga contra os outros nove com peso igual, 1.800 aparições por grupo e diferentes receitas individuais de gemas. Não corresponde à distribuição de uma fila humana.

| Funções | 0.14 | 0.15 |
|---|---:|---:|
{table}

![Vitórias por combinação de funções, antes e depois](roles-before-after.png)

Três danos continuam fortes na média. A melhora dos tanques abriu respostas, mas **o jogo ainda não pode ser considerado equilibrado**. Equipes sem dano seguem fracas; não se pretende que três tanques tenham a mesma capacidade ofensiva de uma equipe completa.

## Final entre builds selecionadas

Os candidatos e vencedores da seleção são recalculados em cada versão; esta fase não tem adversários idênticos à final 0.14. Cada build enfrenta as outras nove por 40 jogos, total de 360 aparições. A seleção é amostral; não prova o melhor trio global.

| Funções | Trio selecionado | Vitória na final 0.15 |
|---|---|---:|
{final}

Na final, Vesper + Astra + Veyra, com três gemas de energia em cada herói, venceu 39/40 contra Riven + Torv + Veyra, com três gemas de vida em cada herói. Esse confronto mostra uma resposta concreta ao trio de dano selecionado; não garante vitória contra qualquer trio de dano.

## Reproduzir e conferir

```bash
npm ci
npm run sync:godot
node scripts/simulate-role-gems.mjs --output artifacts/roles-gems-015 --seed 20261021
python3 scripts/report-balance-015.py
```

O motor confere limites de recursos, conclusão e replays. Há {new['replaySamples']} replays completos amostrados em `replay-samples.ndjson.gz`; `matches.ndjson.gz` guarda resumos de todos os confrontos. `summary.json` contém os resultados por perfil, intervalos, matriz e limites do estudo. Nenhum desses dados é escrito nos logs reais de jogadores.

Os históricos locais de laboratório 0.11 ficam preservados em arquivos próprios; a nova versão inicia arquivos 0.15 para evitar misturar regras. Os registros do servidor PvP continuam separados e identificados pela versão das regras.
'''
(out/'README.md').write_text(text)
print(f'Relatório salvo: {out} ({new["total"]} partidas)')
