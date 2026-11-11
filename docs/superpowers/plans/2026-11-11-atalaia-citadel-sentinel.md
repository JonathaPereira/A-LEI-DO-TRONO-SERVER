# Atalaia: Sentinela da Cidadela — Couraça Rúnica e Escolta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diferenciar a segunda fase da Sentinela da cidadela (chefe da Onda 18 da Crônica do Atalaia) com convocação única de escolta de golem e blindagem de armadura rúnica reforçada ao cruzar 50% de vida, integrando contrajogo por perfuração e dano contínuo, persistência compatível e comunicação no HUD.

**Architecture:** Introduzir a constante `CITADEL_SENTINEL` em `catalog.gd`, métodos de consulta `citadel_sentinel()`, despacho de escolta `_call_citadel_escorts()` e armadura dinâmica `enemy_armor()` em `run.gd`, e atualização de apresentação/toast em `main.gd`. Todo o estado reutiliza o campo `enraged` existente, sem alteração de schema.

**Tech Stack:** Godot 4.6.3 / GDScript, Node.js (testes de integração/regressão).

**Spec:** [docs/RENASCIMENTO.md](file:///home/antigravity/JonathaPereira/A-LEI-DO-TRONO-SERVER/docs/RENASCIMENTO.md) item de expansão de chefes e elites da Crônica.

## Global Constraints

- Formato 1 de save intacto: nenhum campo novo obrigatório em save.
- Preservar integridade de jogos existentes, modo clássico e sobrevivência.
- TDD estrito com execução headless no Godot 4.6.3 (`artifacts/godot-tools/editor/Godot_v4.6.3-stable_linux.x86_64`).

## Review Focus

1. Dano letal direto que reduz a vida da Sentinela de >50% para 0 não pode desovar o golem de escolta.
2. Dano de impacto (Morteiro, Lança-chamas, Tesla) que dispara a transição de fase não pode causar dano no mesmo frame ao golem recém-nascido.
3. Save/restore de partida em andamento na 2ª fase preserva a armadura reforçada e o golem sem convocações duplicadas.
4. Armadura reforçada é superada integralmente por dano perfurante (`ignore_armor == true`, Metal do abismo, Arpão do Abismo) e dano contínuo (DoT de fogo e veneno).
5. Modos Clássico e Sobrevivência não recebem a convocação ou armadura rúnica bônus da Crônica.

---

### Task 1: Criar a suíte de testes de reprodução e contrato da Sentinela da Cidadela

**Files:**
- Create: `games/atalaia/tests/citadel_sentinel.gd`

**Interfaces:**
- Consumes: `Run.new(seed, "chronicle")`, `Main.instantiate()`, `catalog.gd`
- Produces: Relatório de verificação de testes automatizados com código de saída 0 para sucesso e 1 para falhas.

- [ ] **Step 1: Escrever teste em `games/atalaia/tests/citadel_sentinel.gd`**
- [ ] **Step 2: Executar no Godot headless para confirmar falha esperada (RED)**
- [ ] **Step 3: Verificar que a falha decorre da ausência do comportamento da Sentinela**

---

### Task 2: Implementar constante, consulta e combate da Sentinela da Cidadela

**Files:**
- Modify: `games/atalaia/scripts/catalog.gd`
- Modify: `games/atalaia/scripts/run.gd`

**Interfaces:**
- Produces: `C.CITADEL_SENTINEL`, `run.citadel_sentinel() -> Dictionary`, `run._call_citadel_escorts(boss: Dictionary)`, `run.enemy_armor(e: Dictionary) -> float`

- [ ] **Step 1: Adicionar `C.CITADEL_SENTINEL` em `catalog.gd`**
- [ ] **Step 2: Adicionar `citadel_sentinel()`, `_call_citadel_escorts()` e `enemy_armor()` em `run.gd`**
- [ ] **Step 3: Chamar `_call_citadel_escorts()` e usar `enemy_armor()` em `run.damage()`**
- [ ] **Step 4: Executar `citadel_sentinel.gd` para verificar que a lógica de combate passa (GREEN)**

---

### Task 3: Integrar apresentação e comunicação na UI

**Files:**
- Modify: `games/atalaia/scripts/main.gd`

**Interfaces:**
- Produces: Tooltip contextual no `phase_label` na preparação da onda 18 e toast de `boss_phase`.

- [ ] **Step 1: Adicionar tooltip explicativo da Sentinela em `main.gd` na preparação**
- [ ] **Step 2: Adicionar toast específico de fase da Sentinela em `main.gd`**
- [ ] **Step 3: Executar `citadel_sentinel.gd` completo para verificar UI e regras**

---

### Task 4: Validação de Regressões, Documentação e Sincronização

**Files:**
- Modify: `docs/RENASCIMENTO.md`
- Modify: `docs/RENASCIMENTO_CHECKPOINT.md`

- [ ] **Step 1: Executar todas as suítes de Atalaia (`verify.gd`, `runtime_verify.gd`, `chronicle.gd`, `root_matriarch.gd`, `citadel_sentinel.gd`, `slag_ward.gd`, `crown_pulse.gd`)**
- [ ] **Step 2: Executar testes de integração core do repositório (`node tests/atalaia.cjs`)**
- [ ] **Step 3: Atualizar documentação dona (`docs/RENASCIMENTO.md` registrando o 86º incremento e checklist)**
- [ ] **Step 4: Commit e push para `origin/main`**
