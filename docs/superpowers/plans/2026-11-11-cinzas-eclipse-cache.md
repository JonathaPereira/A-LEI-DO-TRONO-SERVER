# Cinzas do Abismo: Relicário do Eclipse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o objeto destrutível de exploração **Relicário do eclipse** (`eclipse-cache`) no Capítulo 8 (*Biblioteca suspensa*, estágio 7) de Cinzas do Abismo, com plataforma alcançável, resistência de 45 HP, destruição por básicos e especiais das 4 famílias de armas, imunidade a projéteis inimigos, concessão única de recompensas (+10% vida máxima, +1 renovação, +50 pontos), persistência atômica no formato 1 de checkpoints em `brokenObjects` e apresentação visual arcana no Canvas.

**Architecture:** 
1. `public/roguelite/levels.js`: enriquecer a definição do Capítulo 8 com `cacheId: 'eclipse-cache'`, `cacheName: 'Relicário do eclipse'`, `cacheHp: 45`, `cacheHeal: .10`, `cacheRerolls: 1`, `cacheScore: 50`, e atualizar o gerador de níveis para instanciar o breakable na plataforma opcional daquele capítulo preservando o fallback de `thaw-urn`.
2. `public/roguelite/core.js`: em `damageBreakable`, suportar a cor e partículas arcanas (`#c084fc`, tipo `'arcane'`) para o `eclipse-cache` ao ser danificado e destruído.
3. `public/roguelite/renderer.js`: desenhar o `eclipse-cache` com paleta temática das Ruínas do Eclipse (gradiente ametista `#392254`/`#a374db`, runas douradas `#ffd54f`, rótulo contextual `RELICÁRIO DO ECLIPSE · ATAQUE` e fragmentos violeta ao quebrar).
4. `tests/cinzas/check-exploration.cjs`: adicionar suíte de testes de exploração cobrindo presença, plataforma alcançável, destruição pelas 4 armas (básicos e especiais), imunidade a inimigos, concessão única de recompensas, persistência em checkpoints e rejeição atômica.

**Tech Stack:** JavaScript (Node.js 24 LTS, HTML5 Canvas 2D).

**Spec:** [docs/RENASCIMENTO.md](file:///home/antigravity/JonathaPereira/A-LEI-DO-TRONO-SERVER/docs/RENASCIMENTO.md) checklist de Cinzas do Abismo: "Ampliar terrenos, rotas alternativas, destruição, segredos e eventos".

## Global Constraints

- Compatibilidade com formato 1 de checkpoints de campanha (`cinzas-campaign`, versão 1): `brokenObjects` permanece opcional e aceita IDs conhecidos do estágio.
- Horda permanece estritamente sem breakables (`breakables.length === 0`).
- Sem alterar RNG da geração procedural de cenário, cartas ou inimigos.
- Não contar como abate de inimigo (`kills` permanece inalterado).
- TDD estrito: escrever testes de exploração que falham (RED), implementar o código mínimo (GREEN) e verificar a suíte completa de regressão.

## Review Focus

1. Projéteis inimigos atravessando o relicário não podem causar dano ou abri-lo.
2. Marco de entrada no Capítulo 8 reverte o relicário e seus recursos se o jogador morrer ou reiniciar o combate.
3. Marco de área limpa (`cleared`) preserva o consumo do relicário e não permite coletar suas recompensas novamente ao recarregar.
4. IDs de outros estágios (como `thaw-urn` ou `dawn-conductor`), duplicatas ou tipos inválidos em `brokenObjects` no Capítulo 8 são rejeitados atomicamente.
5. Pulo duplo comum alcança a plataforma do relicário a partir do solo em todas as sementes autorais.

---

### Task 1: Adicionar casos de teste para o Relicário do Eclipse em `check-exploration.cjs` (RED)

**Files:**
- Modify: `tests/cinzas/check-exploration.cjs`

**Interfaces:**
- Consumes: `Engine`, `CHAPTERS`, `FLOOR`
- Produces: Testes automatizados cobrindo geração, alcance, combate, armas, persistência e rejeição do `eclipse-cache`.

- [ ] **Step 1: Escrever testes do `eclipse-cache` em `tests/cinzas/check-exploration.cjs`**
- [ ] **Step 2: Executar `node tests/cinzas/check-exploration.cjs` para verificar falha esperada (RED)**

---

### Task 2: Configurar o Capítulo 8 e geração de breakable em `levels.js` e `core.js` (GREEN)

**Files:**
- Modify: `public/roguelite/levels.js`
- Modify: `public/roguelite/core.js`

**Interfaces:**
- Produces: Definição de `cacheId`, `cacheName`, `cacheHp`, `cacheHeal`, `cacheRerolls`, `cacheScore` em `CHAPTERS[7]`, instanciação flexível em `levels.js`, partículas arcanas em `core.js`.

- [ ] **Step 1: Atualizar `CHAPTERS[7]` em `public/roguelite/levels.js` com os atributos do `eclipse-cache`**
- [ ] **Step 2: Atualizar a criação de `breakables` em `levels.js` para usar as propriedades do capítulo**
- [ ] **Step 3: Atualizar `damageBreakable` em `core.js` para usar cor e partículas arcanas no `eclipse-cache`**
- [ ] **Step 4: Executar `node tests/cinzas/check-exploration.cjs` para verificar que os testes passam (GREEN)**

---

### Task 3: Atualizar a renderização visual em `renderer.js`

**Files:**
- Modify: `public/roguelite/renderer.js`

**Interfaces:**
- Consumes: `object.id === 'eclipse-cache'`, `object.broken`
- Produces: Visual violeta/ametista/ouro para o relicário intacto e fragmentos temáticos quando quebrado.

- [ ] **Step 1: Atualizar o método `breakables(e)` em `renderer.js` com o estilo das Ruínas do Eclipse**
- [ ] **Step 2: Executar suíte completa de testes de Cinzas e verificar integridade visual**

---

### Task 4: Executar suíte completa de regressão e atualizar documentação

**Files:**
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Executar `npm test` e `node tests/cinzas-upstream.js`**
- [ ] **Step 2: Atualizar o 88º incremento em `docs/RENASCIMENTO.md` e `docs/RENASCIMENTO_CHECKPOINT.md`**
- [ ] **Step 3: Fazer commit e push para `origin/main` de `A-LEI-DO-TRONO-SERVER`**
