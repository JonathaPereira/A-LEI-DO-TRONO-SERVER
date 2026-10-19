'use strict';

const SUITS = {
  cetro: { name: 'Cetro', color: '#d4a63f', glyph: '♜' },
  chave: { name: 'Chave', color: '#2f8a5f', glyph: '⚿' },
  lamina: { name: 'Lâmina', color: '#b13939', glyph: '⚔' },
  mascara: { name: 'Máscara', color: '#8050a0', glyph: '◉' },
};
const SUIT_ORDER = ['cetro', 'chave', 'lamina', 'mascara'];
const LAWS = window.TronoRules.laws;
const LAW_ORDER = window.TronoRules.lawOrder;
const DECREES = window.TronoRules.decrees;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

let game = null;
let leavingGame = false;
const throneControls = window.TronoThroneControls;
const throneLobby = window.TronoThroneLobby;
const throneChoices = window.TronoThroneChoices;
const throneHand = window.TronoThroneHand;
const throneMatch = window.TronoThroneMatch;
const throneSeats = window.TronoThroneSeats;
const throneTable = window.TronoThroneTable;
const thronePrivate = window.TronoThronePrivate;
const throneHistory = window.TronoThroneHistory;
const throneEffects = window.TronoThroneEffects;
let onlineGameMode = false;
let chatOnlyRoomState = null;
let localTurnTimer = null;
// Audio controls initialize independently of the game/room interface.
const storage = window.TronoStorage || localStorage;
const ensureAudio = (...args) => window.TronoAudio?.ensureAudio(...args) || Promise.resolve(false);
const toggleMusic = (...args) => window.TronoAudio?.toggleMusic(...args);

