import { HERO_BY_ID, CLASS_BY_ID, GUARD } from "./data.js";
export function advantage(from, to) {
  const c = CLASS_BY_ID[from];
  if (!c || !CLASS_BY_ID[to]) throw Error("Afinidade desconhecida.");
  return c.strongAgainst === to ? 1.25 : c.weakAgainst === to ? 0.85 : 1;
}
export function validateTeam(ids) {
  return (
    Array.isArray(ids) &&
    ids.length === 3 &&
    new Set(ids).size === 3 &&
    ids.every((id) => Object.hasOwn(HERO_BY_ID, id))
  );
}
export function createBattle(
  team1,
  team2,
  { difficulty = "normal", seed = 73 } = {},
) {
  if (!validateTeam(team1) || !validateTeam(team2))
    throw Error("Cada equipe precisa de três personagens diferentes.");
  if (!["normal", "easy", "hard"].includes(difficulty))
    throw Error("Dificuldade inválida.");
  const units = [team1, team2].flatMap((ids, side) =>
    ids.map((heroId, slot) => {
      const hero = HERO_BY_ID[heroId],
        scale =
          side === 1 ? { easy: 0.82, normal: 1, hard: 1.15 }[difficulty] : 1;
      return {
        id: `${side}-${heroId}`,
        heroId,
        side,
        slot,
        hp: Math.round(hero.hp * scale),
        maxHp: Math.round(hero.hp * scale),
        attack: Math.round(hero.attack * scale),
        defense: hero.defense,
        speed: hero.speed,
        energy: 40,
        shield: 0,
        guarding: false,
        statuses: [],
        cooldowns: {},
        stats: { damage: 0, healing: 0, actions: 0 },
      };
    }),
  );
  const state = {
    units,
    order: [],
    cursor: 0,
    round: 1,
    phase: "playing",
    winner: null,
    log: [],
    random: seed >>> 0,
    turns: 0,
  };
  state.order = turnOrder(state);
  beginTurn(state);
  return state;
}
function turnOrder(state) {
  return state.units
    .filter((u) => u.hp > 0)
    .sort((a, b) => b.speed - a.speed || a.side - b.side || a.slot - b.slot)
    .map((u) => u.id);
}
export function currentUnit(state) {
  return state.units.find((u) => u.id === state.order[state.cursor]);
}
export function getAction(unit, id) {
  const hero = HERO_BY_ID[unit.heroId];
  return id === "guard" ? GUARD : hero[id];
}
export function canUse(unit, id) {
  const a = getAction(unit, id);
  return (
    !!a && unit.hp > 0 && unit.energy >= a.cost && !(unit.cooldowns[id] > 0)
  );
}
export function legalTargets(state, actor, action) {
  if (action.kind === "guard") return [actor];
  const friendly =
    action.kind.startsWith("heal") || action.kind.startsWith("shield");
  return state.units.filter(
    (u) => u.hp > 0 && u.side === (friendly ? actor.side : 1 - actor.side),
  );
}
function random(state) {
  state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0;
  return state.random / 4294967296;
}
function log(state, event) {
  state.log.push({ round: state.round, ...event });
  if (state.log.length > 100) state.log.shift();
}
function checkVictory(state) {
  for (const side of [0, 1])
    if (!state.units.some((u) => u.side === side && u.hp > 0)) {
      state.phase = "finished";
      state.winner = 1 - side;
      return true;
    }
  return false;
}
function heal(target, amount) {
  const n = Math.min(target.maxHp - target.hp, Math.round(amount));
  target.hp += n;
  return n;
}
function addStatus(target, type) {
  if (type === "cleanse") {
    target.statuses = target.statuses.filter((s) => s.type === "regen");
    return;
  }
  const s = target.statuses.find((s) => s.type === type);
  if (s) s.turns = 2;
  else target.statuses.push({ type, turns: 2 });
}
function beginTurn(state) {
  // At most six dead units can be encountered; rounds are rebuilt from survivors.
  while (state.phase === "playing") {
    if (state.cursor >= state.order.length) {
      state.round++;
      state.cursor = 0;
      state.order = turnOrder(state);
    }
    const actor = currentUnit(state);
    if (!actor || actor.hp <= 0) {
      state.cursor++;
      continue;
    }
    actor.guarding = false;
    for (const id of Object.keys(actor.cooldowns))
      actor.cooldowns[id] = Math.max(0, actor.cooldowns[id] - 1);
    // A public, increasing hazard prevents permanent healing/barrier stalemates.
    // It bypasses barriers and is resolved before regeneration, never reviving a casualty.
    if (state.round >= 12) {
      const amount = Math.min(
        actor.hp,
        Math.ceil(
          actor.maxHp * Math.min(0.85, 0.04 + (state.round - 12) * 0.025),
        ),
      );
      actor.hp -= amount;
      log(state, {
        type: "fracture",
        actor: actor.id,
        target: actor.id,
        amount,
      });
      if (actor.hp <= 0)
        log(state, { type: "defeated", actor: actor.id, target: actor.id });
    }
    for (const s of actor.statuses) {
      if (actor.hp <= 0) break;
      if (s.type === "burn") {
        const n = Math.min(actor.hp, Math.round(actor.maxHp * 0.065));
        actor.hp -= n;
        log(state, {
          type: "burn",
          actor: actor.id,
          target: actor.id,
          amount: n,
        });
        if (actor.hp <= 0) {
          log(state, { type: "defeated", actor: actor.id, target: actor.id });
          break;
        }
      }
      if (s.type === "regen") {
        const n = heal(actor, actor.maxHp * 0.07);
        log(state, {
          type: "heal",
          actor: actor.id,
          target: actor.id,
          amount: n,
          passive: true,
        });
      }
      s.turns--;
    }
    // Stat effects last through the affected actor's action, including their last turn.
    actor.statuses = actor.statuses.filter((s) => s.turns >= 0);
    if (checkVictory(state)) return;
    if (actor.hp <= 0) {
      state.cursor++;
      continue;
    }
    return;
  }
}
export function act(state, actionId, targetId) {
  if (state.phase !== "playing") throw Error("A batalha terminou.");
  const actor = currentUnit(state);
  if (!canUse(actor, actionId))
    throw Error("Ação indisponível: energia ou recarga.");
  const action = getAction(actor, actionId),
    targets = legalTargets(state, actor, action);
  const selected = targets.find((t) => t.id === targetId);
  if (!selected) throw Error("Escolha um alvo válido.");
  const events = [],
    hero = HERO_BY_ID[actor.heroId];
  actor.energy -= action.cost;
  actor.stats.actions++;
  state.turns++;
  if (action.cooldown) actor.cooldowns[actionId] = action.cooldown + 1;
  log(state, { type: "action", actor: actor.id, name: action.name, actionId });
  if (action.kind === "guard") {
    actor.guarding = true;
    const beforeShield = actor.shield;
    actor.shield = Math.min(
      Math.round(actor.maxHp * 0.6),
      actor.shield + Math.round(actor.maxHp * 0.12),
    );
    actor.energy = Math.min(100, actor.energy + 25);
    events.push({
      type: "guard",
      target: actor.id,
      amount: actor.shield - beforeShield,
    });
    log(state, { ...events.at(-1), actor: actor.id });
  } else {
    const all = ["aoe", "healAll", "shieldAll"].includes(action.kind);
    for (const target of all ? targets : [selected]) {
      let event;
      if (action.kind.startsWith("heal")) {
        const n = heal(target, target.maxHp * action.power);
        actor.stats.healing += n;
        event = { type: "heal", target: target.id, amount: n };
      } else if (action.kind.startsWith("shield")) {
        const n = Math.round(target.maxHp * action.power),
          before = target.shield;
        target.shield = Math.min(Math.round(target.maxHp * 0.6), before + n);
        event = {
          type: "shield",
          target: target.id,
          amount: target.shield - before,
        };
      } else {
        const weak = actor.statuses.some((s) => s.type === "weaken") ? 0.8 : 1,
          exposed = target.statuses.some((s) => s.type === "expose") ? 0.75 : 1;
        const defense =
            target.defense * exposed * (hero.classId === "arcano" ? 0.75 : 1),
          multiplier = advantage(
            hero.classId,
            HERO_BY_ID[target.heroId].classId,
          ),
          critical = random(state) < 0.1;
        const total = Math.max(
          1,
          Math.round(
            actor.attack *
              weak *
              action.power *
              (100 / (100 + defense * 0.5)) *
              multiplier *
              (target.guarding ? 0.65 : 1) *
              (critical ? 1.4 : 1),
          ),
        );
        const absorbed = Math.min(target.shield, total);
        target.shield -= absorbed;
        const dealt = Math.min(target.hp, total - absorbed);
        target.hp -= dealt;
        actor.stats.damage += dealt;
        event = {
          type: "damage",
          target: target.id,
          amount: dealt,
          absorbed,
          advantage: multiplier,
          critical,
        };
        if (hero.classId === "sombrio" && dealt) {
          const n = heal(actor, dealt * 0.25);
          if (n) {
            events.push({
              type: "heal",
              target: actor.id,
              amount: n,
              passive: true,
            });
            actor.stats.healing += n;
          }
        }
      }
      if (actionId !== "basic" && target.hp > 0 && action.effect)
        addStatus(target, action.effect);
      events.push(event);
      log(state, { ...event, actor: actor.id });
      if (target.hp === 0) {
        events.push({ type: "defeated", target: target.id });
        log(state, { type: "defeated", actor: actor.id, target: target.id });
      }
    }
    if (actionId === "basic") actor.energy = Math.min(100, actor.energy + 24);
  }
  // Remove expired effects after they influenced the actor's last affected action.
  actor.statuses = actor.statuses.filter((s) => s.turns > 0);
  if (!checkVictory(state)) {
    state.cursor++;
    beginTurn(state);
  }
  return {
    actor: actor.id,
    heroId: actor.heroId,
    actionId,
    animation: hero.animation,
    events,
  };
}
export function chooseAI(state) {
  const actor = currentUnit(state);
  if (!actor || state.phase !== "playing") return null;
  const hero = HERO_BY_ID[actor.heroId];
  const candidates = ["ultimate", "skill", "basic"].filter((id) =>
    canUse(actor, id),
  );
  for (const id of candidates) {
    const action = getAction(actor, id),
      targets = legalTargets(state, actor, action);
    if (action.kind.startsWith("heal")) {
      const sorted = [...targets].sort(
        (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
      );
      if (sorted[0].hp / sorted[0].maxHp < 0.72)
        return { actionId: id, targetId: sorted[0].id };
      continue;
    }
    if (action.kind.startsWith("shield")) {
      const t = targets.find((u) => u.shield < u.maxHp * 0.12);
      if (t && state.round > 1) return { actionId: id, targetId: t.id };
      continue;
    }
    const target = [...targets].sort(
      (a, b) =>
        (a.hp + a.shield) /
          advantage(hero.classId, HERO_BY_ID[a.heroId].classId) -
        (b.hp + b.shield) /
          advantage(hero.classId, HERO_BY_ID[b.heroId].classId),
    )[0];
    return { actionId: id, targetId: target.id };
  }
  return { actionId: "guard", targetId: actor.id };
}
