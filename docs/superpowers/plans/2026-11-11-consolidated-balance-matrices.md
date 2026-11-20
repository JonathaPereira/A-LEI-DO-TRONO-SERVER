# Consolidated Balance Matrices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete, audit, and assert full cross-system balance matrices covering weapons, towers, heroes, skills, bosses, and economy/experience across the games, fulfilling Section 28 of the original directive and the corresponding Renascimento checklist item.

**Architecture:** Create an automated, comprehensive balance matrix test suite (`tests/check-balance-matrices.cjs`) that parses, cross-audits, and mathematically validates parameter consistency, progression scaling, cost-efficiency ratios, and stat bounds across all six required domains without visual/DOM overhead.

**Tech Stack:** Node.js, CommonJS, `public/roguelite/core.js`, `public/roguelite/levels.js`, `games/atalaia/scripts/catalog.gd`, `PROJETO-NEXUS/src/kits.js`, `PROJETO-NEXUS/src/balance.json`.

**Spec:** `docs/RENASCIMENTO_DIRETRIZ_ORIGINAL.txt` Section 28 ("Balanceamento verificável") and `docs/RENASCIMENTO.md` checklist item `- [ ] Completar matrizes de armas, torretas, heróis, habilidades, chefes, economia e experiência.`.

## Global Constraints
- Read-only access to `PROJETO-NEXUS` (Nexus remains strictly paused for modifications).
- All new code and tests committed directly inside `A-LEI-DO-TRONO-SERVER`.
- Fast, deterministic execution (<= 2 seconds) suitable for regular test runners.
- Strict numeric validity: no `NaN`, `null`, `undefined`, negative values, or zero-division hazards.

## Review Focus
1. Weapons Matrix: Nominal damages, cadence, ranges, and DPS ratios across 4 base weapons and 4 legacy variants in Cinzas.
2. Towers Matrix: 12 Atalaia towers (6 base + 6 advanced), cost tiers (70–168), DPS, DPS-per-gold efficiency, range, and family tags.
3. Heroes Matrix: 24 Nexus heroes across 4 classes with stat bounds (HP, attack, defense, speed) and power coefficients, plus Cinzas Peregrino difficulty tiers and Atalaia crystal cores.
4. Skills Matrix: Cinzas 4 specials/2 runes, Atalaia 12 cards, and Nexus basic/skill/ultimate powers.
5. Bosses & Enemies Matrix: Cinzas 10 monsters + 5 biome bosses; Atalaia 12 enemies + 5 chronicle bosses with second phase triggers.
6. Economy & Experience Matrix: Cinzas relic milestones, breakables healing/rerolls, and horde scaling; Atalaia gold bounties, tower purchase costs, and shop reroll inflation.

---

### Task 1: Implement Unified Balance Matrices Suite

**Files:**
- Create: `tests/check-balance-matrices.cjs`
- Modify: `tests/suites.json`
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Write `tests/check-balance-matrices.cjs` with assertions for all 6 domains**
- [ ] **Step 2: Run `node tests/check-balance-matrices.cjs` to verify 100% pass**
- [ ] **Step 3: Register `tests/check-balance-matrices.cjs` in `tests/suites.json`**
- [ ] **Step 4: Run full test runner (`node scripts/test.cjs --filter balance` and `npm run format:check && npm run typecheck`)**
- [ ] **Step 5: Update `docs/RENASCIMENTO.md` checklist and increment log**
- [ ] **Step 6: Update `docs/RENASCIMENTO_CHECKPOINT.md`**
- [ ] **Step 7: Commit and push to `origin/main`**