function makeDeck() {
  let id = 0;
  const deck = [];
  for (const suit of SUIT_ORDER)
    for (let value = 1; value <= 12; value++)
      deck.push({ id: `c${id++}`, suit, value, public: false, publicReason: null });
  return deck;
}
function roundPairs(p) {
  return Math.min(p.roundCrowns, p.roundShadows);
}
// Prestígio é calculado sobre o total acumulado da partida.
// Assim, jogadores com a mesma quantidade total de Coroas e Sombras
// sempre possuem o mesmo Prestígio, independentemente da rodada em que
// conquistaram esses marcadores.
function totalPairs(p) {
  return Math.min(p.totalCrowns, p.totalShadows);
}
function totalPrestige(p) {
  return p.totalCrowns + p.totalShadows + 2 * totalPairs(p);
}
function rawAccumulated(p) {
  return p.totalCrowns + p.totalShadows;
}
function playerLabel(id) {
  return game.players[id].name;
}
async function delay(base) {
  const current = game;
  await sleep(Math.max(30, base * throneControls.getSnapshot().scale));
  if (current && !current.online && current !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
}
// Rules and public effects emit text; the typed owner handles history and rendering.
function logEvent(message) {
  throneHistory.appendPublic(message, game?.round || 0, game?.trick || 0);
}
function toast(text, ms = 1500) {
  throneEffects.toast(text, ms, throneControls.getSnapshot().scale);
}
function showConnectionNotice(name, botName = null, reason = 'disconnect') {
  throneEffects.connection(name, botName, reason);
}
function showInfluenceUseFeedback(value) {
  throneEffects.influence(value);
}

function isLocalPlayersTurn() {
  if (!game || game.phase !== 'await-play' || game.turn == null) return false;
  return game.turn === (onlineGameMode ? game.localPlayerId : 0);
}
function showYourTurnNotice() {
  if (game)
    throneEffects.turn(
      LAWS[game.currentLaw]?.name || 'Lei ativa',
      throneControls.getSnapshot().scale,
    );
}

const BOT_NAMES = window.TronoBots.names;
function createPlayers(names, allAI = false) {
  let botIndex = 0;
  return names.map((name, id) => {
    const ai = allAI || id !== 0;
    const resolvedName = ai ? window.TronoBots.at(botIndex++) : name.trim() || `Jogador ${id + 1}`;
    return {
      id,
      name: resolvedName,
      ai,
      hand: [],
      reserve: null,
      totalCrowns: 0,
      totalShadows: 0,
      totalPairs: 0,
      prestige: 0,
      roundCrowns: 0,
      roundShadows: 0,
      influence: 0,
      hadCrown: false,
      crownStreak: 0,
    };
  });
}

function resetRoundStats() {
  for (const p of game.players) {
    p.hand = [];
    p.reserve = null;
    p.intelligence = null;
    p.roundCrowns = 0;
    p.roundShadows = 0;
    p.influence = 0;
    p.hadCrown = false;
    p.crownStreak = 0;
  }
}

async function startGame(allAI = false) {
  clearLocalTurnTimer();
  throneChoices.clear();
  throneHand.clear();
  throneMatch.clear();
  thronePrivate.clear();
  throneHistory.clear();
  onlineGameMode = false;
  leavingGame = false;
  await ensureAudio();
  const names = [0, 1, 2, 3].map((i) => $(`p${i}Name`).value);
  game = {
    players: createPlayers(names, allAI),
    round: 1,
    trick: 1,
    deck: [],
    undealt: [],
    decree: null,
    lawUsage: Object.fromEntries(LAW_ORDER.map((x) => [x, 0])),
    currentLaw: 'ordem',
    trump: null,
    firstRoundStarter: rand(4),
    leader: null,
    lastCrown: null,
    lastShadow: null,
    previousWinningSuit: null,
    plays: [],
    turn: null,
    phase: 'setup',
    allAI,
    handSession: throneHand.beginLocal(),
    choiceSession: throneChoices.beginLocal(),
    gameOver: false,
    declaredLeadSuit: null,
    room: throneLobby.getSnapshot().selected,
    // No protótipo local, o jogador humano ocupa o assento 0. Quando a partida online
    // for sincronizada, este campo será preenchido com o assento pertencente a este cliente.
    localPlayerId: allAI ? null : 0,
  };
  game.leader = game.firstRoundStarter;
  syncLocalStatus();
  $('setupScreen').classList.add('hidden');
  $('roomScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  throneHistory.clearEntries();
  logEvent(
    `Partida iniciada${throneLobby.getSnapshot().selected ? ` em ${throneLobby.getSnapshot().selected.name}` : ''}. O sorteio definiu ${playerLabel(game.leader)} como primeiro líder.`,
  );
  renderAll();
  await startRound();
}

async function startRound() {
  game.phase = 'round-start';
  game.trick = 1;
  game.currentLaw = 'ordem';
  game.trump = null;
  game.lawUsage = Object.fromEntries(LAW_ORDER.map((x) => [x, 0]));
  game.lastCrown = null;
  game.lastShadow = null;
  game.previousWinningSuit = null;
  game.plays = [];
  resetRoundStats();
  const deck = shuffle(makeDeck());
  for (let i = 0; i < 10; i++) for (let p = 0; p < 4; p++) game.players[p].hand.push(deck.pop());
  game.undealt = deck;
  for (const p of game.players) sortHand(p);
  renderAll();

  toast(`Rodada ${game.round} — a corte se reúne`, 1800);
  await delay(800);
  game.decree = await chooseDecree();
  logEvent(`Decreto: ${game.decree.name} vigorará durante toda a rodada.`);
  renderAll();
  await applyDecreeRoundStart();
  await beginTrick();
}

async function chooseDecree() {
  const min = Math.min(...game.players.map(rawAccumulated));
  const tied = game.players.filter((p) => rawAccumulated(p) === min);
  const chooser = tied[rand(tied.length)];
  const picks = shuffle(DECREES).slice(0, 2);
  logEvent(
    `${chooser.name} possui o menor total bruto de Coroas + Sombras e recebe a escolha do Decreto.`,
  );
  if (!chooser.ai) {
    const choice = await chooseLocal({ kind: 'choose-decree', options: picks.map((d) => d.id) });
    return DECREES.find((d) => d.id === choice);
  }
  await delay(700);
  const chosen = picks[rand(picks.length)];
  toast(`${chooser.name} escolheu ${chosen.name}`);
  return chosen;
}

async function applyDecreeRoundStart() {
  if (game.decree.id === 'reserva') {
    for (const p of game.players) {
      let card;
      if (p.ai) {
        card = chooseCpuReserve(p);
      } else card = await chooseCardFromHand(p, 'choose-reserva');
      p.reserve = card;
      p.hand = p.hand.filter((c) => c.id !== card.id);
      logEvent(`${p.name} separou uma carta na Reserva.`);
    }
  }
  if (game.decree.id === 'corte') {
    for (const p of game.players) {
      const candidates = p.hand.filter((c) => !c.public);
      let card = p.ai
        ? candidates[rand(candidates.length)]
        : await chooseCardFromHand(p, 'choose-corte', candidates);
      card.public = true;
      card.publicReason = 'Corte Aberta';
      logEvent(`${p.name} revelou ${SUITS[card.suit].name} ${card.value} pela Corte Aberta.`);
    }
  }
  if (game.decree.id === 'favor') for (const p of game.players) p.influence = 1;
  if (game.decree.id === 'conselho') {
    const choices = new Map();
    for (const p of game.players) {
      const card = p.ai
        ? p.hand[rand(p.hand.length)]
        : await chooseCardFromHand(p, 'choose-conselho');
      choices.set(p.id, card.id);
    }
    window.TronoRules.passCards(game.players, choices, -1);
    for (const p of game.players) sortHand(p);
    logEvent('Conselho: todas as Casas passaram uma carta fechada à direita.');
    await showExchangeAnimation({
      kind: 'conselho',
      title: 'Conselho — pacto entre as Casas',
      subtitle: 'Quatro cartas passam simultaneamente à direita.',
      moves: game.players.map((p) => ({
        from: p.id,
        to: (p.id + 3) % 4,
        label: 'Carta fechada → direita',
      })),
    });
  }
  if (game.decree.id === 'espionagem') {
    for (const p of game.players)
      p.intelligence = window.TronoRules.intelligence(game.players, p.id);
    logEvent('Espionagem: cada Casa recebeu uma informação privada sobre o jogador à direita.');
    const clue = game.players[game.localPlayerId]?.intelligence;
    if (clue) await thronePrivate.showLocal({ kind: 'intelligence', clue });
  }

  renderAll();
}

function chooseCpuReserve(p) {
  const sorted = [...p.hand].sort((a, b) => Math.abs(a.value - 6.5) - Math.abs(b.value - 6.5));
  return sorted[0] || p.hand[0];
}

async function beginTrick() {
  const session = game;
  if (game.gameOver) return;
  game.phase = 'trick-start';
  game.plays = [];
  game.trump = null;
  game.declaredLeadSuit = null;
  game.lawUsage[game.currentLaw]++;
  renderAll();
  logEvent(`Vaza ${game.trick}: ${LAWS[game.currentLaw].name}.`);
  toast(`Vaza ${game.trick} • ${LAWS[game.currentLaw].name}`, 900);

  if (game.currentLaw === 'estandarte') await declareTrump();
  if (game.currentLaw === 'usurpacao') await performUsurpacao();

  if (session !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
  game.phase = 'await-play';
  game.turn = game.leader;
  for (let n = 0; n < 4; n++) {
    const pid = (game.leader + n) % 4;
    game.turn = pid;
    renderAll();
    await playTurn(pid);
    if (session !== game)
      throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
  }
  clearLocalTurnTimer();
  game.turn = null;
  renderAll();
  await resolveTrick();
}

async function declareTrump() {
  const chooser = game.players[game.lastShadow];
  if (!chooser) {
    game.trump = SUIT_ORDER[rand(4)];
    return;
  }
  if (chooser.ai) {
    const scores = SUIT_ORDER.map((s) => ({
      s,
      score:
        chooser.hand.filter((c) => c.suit === s).reduce((a, c) => a + c.value, 0) +
        chooser.hand.filter((c) => c.suit === s).length * 5,
    }));
    scores.sort((a, b) => b.score - a.score);
    game.trump = scores[0].s;
    await delay(500);
  } else {
    game.trump = await chooseLocal({ kind: 'choose-trump', options: SUIT_ORDER });
  }
  logEvent(`${chooser.name} declarou ${SUITS[game.trump].name} como Trunfo.`);
  renderAll();
}

async function showExchangeAnimation(value) {
  const session = game;
  await throneEffects.exchange(
    { ...value, players: game.players, crown: game.lastCrown, shadow: game.lastShadow },
    throneControls.getSnapshot().scale,
  );
  if (session && !session.online && session !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
}

function prepareUsurpacaoExchange(shadow, target, given) {
  return window.TronoRules.reserveExchange(game.players, shadow, target, given?.id, shuffle);
}
function finishUsurpacaoExchange(shadow, target, index, state) {
  return window.TronoRules.finishExchange(shadow, target, state, index);
}

async function chooseUsurpacaoReturnIndex(shadow, crown) {
  const pickable = crown.hand.filter((c) => c.publicReason !== 'Corte Aberta');
  if (shadow.ai) return rand(pickable.length);
  return await chooseLocal({ kind: 'usurp-pick', count: pickable.length, otherName: crown.name });
}

async function showPrivateUsurpationResult(shadow, crown, given, taken) {
  const localId = game?.localPlayerId;
  if (localId == null || (localId !== shadow.id && localId !== crown.id)) return;
  const isShadow = localId === shadow.id;
  await thronePrivate.showLocal({
    kind: 'usurpation',
    role: isShadow ? 'shadow' : 'target',
    otherName: isShadow ? crown.name : shadow.name,
    outgoing: isShadow ? given : taken,
    incoming: isShadow ? taken : given,
  });
}

async function performUsurpacao() {
  const shadow = game.players[game.lastShadow];
  if (!shadow) return;
  const targets = game.players.filter(
    (p) => p.id !== shadow.id && window.TronoRules.eligible(p.hand).length,
  );
  const targetId = shadow.ai
    ? targets[rand(targets.length)].id
    : await chooseLocal({
        kind: 'usurp-target',
        options: targets.map((p) => ({ seat: p.id, name: p.name })),
      });
  const crown = game.players[targetId];
  let given;
  if (shadow.ai) {
    const pool = shadow.hand
      .filter((c) => c.publicReason !== 'Corte Aberta')
      .sort((a, b) => a.value - b.value);
    given = pool[0];
  } else {
    given = await chooseCardFromHand(
      shadow,
      'usurp-give',
      shadow.hand.filter((c) => c.publicReason !== 'Corte Aberta'),
      crown.name,
    );
  }

  // A carta fica separada até a escolha cega na mão do adversário.
  const before = prepareUsurpacaoExchange(shadow, crown, given);

  // Se a Sombra for humana, ela escolhe VISUALMENTE uma posição entre cartas fechadas.
  // Nenhum valor ou naipe é mostrado neste momento.
  const pickIndex = await chooseUsurpacaoReturnIndex(shadow, crown);
  const { taken } = finishUsurpacaoExchange(shadow, crown, pickIndex, before);

  await showExchangeAnimation({
    kind: 'usurpacao',
    title: 'Usurpação — troca de mãos',
    subtitle: `${shadow.name} escolhe uma carta fechada de ${crown.name}; a carta separada segue então para a Casa escolhida.`,
    moves: [
      { from: shadow.id, to: crown.id, role: 'shadow', label: 'Carta separada → Casa escolhida' },
      {
        from: crown.id,
        to: shadow.id,
        role: 'crown',
        label: 'Carta aleatória → Sombra',
        delay: 220,
      },
    ],
  });

  sortHand(shadow);
  sortHand(crown);
  logEvent(
    `Usurpação: ${shadow.name} entregou 1 carta oculta a ${crown.name}; uma carta elegível da Casa escolhida passou à Sombra antes da entrega. A Corte Aberta permaneceu protegida.`,
  );
  renderAll();

  // Só o cliente de um dos dois envolvidos recebe a revelação das cartas.
  await showPrivateUsurpationResult(shadow, crown, given, taken);
  toast('Usurpação resolvida', 900);
  renderAll();
  await delay(420);
}

function isInfluenceBlocked(p = game?.players[game?.localPlayerId]) {
  return window.TronoRules.influenceBlocked(game, p);
}
function getLeadSuit() {
  return game.declaredLeadSuit || game.plays?.[0]?.card?.suit || null;
}
function canUseInfluence(p, cost = 1) {
  if (!p || p.influence < cost || isInfluenceBlocked(p)) return false;
  // Regra v0.5.5: a Coroa/líder também pode abrir a vaza com carta oculta.
  if (game.plays.length === 0) return p.id === game.leader;
  return true;
}
function announceHiddenLead(p, suit) {
  game.declaredLeadSuit = suit;
  logEvent(
    `Influência: ${p.name}, como Coroa, anunciou ${SUITS[suit].name} antes de abrir a vaza com uma carta oculta.`,
  );
  toast(`✦ ${p.name} anuncia ${SUITS[suit].name} e abre com carta oculta`, 1800);
  renderAll();
}

async function playTurn(pid) {
  const p = game.players[pid];
  if (game.decree.id === 'reserva' && game.trick === 10) {
    const card = p.reserve;
    p.reserve = null;
    await commitPlay(p, card, false, null, true, 'none', 0);
    return;
  }
  const legal = getLegalCards(p);
  if (p.ai) {
    await delay(480);
    const card = chooseCpuCard(p, legal);
    const inf = maybeCpuInfluence(p, card);
    if (inf.action !== 'none') {
      p.influence -= inf.cost;
      if (game.plays.length === 0) {
        game.declaredLeadSuit = card.suit;
        announceHiddenLead(p, card.suit);
      }
    }
    await commitPlay(p, card, inf.action !== 'none', null, false, inf.action, inf.modifier);
  } else {
    renderHand();
    const result = await waitHumanPlay(legal, p);
    await commitPlay(
      p,
      result.card,
      result.hidden,
      result.sourceInfo,
      false,
      result.influenceAction || 'none',
      result.modifier || 0,
    );
  }
}

function maybeCpuInfluence(p, card) {
  if (card?.publicReason === 'Corte Aberta' || isInfluenceBlocked(p))
    return { action: 'none', cost: 0, modifier: 0 };
  if (canUseInfluence(p, 2) && card.value >= 4 && card.value <= 9 && Math.random() < 0.3) {
    const seekCrown = Math.random() < 0.62;
    const action =
      game.currentLaw === 'revolta' ? (seekCrown ? 'minus' : 'plus') : seekCrown ? 'plus' : 'minus';
    return { action, cost: 2, modifier: action === 'plus' ? 3 : -3 };
  }
  if (canUseInfluence(p, 1) && Math.random() < 0.12)
    return { action: 'sigilo', cost: 1, modifier: 0 };
  return { action: 'none', cost: 0, modifier: 0 };
}

function getLegalCards(p) {
  let cards = [...p.hand];
  if (game.plays.length === 0 && game.decree.id === 'sucessao' && game.previousWinningSuit) {
    const alternatives = cards.filter((c) => c.suit !== game.previousWinningSuit);
    if (alternatives.length) cards = alternatives;
  }
  if (game.plays.length === 0) return cards;
  const leadSuit = getLeadSuit();
  return window.TronoRules.followCards(cards, game.currentLaw, leadSuit, game.trump);
}

function chooseCpuCard(p, legal) {
  const sorted = [...legal].sort((a, b) => a.value - b.value);
  const seekCrown = Math.random() < 0.55;
  if (game.currentLaw === 'revolta') return seekCrown ? sorted[0] : sorted[sorted.length - 1];
  if (game.currentLaw === 'anarquia') return seekCrown ? sorted[sorted.length - 1] : sorted[0];
  if (game.currentLaw === 'estandarte' && game.trump) {
    const tr = legal.filter((c) => c.suit === game.trump).sort((a, b) => a.value - b.value);
    if (seekCrown && tr.length) return tr[tr.length - 1];
  }
  return seekCrown ? sorted[sorted.length - 1] : sorted[0];
}

function clearLocalTurnTimer() {
  if (localTurnTimer) {
    clearTimeout(localTurnTimer);
    localTurnTimer = null;
  }
  if (game && !onlineGameMode) {
    game.turnDeadline = null;
    syncLocalStatus();
  }
}
function waitHumanPlay(legal, p) {
  const session = game;
  clearLocalTurnTimer();
  game.turnDeadline = Date.now() + 60_000;
  const pending = throneHand.waitLocal(game.handSession, projectLocalHand(true));
  const offered = throneHand.getSnapshot().context;
  const timer = setTimeout(() => {
    if (game !== session || localTurnTimer !== timer) return;
    const card = legal[rand(legal.length)];
    if (!throneHand.timeoutLocal(offered, card.id)) return;
    localTurnTimer = null;
    game.turnDeadline = null;
    logEvent(`Tempo esgotado: ${p.name} recebeu uma jogada automática.`);
    toast('⌛ Tempo esgotado — carta aleatória jogada.', 1800);
    syncLocalStatus();
  }, 60_000);
  localTurnTimer = timer;
  showYourTurnNotice();
  renderAll(false);
  return pending
    .then((move) => {
      if (session !== game)
        throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
      const card = p.hand.find((c) => c.id === move.cardId),
        action = move.influenceAction;
      const hidden = action !== 'none',
        cost = selectedInfluenceCost(action);
      if (
        !card ||
        !getLegalCards(p).some((c) => c.id === card.id) ||
        (hidden &&
          (!canUseInfluence(p, cost) ||
            card.publicReason === 'Corte Aberta' ||
            (!game.plays.length && move.declaredSuit !== card.suit)))
      )
        throw new Error('Jogada local não autorizada pelo motor.');
      clearLocalTurnTimer();
      if (hidden) {
        p.influence -= cost;
        if (!game.plays.length) announceHiddenLead(p, move.declaredSuit);
      }
      renderHand();
      syncLocalSeats();
      return {
        card,
        hidden,
        sourceInfo: move.origin ? { rect: move.origin } : null,
        influenceAction: action,
        modifier: selectedInfluenceModifier(action),
      };
    })
    .finally(() => {
      if (localTurnTimer === timer) clearLocalTurnTimer();
      else clearTimeout(timer);
    });
}

async function commitPlay(
  p,
  card,
  hidden,
  sourceInfo,
  isReserve,
  influenceAction = 'none',
  modifier = 0,
) {
  const session = game;
  if (!isReserve) p.hand = p.hand.filter((c) => c.id !== card.id);
  const play = {
    playerId: p.id,
    card,
    hidden,
    influenceAction,
    modifier,
    order: game.plays.length,
  };
  game.plays.push(play);
  if (influenceAction !== 'none')
    showInfluenceUseFeedback({
      name: p.name,
      action: influenceAction,
      cost: selectedInfluenceCost(influenceAction),
      modifier,
      declaredSuit: play.order === 0 ? game.declaredLeadSuit : null,
    });
  syncLocalSeats();
  renderHand();
  await animateCardToTable(play, sourceInfo);
  if (session !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
  logEvent(
    `${p.name} jogou ${hidden ? `uma carta oculta${play.order === 0 && game.declaredLeadSuit ? ` após anunciar ${SUITS[game.declaredLeadSuit].name}` : ''}` : `${SUITS[card.suit].name} ${card.value}`}${isReserve ? ' da Reserva' : ''}.`,
  );
}

async function animateCardToTable(play, sourceInfo) {
  syncLocalTable();
  await throneEffects.arrival(
    { seat: play.playerId, from: sourceInfo?.rect || null, card: play.card },
    throneControls.getSnapshot().scale,
  );
}
function clampEffectiveValue(v) {
  return Math.max(1, Math.min(12, Number(v) || 0));
}
function playValue(play) {
  return clampEffectiveValue((play?.card?.value || 0) + (play?.modifier || 0));
}

function evaluateTrick() {
  return window.TronoRules.evaluate(game.plays, game.currentLaw, getLeadSuit(), game.trump);
}

async function resolveTrick() {
  game.phase = 'resolve';
  for (const play of game.plays) play.hidden = false;
  syncLocalTable();
  await delay(450);
  const { crown, shadow } = evaluateTrick();
  const crownP = game.players[crown.playerId],
    shadowP = game.players[shadow.playerId];
  crownP.roundCrowns++;
  crownP.totalCrowns++;
  shadowP.roundShadows++;
  shadowP.totalShadows++;
  const influenceGains = [];
  for (const p of game.players) {
    if (p.id !== crown.playerId && p.id !== shadow.playerId) {
      const before = p.influence;
      p.influence = Math.min(2, p.influence + 1);
      if (p.influence > before) influenceGains.push({ player: p, before, after: p.influence });
    }
  }

  if (game.lastCrown === crown.playerId) crownP.crownStreak++;
  else {
    for (const p of game.players) p.crownStreak = 0;
    crownP.crownStreak = 1;
  }

  syncLocalTable({ crown: crown.playerId, shadow: shadow.playerId });
  const crownShown = crown.modifier
    ? `${crown.card.value} ${crown.modifier > 0 ? '+3' : '-3'} → ${playValue(crown)}`
    : `${crown.card.value}`;
  const shadowShown = shadow.modifier
    ? `${shadow.card.value} ${shadow.modifier > 0 ? '+3' : '-3'} → ${playValue(shadow)}`
    : `${shadow.card.value}`;
  logEvent(
    `${LAWS[game.currentLaw].name} — Coroa: ${crownP.name} (${SUITS[crown.card.suit].name} ${crownShown}). Sombra: ${shadowP.name} (${SUITS[shadow.card.suit].name} ${shadowShown})${game.currentLaw === 'estandarte' && game.trump ? ` • Trunfo: ${SUITS[game.trump].glyph} ${SUITS[game.trump].name}` : ''}.`,
  );
  await showTrickOutcome(crownP, shadowP);
  toast(`♛ ${crownP.name} • Sombra: ${shadowP.name}`, 1400);
  if (influenceGains.length) {
    renderAll();
    showInfluenceGains(influenceGains);
    await delay(1750);
  }

  if (game.decree.id === 'desafio') {
    const shouldReveal = !crownP.hadCrown || game.lastCrown === crown.playerId;
    if (shouldReveal) await revealForChallenge(crownP);
  }
  crownP.hadCrown = true;

  game.lastCrown = crown.playerId;
  game.lastShadow = shadow.playerId;
  game.previousWinningSuit = crown.card.suit;
  game.leader = crown.playerId;
  renderAll();
  await delay(900);

  if (game.trick === 10) {
    await endRound();
    return;
  }
  if (game.decree.id === 'rotacao' && [7, 8, 9].includes(game.trick)) await performRotation();

  const nextLaw = await chooseNextLaw(shadowP);
  game.currentLaw = nextLaw;
  game.trick++;
  syncLocalTable(null);
  await delay(350);
  await beginTrick();
}

async function showTrickOutcome(crown, shadow) {
  const session = game;
  await throneEffects.outcome({ crown, shadow }, throneControls.getSnapshot().scale);
  if (session && !session.online && session !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
}
function showInfluenceGains(gains) {
  syncLocalSeats();
  throneEffects.gains(gains, throneControls.getSnapshot().scale);
  renderHand();
}

async function revealForChallenge(p) {
  const privateCards = p.hand.filter((c) => !c.public);
  if (!privateCards.length) return;
  let card = p.ai
    ? privateCards[rand(privateCards.length)]
    : await chooseCardFromHand(p, 'challenge', privateCards);
  card.public = true;
  card.publicReason = 'Desafio';
  logEvent(`Desafio: ${p.name} revelou ${SUITS[card.suit].name} ${card.value}.`);
  renderAll();
  showChallengeReveal(p.id, card);
  await delay(2100);
}

async function performRotation() {
  toast('Rotação — passe 1 carta à esquerda', 1200);
  const choices = [];
  for (const p of game.players) {
    let card;
    if (p.ai) card = p.hand[rand(p.hand.length)];
    else card = await chooseCardFromHand(p, 'rotation');
    choices[p.id] = card;
  }
  await showExchangeAnimation({
    kind: 'rotation',
    title: `Rotação — fim da vaza ${game.trick}`,
    subtitle: 'Todos passam simultaneamente 1 carta oculta ao jogador à esquerda.',
    moves: game.players.map((p) => ({
      from: p.id,
      to: (p.id + 1) % 4,
      label: `${p.name} → ${game.players[(p.id + 1) % 4].name}`,
    })),
  });

  const incoming = Array(4);
  for (const p of game.players) {
    const card = choices[p.id];
    p.hand = p.hand.filter((c) => c.id !== card.id);
    incoming[(p.id + 1) % 4] = card;
  }
  for (const p of game.players) {
    p.hand.push(incoming[p.id]);
    sortHand(p);
  }
  logEvent(`Rotação: quatro cartas ocultas foram passadas simultaneamente para a esquerda.`);
  renderAll();
  await delay(420);
}

async function chooseNextLaw(shadowP) {
  const valid = getSafeLawChoices(game.trick + 1);
  if (!valid.length) {
    throw new Error(
      'Não há Lei válida para a próxima vaza. O planejador de Leis deveria impedir este estado.',
    );
  }
  if (shadowP.ai) {
    await delay(500);
    const choice = valid[rand(valid.length)];
    logEvent(`${shadowP.name}, como Sombra, escolheu ${LAWS[choice].name}.`);
    return choice;
  }
  const choice = await chooseLocal({ kind: 'choose-law', options: valid });
  logEvent(`${shadowP.name}, como Sombra, escolheu ${LAWS[choice].name}.`);
  return choice;
}

function minHandBeforeTrick(t) {
  if (game.decree?.id === 'reserva') return t === 10 ? 1 : 10 - t;
  return 11 - t;
}
function lawEligibleAt(law, trickNum) {
  if (law === 'usurpacao' && minHandBeforeTrick(trickNum) < 4) return false;
  return true;
}
function getSafeLawChoices(nextTrick) {
  const rem = Object.fromEntries(LAW_ORDER.map((l) => [l, 2 - game.lawUsage[l]]));
  return LAW_ORDER.filter((l) => {
    if (rem[l] <= 0 || l === game.currentLaw || !lawEligibleAt(l, nextTrick)) return false;
    rem[l]--;
    const ok = canFinishLawSequence(rem, l, nextTrick + 1, game.decree?.id || '');
    rem[l]++;
    return ok;
  });
}
function canFinishLawSequence(rem, lastLaw, trickNum, decreeId, memo = new Map()) {
  if (trickNum > 10) return LAW_ORDER.every((l) => rem[l] === 0);
  const key = `${trickNum}|${lastLaw}|${LAW_ORDER.map((l) => rem[l]).join(',')}|${decreeId}`;
  if (memo.has(key)) return memo.get(key);
  for (const l of LAW_ORDER) {
    if (rem[l] <= 0 || l === lastLaw) continue;
    const hand = decreeId === 'reserva' ? (trickNum === 10 ? 1 : 10 - trickNum) : 11 - trickNum;
    if (l === 'usurpacao' && hand < 4) continue;
    rem[l]--;
    if (canFinishLawSequence(rem, l, trickNum + 1, decreeId, memo)) {
      rem[l]++;
      memo.set(key, true);
      return true;
    }
    rem[l]++;
  }
  memo.set(key, false);
  return false;
}

async function endRound() {
  game.phase = 'round-end';
  const rows = game.players.map((p) => {
    const previousPrestige = p.prestige;
    const pairs = roundPairs(p);
    const cumulativePairs = totalPairs(p);
    const cumulativePrestige = totalPrestige(p);
    const score = cumulativePrestige - previousPrestige;
    p.prestige = cumulativePrestige;
    p.totalPairs = cumulativePairs;
    p.influence = 0;
    return { p, pairs, score, cumulativePairs, cumulativePrestige };
  });
  const nextStarter = (game.lastCrown + 1) % 4;
  syncLocalStatus();
  await throneHistory.showLocal({
    kind: 'round',
    round: game.round,
    scores: rows.map(({ p, pairs, score, cumulativePrestige }) => ({
      seat: p.id,
      name: p.name,
      crowns: p.totalCrowns,
      shadows: p.totalShadows,
      pairs: p.totalPairs,
      prestige: cumulativePrestige,
      roundScore: { crowns: p.roundCrowns, shadows: p.roundShadows, pairs, gained: score },
    })),
  });
  logEvent(`Rodada ${game.round} encerrada.`);
  if (game.round >= 3) {
    await endGame();
    return;
  }
  game.round++;
  game.leader = nextStarter;
  logEvent(
    `${playerLabel(game.leader)} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`,
  );
  syncLocalTable(null);
  await startRound();
}

async function endGame() {
  game.gameOver = true;
  for (const p of game.players) {
    p.totalPairs = totalPairs(p);
    p.prestige = totalPrestige(p);
  }
  game.phase = 'game-over';
  syncLocalStatus();
  await throneHistory.showLocal({
    kind: 'final',
    round: game.round,
    scores: game.players.map((p) => ({
      seat: p.id,
      name: p.name,
      crowns: p.totalCrowns,
      shadows: p.totalShadows,
      pairs: p.totalPairs,
      prestige: p.prestige,
    })),
  });
  backToLobby();
}

function sortHand(p) {
  p.hand.sort(
    (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.value - b.value,
  );
}

function renderAll(includeHand = true) {
  if (!game) return;
  syncLocalStatus();
  syncLocalSeats();
  syncLocalTable();
  if (includeHand) renderHand();
}
// Project only visible plays; hidden opponents stay inside the local engine.
function syncLocalTable(winners) {
  if (!game || onlineGameMode) return;
  throneTable.setLocal(
    {
      round: game.round,
      trick: game.trick,
      phase: game.phase === 'setup' ? 'starting' : game.phase,
      currentLaw: game.currentLaw,
      lawUsage: game.lawUsage,
      trump: game.trump,
      declaredLeadSuit: game.declaredLeadSuit,
      decree: game.decree ? { id: game.decree.id } : null,
      previousWinningSuit: game.previousWinningSuit,
      localSeat: game.localPlayerId,
      names: game.players.map((p) => p.name),
      plays: game.plays.map((p) => ({
        playerId: p.playerId,
        order: p.order,
        hidden: p.hidden,
        card: !p.hidden || p.playerId === game.localPlayerId ? p.card : null,
        modifier: p.modifier || 0,
        influenceAction: p.influenceAction || 'none',
      })),
    },
    winners,
  );
}
// The local engine keeps its private cards. React receives only the public view.
function syncLocalSeats() {
  if (!game || onlineGameMode) return;
  throneSeats.setLocal({
    turn: game.turn,
    localSeat: game.localPlayerId,
    players: game.players.map((p) => ({
      id: p.id,
      seat: p.id,
      name: p.name,
      ai: p.ai,
      handCount: p.hand.length,
      reservePresent: !!p.reserve,
      publicCards: p.hand.filter((c) => c.public),
      totalCrowns: p.totalCrowns,
      totalShadows: p.totalShadows,
      roundCrowns: p.roundCrowns,
      roundShadows: p.roundShadows,
      influence: p.influence,
      prestige: totalPrestige(p),
      pairs: totalPairs(p),
    })),
  });
}

function projectLocalHand(awaiting = throneHand.waitingLocal) {
  const p = game.players[0],
    demo = p.ai;
  const automaticReserve =
    !demo && game.decree?.id === 'reserva' && game.trick === 10 && !!p.reserve;
  const legal = !demo && awaiting && !automaticReserve ? getLegalCards(p) : [];
  const hiddenLegal = legal.filter((c) => c.publicReason !== 'Corte Aberta');
  const canInfluence = !!hiddenLegal.length && canUseInfluence(p, 1);
  return {
    you: 0,
    round: game.round,
    trick: game.trick,
    phase: game.phase === 'setup' ? 'starting' : game.phase,
    turn: game.turn,
    opening: !!legal.length && !game.plays.length && game.leader === 0,
    automaticReserve,
    hand: demo ? [] : p.hand,
    reserve: demo ? null : p.reserve,
    influence: demo ? 0 : p.influence,
    legal: legal.map((c) => c.id),
    hiddenLegal: hiddenLegal.map((c) => c.id),
    canUseInfluence: canInfluence,
    canUseManeuver: canInfluence && canUseInfluence(p, 2),
    influenceBlocked: isInfluenceBlocked(p),
    decreeName: game.decree?.name || 'Decreto',
  };
}
function renderHand() {
  if (!game || onlineGameMode) return;
  throneHand.presentLocal(game.handSession, projectLocalHand(), game.players[0].ai);
}
function selectedInfluenceCost(action) {
  return action === 'sigilo' ? 1 : action === 'plus' || action === 'minus' ? 2 : 0;
}
function selectedInfluenceModifier(action) {
  return action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
}
// Copy only the human's own cards and public seats into the shared choices owner.
// The local engine retains the rules, mutable cards and simultaneous exchanges.
async function chooseLocal(prompt) {
  const session = game,
    own = session.players[0];
  if (session.online || own.ai) throw new Error('A mesa não possui uma escolha humana local.');
  const value = await throneChoices.showLocal(
    session.choiceSession,
    {
      you: 0,
      round: session.round,
      trick: session.trick,
      phase: prompt.kind,
      lastCrown: session.lastCrown,
      lastShadow: session.lastShadow,
      hand: own.hand,
      reserve: own.reserve,
      players: session.players.map((p) => ({ seat: p.id, name: p.name })),
      lawUsage: session.lawUsage,
    },
    prompt,
  );
  if (session !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
  return value;
}
async function chooseCardFromHand(p, kind, candidates = p.hand, otherName) {
  if (p.ai) return candidates[rand(candidates.length)];
  if (p !== game.players[0]) throw new Error('Assento humano local inválido.');
  const ids = candidates.map((c) => c.id);
  const value = await chooseLocal({ kind, cardIds: ids, otherName });
  const card = p.hand.find((c) => c.id === value && ids.includes(c.id));
  if (
    !card ||
    (kind === 'usurp-give' && card.publicReason === 'Corte Aberta') ||
    (kind === 'challenge' && card.public)
  )
    throw new Error('Carta local indisponível.');
  return card;
}

let activeTooltipTarget = null;
function positionHoverTooltip(e) {
  const tip = $('hoverTooltip');
  if (!tip || tip.classList.contains('hidden')) return;
  const pad = 14,
    gap = 16;
  const rect = tip.getBoundingClientRect();
  let x = e.clientX + gap,
    y = e.clientY - rect.height - gap;
  if (x + rect.width + pad > window.innerWidth) x = e.clientX - rect.width - gap;
  if (y < pad) y = e.clientY + gap;
  tip.style.left = `${Math.max(pad, x)}px`;
  tip.style.top = `${Math.max(pad, Math.min(window.innerHeight - rect.height - pad, y))}px`;
}
document.addEventListener('pointerover', (e) => {
  const target = e.target.closest?.('[data-tooltip]');
  if (!target || !target.dataset.tooltip) return;
  activeTooltipTarget = target;
  const tip = $('hoverTooltip');
  if (!tip) return;
  tip.textContent = target.dataset.tooltip;
  tip.classList.remove('hidden');
  requestAnimationFrame(() => tip.classList.add('visible'));
  positionHoverTooltip(e);
});
document.addEventListener('pointermove', (e) => {
  if (activeTooltipTarget) positionHoverTooltip(e);
});
document.addEventListener('pointerout', (e) => {
  if (!activeTooltipTarget) return;
  if (e.relatedTarget && activeTooltipTarget.contains(e.relatedTarget)) return;
  const from = e.target.closest?.('[data-tooltip]');
  if (from !== activeTooltipTarget) return;
  const tip = $('hoverTooltip');
  activeTooltipTarget = null;
  if (tip) {
    tip.classList.remove('visible');
    setTimeout(() => {
      if (!activeTooltipTarget) tip.classList.add('hidden');
    }, 140);
  }
});

function enterOnlineBoard() {
  onlineGameMode = true;
  window.TronoPortal?.showOnly?.('gameScreen');
}
// Presentation bridge only. Network parsing and clock state belong to TronoThroneMatch.
function presentOnlineMatch(state) {
  if (!state) {
    if (game?.online) game = null;
    return;
  }
  if (leavingGame) return;
  if (!onlineGameMode) enterOnlineBoard();
  const next = {
    ...state,
    decree: state.decree ? DECREES.find((d) => d.id === state.decree) : null,
    gameOver: state.phase === 'game-over',
  };
  // Temporary public presentation adapter; the event owner reads ThroneMatch directly.
  if (game?.online) Object.assign(game, next);
  else game = next;
  renderAll();
}
function consumeChatOnlyRoom(room) {
  chatOnlyRoomState = room;
  if (room?.id)
    try {
      sessionStorage.setItem(
        'mn-resume-chat',
        JSON.stringify({ id: room.id, userId: window.TronoAuth?.user?.id }),
      );
    } catch {}
  if ($('chatOnlyRoomName')) $('chatOnlyRoomName').textContent = room?.name || 'Comunidade';
  if ($('chatOnlyStatus'))
    $('chatOnlyStatus').textContent =
      `${room?.name || 'Comunidade'} · ${room?.channelType === 'text' ? 'Canal de texto' : room?.channelType === 'voice' ? 'Canal de voz' : 'Texto e voz'}`;
  document.querySelector('.court-chat-title strong').textContent =
    '# ' + (room?.name || 'conversa');
  $('channelFilesBtn').classList.toggle('hidden', room?.channelType === 'voice');
  window.TronoNetwork?.requestChatChannels?.();
  const count = room?.count ?? room?.players?.length ?? 0;
  if ($('chatOnlyCount'))
    $('chatOnlyCount').textContent =
      `${count} ${count === 1 ? 'pessoa conectada' : 'pessoas conectadas'}`;
  if (!window.TronoNetwork?.connected && $('chatOnlyStatus'))
    $('chatOnlyStatus').textContent = 'Reconectando ao servidor...';
}
async function enterChatOnly({
  validatedIdentity,
  channelId,
  isCurrent = () => true,
  showScreen,
} = {}) {
  if (!isCurrent()) return false;
  if (window.TronoAuth && !window.TronoAuth.user) {
    window.TronoAuth.open('login');
    return false;
  }
  if (
    !$('chatOnlyScreen') ||
    !$('socialPanel') ||
    !window.TronoSocial?.showForRoom ||
    !window.TronoNetwork?.joinChatOnly
  )
    throw new Error('O chat não terminou de carregar. Recarregue com Ctrl+F5.');
  const validation = validatedIdentity || (await window.TronoPortal?.validateIdentity?.());
  if (!isCurrent()) return false;
  if (validation && !validation.ok) {
    toast(validation.message || 'Escolha um nome disponível.', 1800);
    window.TronoPortal?.showPortal?.();
    $('portalIdentity')?.focus();
    return false;
  }
  const name = validation?.name || $('playerIdentity')?.value?.trim();
  if (!name) {
    toast('Digite um nome para entrar.', 1600);
    window.TronoPortal?.showPortal?.();
    return false;
  }
  storage.setItem('tronoPlayerName', name);
  await window.TronoCommunityAdmin?.refresh?.().catch(() => {});
  if (!isCurrent()) return false;
  const requested = window.TronoChannels.get(channelId) ? channelId : null,
    current = window.TronoNetwork.currentRoom;
  const restoreCurrent = window.TronoChannels.get(current) && (!requested || requested === current);
  const preserveVoice =
    !requested && window.TronoNetwork.independentGameVoice && window.TronoSocial.voiceJoined;
  if (!requested)
    channelId = preserveVoice
      ? window.TronoChannels.getSnapshot().channels.find((c) => c.type !== 'voice')?.id
      : (window.TronoDesktop
          ? window.TronoChannels.getSnapshot().channels.find((c) => c.type !== 'text')?.id
          : null) || window.TronoChannels.getSnapshot().channels[0]?.id;
  if (!window.TronoNetwork.gameRoom) {
    throneLobby.clear();
    onlineGameMode = false;
  }
  chatOnlyRoomState = null;
  try {
    window.TronoSocial.setChatHubMode?.(true);
    window.TronoSocial.showForRoom(true);
    if (showScreen) showScreen();
    else if (window.TronoPortal?.showOnly) window.TronoPortal.showOnly('chatOnlyScreen');
    else
      for (const id of [
        'portalScreen',
        'setupScreen',
        'roomScreen',
        'gameScreen',
        'chatOnlyScreen',
      ])
        $(id)?.classList.toggle('hidden', id !== 'chatOnlyScreen');
    document.body.classList.remove('portal-active');
    document.body.classList.add('chat-only-active');
  } catch (err) {
    window.TronoSocial.setChatHubMode(false);
    throw err;
  }
  if (restoreCurrent) {
    consumeChatOnlyRoom(window.TronoSocial.chatRoomState);
    return true;
  }
  if (!channelId) {
    $('chatOnlyStatus').textContent = preserveVoice
      ? 'Sua chamada continua conectada. Selecione uma sala de voz para trocar de chamada.'
      : 'Nenhum canal disponível. Crie um canal para começar.';
    if (!preserveVoice) {
      window.TronoNetwork.leaveVoiceRoom();
      window.TronoSocial.consumeRoom(null);
    }
    return true;
  }
  $('chatOnlyStatus').textContent = 'Abrindo a comunidade...';
  void ensureAudio().catch(() => {});
  try {
    const textSubscription = preserveVoice || window.TronoChannels.get(channelId)?.type === 'text',
      wasInVoice = window.TronoSocial.voiceJoined;
    if (!textSubscription && window.TronoNetwork.primaryRoom !== channelId && wasInVoice)
      await window.TronoSocial.leaveVoice();
    if (!isCurrent()) return false;
    const online = await (textSubscription
      ? window.TronoNetwork.joinTextChannel(channelId, name)
      : window.TronoNetwork.joinChatChannel(channelId, name));
    if (!isCurrent()) return false;
    window.TronoNetwork.requestChatChannels?.();
    if (window.TronoCallNavigation.getSnapshot().hub && !online)
      $('chatOnlyStatus').textContent =
        'Servidor indisponível. Aguarde a reconexão ou volte ao início para tentar novamente.';
  } catch (err) {
    if (!isCurrent()) return false;
    console.warn('Conexão ao chat:', err);
    if (window.TronoCallNavigation.getSnapshot().hub)
      $('chatOnlyStatus').textContent =
        'Conexão interrompida. Aguarde a reconexão ou volte ao início para tentar novamente.';
  }
  return true;
}
let chatChannelSwitching = false;
let chatChannelResumeVoice = null;
async function switchChatChannel(channelId, { connectVoice = false } = {}) {
  if (
    !window.TronoCallNavigation.getSnapshot().hub ||
    chatChannelSwitching ||
    !window.TronoChannels.get(channelId)
  )
    return;
  if (
    window.TronoNetwork?.currentRoom === channelId &&
    (window.TronoChannels.get(channelId)?.type === 'text' ||
      window.TronoNetwork.primaryRoom === channelId)
  ) {
    if (
      connectVoice &&
      window.TronoChannels.get(channelId)?.type !== 'text' &&
      !window.TronoSocial.voiceJoined
    )
      await window.TronoSocial.joinVoice();
    return;
  }
  chatChannelSwitching = true;
  try {
    const wasInVoice = Boolean(window.TronoSocial?.voiceJoined);
    const textChannel = window.TronoChannels.get(channelId)?.type === 'text';
    const keepVoice = textChannel || channelId === window.TronoNetwork.primaryRoom;
    if (!keepVoice) await window.TronoSocial?.leaveVoice?.();
    const name = (
      storage.getItem('tronoPlayerName') ||
      $('portalIdentity')?.value ||
      $('playerIdentity')?.value ||
      ''
    ).trim();
    if (!name) {
      toast('Informe seu nome no portal para entrar.', 1800);
      return;
    }
    // Only an explicit room choice starts voice. Opening/resuming the hub never does.
    chatChannelResumeVoice =
      (wasInVoice || connectVoice) && !textChannel && !window.TronoSocial.voiceJoined
        ? channelId
        : null;
    const online = await (textChannel
      ? window.TronoNetwork.joinTextChannel(channelId, name)
      : window.TronoNetwork.joinChatChannel(channelId, name));
    if (!online) throw new Error('Servidor indisponível.');
    $('chatOnlyStatus').textContent = textChannel
      ? 'Abrindo mensagens...'
      : `Entrando no canal ${window.TronoChannels.get(channelId).name}...`;
    window.TronoSocial?.clearChannelChat?.();
  } catch (err) {
    chatChannelResumeVoice = false;
    toast(err?.message || 'Não foi possível trocar de canal.', 2200);
  } finally {
    chatChannelSwitching = false;
  }
}
async function leaveChatOnly() {
  chatChannelResumeVoice = null;
  try {
    sessionStorage.removeItem('mn-resume-chat');
  } catch {}
  await window.TronoSocial?.leaveVoice?.();
  window.TronoSocial?.showForRoom?.(false);
  window.TronoSocial?.setChatHubMode?.(false);
  window.TronoNetwork?.leaveVoiceRoom();
  chatOnlyRoomState = null;
  document.body.classList.remove('chat-only-active');
  $('chatOnlyScreen').classList.add('hidden');
  if (window.TronoPortal?.showPortal) window.TronoPortal.showPortal();
  else $('setupScreen').classList.remove('hidden');
  setTimeout(() => window.TronoNetwork?.requestRooms(), 120);
}
function backToLobby() {
  window.TronoThroneEvents.clear();
  throneChoices.clear();
  throneHand.clear();
  leavingGame = true;
  clearLocalTurnTimer();
  throneEffects.clear();
  if (
    window.TronoNetwork?.gameRoom &&
    window.TronoNetwork?.primaryRoom === window.TronoNetwork?.gameRoom
  )
    void window.TronoSocial?.leaveVoice?.();
  window.TronoNetwork?.leaveGameRoom();
  throneLobby.clear();
  onlineGameMode = false;
  game = null;
  thronePrivate.clear();
  throneHistory.clear();
  throneMatch.clear();
  window.TronoSocial?.setChatHubMode?.(false);
  document.body.classList.remove('chat-only-active');
  window.TronoPortal?.showOnly?.('setupScreen');
  if (!window.TronoSocial?.voiceJoined) window.TronoSocial?.showForRoom?.(false);
  setTimeout(() => window.TronoNetwork?.requestRooms(), 120);
}

$('chatOnlyBtn')?.addEventListener('click', () =>
  enterChatOnly().catch((err) => {
    window.TronoPortal?.showPortal?.();
    toast(err.message || 'Não foi possível abrir o chat.', 3000);
    console.error(err);
  }),
);
$('backFromChatOnlyBtn')?.addEventListener('click', () => leaveChatOnly().catch(fatalError));
window.TronoNetwork?.onMessage((msg) => {
  if (msg.type === 'connection') {
    if (
      !msg.connected &&
      (throneLobby.getSnapshot().room ||
        onlineGameMode ||
        window.TronoCallNavigation.getSnapshot().hub)
    )
      showConnectionNotice('Você', null, 'self-disconnect');
    if (window.TronoCallNavigation.getSnapshot().hub && $('chatOnlyStatus'))
      $('chatOnlyStatus').textContent = msg.connected
        ? 'Servidor reconectado.'
        : 'Conexão interrompida; tentando reconectar...';
  }
  if (msg.type === 'version-mismatch') {
    toast('⚠ Frontend e backend estão em versões diferentes.', 3200);
  }
  if (
    msg.type === 'channel-deleted' &&
    window.TronoCallNavigation.getSnapshot().hub &&
    msg.roomId === chatOnlyRoomState?.id
  ) {
    chatOnlyRoomState = null;
    chatChannelResumeVoice = false;
    try {
      sessionStorage.removeItem('mn-resume-chat');
    } catch {}
    window.TronoSocial.consumeChatRoom(null);
    document.body.classList.remove('channel-text-active', 'channel-voice-active');
    $('chatOnlyStatus').textContent = 'Este canal foi excluído. Escolha outro canal.';
    window.TronoSocial.clearChannelChat();
    window.TronoNetwork.requestChatChannels();
  }
  if (msg.type === 'joined-text-channel' && window.TronoCallNavigation.getSnapshot().hub)
    consumeChatOnlyRoom(msg.room);
  if (msg.type === 'joined-room') {
    if (msg.room?.kind === 'chat') {
      window.TronoSocial?.setChatHubMode?.(true);
      consumeChatOnlyRoom(msg.room);
      if (chatChannelResumeVoice === msg.room.id) {
        chatChannelResumeVoice = null;
        void window.TronoSocial?.joinVoice?.();
      }
    }
  }
  if (msg.type === 'room-state') {
    if (msg.room?.kind === 'chat' && msg.room.id === window.TronoNetwork.currentRoom)
      consumeChatOnlyRoom(msg.room);
  }
  if (msg.type === 'player-left' && !onlineGameMode) {
    if (window.TronoCallNavigation.getSnapshot().hub) {
      toast(`${msg.name || 'Uma pessoa'} saiu do canal.`, 1500);
    } else if (msg.reason === 'disconnect') showConnectionNotice(msg.name, null, 'disconnect');
    else toast(`${msg.name || 'Um jogador'} deixou o salão.`, 1600);
  }
  if (msg.type === 'error') {
    if (msg.code === 'NAME_TAKEN' || msg.code === 'NAME_REQUIRED') {
      window.TronoPortal?.setNameFeedback?.({
        available: false,
        code: msg.code,
        message: msg.message || 'Nome indisponível.',
      });
      toast(msg.message || 'Escolha outro nome.', 2800);
      if (window.TronoCallNavigation.getSnapshot().hub) {
        leaveChatOnly().catch(() => window.TronoPortal?.showPortal?.());
      } else if (throneLobby.getSnapshot().selected && !onlineGameMode) {
        backToLobby();
      }
    } else toast(msg.message || 'Erro de sala', 2400);
  }
});
window.addEventListener('trono:ready', async () => {
  await window.TronoAuth?.ready;
  try {
    const saved = JSON.parse(sessionStorage.getItem('mn-resume-chat') || 'null');
    if (saved?.id && saved.userId === window.TronoAuth?.user?.id)
      await enterChatOnly({ channelId: saved.id });
  } catch (err) {
    console.warn('Retomar chat:', err);
  }
  const savedName = storage.getItem('tronoPlayerName');
  if (savedName !== null) $('playerIdentity').value = savedName;
  const online = await window.TronoNetwork?.connect();
  if (online) window.TronoNetwork.requestRooms();
});

$('startHumanBtn').onclick = () => startGame(false).catch(fatalError);
$('startDemoBtn').onclick = () => startGame(true).catch(fatalError);

function showChallengeReveal(seat, card) {
  throneEffects.challenge({ seat, card });
}
function syncLocalStatus() {
  if (!game || onlineGameMode) return;
  throneMatch.setLocal({
    round: game.round,
    trick: game.trick,
    phase: game.phase,
    turnName: game.turn == null ? null : playerLabel(game.turn),
    yourTurn: isLocalPlayersTurn(),
    deadline: game.turnDeadline || null,
  });
}

function fatalError(err) {
  if (err.name === 'AbortError') return;
  console.error(err);
  logEvent(`Erro de execução: ${err.message}`);
  toast('O jogo encontrou um erro. Veja o console.', 3000);
}

// Utilidades de teste expostas sem interferir na partida normal.
window.TronoChatHub = {
  enter: enterChatOnly,
  leave: leaveChatOnly,
  switchChannel: switchChatChannel,
  openChannelText(id) {
    void window.TronoMessenger.joinChannel(id, { showText: true }).catch((e) =>
      toast(e.message, 2200),
    );
  },
  get channels() {
    return window.TronoChannels.getSnapshot().channels;
  },
};
window.__LeiDoTrono = {
  getState: () => game,
  validateLawPlan: () => (game ? getSafeLawChoices(game.trick + 1) : []),
  setFast: () => {
    throneControls.setFast();
  },
  toggleMusic,
  usurpacaoRule: () => ({
    rule: LAWS.usurpacao.description,
    privateReveal:
      'A identidade das duas cartas só é exibida no cliente local quando ele é a Sombra ou a Casa escolhida.',
  }),
};

// Temporary board bridge: lobby owns selection/rosters; this controller still owns match cancellation.
window.TronoThroneBoard = {
  presentOnlineMatch,
  notify: toast,
  get online() {
    return !!game?.online;
  },
  prepareRoom(name) {
    leavingGame = false;
    window.TronoSocial?.setChatHubMode?.(false);
    storage.setItem('tronoPlayerName', name);
    $('p0Name').value = name;
    $('p1Name').value = 'Epaminondas';
    $('p2Name').value = 'Bonifácio';
    $('p3Name').value = 'Cícero';
  },
  backToLobby,
};
