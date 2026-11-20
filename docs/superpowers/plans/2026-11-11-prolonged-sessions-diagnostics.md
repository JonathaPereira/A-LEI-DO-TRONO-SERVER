# Prolonged Sessions Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated verification for prolonged gameplay sessions, measuring simulated FPS headroom, memory heap stability across 50+ restarts/transitions, and state isolation in Cinzas do Abismo and Atalaia.

**Architecture:** Create an automated diagnostic test suite (`tests/check-prolonged-sessions.cjs`) running prolonged simulation loops (3,600+ continuous frames at 60fps), 50 consecutive restart/reset transitions, and memory heap delta checks, proving absence of memory leaks and strict state isolation.

**Tech Stack:** Node.js, CommonJS, `public/roguelite/core.js`, `src/lib/games/atalaia.ts`.

**Spec:** `docs/RENASCIMENTO.md` checklist item `- [ ] Medir FPS, memória, reinicialização e transições em sessões prolongadas.`.

## Global Constraints
- Fast execution under 3 seconds in Node.js headless environment.
- Strict numeric validity: memory heap growth bounded under 15MB across 50 full cycles.
- Frame step timing under 0.25ms/frame (simulated rate > 4,000 FPS).
- Zero modifications to Project Nexus.

## Review Focus
1. Frame timing headroom: 3,600 consecutive engine frames execute within tight millisecond budgets without garbage collection spikes.
2. Memory leak resistance: 50 consecutive run reboots in Cinzas and 50 lifecycle transitions in Atalaia exhibit bounded heap deltas.
3. State contamination prevention: Variables, timers, particles, and listeners reset to pristine initial state on each run restart.
4. Transition recovery: Checkpoint saves and restores withstand repeated reloads without data corruption or memory bloating.

---

### Task 1: Create Prolonged Sessions Diagnostic Suite

**Files:**
- Create: `tests/check-prolonged-sessions.cjs`
- Modify: `tests/suites.json`
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Write `tests/check-prolonged-sessions.cjs` with 4 comprehensive diagnostics**
- [ ] **Step 2: Run `node tests/check-prolonged-sessions.cjs` to verify 100% pass**
- [ ] **Step 3: Register `tests/check-prolonged-sessions.cjs` in `tests/suites.json`**
- [ ] **Step 4: Run full test runner (`node scripts/test.cjs --filter session` and `npm run format:check && npm run typecheck`)**
- [ ] **Step 5: Update `docs/RENASCIMENTO.md` checklist and increment log**
- [ ] **Step 6: Update `docs/RENASCIMENTO_CHECKPOINT.md`**
- [ ] **Step 7: Commit and push to `origin/main`**
