# Atalaia: Guardião das Raízes — Matilha Ancestral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diferenciar a segunda fase do Guardião das raízes (chefe da Onda 6 da Crônica do Atalaia) com convocação única de matilha de dois lobos velozes ao cruzar 50% de vida, completando a diferenciação dos cinco chefes da Crônica, com contrajogo por controle/desaceleração, persistência compatível e comunicação no HUD.

**Architecture:** Introduzir a constante `ROOT_GUARDIAN` em `catalog.gd`, métodos de consulta `root_guardian()` e despacho de escolta `_call_root_escorts()` em `run.gd`, e atualização de apresentação/toast em `main.gd`. Todo o estado reutiliza o campo `enraged` já gravado na transição de fase, mantendo o schema de save sem alterações.

**Tech Stack:** Godot 4.6.3 / GDScript, Node.js (testes de integração/regressão).

**Spec:** [docs/RENASCIMENTO.md](file:///home/antigravity/JonathaPereira/A-LEI-DO-TRONO-SERVER/docs/RENASCIMENTO.md) item de expansão de chefes e elites da Crônica.

## Global Constraints

- Compatibilidade com formato 1 de save: nenhum campo novo obrigatório em save.
- Preservar integridade de jogos existentes, modo clássico e sobrevivência.
- TDD estrito com execução headless no Godot 4.6.3 (`artifacts/godot-tools/editor/Godot_v4.6.3-stable_linux.x86_64`).

## Review Focus

1. Dano letal direto que reduz a vida do Guardião de >50% para 0 não pode desovar os lobos de escolta.
2. Dano em área (Morteiro, Lança-chamas, Tesla) que dispara a transição de fase não pode causar dano no mesmo frame aos lobos recém-nascidos.
3. Save/restore de partida em andamento na 2ª fase preserva os lobos sem convocações duplicadas.
4. Saves antigos já com `enraged: true` mantêm o estado sem surpresas ao recarregar.
5. Modos Clássico e Sobrevivência não recebem a convocação da Crônica.

---

### Task 1: Criar a suíte de testes de reprodução e contrato do Guardião das Raízes

**Files:**
- Create: `games/atalaia/tests/root_guardian.gd`

**Interfaces:**
- Consumes: `Run.new(seed, "chronicle")`, `Main.instantiate()`, `catalog.gd`
- Produces: Relatório de verificação de testes automatizados com código de saída 0 para sucesso e 1 para falhas.

- [ ] **Step 1: Escrever teste em `games/atalaia/tests/root_guardian.gd`**
- [ ] **Step 2: Executar no Godot headless para confirmar falha esperada (RED)**
- [ ] **Step 3: Verificar que a falha decorre da ausência da convocação dos lobos**

---

### Task 2: Implementar constante, consulta e combate do Guardião das Raízes

**Files:**
- Modify: `games/atalaia/scripts/catalog.gd`
- Modify: `games/atalaia/scripts/run.gd`

**Interfaces:**
- Produces: `C.ROOT_GUARDIAN`, `run.root_guardian() -> Dictionary`, `run._call_root_escorts(boss: Dictionary)`

- [ ] **Step 1: Adicionar `C.ROOT_GUARDIAN` em `catalog.gd`**
- [ ] **Step 2: Adicionar `root_guardian()` e `_call_root_escorts()` em `run.gd`**
- [ ] **Step 3: Chamar `_call_root_escorts()` na transição de fase em `run.damage()`**
- [ ] **Step 4: Executar `root_guardian.gd` para verificar que a lógica de combate passa (GREEN)**

---

### Task 3: Integrar apresentação e comunicação na UI

**Files:**
- Modify: `games/atalaia/scripts/main.gd`

**Interfaces:**
- Produces: Tooltip contextual no `phase_label` na preparação da onda 6 e toast de `boss_phase`.

- [ ] **Step 1: Adicionar tooltip explicativo do Guardião em `main.gd` na preparação**
- [ ] **Step 2: Adicionar toast específico de fase do Guardião em `main.gd`**
- [ ] **Step 3: Executar `root_guardian.gd` completo para verificar UI e regras**

---

### Task 4: Validação de Regressões, Documentação e Sincronização

**Files:**
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Executar todas as suítes de Atalaia (`verify.gd`, `runtime_verify.gd`, `chronicle.gd`, `root_guardian.gd`, `root_matriarch.gd`, `citadel_sentinel.gd`, `slag_ward.gd`, `crown_pulse.gd`)**
- [ ] **Step 2: Executar testes de integração core do repositório (`node tests/atalaia.cjs`)**
- [ ] **Step 3: Atualizar documentação dona (`docs/RENASCIMENTO.md` registrando o 87º incremento e marcando checklist de elites completo)**
- [ ] **Step 4: Commit e push para `origin/main`**
