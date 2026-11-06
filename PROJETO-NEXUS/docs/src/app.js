import {
  HEROES,
  HERO_BY_ID,
  CLASSES,
  CLASS_BY_ID,
  DEFAULT_TEAMS,
  GUARD,
} from "./data.js";
import {
  createBattle,
  currentUnit,
  getAction,
  canUse,
  legalTargets,
  advantage,
  act,
  chooseAI,
  validateTeam,
} from "./engine.js";
import {
  icon,
  classIcon,
  heroArt,
  crest,
  statusIcon,
  STATUS_LABELS,
} from "./art.js";

const $ = (s) => document.querySelector(s),
  root = $("#app");
const read = () => {
  try {
    const value = JSON.parse(localStorage.getItem("nexus-v1") || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
};
const saved = read();
let teams =
  Array.isArray(saved.teams) &&
  saved.teams.length === 2 &&
  saved.teams.every(validateTeam)
    ? saved.teams
    : DEFAULT_TEAMS.map((t) => [...t]);
let mode = saved.mode === "local" ? "local" : "training",
  difficulty = ["easy", "normal", "hard"].includes(saved.difficulty)
    ? saved.difficulty
    : "normal";
let sound = saved.sound === true,
  reduced =
    typeof saved.reduced === "boolean"
      ? saved.reduced
      : matchMedia("(prefers-reduced-motion: reduce)").matches;
let battle = createBattle(...teams, {
    difficulty: mode === "local" ? "normal" : difficulty,
  }),
  started = false,
  busy = false,
  actionId = "basic",
  targetId = null,
  modal = null,
  draft = null,
  rosterSide = 0,
  filter = "all",
  inspected = HEROES[0].id,
  aiTimer = null,
  toastTimer = null,
  audio = null;
let generation = 0,
  detailMobile = false;
const dialog = document.createElement("dialog");
dialog.id = "overlay";
dialog.setAttribute("aria-label", "Painel do Nexus");
document.body.append(dialog);
const persist = () => {
  try {
    localStorage.setItem(
      "nexus-v1",
      JSON.stringify({ teams, mode, difficulty, sound, reduced }),
    );
  } catch {}
};
const human = () => mode === "local" || currentUnit(battle)?.side === 0;
const hpPercent = (u) => Math.max(0, (u.hp / u.maxHp) * 100);
const heroName = (id) =>
  HERO_BY_ID[battle.units.find((u) => u.id === id)?.heroId]?.name || "Herói";
const smallLabel = (side) =>
  mode === "local"
    ? `Equipe ${side + 1}`
    : side === 0
      ? "Sua equipe"
      : "Equipe rival";
const wait = (ms) =>
  new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 30) : ms));
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3300);
}
function soundEffect(type = "hit") {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const t = audio.currentTime,
      osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = type === "ultimate" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(
      type === "heal"
        ? 480
        : type === "ultimate"
          ? 140
          : type === "select"
            ? 640
            : 280,
      t,
    );
    osc.frequency.exponentialRampToValueAtTime(
      type === "heal" ? 720 : 70,
      t + 0.22,
    );
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      type === "select" ? 0.035 : 0.08,
      t + 0.015,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(t + 0.34);
  } catch {}
}
function chooseDefaultTarget() {
  const actor = currentUnit(battle),
    action = getAction(actor, actionId);
  const targets = legalTargets(battle, actor, action);
  if (!targets.some((u) => u.id === targetId)) targetId = targets[0]?.id;
}
function render() {
  document.documentElement.classList.toggle("reduced-motion", !!reduced);
  document.documentElement.classList.toggle("motion-allowed", !reduced);
  chooseDefaultTarget();
  const actor = currentUnit(battle),
    h = HERO_BY_ID[actor.heroId],
    c = CLASS_BY_ID[h.classId];
  const canAct = started && !busy && battle.phase === "playing" && human();
  root.innerHTML = `
 <header class="topbar"><a class="brand" href="./" aria-label="Nexus, início">${crest()}<span>NEXUS<small>ECOS DO CREPÚSCULO</small></span></a>
  <nav aria-label="Navegação principal"><button class="nav-link active" data-act="battle">${icon("swords")}<span>Batalha</span></button><button class="nav-link" data-act="roster">${icon("people")}<span>Personagens</span><b>24</b></button><button class="nav-link" data-act="classes">${icon("diamond")}<span>Afinidades</span></button></nav>
  <div class="top-tools"><span class="prototype"><i></i> VERSÃO ALPHA <b>0.1</b></span><button class="icon-button" data-act="sound" aria-label="${sound ? "Desativar" : "Ativar"} som" title="${sound ? "Desativar" : "Ativar"} som">${icon(sound ? "volume" : "muted")}</button><button class="icon-button" data-act="help" aria-label="Como jogar" title="Como jogar">${icon("help")}</button></div>
 </header>
 <main class="main-shell">
  <section class="page-heading"><div><div class="eyebrow">O EQUILÍBRIO ESTÁ EM SUAS MÃOS</div><h1>Entre ecos e <em>lendas.</em></h1><p>Três heróis. Seis afinidades. Uma escolha muda tudo.</p></div>
   <button class="mode-button" data-act="mode">${icon(mode === "training" ? "target" : "people")}<span>${mode === "training" ? "Treino tático" : "Duelo local"}<small>${mode === "training" ? "Enfrente a inteligência artificial" : "Duas pessoas · mesmo dispositivo"}</small></span>${icon("chevron")}</button>
  </section>
  <div class="game-grid">
   <aside class="left-column">
    <section class="panel team-panel"><div class="section-label"><span>${icon("people")} ${smallLabel(0)}</span><b>3 / 3</b></div>
     <div class="team-list">${battle.units
       .filter((u) => u.side === 0)
       .map((u) => teamRow(u, actor.id))
       .join("")}</div>
     <button class="outline-button team-edit" data-act="roster">${icon("plus")} Montar equipe ${icon("chevron")}</button>
    </section>
    <section class="panel affinities-panel"><div class="section-label"><span>${icon("diamond")} Afinidades</span><button class="tiny-button" data-act="classes" aria-label="Ver todas as vantagens">${icon("eye")}</button></div>${classWheel(h.classId)}<div class="affinity-note"><span class="gold-dot"></span><strong>+25%</strong> de dano com vantagem</div><button class="text-button" data-act="classes">Conhecer o ciclo ${icon("arrow")}</button></section>
    <div class="world-note">${icon("flag")}<span>EXPEDIÇÃO 01<strong>Ruínas de Asterion</strong><small>Onde a última aurora permanece.</small></span></div>
   </aside>
   <section class="battle-column" aria-label="Batalha 3 contra 3">
    <div class="arena-heading"><span>${icon("swords")} CAMPO DE BATALHA</span><div><i></i> ${mode === "training" ? "COMBATE CONTRA IA" : "DUELO LOCAL"}</div></div>
    <div class="arena ${!started ? "preparing" : ""} ${busy ? "animating" : ""}" id="arena">
     <div class="arena-vignette"></div><div class="arena-dust"></div>
     <div class="location-badge"><span>AS TERRAS FRATURADAS</span><strong>Ruínas de Asterion</strong></div>
     <div class="turn-strip" aria-label="Ordem de iniciativa"><span>ORDEM<br>DE TURNO</span>${battle.order
       .slice(battle.cursor)
       .concat(battle.order.slice(0, battle.cursor))
       .filter((id) => battle.units.find((u) => u.id === id)?.hp > 0)
       .slice(0, 6)
       .map((id, i) => {
         const u = battle.units.find((u) => u.id === id),
           hero = HERO_BY_ID[u.heroId];
         return `<div class="turn-portrait ${i === 0 ? "current" : ""} ${u.side === 1 ? "rival" : ""}" style="--affinity:${CLASS_BY_ID[hero.classId].color}" title="${hero.name} · Velocidade ${u.speed}">${heroArt(hero, true)}${i === 0 ? "<span>AGORA</span>" : ""}</div>`;
       })
       .join(
         "",
       )}<b>${icon("reset")} ${String(battle.round).padStart(2, "0")}</b></div>
     <div class="versus-label">${smallLabel(0)} <span>VS</span> ${smallLabel(1)}</div>
     <div class="fighters">${battle.units.map((u) => fighter(u, actor, canAct)).join("")}</div>
     ${!started ? `<div class="start-banner"><div class="start-copy"><span class="eyebrow">SEU PRÓXIMO CAPÍTULO</span><strong>O Nexus espera por você.</strong><small>Escolha sua formação e desafie o destino.</small></div><button class="gold-button" data-act="start">${icon("swords")} Iniciar combate ${icon("arrow")}</button></div>` : `<div class="arena-caption ${busy ? "thinking" : ""}"><span class="pulse-dot"></span>${battle.phase === "finished" ? "O combate chegou ao fim." : busy ? `${h.name} está agindo…` : !human() ? `${h.name} prepara sua próxima ação…` : `${mode === "local" ? smallLabel(actor.side) + " · " : ""}É a vez de ${h.name}. Escolha uma ação.`}</div>`}
     <div class="arena-bottom"><span>${icon("flag")} ARENA LIVRE</span><span>${battle.round >= 12 ? "FRATURA DO NEXUS <b>·</b> " : ""}3 <i>×</i> 3 <b>·</b> ${mode === "training" ? { easy: "Iniciante", normal: "Normal", hard: "Desafiador" }[difficulty] : "Regras iguais"}</span></div>
    </div>
    <section class="action-panel panel" style="--affinity:${c.color}">
     <div class="active-hero"><div class="active-portrait">${heroArt(h, true)}${classIcon(h.classId)}</div><div><span class="eyebrow">${started ? (human() ? "SUA VEZ" : "VEZ DO RIVAL") : "PRIMEIRO A AGIR"}</span><h2>${h.name}</h2><span>${h.title}</span><div class="active-energy">${icon("bolt")} <b>${actor.energy}</b> / 100 energia</div></div></div>
     <div class="ability-grid">${["basic", "skill", "ultimate", "guard"].map((id, i) => abilityButton(actor, id, i, canAct)).join("")}</div>
     ${targetSelector(actor, canAct)}
     <div class="action-bottom"><span id="action-hint">${icon("help")} ${!started ? "Monte sua equipe ou inicie o combate para jogar." : !human() ? "Aguarde a ação da equipe rival." : getAction(actor, actionId).description}</span>${started && battle.phase === "playing" ? `<button class="execute-button" data-act="execute" ${!canAct ? "disabled" : ""}>${icon(getAction(actor, actionId).kind.startsWith("heal") ? "leaf" : getAction(actor, actionId).kind.startsWith("shield") ? "shield" : "swords")} ${actionId === "guard" ? "Defender" : `Usar em ${heroName(targetId)}`} ${icon("arrow")}</button>` : '<span class="keyboard-hint">TECLAS <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></span>'}</div>
    </section>
   </section>
   <aside class="right-column">
    <section class="panel log-panel"><div class="section-label"><span>${icon("scroll")} Registro</span><span class="live-indicator">AO VIVO</span></div><div class="combat-log" id="combat-log" role="log" aria-label="Registro do combate">${battle.log.length ? battle.log.map(logEntry).join("") : `<div class="log-intro">${icon("diamond")}<span>Todo grande destino<br>começa com uma escolha.</span></div><div class="log-message system"><span class="log-mark">✦</span><p>A arena está pronta.<small>Monte sua equipe e inicie o combate.</small></p></div>`}</div><div class="log-footer"><span class="pulse-dot"></span> ${started ? `${battle.turns} ações realizadas` : "Aguardando os heróis"}</div></section>
    <section class="tip-card"><span class="eyebrow">UM PASSO À FRENTE</span>${icon("spark")}<h3>Conheça seu rival.</h3><p>Uma afinidade favorável pode virar uma batalha. Planeje além do próximo golpe.</p><button class="text-button" data-act="help">Guia de combate ${icon("arrow")}</button></section>
   </aside>
  </div>
  <footer class="page-footer"><span>${crest()} UM UNIVERSO ORIGINAL. SUA PRÓXIMA HISTÓRIA.</span><span>24 heróis disponíveis <i>·</i> Sem progressão ou obtenção definidas</span><button class="text-button" data-act="restart">${icon("reset")} ${started ? "Reiniciar combate" : "Nova preparação"}</button></footer>
 </main>`;
  const log = $("#combat-log");
  if (log) log.scrollTop = log.scrollHeight;
}
function teamRow(u, active) {
  const h = HERO_BY_ID[u.heroId],
    c = CLASS_BY_ID[h.classId];
  return `<button class="team-row ${u.id === active ? "is-active" : ""} ${u.hp <= 0 ? "is-defeated" : ""}" style="--affinity:${c.color}" data-inspect="${h.id}" aria-label="Ver ficha de ${h.name}"><span class="small-portrait">${heroArt(h, true)}</span><span class="team-row-info"><strong>${h.name}${classIcon(h.classId)}</strong><small>${c.name} <i>·</i> ${h.role}</small><span class="health-track"><i style="width:${hpPercent(u)}%"></i></span><span class="row-numbers">${u.hp} <span>/ ${u.maxHp} PV</span>${u.shield ? `<b>+${Math.round(u.shield)} ${icon("shield")}</b>` : ""}</span></span></button>`;
}
function fighter(u, actor, canAct) {
  const h = HERO_BY_ID[u.heroId],
    c = CLASS_BY_ID[h.classId],
    valid = legalTargets(battle, actor, getAction(actor, actionId)).some(
      (t) => t.id === u.id,
    );
  return `<button class="fighter side-${u.side} slot-${u.slot} ${u.id === actor.id ? "acting" : ""} ${u.id === targetId && started ? "targeted" : ""} ${u.hp <= 0 ? "fallen" : ""} ${valid && canAct ? "can-target" : ""}" style="--affinity:${c.color};--delay:${(h.index % 4) * 0.38}s" data-unit="${u.id}" aria-label="${h.name}, ${c.name}, ${u.hp} de ${u.maxHp} de vida${valid && canAct ? ", selecionar alvo" : ""}" ${u.hp <= 0 ? "disabled" : ""}>
 <span class="fighter-tag">${classIcon(h.classId)}<strong>${h.name}</strong>${u.shield ? `<b>${icon("shield")}</b>` : ""}<span class="fighter-health"><i style="width:${hpPercent(u)}%"></i></span><small>${u.hp} / ${u.maxHp}</small></span>
 <span class="unit-status">${u.statuses.map((s) => `<span title="${STATUS_LABELS[s.type]} · ${Math.max(1, s.turns)} turno(s)">${statusIcon(s.type)}</span>`).join("")}${u.guarding ? `<span title="Postura defensiva">${icon("shield")}</span>` : ""}</span>
 <span class="ground-shadow"></span><span class="selection-ring"></span><span class="fighter-sprite">${heroArt(h)}</span><span class="target-prompt">${u.side === actor.side ? "ALIADO" : "ALVO"} ${icon("target")}</span>
 </button>`;
}
function abilityButton(actor, id, i, canAct) {
  const a = getAction(actor, id),
    h = HERO_BY_ID[actor.heroId],
    available = canUse(actor, id);
  let reason =
    actor.cooldowns[id] > 0
      ? `${actor.cooldowns[id]} turno(s) de recarga`
      : actor.energy < a.cost
        ? `Requer ${a.cost} de energia`
        : a.description;
  return `<button class="ability-button ${actionId === id ? "selected" : ""} ${id === "ultimate" ? "ultimate" : ""}" data-action="${id}" ${!canAct || !available ? "disabled" : ""} title="${reason}" aria-label="${i + 1}: ${a.name}. ${reason}" aria-pressed="${actionId === id}"><span class="ability-top"><kbd>${i + 1}</kbd><span>${id === "basic" ? "+24" : id === "guard" ? "+25" : a.cost} ${icon("bolt")}</span></span><span class="ability-icon">${icon(id === "basic" ? "swords" : id === "guard" ? "shield" : id === "ultimate" ? "crown" : CLASS_BY_ID[h.classId].icon)}</span><strong>${id === "basic" ? "Ataque básico" : id === "skill" ? "Técnica" : id === "ultimate" ? "Supremo" : "Defesa"}</strong><small>${id === "guard" ? "Postura defensiva" : a.name}</small>${actor.cooldowns[id] > 0 ? `<span class="cooldown-label">${actor.cooldowns[id]}T</span>` : ""}</button>`;
}
function classWheel(selected) {
  return `<div class="class-wheel"><svg viewBox="0 0 200 185" class="wheel-orbit" aria-hidden="true"><circle cx="100" cy="92" r="65" fill="none" stroke="#37332f" stroke-width="1" stroke-dasharray="3 5"/><path d="m112 28-7-3 2 8m53 35 4 6 2-8m-7 58-4 7 8-1m-67 26 7 3-2-8m-53-35-4-6-2 8m7-58 4-7-8 1" fill="none" stroke="#ad8c5e" stroke-width="1.5"/></svg><div class="wheel-center">${crest()}<small>NEXUS</small></div>${CLASSES.map((c, i) => `<button data-class="${c.id}" class="wheel-node ${selected === c.id ? "selected" : ""}" style="--i:${i};--affinity:${c.color}" title="${c.name} supera ${CLASS_BY_ID[CLASS_BY_ID[c.id].strongAgainst].name}" aria-label="Entender classe ${c.name}">${classIcon(c.id)}<span>${c.name}</span></button>`).join("")}</div>`;
}
function targetSelector(actor, enabled) {
  if (!started || battle.phase !== "playing") return "";
  const action = getAction(actor, actionId);
  const friendly =
    action.kind.startsWith("heal") ||
    action.kind.startsWith("shield") ||
    action.kind === "guard";
  const targets = legalTargets(battle, actor, action);
  return `<div class="target-selector" aria-label="Selecionar alvo"><span>${icon("target")} ${friendly ? "ALIADO" : "ALVO"}</span>${targets
    .map((u) => {
      const hero = HERO_BY_ID[u.heroId];
      const mult = friendly
        ? 1
        : advantage(HERO_BY_ID[actor.heroId].classId, hero.classId);
      return `<button data-target="${u.id}" class="${targetId === u.id ? "selected" : ""}" ${!enabled ? "disabled" : ""} aria-pressed="${targetId === u.id}" title="${hero.name} · ${u.hp}/${u.maxHp} PV${mult > 1 ? " · vantagem +25%" : mult < 1 ? " · desvantagem −15%" : ""}">${classIcon(hero.classId)} ${hero.name} ${mult > 1 ? "<b>+25%</b>" : mult < 1 ? "<small>−15%</small>" : ""}</button>`;
    })
    .join("")}</div>`;
}
function logEntry(e) {
  if (e.type === "fracture")
    return `<div class="log-message fracture"><span class="log-mark">${icon("diamond")}</span><p>A <em>Fratura do Nexus</em> causou <b>${e.amount}</b> de dano a <strong>${heroName(e.target)}</strong>.<time>RODADA ${String(e.round).padStart(2, "0")}</time></p></div>`;
  const name = heroName(e.actor),
    target = heroName(e.target);
  const message =
    e.type === "action"
      ? `<strong>${name}</strong> usou <em>${e.name}</em>.`
      : e.type === "damage"
        ? `<strong>${target}</strong> recebeu <b>${e.amount}</b> de dano.${e.advantage > 1 ? '<small class="advantage-text">Vantagem de afinidade</small>' : ""}${e.critical ? "<small>Acerto crítico!</small>" : ""}${e.absorbed ? `<small>${e.absorbed} absorvidos pela barreira.</small>` : ""}`
        : e.type === "heal"
          ? `<strong>${target}</strong> recuperou <b>${e.amount}</b> PV.`
          : e.type === "shield" || e.type === "guard"
            ? `<strong>${target}</strong> recebeu uma barreira.`
            : e.type === "defeated"
              ? `<strong>${target}</strong> deixou o combate.`
              : e.type === "burn"
                ? `Queimadura causou <b>${e.amount}</b> de dano a <strong>${target}</strong>.`
                : "";
  return `<div class="log-message ${e.type}"><span class="log-mark">${icon(e.type === "action" ? "swords" : e.type === "heal" ? "leaf" : e.type === "defeated" ? "skull" : e.type === "burn" ? "flame" : e.type === "shield" || e.type === "guard" ? "shield" : "bolt")}</span><p>${message}<time>RODADA ${String(e.round).padStart(2, "0")}</time></p></div>`;
}

