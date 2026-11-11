# Cinzas do Abismo: Campaign and Horde Reproducible Balance Playtests Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive reproducible balance playtests for both Campaign and Horde modes in Cinzas do Abismo, validating win rates, TTK, enemy spawn pacing, and tuning curves across all 5 tiers.

**Architecture:** Extend and create reproducible simulated duel/playtest runners in Node.js executing the headless `Engine` at 60fps across deterministic seeds, weapon classes, legacy variants, and tactical AI policies (`close`, `space`, `kiting`), asserting balanced survivability and progression bounds.

**Tech Stack:** Node.js, JavaScript (CommonJS), `public/roguelite/core.js`, `public/roguelite/levels.js`.

**Spec:** `docs/RENASCIMENTO.md` checklist item `- [ ] Rebalancear campanha/Horda por cenários reproduzíveis e playtests.`.

## Global Constraints
- Pure JavaScript and deterministic PRNG seeds; zero visual/DOM dependencies.
- No modifications to existing game mechanics unless a balance degeneration is discovered.
- Fast execution suitable for CI/local verification (all simulations complete within a few seconds).
- Strict adherence to repository rules and English commit conventions.

## Review Focus
1. Horde wave scaling curves: HP, damage, interval, and spawn counts scale smoothly across waves 1 to 20 without exponential explosion.
2. Boss survivability: All 5 campaign boss encounters remain winnable with realistic representative builds.
3. Horde tier playability: Tiers 1-5 (waves 1, 5, 10, 15, 20) tested under automated bots show bounded clear times and non-degenerative kill rates.
4. Variant equity: Legacy weapon variants (ash_blade, echo_bow, rift_hammer, frost_staff) exhibit viable completion rates comparable to base weapons.
5. Entity caps: Simultaneous enemies never exceed the horde tuning cap (`simultaneous <= 14`), preventing performance collapse.

---

### Task 1: Create Comprehensive Reproducible Balance Suite

**Files:**
- Create: `tests/cinzas/check-balance-matrix.cjs`
- Modify: `tests/cinzas/check-balance.cjs`
- Modify: `tests/cinzas-upstream.js`

- [ ] **Step 1: Write test runner with Campaign and Horde scenarios in `tests/cinzas/check-balance-matrix.cjs`**
- [ ] **Step 2: Run test to verify it executes and measures reproducible scenarios**
- [ ] **Step 3: Add assertions for win rate ranges, TTK bounds, and scaling curves**
- [ ] **Step 4: Integrate into `tests/cinzas-upstream.js` or standalone regression test**
- [ ] **Step 5: Run full test pipeline (`npm run format:check && npm run typecheck && node scripts/test.cjs --filter cinzas`)**
- [ ] **Step 6: Update `docs/RENASCIMENTO.md` and `docs/RENASCIMENTO_CHECKPOINT.md`**
- [ ] **Step 7: Commit and push**
