# Checkpoint de transferência — Operação Renascimento

O checkpoint original registrou uma interrupção para transferência. A instrução
vigente é continuar autonomamente pelos itens pendentes, preservando o checkout
e os pacotes. **Não recomeçar a auditoria nem reimplementar entregas já feitas.**

## Continuidade após a transferência

As referências publicadas foram usadas como base da continuidade local.
Os incrementos 12–80 cobrem fases de chefes, expansão de Nexus, vínculos e
jornadas, Legado/cinco regiões de Cinzas e árvores/Crônica/modos do Atalaia.
O corte 61 conserva os 24 perfis corporais e a verificação integrada do 62.
As revisões independentes de 55/56/58/59/60/61 foram concluídas sem achados.
As pendências de revisão nos manifestos dos pacotes antigos são históricas.
As seções abaixo distinguem os pacotes e os limites de cada evidência.
O novo corte 63 inclui o condutor de Cinzas e a integração Nexus do 62, com
revisões independentes concluídas. Os pacotes anteriores permanecem preservados.
O novo corte 65 conserva as cinco lições Nexus, o condutor e a verificação
integrada, com documentação 66 e revisões concluídas. As seções distinguem
os pacotes; os oito anteriores permanecem preservados.
A autorização vigente exige confirmação explícita para commit e push.
Consulte o [andamento e a checklist](RENASCIMENTO.md#checklist-consolidado-solicitado).

## Corte local até o incremento 80 — 10/11/2026

**Posterior ao pacote:** o incremento 82 acrescenta o balanceamento tático sob
pressão de prazo no relé (`forge-relay`), destravando as três composições de
campanha que permaneciam bloqueadas (`Torv/Oren/Sylva`, `Nima/Axion/Brin` e
`Noct/Auren/Elyra`) para conclusão de 48/48 (verificações: 13 em
`mission_support_ai.gd`, 624 cenários/600 vitórias em `objective_matrix.gd`), e a
diferenciação corporal do supremo *Mil Espinhos* de Nima com folha dedicada de 8
desenhos (`nima-supreme-renascimento-v1.png`), metadados e mapeamento de
regiões (50 checks em `hero_choreography.gd`). O incremento 83 inaugura a
classe Técnica com o supremo corporal dedicado *Órbita de Aço* de Kira
(`kira-supreme-renascimento-v1.png`, 1774x887, 8 poses), registrado em
`animation-art.json` e `pose-regions.json` (63 checks em `hero_choreography.gd`).
O incremento 84 completa a dupla da classe Técnica com o supremo corporal
dedicado *Protocolo Zero* de Axion (`axion-supreme-renascimento-v1.png`, 1774x887,
8 poses), registrado em `animation-art.json` e `pose-regions.json` (76 checks em
`hero_choreography.gd`).
O incremento 85 diferencia a segunda fase da Matriarca das raízes (chefe da onda
12 da Crônica do Atalaia) com convocação única de ninhada de duas tecelãs
(`brood`) ao cruzar 50% de vida sem morrer, entrando imediatamente atrás do chefe
na mesma rota e dividindo-se em filhotes (`hatchling`) ao cair, com contrajogo por
dano em área, tooltip na preparação e toast dedicado (22 checks em
`root_matriarch.gd`).
O incremento 86 diferencia a segunda fase da Sentinela da cidadela (chefe da onda
18 da Crônica do Atalaia) com convocação única de escolta de golem e blindagem
rúnica reforçada para 33% de armadura ao cruzar 50% de vida sem morrer, com
contrajogo explícito por perfuração (Metal do abismo, Arpão), Caçador de colossos
e dano contínuo (fogo/veneno), tooltip e toast dedicado (27 checks em
`citadel_sentinel.gd`).
O incremento 87 diferencia a segunda fase do Guardião das raízes (chefe da onda
6 da Crônica do Atalaia) com convocação única de matilha de dois lobos velozes ao
cruzar 50% de vida sem morrer, completando a diferenciação dedicada das segundas
fases de todos os cinco chefes da Crônica (20 checks em `root_guardian.gd`).
O incremento 88 introduz o objeto destrutível de exploração Relicário do Eclipse
(`eclipse-cache`) no Capítulo 8 (Biblioteca suspensa / estágio 7 de Cinzas do
Abismo), numa prateleira elevada opcional da rota alcançável por pulo duplo, com
45 HP, recompensas únicas (+10% vida máxima, +1 reroll, 50 pontos), destruição
pelas quatro armas, imunidade a disparos inimigos, apresentação temática em
ametista e ouro no Canvas, persistência atômica no formato 1 em `brokenObjects` e
rejeição atômica de corrupção (34 checks em `check-exploration.cjs`).
O incremento 89 entrega a revisão integral dos seis pilares de combate de Cinzas
do Abismo (dano nominal e variantes, cadência e haste, colisão e declives, esquiva
e invulnerabilidade, resistência e guardas, estados e controle de grupo),
consolidando uma nova suíte automatizada integrada ao pipeline principal (6
verificações integradas em `check-combat-review.cjs` e 20 suítes em
`cinzas-upstream.js`).
O incremento 90 estabelece o rebalanceamento e matriz de playtests reproduzíveis
de Campanha e Horda em Cinzas do Abismo (curvas de escalonamento 1–25 da Horda,
teto de 14 inimigos simultâneos, taxa de vitória global de 68.8% em 80 duelos dos
5 chefes, equidade das 4 variantes de arma e ausência de encontros degenerados),
consolidando a suíte `check-balance-matrix.cjs` integrada a `cinzas-upstream.js`.
O incremento 91 entrega a consolidação e verificação automatizada das matrizes
completas de armas, torretas, heróis, habilidades, chefes, economia e
experiência (Seção 28 da diretriz original), auditando matematicamente 4 armas/4
variantes de Cinzas, 12 torretas de Atalaia, 24 heróis de Nexus, 10 monstros e 12
inimigos com segundas fases dos 5 chefes, e escalonamento econômico de ouro e
relicários (`check-balance-matrices.cjs` integrado a `tests/suites.json`).

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-10-INCREMENTO-80-R2.zip`
reúne fontes/WIP até 80 e documentação 81: 2.310 fontes, 1.333 evidências
e manifesto (3.644 entradas). Acompanham `.zip.sha256` e `.VERIFICACAO.json`;
confira esses arquivos ao transportar/restaurar. As bases e branches exatas
continuam as da tabela deste checkpoint, com main preservada. Não use
somente main para recuperar os arquivos novos e o trabalho sem commit.

Inclui Refluxo do Executor (38 padrões/quatro campanhas 48/48), duas novas
composições com 48/48 por política temporária do relé (25 comparações), os
supremos corporais de Rhazen/Cindra e a emissão corrigida por escala efetiva.
São 24 perfis/26 folhas/208 desenhos, com artes básicas preservadas. A última
integrada ampla Nexus é a do 78: 286 coreografias, 1.301 nativos/1.272 UI,
paridade/replays. No 80 passaram 62 dirigidos/nove de transição/geometria,
55 JS/check, export local 113,4 MiB, quatro casos nativos e Chrome em duas
resoluções; Standards/Spec sem achados restantes após P2 reproduzido/corrigido.

A R2 corrige um P3 de metadado histórico: a primeira integrada de lições tinha
27 verificações; 33 é a cobertura posterior. O ZIP inicial do corte 80 fica
preservado. As fontes de produto não mudam nessa correção.

Os 13 pacotes anteriores foram rechecados por tamanho/SHA-256 e permanecem
preservados. Ensaios distinguem fixtures, táticas experimentais, tentativas
inválidas e aceite humano ausente. Supremos completos dos 24, demais metas
da checklist e homologação 1.0 continuam abertos. Sem commit/push, merge,
PR, deploy ou publicação; preserve a autorização vigente.

## Corte local até o incremento 74 — 09/11/2026

**Posterior ao pacote:** o 80 acrescenta supremo corporal de Cindra e corrige
emissão pela escala efetiva do quadro; 62 dirigidos/nove geometria, 55 JS/check,
export 113,4 MiB, quatro casos nativos e Chrome em duas resoluções passaram.
Standards/Spec reexaminaram o P2 corrigido sem achados restantes; sem aceite
humano ou nova integrada ampla. O 79 conferiu o
roteiro de seleção por teclado, sem alterar produto. O incremento 78 acrescenta oito desenhos exclusivos
do supremo de Rhazen, com 26 dirigidos/cinco transições, 55 JS/check, integrada
(286 coreografias/1.301 nativos/1.272 UI/paridade/replays), export 112,6 MiB,
nativo/Chrome em duas resoluções conferidos e Standards/Spec sem achados.
Sem aceite humano. O ensaio 77 registrou
duas novas campanhas 48/48 por tática temporária, sem alterar a IA pública.
Nexus também contém o Refluxo das marés do 76, com 38
padrões, 55 JS, integrada/paridade/replays, export e quatro campanhas 48/48.
Inspeções nativa/Web em duas resoluções e Standards/Spec sem achados concluídos.
Web confirmou fase 2 e vitória com perfil desbloqueado de fixture; sem aceite
humano. Fontes e testes modificados ainda
não integram o ZIP 74; preservar o checkout e os pacotes anteriores.

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-74.zip`
conserva fontes/WIP até 74 e documentação/evidências 75. Inclui a escolta do
Guardião da escória (35 dirigidos, build completo, 1.484 core/Chrome, matriz
36/36) e o Nexus nativo (1.316 ciclos/30 minutos/saída 0), com revisões
73/74 concluídas sem achados restantes. Memória estática nativa não mede
RSS/driver/GPU ou FPS físico. Manifesto, CRC/hashes por arquivo e SHA-256
externo verificados; onze pacotes anteriores preservados e reconferidos.
Não inclui saves reais/dependências/exports; Git/publicação/homologação
continuam limitados como descrito acima.

## Corte local até o incremento 71 — 09/11/2026

**Depois deste corte:** o checkout contém o Guardião da escória do 74,
com 35 casos dirigidos/build/matriz 36/36 e fontes novas. Rechecagens
independentes concluídas sem achados restantes; o Nexus nativo do 73 concluiu 1.316 ciclos/30 minutos, saída
0 limpa, memória estática 70,03–71,08 MiB, sem fechar hardware/FPS/RSS/GPU.
Esses trabalhos não estão no ZIP 71; foram incorporados ao corte 74.

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-71.zip`
conserva fontes completas/WIP até 71 e documentação/evidências 72. Inclui
resolução terminal Cinzas (28 gameplay, DOM, 1.484 core, oito Web, tipos/
formato/build) e ensaios prolongados dos três jogos, com revisões 70/71
concluídas. O Nexus repetido encerrou 1.325 ciclos/30 minutos com saída 0
limpa; a memória headless cresceu e o diagnóstico upstream está documentado,
sem trocar motor ou fechar a meta de memória. Manifesto, CRC, hashes por
arquivo e SHA-256 externo verificados; dez pacotes anteriores intactos,
com hashes reconferidos. Sem saves reais, dependências ou exports. Não é
release/homologação; a autorização Git permanece limitada como descrito acima.

## Continuidade posterior ao corte 68, incorporada ao corte 71

O incremento 70 corrige resoluções posteriores à derrota no mesmo quadro em
Cinzas, com cinco fontes fatais, 28 casos de gameplay, fluxo DOM, core/tipos/
formato/build, oito Web e inspeção em duas resoluções. Preserva créditos
anteriores ao dano fatal e não altera save/kit/arte. Essa fatia está no
checkout e ainda não está no ZIP 68; não descartá-la ao restaurar o pacote.
Os ensaios 71 registram Atalaia 195 campanhas/11.971 retomadas
e Cinzas 43 sessões Chrome, ambos em cerca de 15 minutos. O primeiro Nexus
completou 30 minutos com aviso de liberação antecipada do dono no roteiro.
Uma reprodução mínima com retorno aguardado encerrou limpa; a repetição
completa corrigida terminou em 1.801,028 s/1.325 ciclos, saída 0 limpa e
nenhuma ação pendente ao liberar a cena, sem alterar fontes do jogo. A memória
headless cresceu; reprodução mínima e controles correspondem ao defeito
upstream Godot #124439, sem trocar o motor ou fechar a meta de memória.
Cinzas perdeu 60 cenários de cinco políticas legais; capítulo máximo 13,
sem prova de impossibilidade ou aceite de balanceamento. Evidências no 71.

## Entregas locais 67/68 incluídas no novo corte

O incremento 67 implementa pulso anunciado da Coroa do Bastião, exclusivo da
fase final da Crônica/repetição/desafio. Passaram 38 casos dirigidos,
build/regressões do Atalaia, core/tipos/formato/Next/Chrome e matriz 36/36.
O timestamp opcional preserva save v1; aviso permanece com efeitos reduzidos.
A revisão identificou e reproduziu uma janela parcial, corrigida antes da
rechecagem final; Standards/Spec concluídas sem achados restantes, com os
38 casos reexecutados por ambos. Inspeções são fixtures com áudio Dummy/mutado e renderização
por software, sem aceite humano. O incremento 68 conserva foco/rolagem/seleção/retry na Coleção Nexus: 30
casos dirigidos, 55 JS, integrada 1.301/1.272 UI/paridade/replays e inspeções
nativa/Web em duas resoluções. As fontes 67/68 estão no novo corte 68; os pacotes anteriores permanecem
intactos, com seus estados históricos.

## Corte local até o incremento 68 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-68.zip`
conserva fontes completas/WIP até 68 e documentação/evidências 69. Inclui
pulso da Coroa (38 dirigidos, build/regressões/matriz 36/36) e Coleção Nexus
(30 dirigidos, 55 JS, integrada 1.301/1.272 UI/paridade/replays), com suas
revisões concluídas. Distingue fixtures, tentativa Web incompleta e repetição
confirmada, sem aceite humano. CRC/todos os hashes e SHA-256 externo são
verificados. Nove pacotes anteriores preservados, com hashes reconferidos.
O ensaio de 30 minutos está em andamento e não é declarado concluído neste
corte. Não inclui saves reais, dependências ou exports reconstruíveis.
Commit/push exigem confirmação; main, merge, PR, deploy e release continuam
fora do checkpoint. Renascimento 1.0 permanece sem homologação.

## Corte local até o incremento 65 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-65.zip`
conserva fontes completas/WIP até 65 e documentação/evidências 66. Inclui cinco
lições Nexus, seus 33 casos dirigidos finais e a integrada do 65 (27 dirigidos na
abertura, seguida de 1.301 nativos/1.272 UI/paridade/replays); seis simulações
legais e conclusão Web 2/2 por teclado/movimento reduzido, além do condutor de
Cinzas/checagens 63. Registra revisões independentes concluídas, bases/branches,
fontes novas e hashes. CRC/todos os hashes e SHA-256 externo verificados.
Oito ZIPs anteriores preservados; sem saves reais, dependências ou exports
reconstruíveis. Não é release/homologação; commit/push exigem confirmação.

## Corte local até o incremento 63 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-63.zip`
conserva fontes completas/WIP até 63 e documentação/evidências 64. Inclui o
condutor de Cinzas com 1.483 core, 27 de exploração, oito Web e inspeção em duas resoluções,
além dos 24 perfis Nexus/regressão integrada do 62. Registra revisões independentes
concluídas, bases/branches/arquivos novos e hashes. CRC e todos os hashes são
conferidos, com SHA-256 externo. Sete ZIPs anteriores preservados; não inclui
saves reais, dependências ou exports reconstruíveis. Não é release, homologação
ou autorização de commit/push. Os limites das simulações e do aceite humano
permanecem explícitos no manifesto e nos documentos donos.

## Corte local até o incremento 61 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-61.zip`
conserva fontes WIP completas até 61 e documentação/evidências do corte 62.
Inclui os 24 perfis corporais/192 desenhos, prompts/correções e metadados;
regressão integrada 1.301/1.272 UI, coreografia 284, derrota 110, 55 testes JS,
campanha contínua 48/48, paridade/replays e PvP local nativo/Web. Ensaio de
240 cancelamentos alternando o elenco é limitado e separado de hardware/FPS.
As revisões independentes de 55/56/58/59/60/61 foram concluídas sem achados;
as pendências nos manifestos antigos são históricas. Manifesto conserva bases,
branches, fontes novas e estado sem commit. SHA-256 externo, CRC e hashes de
todas as entradas acompanham o pacote. Seis ZIPs anteriores permanecem intactos.
Não inclui saves reais, dependências ou exports reconstruíveis. Supremos finais,
metas abertas e aceite humano continuam; não é release ou homologação.
Commit/push ainda exigem confirmação explícita.

## Corte local até o incremento 56 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-56.zip`
conserva fontes completas/WIP até 56 e documentação do corte no incremento 57.
Inclui os dez perfis corporais e suas evidências. O manifesto mantém pendentes
as revisões independentes de 55/56 e distingue regressões, simulações e ensaio
curto de cancelamento. Registra bases, branches, estado sem commit, fontes
novas e hashes. SHA-256 externo e verificação de CRC/todas as entradas acompanham
o ZIP. Cinco pacotes anteriores permanecem intactos. Não inclui saves reais,
dependências ou exports reconstruíveis; não é release ou homologação.
Commit/push continuam exigindo confirmação explícita.

## Corte local até o incremento 53 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-53.zip`
conserva fontes completas/WIP até 53 e documentação do corte no incremento 54.
Inclui Arauto no Atalaia, urna/ataques curtos em Cinzas e a integração Nexus
até 49. Manifesto registra bases, branches, status, fontes novas e hashes;
separa as evidências atuais de cada jogo e mantém aceite humano falso.
SHA-256 externo e verificação de CRC/todas as entradas acompanham o ZIP.
Os quatro pacotes anteriores permanecem intactos. Não inclui saves reais,
dependências ou exports reconstruíveis; não é release ou homologação.
Commit/push seguem exigindo confirmação explícita.

## Corte local até o incremento 49 — 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-49.zip`
conserva fontes completas/WIP até 49 e documentação do corte no incremento 50.
Inclui seis folhas corporais, prompts e integração de apresentação, além dos
padrões do Arquivista/Arquiteta. Manifesto registra bases exatas, branches,
status Git, hashes e evidências selecionadas. Distingue a regressão integrada
do 48 das verificações pertinentes do 49. SHA-256 e verificação de CRC/todas
as entradas acompanham o ZIP. Os três pacotes anteriores permanecem intactos.
Não inclui saves reais, dependências ou exports reconstruíveis. Não é release
nem homologação; commit/push exigem confirmação explícita.

## Checkpoint local atualizado em 09/11/2026

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-46.zip`
conserva fontes completas e WIP até o incremento 46, incluindo as quatro
folhas corporais novas, metadados e prompts, mais a documentação do corte
no incremento 47. As bases exatas continuam as da tabela abaixo. O manifesto
registra branches, estado sem commit, hashes e evidências selecionadas,
distinguindo as verificações atuais de arte da última regressão integrada.
SHA-256 externo e verificação de CRC/todas as entradas usam o nome-base do ZIP.
Não inclui saves reais, dependências ou exports reconstruíveis. Não é release.
Os dois pacotes de 08/11 abaixo permanecem preservados. Commit/push seguem
exigindo confirmação explícita.

## Checkpoint local atualizado em 08/11/2026

O pacote do corte até o incremento 42 é
`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-08-INCREMENTO-42.zip`.
Inclui fontes completas e WIP até o incremento 42, mais a documentação do
incremento 43 que registra este corte. Usa as mesmas bases exatas da tabela
abaixo e contém `MANIFESTO.json`, hashes de cada entrada e evidências selecionadas.
O SHA-256 externo e a verificação estão em arquivos com o mesmo nome-base do
novo ZIP. Preserve ambos os pacotes ao restaurar; nenhum autoriza commit/push.
Não inclui saves reais, dependências ou exports reconstruíveis. Não é release.

O pacote abaixo é o checkpoint anterior desta continuidade e conserva seu corte:

`artifacts/renascimento-transfer/RENASCIMENTO-CONTINUIDADE-2026-11-08.zip`
guarda as fontes completas dos dois checkouts, incluindo arquivos novos e
alterações sem commit até o incremento 35, além desta documentação. É um
checkpoint de desenvolvimento; não é release homologada ou publicação.
`MANIFESTO.json` contém bases, branches, estado Git e hashes individuais.
O arquivo `.sha256` ao lado do ZIP verifica o pacote inteiro.

| Checkout | Base exata do trabalho sem commit |
| --- | --- |
| A-LEI-DO-TRONO-SERVER · codex/renascimento-audit | `9162d48c7b7c324f2697fee2f851bc2c7bcf2374` |
| PROJETO-NEXUS · codex/renascimento-save-recovery | `27768ca126d8e2f93139702656849c561eec0705` |

Para recuperação, primeiro preserve o checkout de destino e confira o hash do
ZIP. Restaure os diretórios nomeados sobre essas bases exatas, conservando
`.git`, saves e quaisquer alterações posteriores. Confira os hashes individuais
do manifesto antes de editar. Dependências, caches, exports e segredos ficam
fora; builds usam os lockfiles e o toolchain documentados. Não restaurar somente
`main`. As referências históricas e o pacote anterior abaixo são preservados.
Commit e push continuam exigindo confirmação explícita; não houve nenhum nesta
continuidade. A checklist viva de trabalho pendente está em `RENASCIMENTO.md`.

## Situação de preservação da transferência anterior

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
