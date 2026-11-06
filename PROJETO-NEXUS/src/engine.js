import { HERO_BY_ID, CLASS_BY_ID, GUARD } from "./data.js";
// Shared formula parameters; hero-specific stats/powers live in kits.js.
// Godot reads a generated copy. See godot/BALANCING.md before changing rules.
import RULES from "./balance.json" with { type: "json" };
export { RULES };
const FRACTURE_HEALING_PERCENT = RULES.fracture.healingReductionPerRound * 100;
export function advantage(from, to) {
  const c = CLASS_BY_ID[from];
  if (!c || !CLASS_BY_ID[to]) throw Error("Afinidade desconhecida.");
  return c.strongAgainst === to ? RULES.affinity.advantageMultiplier : c.weakAgainst === to ? RULES.affinity.resistanceMultiplier : RULES.affinity.neutralMultiplier;
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
          side === 1 ? RULES.difficulty.enemyStatMultiplier[difficulty] : 1;
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
        energy: RULES.energy.initial,
        shield: 0,
        shieldTurns: 0,
        shieldLayers: [],
        guarding: false,
        statuses: [],
        cooldowns: {},
        stats: { damage: 0, healing: 0, actions: 0, shieldDamage: 0, shieldGranted: 0, protected: 0, energyGiven: 0, combos: 0, shieldAbsorbed: 0 },
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
  // The first tank in formation protects the opening without forcing targets.
  for (const side of [0, 1]) {
    const guardian = units.find(u => u.side === side && HERO_BY_ID[u.heroId].role === 'Tanque');
    if (guardian) for (const ally of units.filter(u => u.side === side && u !== guardian))
      addStatus(ally, 'cover', guardian.id, RULES.tankProtection.openingTurns);
  }
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
export const POSITIVE = ['regen','empower','fortify','cover','mirror','riposte','taunt','emberguard','sentinel','elementalWard'];
export function friendly(action) { return /^(heal|shield|support)/.test(action.kind); }
export function legalTargets(state, actor, action) {
  if (action.kind === 'guard' || action.self) return [actor];
  let targets = state.units.filter(u => u.hp > 0 && u.side === (friendly(action) ? actor.side : 1 - actor.side));
  if (action.effect === 'cover') targets = targets.filter(u => u.id !== actor.id);
  if (action.kind === 'damage') {
    const taunting = targets.filter(u => u.statuses.some(s => s.type === 'taunt'));
    if (taunting.length) targets = taunting;
  }
  return targets;
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
export function healingMultiplier(state, target) {
  const fracture = Math.max(0, 1 - Math.max(0, state.round - (RULES.fracture.startRound - 1)) * RULES.fracture.healingReductionPerRound);
  return fracture * (has(target, 'bleed') ? RULES.status.bleedHealingMultiplier : 1);
}
function heal(state, target, amount, metadata = {}) {
  const multiplier = healingMultiplier(state, target);
  const n = target.hp > 0 ? Math.min(target.maxHp - target.hp, Math.round(amount * multiplier)) : 0;
  target.hp += n;
  return {type:'heal',target:target.id,amount:n,healingPenalty:Math.round((1-multiplier)*100),...metadata};
}
function addStatus(target, type, owner = null, duration = RULES.status.durationTurns) {
  if (type === "cleanse") {
    target.statuses = target.statuses.filter((s) => POSITIVE.includes(s.type));
    return;
  }
  const s = target.statuses.find((s) => s.type === type);
  if (s) { s.turns = duration; if (["cover","darkmark"].includes(type)) s.owner = owner; }
  else target.statuses.push(["cover","darkmark"].includes(type) ? { type, turns: duration, owner } : { type, turns: duration });
}
function beginTurn(state, turnEvents = []) {
  // At most six dead units can be encountered; rounds are rebuilt from survivors.
  while (state.phase === "playing") {
    if (state.cursor >= state.order.length) {
      state.round++;
      state.cursor = 0;
      state.order = turnOrder(state);
      for (const unit of state.units) {
        const before = unit.shield;
        normalizeShields(unit, state.round - 1);
        unit.shieldLayers = unit.shieldLayers.filter(layer => layer.expiresRound > state.round);
        syncShields(unit, state.round);
        if (before > unit.shield) {
          const event = {type:'shieldExpired',actor:unit.id,target:unit.id,amount:before-unit.shield,shieldAfter:unit.shield,hpAfter:unit.hp};
          log(state,event); turnEvents.push(event);
        }
      }
    }
    const actor = currentUnit(state);
    if (!actor || actor.hp <= 0) {
      state.cursor++;
      continue;
    }
    actor.guarding = false;
    const report = (event, recipient = actor) => {
      const detail = { ...event, hpAfter: recipient.hp, shieldAfter: recipient.shield };
      log(state, detail);
      turnEvents.push(detail);
    };
    for (const id of Object.keys(actor.cooldowns))
      actor.cooldowns[id] = Math.max(0, actor.cooldowns[id] - 1);
    // A public, increasing hazard prevents permanent healing/barrier stalemates.
    // It bypasses barriers and is resolved before regeneration, never reviving a casualty.
    if (state.round >= RULES.fracture.startRound) {
      const amount = Math.min(
        actor.hp,
        Math.ceil(
          actor.maxHp * Math.min(RULES.fracture.maxHpRatioCap, RULES.fracture.initialMaxHpRatio + (state.round - RULES.fracture.startRound) * RULES.fracture.perRoundMaxHpRatio),
        ),
      );
      actor.hp -= amount;
      report({
        type: "fracture",
        actor: actor.id,
        target: actor.id,
        amount,
        healingPenalty: Math.min(100, (state.round - (RULES.fracture.startRound - 1)) * FRACTURE_HEALING_PERCENT),
      });
      if (actor.hp <= 0)
        report({ type: "defeated", actor: actor.id, target: actor.id });
    }
    for (const s of actor.statuses) {
      if (actor.hp <= 0) break;
      if (s.turns <= 0) continue;
      if (["burn","bleed","darkmark"].includes(s.type)) {
        const n = Math.min(actor.hp, Math.round(actor.maxHp * ({burn:RULES.status.burnMaxHpRatio,bleed:RULES.status.bleedMaxHpRatio,darkmark:RULES.status.darkmarkMaxHpRatio}[s.type])));
        actor.hp -= n;
        report({
          type: s.type,
          actor: actor.id,
          target: actor.id,
          amount: n,
          remaining: s.turns - 1,
        });
        if (s.type === "darkmark") {
          const owner = state.units.find(u => u.id === s.owner && u.hp > 0 && u.side !== actor.side);
          if (owner) {
            const receipt = heal(state,owner,n*RULES.status.darkmarkDrainRatio,{actor:owner.id,passive:true,source:"darkmark"});
            owner.stats.healing += receipt.amount; owner.stats.damage += n;
            report(receipt,owner);
          }
        }
        if (actor.hp <= 0) {
          report({ type: "defeated", actor: actor.id, target: actor.id });
          break;
        }
      }
      if (s.type === "regen") {
        report({
          ...heal(state, actor, actor.maxHp * RULES.status.regenMaxHpRatio),
          actor: actor.id,
          passive: true,
          remaining: s.turns - 1,
        });
      }
      s.turns--;
    }
    // Stat effects last through the affected actor's action, including their last turn.
    actor.statuses = actor.statuses.filter((s) => s.turns > 0 ||
      (s.turns === 0 && !["burn", "bleed", "darkmark", "regen"].includes(s.type)));
    if (checkVictory(state)) return;
    if (actor.hp <= 0) {
      state.cursor++;
      continue;
    }
    return;
  }
}
function has(unit, type) { return unit.statuses.some(s => s.type === type); }
function matchingStatus(unit, config = {}) { return (config.statuses || [config.status]).find(type => has(unit,type)) || ''; }
function remove(unit, type) { unit.statuses = unit.statuses.filter(s => s.type !== type); }
// Independent round-based layers, capped in total. Oldest layers absorb first.
export const SHIELD_CAP = RULES.shield.maxHpRatio;
function normalizeShields(unit, round) {
  unit.shieldLayers ||= [];
  if (!unit.shield) unit.shieldLayers = [];
  else if (!unit.shieldLayers.length) unit.shieldLayers.push({amount:unit.shield,expiresRound:round+(unit.shieldTurns || RULES.shield.durationRounds)});
}
function syncShields(unit, round) {
  unit.shield = unit.shieldLayers.reduce((n,l)=>n+l.amount,0);
  unit.shieldTurns = unit.shieldLayers.reduce((n,l)=>Math.max(n,l.expiresRound-round),0);
}
function shield(unit, power, round) {
  normalizeShields(unit,round);
  const before = unit.shield;
  const grant = Math.max(0,Math.min(Math.round(unit.maxHp * SHIELD_CAP)-before,Math.round(unit.maxHp * power)));
  if (grant) unit.shieldLayers.push({amount:grant,expiresRound:round+RULES.shield.durationRounds});
  syncShields(unit,round);
  return {type:'shield',target:unit.id,amount:grant,shieldBefore:before,shieldAfter:unit.shield,shieldTurns:unit.shieldTurns};
}
function hit(target, total, pierce = 0, metadata = {}) {
  const before = target.shield;
  const absorbed = Math.min(before, total - Math.round(total * pierce));
  target.shield -= absorbed;
  let remaining = absorbed;
  for (const layer of target.shieldLayers || []) { const n = Math.min(layer.amount,remaining); layer.amount -= n; remaining -= n; }
  target.shieldLayers = (target.shieldLayers || []).filter(l=>l.amount>0);
  if (target.shield === 0) target.shieldTurns = 0;
  target.stats.shieldAbsorbed += absorbed;
  const amount = Math.min(target.hp, total - absorbed);
  target.hp -= amount;
  return {type:'damage',target:target.id,amount,absorbed,advantage:1,critical:false,total,shieldBefore:before,shieldAfter:target.shield,hpAfter:target.hp,...metadata};
}
export function act(state, actionId, targetId, criticalOverride = null) {
  if (state.phase !== 'playing') throw Error('A batalha terminou.');
  const actor = currentUnit(state);
  if (!canUse(actor, actionId)) throw Error('Ação indisponível: energia ou recarga.');
  const action = getAction(actor, actionId), targets = legalTargets(state, actor, action);
  const selected = targets.find(t => t.id === targetId);
  if (!selected) throw Error('Escolha um alvo válido.');
  const hero = HERO_BY_ID[actor.heroId], events = [];
  const emit = event => { events.push(event); log(state,{...event,actor:actor.id}); };
  actor.energy -= action.cost;
  actor.stats.actions++; state.turns++;
  if (action.cooldown) actor.cooldowns[actionId] = action.cooldown + 1;
  log(state,{type:'action',actor:actor.id,name:action.name,actionId});
  const recipients = ['aoe','healAll','shieldAll','supportAll'].includes(action.kind) ? targets : [selected];
  const boostedSecondary = action.secondary && recipients.some(t => matchingStatus(t,{statuses:action.secondary.whenStatuses || [action.secondary.whenStatus]}));
  const spreading = action.spread && selected.statuses.find(s => ['burn','bleed','darkmark'].includes(s.type) && s.turns > 0);
  const storedShield = action.shieldScale ? actor.shield : 0;
  if (storedShield) { actor.shield = 0; actor.shieldTurns = 0; actor.shieldLayers = []; emit({type:'converted',target:actor.id,shieldSpent:storedShield}); }
  if (action.kind === 'guard') {
    actor.guarding = true;
    const e = shield(actor,RULES.guard.shieldMaxHpRatio,state.round); e.type = 'guard'; emit(e);
    actor.stats.shieldGranted += e.amount;
    actor.energy = Math.min(RULES.energy.maximum,actor.energy+RULES.energy.guardGain);
  } else {
    for (const target of recipients) {
      let event;
      if (action.kind.startsWith('heal')) {
        event = heal(state,target,target.maxHp*action.power);
        actor.stats.healing += event.amount;
      } else if (action.kind.startsWith('shield')) {
        event = shield(target,action.power,state.round); actor.stats.shieldGranted += event.amount;
      } else if (action.kind.startsWith('support')) {
        event = {type:'support',target:target.id,amount:0};
      } else {
        const weak = has(actor,'weaken') ? RULES.status.weakenAttackMultiplier : 1, empowered = has(actor,'empower') ? RULES.status.empowerAttackMultiplier : 1;
        const defense = target.defense * (has(target,'expose') ? RULES.status.exposeDefenseMultiplier : 1) * (has(target,'taunt') ? RULES.status.tauntDefenseMultiplier : 1) * (hero.classId === 'arcano' ? RULES.classPassives.arcanoDefenseMultiplier : 1);
        const multiplier = advantage(hero.classId,HERO_BY_ID[target.heroId].classId);
        let critical = random(state) < Math.min(1,RULES.critical.chance + (hero.classId === 'igneo' ? RULES.classPassives.igneoCriticalChance : 0) + (action.criticalChance || 0));
        if (criticalOverride !== null) critical = criticalOverride;
        let bonus = 1, combo = '';
        if (action.combo && matchingStatus(target,action.combo)) {
          bonus *= action.combo.multiplier; combo = matchingStatus(target,action.combo); actor.stats.combos++;
          if (action.combo.consume) remove(target,combo);
        }
        if (has(target,'focus')) { bonus *= RULES.status.focusDamageMultiplier; remove(target,'focus'); combo = combo || 'focus'; actor.stats.combos++; }
        if (action.executeThreshold && target.hp / target.maxHp < action.executeThreshold) { bonus *= action.executeMultiplier; combo = combo || 'execute'; actor.stats.combos++; }
        // Order matters: one rounding after offense, defense, affinity and bonuses.
        let total = Math.max(RULES.damage.minimumHit, Math.round(
          (actor.attack * weak * empowered * action.power + storedShield * (action.shieldScale || 0))
          * RULES.damage.defenseBaseline / (RULES.damage.defenseBaseline + defense * RULES.damage.defenseWeight)
          * multiplier
          * (target.guarding ? RULES.guard.incomingDamageMultiplier : 1)
          * (has(target, 'fortify') ? RULES.status.fortifyIncomingDamageMultiplier : 1)
          * (has(target,'elementalWard') && multiplier > 1 ? RULES.status.elementalWardIncomingMultiplier : 1)
          * bonus * (critical ? RULES.critical.damageMultiplier : 1)
        ));
        const protection = action.kind === 'damage' && target.statuses.find(s => s.type === 'cover');
        const guardian = protection && state.units.find(u => u.id === protection.owner && u.hp > 0 && u.side === target.side && u.id !== target.id);
        if (guardian) {
          const share = Math.round(total*RULES.status.coverRedirectRatio);
          const e = hit(guardian,share,action.pierce||0,{intercepted:true}); emit(e);
          total -= e.amount + e.absorbed;
          guardian.stats.protected += e.amount + e.absorbed; actor.stats.damage += e.amount; actor.stats.shieldDamage += e.absorbed;
          if (!guardian.hp) emit({type:'defeated',target:guardian.id});
        }
        event = hit(target,total,action.pierce||0,{advantage:multiplier,critical});
        if (combo) event.combo = combo;
        actor.stats.damage += event.amount; actor.stats.shieldDamage += event.absorbed;
        if (has(target,'seed') && actor.hp > 0) {
          remove(target,'seed'); const receipt = heal(state,actor,actor.maxHp*RULES.status.seedHealMaxHpRatio,{passive:true,source:'seed'});
          emit(receipt); actor.stats.healing += receipt.amount;
        }
        if (hero.classId === 'sombrio' && event.amount > 0 && actor.hp > 0) {
          const receipt = heal(state,actor,event.amount*RULES.classPassives.sombrioDrainRatio,{passive:true,source:'drain'});
          if (receipt.amount) { emit(receipt); actor.stats.healing += receipt.amount; }
        }
        if (target.hp > 0 && actor.hp > 0) {
          const defender = HERO_BY_ID[target.heroId];
          const reflect = (has(target,'mirror') ? RULES.status.mirrorDamageRatio : 0) + (defender.classId === 'igneo' && ['Tanque','Suporte'].includes(defender.role) ? RULES.classPassives.igneoReflectRatio : 0);
          const retaliation = Math.round(event.amount*reflect) + (has(target,'riposte') ? Math.round(target.attack*RULES.status.riposteAttackRatio) : 0);
          if (retaliation > 0) {
            const e = hit(actor,retaliation,0,{reaction:true}); emit(e);
            target.stats.damage += e.amount; target.stats.shieldDamage += e.absorbed;
            if (!actor.hp) emit({type:'defeated',target:actor.id});
          }
          if (has(target,'sentinel') && actor.hp > 0) { addStatus(actor,'weaken'); emit({type:'status',target:actor.id,effect:'weaken',effectTurns:RULES.status.durationTurns,source:'sentinel'}); }
          if (has(target,'emberguard') && actor.hp > 0) { addStatus(actor,'burn'); emit({type:'status',target:actor.id,effect:'burn',effectTurns:RULES.status.durationTurns,source:'emberguard'}); }
        }
      }
      if (target.hp > 0) {
        for (const effect of [action.effect,action.extraEffect].filter(Boolean)) {
          if (!event.effect) { event.effect = effect; event.effectTurns = effect === 'cleanse' ? 0 : (action.duration || RULES.status.durationTurns); }
          else { event.extraEffect = effect; event.extraEffectTurns = action.duration || RULES.status.durationTurns; }
          if (effect === 'cleanse') event.cleansed = target.statuses.filter(s => !POSITIVE.includes(s.type)).map(s => s.type);
          addStatus(target,effect,actor.id,action.duration || RULES.status.durationTurns);
        }
      }
      emit(event);
      if (!target.hp) emit({type:'defeated',target:target.id});
    }
    if (spreading && actor.hp > 0) {
      const destination = state.units.find(u => u.side === selected.side && u.hp > 0 && u.id !== selected.id && !has(u,spreading.type));
      if (destination) {
        addStatus(destination,spreading.type,spreading.owner ?? null,spreading.turns);
        emit({type:'status',target:destination.id,effect:spreading.type,effectTurns:spreading.turns,source:'spread'});
      }
    }
    const extra = action.secondary;
    if (extra && actor.hp > 0) {
      const allies = state.units.filter(u => u.side === actor.side && u.hp > 0);
      const destinations = extra.target === 'allies' ? allies : extra.target === 'actor' ? [actor] : extra.target === 'lowestAlly' ? [[...allies].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]] : [selected];
      for (const target of destinations) {
        if (target.hp <= 0) continue;
        const power = (extra.power||0) * (boostedSecondary ? extra.multiplier : 1);
        if (extra.kind === 'heal') { const receipt = heal(state,target,target.maxHp*power,{source:'secondary'}); actor.stats.healing += receipt.amount; emit(receipt); }
        if (extra.kind === 'shield') { const e = shield(target,power,state.round); actor.stats.shieldGranted += e.amount; emit(e); }
        if (extra.kind === 'energy') { const amount = Math.min(RULES.energy.maximum-target.energy,extra.amount); target.energy += amount; actor.stats.energyGiven += amount; emit({type:'energy',target:target.id,amount,energyAfter:target.energy}); }
      }
    }
    if (actionId === 'basic') actor.energy = Math.min(RULES.energy.maximum,actor.energy+RULES.energy.basicGain);
  }
  actor.statuses = actor.statuses.filter(s => s.turns > 0);
  const impactUnits = structuredClone(state.units), turnEvents = [];
  if (!checkVictory(state)) { state.cursor++; beginTurn(state,turnEvents); }
  return {actor:actor.id,heroId:actor.heroId,actionId,animation:hero.animation,events,impactUnits,turnEvents};
}
export function preview(state, actionId, targetId) {
  return {normal:act(structuredClone(state),actionId,targetId,false),critical:act(structuredClone(state),actionId,targetId,true)};
}
// One-ply utility: deterministic, never draws RNG or mutates the live battle.
function aiThreat(unit) { return 1 + Math.max(0, .7-unit.hp/unit.maxHp)*2; }
function aiEffect(state, actor, target, type) {
  if (!type) return 0;
  if (type === 'cleanse') return target.statuses.filter(s=>!POSITIVE.includes(s.type)).length*70;
  if (has(target,type)) return 0;
  if (type === 'taunt') return state.units.filter(u=>u.side===actor.side && u.hp>0 && u!==actor).reduce((n,u)=>n+55*aiThreat(u),0)*(actor.hp/actor.maxHp);
  if (type === 'cover') return 75*aiThreat(target);
  return ({burn:90,bleed:110,darkmark:85,weaken:65,expose:50,focus:65,seed:55,regen:65,fortify:55,empower:65,riposte:40,mirror:45,emberguard:45,sentinel:65,elementalWard:45})[type] || 0;
}
function aiDamage(state, actor, target, action) {
  const hero=HERO_BY_ID[actor.heroId], affinity=advantage(hero.classId,HERO_BY_ID[target.heroId].classId);
  let defense=target.defense*(has(target,'expose')?RULES.status.exposeDefenseMultiplier:1)*(has(target,'taunt')?RULES.status.tauntDefenseMultiplier:1)*(hero.classId==='arcano'?RULES.classPassives.arcanoDefenseMultiplier:1);
  let bonus=action.combo && matchingStatus(target,action.combo)?action.combo.multiplier:1;
  if(has(target,'focus'))bonus*=RULES.status.focusDamageMultiplier;
  if(action.executeThreshold && target.hp/target.maxHp<action.executeThreshold)bonus*=action.executeMultiplier;
  let total=Math.max(1,Math.round((actor.attack*(has(actor,'weaken')?RULES.status.weakenAttackMultiplier:1)*(has(actor,'empower')?RULES.status.empowerAttackMultiplier:1)*action.power+actor.shield*(action.shieldScale||0))*RULES.damage.defenseBaseline/(RULES.damage.defenseBaseline+defense*RULES.damage.defenseWeight)*affinity*(target.guarding?RULES.guard.incomingDamageMultiplier:1)*(has(target,'fortify')?RULES.status.fortifyIncomingDamageMultiplier:1)*(has(target,'elementalWard')&&affinity>1?RULES.status.elementalWardIncomingMultiplier:1)*bonus));
  const cover=target.statuses.find(s=>s.type==='cover');
  if(action.kind==='damage' && cover && state.units.some(u=>u.id===cover.owner && u.hp>0 && u.side===target.side))total-=Math.round(total*RULES.status.coverRedirectRatio);
  const absorbed=Math.min(target.shield,total-Math.round(total*(action.pierce||0))), hpDamage=Math.max(0,total-absorbed);
  const priority=HERO_BY_ID[target.heroId].role==='Suporte'?RULES.ai.supportPriority:HERO_BY_ID[target.heroId].role==='Dano'?RULES.ai.damagePriority:1;
  return Math.min(target.hp,hpDamage)*priority + absorbed*.6 + (hpDamage>=target.hp?RULES.ai.killBonus:0) + (target.maxHp-target.hp)*.08;
}
function aiValue(state, actor, target, action) {
  let value=0;
  if(action.kind.startsWith('heal')) value=Math.min(target.maxHp-target.hp,Math.round(target.maxHp*action.power*healingMultiplier(state,target)))*RULES.ai.healValue*aiThreat(target);
  else if(action.kind.startsWith('shield')) value=Math.max(0,Math.min(Math.round(target.maxHp*RULES.shield.maxHpRatio)-target.shield,Math.round(target.maxHp*action.power)))*RULES.ai.shieldValue*aiThreat(target);
  else if(!action.kind.startsWith('support'))value=aiDamage(state,actor,target,action);
  value+=aiEffect(state,actor,target,action.effect)+aiEffect(state,actor,target,action.extraEffect);
  return value;
}
export function chooseAI(state) {
  const actor=currentUnit(state);
  if(!actor || state.phase!=='playing')return null;
  let best=null, bestScore=-Infinity;
  // Basic wins an exact tie, conserving energy for a meaningful later action.
  for(const actionId of ['basic','skill','ultimate']) {
    if(!canUse(actor,actionId))continue;
    const action=getAction(actor,actionId),targets=legalTargets(state,actor,action);
    if(friendly(action))targets.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp || a.slot-b.slot);
    for(const target of targets) {
      const recipients=['aoe','healAll','shieldAll','supportAll'].includes(action.kind)?targets:[target];
      let score=recipients.reduce((n,t)=>n+aiValue(state,actor,t,action),0)-action.cost*.25;
      if(actionId==='basic')score+=8;
      if(action.spread && target.statuses.some(s=>['burn','bleed','darkmark'].includes(s.type)))score+=60;
      const extra=action.secondary;
      if(extra) {
        const allies=state.units.filter(u=>u.side===actor.side&&u.hp>0);
        const destinations=extra.target==='allies'?allies:extra.target==='actor'?[actor]:extra.target==='lowestAlly'?[[...allies].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]]:[target];
        const boost=recipients.some(t=>matchingStatus(t,{statuses:extra.whenStatuses||[extra.whenStatus]}))?(extra.multiplier||1):1;
        for(const t of destinations) {
          if(extra.kind==='energy')score+=Math.min(RULES.energy.maximum-t.energy,extra.amount)*.8;
          else score+=aiValue(state,actor,t,{kind:extra.kind,power:(extra.power||0)*boost});
        }
      }
      // Integer scores make stable JS/Godot comparisons independent of float noise.
      score=Math.round(score*100);
      if(score>bestScore){bestScore=score;best={actionId,targetId:target.id};}
    }
  }
  return best || {actionId:'guard',targetId:actor.id};
}
