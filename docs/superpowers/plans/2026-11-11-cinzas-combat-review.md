# Cinzas do Abismo: Revisão Integral de Combate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realizar a revisão integral e automatizada dos seis pilares de combate de Cinzas do Abismo — dano, cadência, colisão, esquiva, resistência e estados —, cobrindo as quatro famílias de armas, quatro variantes táticas, modificadores de build, proteções defensivas e reações de ambos os lados, integrando uma suíte dedicada em `tests/cinzas/check-combat-review.cjs` e conectando-a à verificação contínua.

**Architecture:**
1. `tests/cinzas/check-combat-review.cjs`: suíte abrangente com 6 grupos de testes cobrindo formalmente cada um dos pilares de combate do jogo:
   - Grupo 1: Dano e escalonamento (4 armas base, 4 variantes de arma, power/meleePower/magicPower, bloodrage <40% HP, fury no 3º combo/aéreo, shatter em alvos lentos, multiplicador de crítico 2x).
   - Grupo 2: Cadência e ritmo (durações de ataque das 4 armas, windup de impacto por arma, cooldowns base, escalonamento por haste `1/haste`, recarga de habilidade especial e escalonamento por magicRate, preservação de ataque com toque curto).
   - Grupo 3: Colisão e alcance (alcance melee por arma escalado por reach, bônus de 20px no 3º combo da lâmina, colisão e contagem de perfuração de projéteis, colisão de terreno sólido/declive, descida de plataforma unidirecional, bloqueio em teto de túnel).
   - Grupo 4: Esquiva e invulnerabilidade (dash velocity 790, duração 0.21s, invulnerabilidade ativa >= 0.25s a contato, projéteis e campos hostis, recarga escalada por dashRate, mitigação pós-esquiva de 2s com aegis).
   - Grupo 5: Resistência e proteção (armadura percentual até 30%, fator de dificuldade 0.7x/1.0x/1.45x, guarda pesada de 20% durante windup da Lâmina de Guarda, mitigação de lava com Pele de Salamandra, bloqueio frontal do Escudeiro reduzindo 58% salvo por armas perfurantes).
   - Grupo 6: Estados e sinergias (Queimadura de 3s a 6 dps/nível e explosão com Inferno; Congelamento de 2s com lentidão a 52% e bônus com Shatter; Veneno de 5s a 4 dps/nível e dano dobrado com Plague; Raio com salto em cadeia a 35%/60% do dano e microatordoamento; reações do herói a teia/snare, sangramento físico, queima e choque).
2. `tests/cinzas-upstream.js`: registrar `check-combat-review.cjs` na lista de suítes de Cinzas.
3. `public/roguelite/core.js`: sanear e afinar as transições e parâmetros de combate conforme as verificações dos testes.
4. `docs/RENASCIMENTO.md` e `docs/RENASCIMENTO_CHECKPOINT.md`: documentar a revisão integral e marcar o item do checklist.

**Tech Stack:** JavaScript (Node.js 24 LTS, `node:assert/strict`).

**Spec:** [docs/RENASCIMENTO.md](file:///home/antigravity/JonathaPereira/A-LEI-DO-TRONO-SERVER/docs/RENASCIMENTO.md) item: "Revisar integralmente dano, cadência, colisão, esquiva, resistência e estados".

## Global Constraints

- Preservar compatibilidade total de saves e checkpoints (formato `cinzas-campaign`, versão 1).
- Não alterar sementes de RNG procedural do cenário ou das cartas.
- TDD estrito com suíte automatizada executável via `node tests/cinzas/check-combat-review.cjs` e `node tests/cinzas-upstream.js`.

## Review Focus

1. Dano do martelo e espada respeitam estritamente `meleePower`, `power` e multiplicadores de combo e crítico sem duplicação de acerto.
2. Cadência de disparo com `haste` reduz a duração e o cooldown exatamente por `1 / haste`.
3. Esquiva (dash) bloqueia 100% do dano sofrido durante toda a janela de 0.21s contra contato, projéteis e campos nocivos.
4. Escudeiro (`bulwark`) reduz 58% do dano frontal físico, mas golpes com `unblockable` (como martelo de ruptura) passam direto sem redução.
5. Inimigos sob veneno, queimadura e lentidão calculam suas durações e dano por segundo exatamente pelos parâmetros de design das cartas.

---

### Task 1: Criar a suíte `tests/cinzas/check-combat-review.cjs` (TDD)

**Files:**
- Create: `tests/cinzas/check-combat-review.cjs`
- Modify: `tests/cinzas-upstream.js`

**Interfaces:**
- Consumes: `Engine`, `CARDS`, `WEAPONS`, `SPECIALS`, `FLOOR` de `public/roguelite/core.js` e `Levels` de `public/roguelite/levels.js`
- Produces: 6 testes integrados cobrindo os 6 pilares de combate.

- [ ] **Step 1: Escrever os testes em `tests/cinzas/check-combat-review.cjs`**
- [ ] **Step 2: Conectar em `tests/cinzas-upstream.js`**
- [ ] **Step 3: Executar `node tests/cinzas/check-combat-review.cjs` e verificar aprovação**

---

### Task 2: Harmonizar parâmetros de combate em `public/roguelite/core.js` se identificado gap

**Files:**
- Modify: `public/roguelite/core.js`

- [ ] **Step 1: Revisar consistência de dano, cadência, colisão, esquiva, resistência e estados**
- [ ] **Step 2: Executar testes de Cinzas e verificar zero regressões**

---

### Task 3: Verificação de regressões, documentação e sincronização

**Files:**
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Rodar todas as suítes de Cinzas (`check-combat-review.cjs`, `check-exploration.cjs`, `cinzas-upstream.js`, `check-balance.cjs`)**
- [ ] **Step 2: Rodar todas as 8 suítes Godot do Atalaia**
- [ ] **Step 3: Atualizar `docs/RENASCIMENTO.md` marcando o checklist e registrando o 89º incremento**
- [ ] **Step 4: Atualizar `docs/RENASCIMENTO_CHECKPOINT.md`**
- [ ] **Step 5: Fazer commit e push para `origin/main` de `A-LEI-DO-TRONO-SERVER`**
