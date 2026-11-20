# Atalaia: Matriarca das Raízes — Convocação de Ninhada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diferenciar a segunda fase da Matriarca das raízes (chefe da Onda 12 da Crônica do Atalaia) com convocação única de uma ninhada de duas tecelãs ao cruzar 50% de vida, integrando contrajogo em área, persistência compatível e comunicação clara no HUD.

**Architecture:** Introduzir a constante de dados `MATRIARCH_BROOD` em `catalog.gd`, métodos de consulta e despacho de escolta em `run.gd`, e atualização de apresentação/toast em `main.gd`. Todo o estado reutiliza o campo `enraged` já existente, preservando o schema de save sem migração forçada.

**Tech Stack:** Godot 4.6.3 / GDScript, Node.js (testes de integração/regressão).

**Spec:** [docs/RENASCIMENTO.md](file:///home/antigravity/JonathaPereira/A-LEI-DO-TRONO-SERVER/docs/RENASCIMENTO.md) item de expansão de chefes e elites da Crônica.

## Global Constraints

- Compatibilidade com formato 1 de save: nenhum campo novo obrigatório em save.
- Preservar integridade de jogos existentes, modo clássico e sobrevivência.
- TDD estrito com execução headless no Godot 4.6.3 (`artifacts/godot-tools/editor/Godot_v4.6.3-stable_linux.x86_64`).

## Review Focus

1. Dano letal direto que reduz a vida da Matriarca de >50% para 0 não pode desovar a ninhada pós-morte.
2. Dano em área (Morteiro, Lança-chamas, Tesla) que dispara a transição de fase não pode causar dano no mesmo frame às recém-nascidas.
3. Save/restore de partida em andamento na 2ª fase não pode invocar duplicatas ao carregar ou no acerto seguinte.
4. Saves antigos já com `enraged: true` não recebem reforços surpresa na recarga.
5. Modos Clássico e Sobrevivência não recebem a convocação da Crônica.

---

### Task 1: Criar a suíte de testes de reprodução e contrato da Matriarca das Raízes

**Files:**
- Create: `games/atalaia/tests/root_matriarch.gd`

**Interfaces:**
- Consumes: `Run.new(seed, "chronicle")`, `Main.instantiate()`, `catalog.gd`
- Produces: Relatório de verificação de testes automatizados com código de saída 0 para sucesso e 1 para falhas.

- [ ] **Step 1: Write the failing test in `games/atalaia/tests/root_matriarch.gd`**
- [ ] **Step 2: Run test with Godot headless to verify it fails**
- [ ] **Step 3: Verify the failure reason is missing `matriarch_brood`**

---

### Task 2: Implementar constante e métodos de catálogo e combate

**Files:**
- Modify: `games/atalaia/scripts/catalog.gd:7-8`
- Modify: `games/atalaia/scripts/run.gd:83-86` e `run.gd:308-312`

**Interfaces:**
- Produces: `C.MATRIARCH_BROOD`, `run.matriarch_brood() -> Dictionary`, `run._call_matriarch_escorts(boss: Dictionary)`

- [ ] **Step 1: Implement `C.MATRIARCH_BROOD` in `games/atalaia/scripts/catalog.gd`**
- [ ] **Step 2: Implement `matriarch_brood()` and `_call_matriarch_escorts()` in `games/atalaia/scripts/run.gd`**
- [ ] **Step 3: Connect invocation in `run.damage()` upon boss entering second phase**
- [ ] **Step 4: Run `root_matriarch.gd` to verify rules pass**

---

### Task 3: Integrar apresentação e comunicação na UI

**Files:**
- Modify: `games/atalaia/scripts/main.gd:289-291` e `main.gd:502-504`

**Interfaces:**
- Produces: Tooltip contextual no `phase_label` na preparação e mensagem de toast no evento `boss_phase`.

- [ ] **Step 1: Adicionar tooltip explicativo da Matriarca em `main.gd` na preparação**
- [ ] **Step 2: Adicionar toast específico de fase da Matriarca em `main.gd`**
- [ ] **Step 3: Executar `root_matriarch.gd` completo para verificar UI e regras**

---

### Task 4: Validação de Regressões, Documentação e Sincronização

**Files:**
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Executar todas as suítes de Atalaia (`verify.gd`, `runtime_verify.gd`, `chronicle.gd`, `root_matriarch.gd`, `slag_ward.gd`, `crown_pulse.gd`)**
- [ ] **Step 2: Executar testes de integração core do repositório (`node tests/atalaia.cjs`)**
- [ ] **Step 3: Atualizar documentação dona (`docs/RENASCIMENTO.md` com o 85º incremento e checklist)**
- [ ] **Step 4: Commit e push para `origin/main`**