function resetBattle() {
  generation++;
  clearTimeout(aiTimer);
  battle = createBattle(...teams, {
    difficulty: mode === "local" ? "normal" : difficulty,
    seed: Date.now() >>> 0,
  });
  started = false;
  busy = false;
  actionId = "basic";
  targetId = null;
  render();
}
function queueAI() {
  clearTimeout(aiTimer);
  if (started && !busy && battle.phase === "playing" && !human())
    aiTimer = setTimeout(
      () => {
        if (!modal && !busy) {
          const move = chooseAI(battle);
          if (move) void perform(move.actionId, move.targetId);
        } else queueAI();
      },
      reduced ? 180 : 950,
    );
}
async function perform(id = actionId, target = targetId) {
  if (!started || busy || battle.phase !== "playing" || modal) return;
  const actor = currentUnit(battle);
  if (!canUse(actor, id)) return;
  const turnGeneration = generation;
  busy = true;
  render();
  const oldHero = HERO_BY_ID[actor.heroId];
  let result;
  try {
    result = act(battle, id, target);
    await animateAction(result, oldHero, id);
  } catch (e) {
    notify(e.message);
  } finally {
    if (generation !== turnGeneration) return;
    busy = false;
    actionId = "basic";
    targetId = null;
    render();
    if (battle.phase === "finished") {
      await wait(450);
      openDialog("result");
    } else queueAI();
  }
}
async function animateAction(result, hero, id) {
  const arena = $("#arena"),
    actor = $(`[data-unit="${result.actor}"]`),
    color = CLASS_BY_ID[hero.classId].color;
  soundEffect(
    id === "ultimate"
      ? "ultimate"
      : result.events.some((e) => e.type === "heal")
        ? "heal"
        : "hit",
  );
  actor?.classList.add("is-attacking");
  arena?.classList.add(`fx-${hero.animation}`);
  if (id === "ultimate") arena?.classList.add("ultimate-cast");
  const name = document.createElement("div");
  name.className = "cast-name";
  name.style.setProperty("--affinity", color);
  name.innerHTML = `<span>${id === "ultimate" ? "GOLPE SUPREMO" : hero.name.toUpperCase()}</span><strong>${getAction({ heroId: hero.id }, id).name}</strong>`;
  arena.append(name);
  const origin = actor?.getBoundingClientRect();
  await wait(240);
  for (const event of result.events) {
    const node = $(`[data-unit="${event.target}"]`);
    if (!node || event.type === "defeated") continue;
    const r = node.getBoundingClientRect(),
      x = r.x + r.width * 0.5,
      y = r.y + r.height * 0.48;
    const fx = document.createElement("div");
    fx.className = `hit-effect animation-${hero.animation} ${id === "ultimate" ? "big-hit" : ""} effect-${event.type}`;
    fx.style.cssText = `left:${x}px;top:${y}px;--affinity:${color};--variant:${hero.index}`;
    const count = 8 + (hero.index % 5);
    fx.innerHTML = `<span class="impact-core"></span><span class="impact-ring"></span>${Array.from({ length: count }, (_, i) => `<i style="--angle:${(i * 360) / count + hero.index * 17}deg;--travel:${45 + (i % 3) * 22}px;--particle-delay:${(i % 3) * 30}ms"></i>`).join("")}<span class="signature">${icon(hero.weapon === "bow" ? "arrow" : hero.weapon === "hammer" ? "shield" : hero.weapon === "staff" ? "spark" : hero.weapon === "orb" ? CLASS_BY_ID[hero.classId].icon : hero.weapon === "gauntlet" ? "bolt" : "swords")}</span>`;
    $("#effects").append(fx);
    if (
      origin &&
      event.type === "damage" &&
      hero.weapon !== "hammer" &&
      hero.weapon !== "gauntlet"
    ) {
      const projectile = document.createElement("span");
      projectile.className = `projectile projectile-${hero.animation}`;
      const ox = origin.x + origin.width * 0.5,
        oy = origin.y + origin.height * 0.5;
      projectile.style.cssText = `left:${ox}px;top:${oy}px;--dx:${x - ox}px;--dy:${y - oy}px;--affinity:${color};`;
      $("#effects").append(projectile);
      setTimeout(() => projectile.remove(), 700);
    }
    setTimeout(
      () => {
        node.classList.add(event.type === "damage" ? "is-hit" : "is-blessed");
        const pop = document.createElement("span");
        pop.className = `damage-number number-${event.type}`;
        pop.style.cssText = `left:${x}px;top:${y - 25}px;`;
        pop.innerHTML = `${event.type === "heal" ? "+" : event.type === "shield" || event.type === "guard" ? "◈ " : ""}${event.amount}${event.critical ? "<small>CRÍTICO</small>" : event.advantage > 1 ? "<small>VANTAGEM</small>" : ""}`;
        $("#effects").append(pop);
        setTimeout(() => pop.remove(), 1400);
      },
      reduced ? 0 : 160,
    );
    setTimeout(() => fx.remove(), 1400);
  }
  await wait(id === "ultimate" ? 1250 : 950);
  name.remove();
  actor?.classList.remove("is-attacking");
  arena?.classList.remove(`fx-${hero.animation}`, "ultimate-cast");
}
function openDialog(type) {
  if (busy && type !== "help") {
    notify("Aguarde a animação terminar.");
    return;
  }
  modal = type;
  if (type === "roster") {
    draft = teams.map((t) => [...t]);
    filter = "all";
    rosterSide = 0;
    detailMobile = false;
  }
  renderDialog();
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  modal = null;
  dialog.close();
  queueAI();
}
dialog.addEventListener("cancel", () => {
  modal = null;
  queueAI();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
function dialogHeader(label, title, subtitle = "") {
  return `<div class="dialog-header"><div><span class="eyebrow">${label}</span><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><button class="icon-button" data-act="close" aria-label="Fechar painel">${icon("close")}</button></div>`;
}
function renderDialog() {
  dialog.className = `dialog-${modal}`;
  if (modal === "roster") dialog.innerHTML = rosterDialog();
  if (modal === "classes")
    dialog.innerHTML =
      dialogHeader(
        "SEIS CAMINHOS. UM EQUILÍBRIO.",
        "O ciclo de afinidades",
        "A classe faz parte de cada herói. Conhecer suas relações é tão importante quanto o poder do golpe.",
      ) +
      `<div class="classes-content"><div class="large-wheel">${classWheel(inspected && HERO_BY_ID[inspected] ? HERO_BY_ID[inspected].classId : "igneo")}</div><div class="class-guide-grid">${CLASSES.map((c) => `<article style="--affinity:${c.color}">${classIcon(c.id)}<h3>${c.name}</h3><p>${c.description}</p><div>Supera <strong>${CLASS_BY_ID[CLASS_BY_ID[c.id].strongAgainst].name}</strong> ${icon("arrow")} <b>+25%</b></div><small>Resistência ao ataque de ${CLASS_BY_ID[CLASS_BY_ID[c.id].strongAgainst].name}: −15% de dano recebido.</small></article>`).join("")}</div></div><div class="dialog-footnote">${icon("help")} Afinidades sem relação direta causam dano neutro. A classe é permanente e não muda durante o combate.</div>`;
  if (modal === "help")
    dialog.innerHTML =
      dialogHeader(
        "SEU PRIMEIRO PASSO NO NEXUS",
        "Toda lenda começa aqui.",
        "Combate por turnos, escolhas com consequências e uma equipe inteiramente sua.",
      ) +
      `<div class="help-grid"><article><span>01</span>${icon("people")}<h3>Forme seu trio</h3><p>Escolha 3 dos 24 heróis. Combine atacantes, guardiões e suportes. Todos estão disponíveis neste protótipo.</p></article><article><span>02</span>${icon("reset")}<h3>Leia a iniciativa</h3><p>A velocidade define a ordem de cada rodada. Cada herói vivo realiza uma ação. Vença ao derrotar os três rivais.</p></article><article><span>03</span>${icon("bolt")}<h3>Gerencie a energia</h3><p>Todos começam com 40 de energia. Ataques recuperam 24; defesa, 25. Técnicas custam 30 e supremas, 80.</p></article><article><span>04</span>${icon("target")}<h3>Escolha seu alvo</h3><p>Selecione uma ação, clique no herói ou no seu nome no painel e confirme em “Usar em”. Curas e barreiras escolhem aliados.</p></article></div><div class="help-extra"><div><h3>Mais do que dano</h3><p>Queimadura tira 6,5% da vida máxima por turno; regeneração cura 7%. Exposição reduz a defesa em 25%; enfraquecimento reduz o ataque em 20%. Efeitos duram 2 turnos do alvo. Sombrio rouba 25% do dano causado. Arcano ignora 25% da defesa.</p><p>Defesa reduz o dano recebido em 35% até seu próximo turno. Barreiras absorvem dano e acumulam até 60% da vida máxima. Técnicas recarregam por 2 turnos pessoais. A partir da rodada 12, a Fratura do Nexus causa dano direto antes do turno de cada herói: 4% da vida máxima, mais 2,5 pontos percentuais por rodada, até 85%. Barreiras não absorvem esse desgaste. Críticos têm 10% de chance e causam +40% de dano.</p></div><div><h3>No seu ritmo</h3><label class="setting-toggle"><input type="checkbox" id="motion-setting" ${reduced ? "checked" : ""}> Reduzir animações</label><label class="setting-toggle"><input type="checkbox" id="sound-setting" ${sound ? "checked" : ""}> Efeitos sonoros</label><p><kbd>1</kbd>–<kbd>4</kbd> escolher ação<br><kbd>←</kbd> <kbd>→</kbd> alternar alvo<br><kbd>Enter</kbd> confirmar ação<br><kbd>Esc</kbd> fechar painel</p></div></div><button class="gold-button help-start" data-act="close">Entendi. Vamos ao combate. ${icon("arrow")}</button>`;
  if (modal === "mode")
    dialog.innerHTML =
      dialogHeader(
        "ESCOLHA SUA EXPERIÊNCIA",
        "Como você quer jogar?",
        "Alterar o modo inicia uma nova preparação com as suas equipes atuais.",
      ) +
      `<div class="mode-options"><button data-mode="training" class="mode-option ${mode === "training" ? "selected" : ""}">${icon("target")}<h3>Treino tático</h3><p>Experimente combinações e enfrente uma equipe controlada pela IA.</p><span>1 JOGADOR ${icon("arrow")}</span></button><button data-mode="local" class="mode-option ${mode === "local" ? "selected" : ""}">${icon("people")}<h3>Duelo local</h3><p>Dois jogadores escolhem seus trios e alternam as ações no mesmo dispositivo.</p><span>2 JOGADORES ${icon("arrow")}</span></button></div><div class="difficulty-setting"><label for="difficulty-select">Dificuldade da IA</label><select id="difficulty-select"><option value="easy" ${difficulty === "easy" ? "selected" : ""}>Iniciante</option><option value="normal" ${difficulty === "normal" ? "selected" : ""}>Normal</option><option value="hard" ${difficulty === "hard" ? "selected" : ""}>Desafiador</option></select><small>Afeta vida e ataque da IA. No duelo local, os atributos são sempre iguais.</small></div>`;
  if (modal === "restart")
    dialog.innerHTML =
      dialogHeader(
        "UMA NOVA CHANCE",
        "Recomeçar a batalha?",
        "O combate atual será encerrado. Sua formação será preservada.",
      ) +
      `<div class="confirm-actions"><button class="outline-button" data-act="close">Continuar batalha</button><button class="gold-button" data-act="confirm-restart">${icon("reset")} Recomeçar</button></div>`;
  if (modal === "result") {
    const win = battle.winner === 0 || mode === "local",
      winning = battle.units.filter((u) => u.side === battle.winner),
      total = winning.reduce((n, u) => n + u.stats.damage, 0);
    dialog.innerHTML = `<button class="icon-button result-close" data-act="close" aria-label="Fechar resultado">${icon("close")}</button><div class="result-crest">${icon(win ? "crown" : "shield")}</div><span class="eyebrow">${mode === "local" ? smallLabel(battle.winner).toUpperCase() + " VENCEU" : "O NEXUS GUARDA SUA HISTÓRIA"}</span><h2>${win ? "Vitória." : "Um novo aprendizado."}</h2><p>${win ? "Uma formação. Muitas possibilidades. Esta foi a sua conquista." : "Até as maiores lendas precisam de um novo começo. Experimente outras afinidades."}</p><div class="winning-team">${winning.map((u) => `<div>${heroArt(HERO_BY_ID[u.heroId])}<span>${HERO_BY_ID[u.heroId].name}</span></div>`).join("")}</div><div class="result-stats"><span><b>${battle.round}</b> rodadas</span><span><b>${battle.turns}</b> ações</span><span><b>${total.toLocaleString("pt-BR")}</b> dano direto da equipe</span></div><div class="result-actions"><button class="outline-button" data-act="roster">${icon("people")} Mudar formação</button><button class="gold-button" data-act="play-again">Jogar novamente ${icon("arrow")}</button></div>`;
  }
}
function rosterDialog() {
  const h = HERO_BY_ID[inspected] || HEROES[0],
    c = CLASS_BY_ID[h.classId];
  return (
    dialogHeader(
      "O PODER ESTÁ NA COMBINAÇÃO",
      "Encontre a sua formação.",
      "24 histórias originais. Seis afinidades. Escolha os três heróis da sua próxima batalha.",
    ) +
    `
 <div class="formation-bar"><div class="formation-tabs"><button data-roster-side="0" class="${rosterSide === 0 ? "active" : ""}">${smallLabel(0)}</button><button data-roster-side="1" class="${rosterSide === 1 ? "active" : ""}">${smallLabel(1)}</button></div><div class="formation-slots">${Array.from(
   { length: 3 },
   (_, i) => {
     const hero = HERO_BY_ID[draft[rosterSide][i]];
     return hero
       ? `<button data-remove="${hero.id}" title="Remover ${hero.name}"><span>${heroArt(hero, true)}</span>${classIcon(hero.classId)}<strong>${hero.name}</strong>${icon("close")}</button>`
       : `<span class="empty-slot">${icon("plus")} Escolha um herói</span>`;
   },
 ).join(
   "",
 )}</div><b class="formation-count">${draft[rosterSide].length}<span> / 3</span></b></div>
 <div class="roster-content ${detailMobile ? "show-mobile-detail" : ""}"><div class="roster-library"><div class="class-filters" role="group" aria-label="Filtrar personagens por afinidade"><button data-filter="all" class="${filter === "all" ? "selected" : ""}">Todos <b>24</b></button>${CLASSES.map((cl) => `<button data-filter="${cl.id}" class="${filter === cl.id ? "selected" : ""}" style="--affinity:${cl.color}">${classIcon(cl.id)}${cl.name}</button>`).join("")}</div><button class="mobile-detail-open" data-act="mobile-detail">${icon("eye")} Ver ficha de ${h.name} ${icon("arrow")}</button><div class="hero-grid">${HEROES.filter(
   (hero) => filter === "all" || hero.classId === filter,
 )
   .map((hero) => {
     const selected = draft[rosterSide].includes(hero.id),
       cl = CLASS_BY_ID[hero.classId];
     return `<button class="hero-card ${selected ? "chosen" : ""} ${inspected === hero.id ? "inspected" : ""}" data-hero="${hero.id}" style="--affinity:${cl.color};--class-bg:${cl.soft}" aria-label="${selected ? "Remover" : "Escolher"} ${hero.name}, ${cl.name}, ${hero.role}" aria-pressed="${selected}"><div class="card-art">${heroArt(hero)}<span class="card-class">${classIcon(hero.classId)}</span>${selected ? `<span class="chosen-mark">${icon("check")}</span>` : ""}<span class="card-add">${icon(selected ? "close" : "plus")}</span></div><div class="card-copy"><strong>${hero.name}</strong><span>${hero.role}</span></div></button>`;
   })
   .join("")}</div></div>
 <aside class="hero-detail" style="--affinity:${c.color}"><button class="mobile-detail-back" data-act="mobile-detail">${icon("arrow")} Voltar aos personagens</button><div class="detail-art">${heroArt(h)}</div><span class="detail-class">${classIcon(h.classId)} ${c.name} <i>·</i> ${h.role}</span><h3>${h.name}</h3><span class="detail-title">${h.title}</span><p class="hero-lore">${h.lore}</p><div class="hero-stats">${[
   ["Vida", h.hp, 1500],
   ["Ataque", h.attack, 220],
   ["Defesa", h.defense, 150],
   ["Velocidade", h.speed, 120],
 ]
   .map(
     ([label, value, max]) =>
       `<div><span>${label}<b>${value}</b></span><i><em style="width:${(value / max) * 100}%"></em></i></div>`,
   )
   .join(
     "",
   )}</div><div class="detail-skills">${[h.basic, h.skill, h.ultimate].map((a, i) => `<div><span>${icon(i === 0 ? "swords" : i === 2 ? "crown" : c.icon)}</span><p><strong>${a.name}</strong><small>${a.description}</small></p></div>`).join("")}</div></aside></div>
 <div class="roster-footer"><p>${icon("help")} Clique para adicionar ou remover. ${draft[rosterSide].length === 3 ? "Para trocar um herói, remova um dos selecionados." : "Escolha mais " + (3 - draft[rosterSide].length) + " herói(s)."}${started ? "<small>Aplicar uma formação reinicia o combate atual.</small>" : ""}</p><button class="gold-button" data-act="save-team" ${!draft.every(validateTeam) ? "disabled" : ""}>${icon("check")} ${started ? "Aplicar e reiniciar" : "Confirmar formação"} ${icon("arrow")}</button></div>`
  );
}

document.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.act) {
    const a = button.dataset.act;
    if (a === "close") {
      closeDialog();
      return;
    }
    if (a === "mobile-detail") {
      detailMobile = !detailMobile;
      renderDialog();
      return;
    }
    if (a === "sound") {
      sound = !sound;
      persist();
      soundEffect("select");
      render();
      return;
    }
    if (a === "battle") {
      window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
      return;
    }
    if (a === "roster" || a === "classes" || a === "help" || a === "mode") {
      openDialog(a);
      return;
    }
    if (a === "start") {
      started = true;
      actionId = "basic";
      render();
      soundEffect("select");
      queueAI();
      return;
    }
    if (a === "execute") {
      if (human()) void perform();
      return;
    }
    if (a === "restart") {
      if (started) openDialog("restart");
      else {
        resetBattle();
        notify("Uma nova preparação. As equipes estão prontas.");
      }
      return;
    }
    if (a === "confirm-restart" || a === "play-again") {
      closeDialog();
      resetBattle();
      if (a === "play-again") {
        started = true;
        render();
        queueAI();
      }
      return;
    }
    if (a === "save-team") {
      if (!draft.every(validateTeam)) return;
      teams = draft.map((t) => [...t]);
      persist();
      closeDialog();
      resetBattle();
      notify("Formação confirmada. Sua próxima história começa agora.");
      return;
    }
  }
  if (button.dataset.inspect) {
    inspected = button.dataset.inspect;
    openDialog("roster");
    return;
  }
  if (button.dataset.class) {
    openDialog("classes");
    return;
  }
  if (button.dataset.mode) {
    mode = button.dataset.mode;
    persist();
    closeDialog();
    resetBattle();
    notify(
      mode === "local"
        ? "Duelo local: cada pessoa controla sua equipe."
        : "Treino tático: a IA controla a equipe rival.",
    );
    return;
  }
  if (button.dataset.rosterSide) {
    rosterSide = Number(button.dataset.rosterSide);
    renderDialog();
    return;
  }
  if (button.dataset.filter) {
    filter = button.dataset.filter;
    renderDialog();
    return;
  }
  if (button.dataset.remove) {
    draft[rosterSide] = draft[rosterSide].filter(
      (id) => id !== button.dataset.remove,
    );
    renderDialog();
    return;
  }
  if (button.dataset.hero) {
    const id = button.dataset.hero;
    inspected = id;
    if (draft[rosterSide].includes(id))
      draft[rosterSide] = draft[rosterSide].filter((h) => h !== id);
    else if (draft[rosterSide].length < 3) draft[rosterSide].push(id);
    else
      notify("Ficha aberta. Remova um herói da formação para adicionar outro.");
    renderDialog();
    return;
  }
  if (button.dataset.action) {
    actionId = button.dataset.action;
    targetId = null;
    chooseDefaultTarget();
    soundEffect("select");
    render();
    return;
  }
  if (button.dataset.target) {
    if (!started || busy || !human() || battle.phase !== "playing") return;
    const actor = currentUnit(battle);
    if (
      legalTargets(battle, actor, getAction(actor, actionId)).some(
        (u) => u.id === button.dataset.target,
      )
    ) {
      targetId = button.dataset.target;
      soundEffect("select");
      render();
    }
    return;
  }
  if (button.dataset.unit) {
    const actor = currentUnit(battle);
    if (!started) {
      notify("Inicie o combate para selecionar um alvo.");
      return;
    }
    if (busy || !human() || battle.phase !== "playing") return;
    if (
      legalTargets(battle, actor, getAction(actor, actionId)).some(
        (u) => u.id === button.dataset.unit,
      )
    ) {
      targetId = button.dataset.unit;
      soundEffect("select");
      render();
    } else
      notify(
        "Essa ação precisa de " +
          (getAction(actor, actionId).kind.startsWith("heal") ||
          getAction(actor, actionId).kind.startsWith("shield")
            ? "um aliado."
            : "um rival."),
      );
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "motion-setting") {
    reduced = e.target.checked;
    persist();
    document.documentElement.classList.toggle("reduced-motion", reduced);
    document.documentElement.classList.toggle("motion-allowed", !reduced);
  }
  if (e.target.id === "sound-setting") {
    sound = e.target.checked;
    persist();
    soundEffect("select");
    render();
  }
  if (e.target.id === "difficulty-select") {
    difficulty = e.target.value;
    persist();
    if (!started) resetBattle();
    notify("Dificuldade aplicada à próxima batalha.");
  }
});
document.addEventListener("keydown", (e) => {
  if (
    modal ||
    e.target.matches("input,select,textarea") ||
    !started ||
    busy ||
    !human() ||
    battle.phase !== "playing"
  )
    return;
  const actor = currentUnit(battle);
  if (["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    const id = ["basic", "skill", "ultimate", "guard"][Number(e.key) - 1];
    if (canUse(actor, id)) {
      actionId = id;
      targetId = null;
      render();
    }
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const targets = legalTargets(battle, actor, getAction(actor, actionId)),
      i = targets.findIndex((u) => u.id === targetId);
    targetId =
      targets[
        (i + (e.key === "ArrowRight" ? 1 : targets.length - 1)) % targets.length
      ].id;
    render();
  }
  if (e.key === "Enter" && !e.target.closest("button")) {
    e.preventDefault();
    void perform();
  }
});
render();
