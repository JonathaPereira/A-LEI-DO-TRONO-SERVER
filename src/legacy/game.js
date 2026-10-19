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

let animationScale = 1;
let game = null;
let humanPlayResolver = null;
let modalResolver = null,
  modalReject = null,
  leavingGame = false;
const throneLobby = window.TronoThroneLobby;
const throneChoices = window.TronoThroneChoices;
const throneHand = window.TronoThroneHand;
const throneMatch = window.TronoThroneMatch;
const throneSeats = window.TronoThroneSeats;
const thronePrivate = window.TronoThronePrivate;
let onlineGameMode = false;
let chatOnlyRoomState = null;
let exchangeSequence = 0;
let localTurnTimer = null;
let clientLogHistory = [];
// Audio controls initialize independently of the game/room interface.
const storage = window.TronoStorage || localStorage;
const ensureAudio = (...args) => window.TronoAudio?.ensureAudio(...args) || Promise.resolve(false);
const playSfx = (...args) => window.TronoAudio?.playSfx(...args);
const toggleMusic = (...args) => window.TronoAudio?.toggleMusic(...args);

function cardAsset(card) {
  return `assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`;
}
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
  await sleep(Math.max(30, base * animationScale));
  if (current && !current.online && current !== game)
    throw Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
}
function escAttr(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function lawTooltip(id) {
  const law = LAWS[id];
  if (!law) return '';
  const used = game?.lawUsage?.[id] ?? 0;
  let extra = game ? ` Usos consumidos nesta rodada: ${used}/2.` : '';
  if (game?.currentLaw === id) {
    extra += ` Esta é a Lei ativa da vaza ${game.trick}.`;
    if (id === 'estandarte')
      extra += game.trump
        ? ` Trunfo atual: ${SUITS[game.trump].name}.`
        : ' O Trunfo será declarado antes da abertura.';
  }
  return `${law.name}: ${law.description}${extra}`;
}
function decreeTooltip(d = game?.decree) {
  if (!d) return 'O Decreto altera a estrutura estratégica da rodada inteira.';
  if (!game) return `${d.name}: ${d.text}`;
  let moment = '';
  if (d.id === 'reserva')
    moment =
      game.trick < 10
        ? ` Momento atual: a Reserva continua protegida e será obrigatória na 10ª vaza.`
        : ` Momento atual: a carta de Reserva deve ser jogada nesta 10ª vaza.`;
  if (d.id === 'rotacao')
    moment =
      game.trick < 7
        ? ` Momento atual: a Rotação ainda não começou; haverá trocas após as vazas 7, 8 e 9.`
        : game.trick <= 9
          ? ` Momento atual: ao fim desta vaza haverá uma troca simultânea para a esquerda.`
          : ` Momento atual: as rotações desta rodada já terminaram.`;
  if (d.id === 'corte')
    moment =
      ' Momento atual: as cartas escolhidas pela Corte Aberta permanecem expostas até serem utilizadas.';
  if (d.id === 'desafio')
    moment =
      ' Momento atual: uma primeira Coroa, ou uma nova Coroa consecutiva, pode obrigar o vencedor a revelar uma carta.';
  if (d.id === 'silencio')
    moment =
      game.trick <= 3
        ? ` Momento atual: gastar Influência está BLOQUEADO nesta vaza (${game.trick}/3).`
        : ' Momento atual: o período de Silêncio terminou; Influência pode ser usada normalmente.';
  if (d.id === 'sucessao')
    moment = game.previousWinningSuit
      ? ` Momento atual: o próximo líder não poderá abrir com ${SUITS[game.previousWinningSuit].name}, salvo se não possuir outro naipe.`
      : ' Momento atual: ainda não existe um naipe vencedor anterior a restringir.';
  return `${d.name}: ${d.text}${moment}`;
}

function logEvent(html) {
  const el = document.createElement('div');
  el.className = 'event-item';
  el.innerHTML = html;
  $('eventLog').prepend(el);
  const plain = el.textContent || '';
  clientLogHistory.push({
    ts: Date.now(),
    round: game?.round || 0,
    trick: game?.trick || 0,
    message: plain,
  });
  if (clientLogHistory.length > 600) clientLogHistory.splice(0, clientLogHistory.length - 600);
}
function clearLog() {
  $('eventLog').innerHTML = '';
  clientLogHistory = [];
}
function toast(text, ms = 1500) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), ms * animationScale + 250);
}

function showConnectionNotice(name, botName = null, reason = 'disconnect') {
  const el = $('connectionNotice');
  if (!el) return;
  const disconnected = reason === 'disconnect' || reason === 'self-disconnect';
  const title =
    reason === 'self-disconnect'
      ? 'CONEXÃO COM O SERVIDOR INTERROMPIDA'
      : disconnected
        ? `${escAttr(name || 'Um jogador')} SE DESCONECTOU`
        : `${escAttr(name || 'Um jogador')} SAIU DA SALA`;
  const detail =
    reason === 'self-disconnect'
      ? 'Tentando manter o estado local. Recarregue se a conexão não voltar.'
      : botName
        ? `${escAttr(botName)} assumiu o assento e a partida continua.`
        : 'O assento ficou livre.';
  el.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showConnectionNotice._timer);
  showConnectionNotice._timer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, 3600);
}
function showInfluenceUseFeedback({
  name = 'Jogador',
  action = 'sigilo',
  cost = null,
  modifier = 0,
  declaredSuit = null,
} = {}) {
  const el = $('influencePublicNotice');
  if (!el || !action || action === 'none' || action === 'hidden') return;
  const actualCost = cost ?? (action === 'sigilo' ? 1 : 2),
    label =
      action === 'sigilo'
        ? 'SIGILO'
        : action === 'plus'
          ? 'MANOBRA DA CORTE +3'
          : 'MANOBRA DA CORTE -3';
  const detail =
    action === 'sigilo'
      ? 'Carta jogada oculta • valor original mantido'
      : `Modificador público ${modifier > 0 ? '+3' : '-3'} • valor efetivo limitado entre 1 e 12`;
  const suit =
    declaredSuit && SUITS[declaredSuit] ? ` • Naipe anunciado: ${SUITS[declaredSuit].name}` : '';
  el.className = `influence-public-notice ${action === 'plus' ? 'plus' : action === 'minus' ? 'minus' : ''}`;
  el.innerHTML = `<div class="influence-coins-public">${Array.from({ length: actualCost }, () => '<i>✦</i>').join('')}</div><strong>${escAttr(name)}</strong><b>${label}</b><span>${detail}${suit}</span>`;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  playSfx('influence');
  clearTimeout(showInfluenceUseFeedback._timer);
  showInfluenceUseFeedback._timer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, 2700);
}

function isLocalPlayersTurn() {
  if (!game || game.phase !== 'await-play' || game.turn == null) return false;
  return game.turn === (onlineGameMode ? game.localPlayerId : 0);
}
function showYourTurnNotice() {
  const wrap = $('turnNotice');
  if (!wrap || !game) return;
  const law = $('turnNoticeLaw');
  if (law)
    law.textContent = `${LAWS[game.currentLaw]?.name || 'Lei ativa'} • escolha uma carta válida`;
  wrap.classList.remove('hidden', 'play');
  wrap.setAttribute('aria-hidden', 'false');
  void wrap.offsetWidth;
  wrap.classList.add('play');
  playSfx('turn');
  clearTimeout(showYourTurnNotice._timer);
  showYourTurnNotice._timer = setTimeout(
    () => {
      wrap.classList.add('hidden');
      wrap.classList.remove('play');
      wrap.setAttribute('aria-hidden', 'true');
    },
    2400 * Math.max(0.35, animationScale),
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
  throneChoices.clear();
  throneHand.clear();
  throneMatch.clear();
  thronePrivate.clear();
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
    sortMode: 'suit',
    gameOver: false,
    declaredLeadSuit: null,
    room: throneLobby.getSnapshot().selected,
    // No protótipo local, o jogador humano ocupa o assento 0. Quando a partida online
    // for sincronizada, este campo será preenchido com o assento pertencente a este cliente.
    localPlayerId: allAI ? null : 0,
  };
  game.leader = game.firstRoundStarter;
  $('setupScreen').classList.add('hidden');
  $('roomScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  clearLog();
  logEvent(
    `<strong>Partida iniciada${throneLobby.getSnapshot().selected ? ` em ${throneLobby.getSnapshot().selected.name}` : ''}.</strong> O sorteio definiu ${playerLabel(game.leader)} como primeiro líder.`,
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
  logEvent(`<strong>Decreto:</strong> ${game.decree.name} vigorará durante toda a rodada.`);
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
    const choice = await choiceModal({
      icon: '📜',
      title: 'Escolha o Decreto',
      text: `Você recebeu a escolha desta rodada. Selecione 1 dos 2 Decretos sorteados.`,
      options: picks.map((d) => ({
        value: d.id,
        type: 'decree',
        title: d.name,
        subtitle: d.text,
        icon: d.icon,
      })),
    });
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
      } else
        card = await chooseCardFromHand(
          p,
          'Escolha sua Reserva',
          'Esta carta ficará fora da mão durante as 9 primeiras vazas e será obrigatória na 10ª vaza.',
        );
      p.reserve = card;
      p.hand = p.hand.filter((c) => c.id !== card.id);
      logEvent(`${p.name} separou uma carta na <strong>Reserva</strong>.`);
    }
  }
  if (game.decree.id === 'corte') {
    for (const p of game.players) {
      const candidates = p.hand.filter((c) => !c.public);
      let card = p.ai
        ? candidates[rand(candidates.length)]
        : await chooseCardFromHand(
            p,
            'Corte Aberta',
            'Revele 1 carta. Ela continuará em sua mão, mas ficará pública até ser usada.',
          );
      card.public = true;
      card.publicReason = 'Corte Aberta';
      logEvent(
        `${p.name} revelou ${SUITS[card.suit].name} ${card.value} pela <strong>Corte Aberta</strong>.`,
      );
    }
  }
  if (game.decree.id === 'favor') for (const p of game.players) p.influence = 1;
  if (game.decree.id === 'conselho') {
    const choices = new Map();
    for (const p of game.players) {
      const card = p.ai
        ? p.hand[rand(p.hand.length)]
        : await chooseCardFromHand(
            p,
            'Conselho',
            'Escolha uma carta fechada para passar ao jogador à direita. Todas as trocas acontecem juntas.',
          );
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
  logEvent(`<strong>Vaza ${game.trick}:</strong> ${LAWS[game.currentLaw].name}.`);
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
    game.trump = await choiceModal({
      icon: '⚑',
      title: 'Declare o Trunfo',
      text: 'Como Sombra da vaza anterior, escolha o naipe de Trunfo antes da abertura da vaza.',
      options: SUIT_ORDER.map((s) => ({
        value: s,
        type: 'suit',
        title: SUITS[s].name,
        icon: SUITS[s].glyph,
        color: SUITS[s].color,
      })),
    });
  }
  logEvent(`${chooser.name} declarou <strong>${SUITS[game.trump].name}</strong> como Trunfo.`);
  renderAll();
}

function exchangePointForPlayer(id) {
  // Coordenadas relativas ao palco, espelhando a posição dos quatro jogadores na mesa.
  return (
    [
      { x: '50%', y: '88%' }, // J1 — baixo
      { x: '10%', y: '50%' }, // J2 — esquerda
      { x: '50%', y: '12%' }, // J3 — topo
      { x: '90%', y: '50%' }, // J4 — direita
    ][id] || { x: '50%', y: '50%' }
  );
}

function exchangeNodeHtml(p, role = '') {
  return `<div class="exchange-player-node exchange-node-${p.id}"><span>${SUITS[SUIT_ORDER[p.id % 4]].glyph}</span><div><b>${escAttr(p.name)}</b>${role ? `<div class="node-role">${role}</div>` : ''}</div></div>`;
}

function exchangeArrowHtml(fromId, toId) {
  const numeric = {
    0: { x: 50, y: 88 },
    1: { x: 10, y: 50 },
    2: { x: 50, y: 12 },
    3: { x: 90, y: 50 },
  };
  const a = numeric[fromId],
    b = numeric[toId];
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return `<div class="exchange-arrow" style="left:${a.x}%;top:${a.y}%;width:${len}%;transform:rotate(${angle}deg)"></div>`;
}

async function showExchangeAnimation({
  kind = 'exchange',
  title = 'Troca de cartas',
  subtitle = '',
  moves = [],
}) {
  const wrap = $('exchangeCinematic'),
    stage = $('exchangeStage');
  if (!wrap || !stage || !moves.length) return;
  const sequence = ++exchangeSequence;
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 450
    : Math.max(900, 3000 * animationScale);
  wrap.style.setProperty('--exchange-duration', `${duration}ms`);
  $('exchangeIcon').textContent = kind === 'rotation' ? '⟳' : '⇄';
  $('exchangeKicker').textContent =
    kind === 'rotation' ? 'DECRETO EM MOVIMENTO' : 'LEI EM MOVIMENTO';
  $('exchangeTitle').textContent = title;
  $('exchangeSubtitle').textContent = subtitle || 'Cartas ocultas estão mudando de mãos.';

  const touched = [...new Set(moves.flatMap((m) => [m.from, m.to]))];
  let html = touched
    .map((id) => {
      const p = game.players[id];
      const roles = [];
      if (kind === 'usurpacao') {
        if (id === game.lastShadow) roles.push('Sombra');
        if (id === game.lastCrown) roles.push('Coroa');
      }
      return exchangeNodeHtml(p, roles.join(' • '));
    })
    .join('');
  html += moves.map((m) => exchangeArrowHtml(m.from, m.to)).join('');
  html += `<div class="exchange-center-seal"><strong>${kind === 'rotation' ? 'ROTAÇÃO' : 'TROCA'}</strong><small>${kind === 'rotation' ? 'À ESQUERDA' : 'CARTAS OCULTAS'}</small></div>`;
  html += moves
    .map((m, i) => {
      const a = exchangePointForPlayer(m.from),
        b = exchangePointForPlayer(m.to);
      const cssClass = `exchange-card-token ${kind === 'rotation' ? 'rotation-card' : m.role === 'shadow' ? 'shadow-card' : ''}`;
      const label = m.label || `${game.players[m.from].name} → ${game.players[m.to].name}`;
      return `<div class="${cssClass}" style="--sx:${a.x};--sy:${a.y};--tx:${b.x};--ty:${b.y};--delay:${(m.delay || 0) * animationScale}ms;--r0:${i % 2 ? 7 : -7}deg;--rm:${i % 2 ? -7 : 7}deg;--r1:${i % 2 ? -5 : 5}deg"><span class="exchange-card-label">${escAttr(label)}</span></div>`;
    })
    .join('');
  stage.innerHTML = html;
  wrap.classList.remove('hidden');
  wrap.setAttribute('aria-hidden', 'false');
  playSfx('card');
  const maxDelay = Math.max(0, ...moves.map((m) => (m.delay || 0) * animationScale));
  await sleep(duration + maxDelay + 80);
  if (sequence !== exchangeSequence) return;
  wrap.classList.add('hidden');
  wrap.setAttribute('aria-hidden', 'true');
  stage.innerHTML = '';
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
  return await choiceModal({
    icon: '☾',
    title: 'Usurpação — escolha às cegas',
    text: `${crown.name} embaralhou a mão. Sua carta está separada e será entregue somente depois da escolha; ela nunca pode retornar. Escolha uma das cartas fechadas elegíveis. A carta da Corte Aberta está protegida e não participa da troca.`,
    options: pickable.map((_, i) => ({
      value: i,
      type: 'hidden-card',
      title: `Carta ${i + 1}`,
      subtitle: 'Face voltada para baixo',
    })),
  });
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
    : await choiceModal({
        icon: '☾',
        title: 'Usurpação — escolha uma Casa',
        text: 'Você pode trocar com qualquer adversário. Primeiro escolha a Casa; depois separe sua carta e escolha uma carta fechada da mão dela.',
        options: targets.map((p) => ({
          value: p.id,
          title: p.name,
          subtitle: 'Trocar uma carta fechada',
          icon: '♜',
        })),
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
      'Usurpação',
      'Escolha 1 carta da sua mão para entregar, virada para baixo, à Casa escolhida. A carta da Corte Aberta é protegida e não pode ser trocada.',
      shadow.hand.filter((c) => c.publicReason !== 'Corte Aberta'),
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
    `<strong>Usurpação:</strong> ${shadow.name} entregou 1 carta oculta a ${crown.name}; uma carta elegível da Casa escolhida passou à Sombra antes da entrega. A Corte Aberta permaneceu protegida.`,
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
function influenceOpeningSuits(p) {
  if (!p || game.plays.length !== 0 || p.id !== game.leader) return [];
  return [
    ...new Set(
      getLegalCards(p)
        .filter((c) => c.publicReason !== 'Corte Aberta')
        .map((c) => c.suit),
    ),
  ];
}

function announceHiddenLead(p, suit) {
  game.declaredLeadSuit = suit;
  logEvent(
    `<strong>Influência:</strong> ${p.name}, como Coroa, anunciou <strong>${SUITS[suit].name}</strong> antes de abrir a vaza com uma carta oculta.`,
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
    $('instructionText').textContent = 'Sua vez: escolha uma carta válida.';
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
  return new Promise((resolve, reject) => {
    clearLocalTurnTimer();
    game.turnDeadline = Date.now() + 60_000;
    humanPlayResolver = {
      resolve,
      reject,
      legalIds: new Set(legal.map((c) => c.id)),
      playerId: p.id,
      declaredSuit: null,
      influenceAction: 'none',
    };
    localTurnTimer = setTimeout(() => {
      if (!humanPlayResolver || humanPlayResolver.playerId !== p.id) return;
      const card = legal[rand(legal.length)];
      const r = humanPlayResolver.resolve;
      humanPlayResolver = null;
      localTurnTimer = null;
      game.turnDeadline = null;
      if ($('influenceToggle')) $('influenceToggle').checked = false;
      logEvent(`<strong>Tempo esgotado:</strong> ${p.name} recebeu uma jogada automática.`);
      toast('⌛ Tempo esgotado — carta aleatória jogada.', 1800);
      renderHand();
      r({ card, hidden: false, sourceInfo: null, influenceAction: 'none', modifier: 0 });
    }, 60_000);
    showYourTurnNotice();
    renderHand();
    renderAll(false);
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
    `${p.name} jogou ${hidden ? `<strong>uma carta oculta</strong>${play.order === 0 && game.declaredLeadSuit ? ` após anunciar <strong>${SUITS[game.declaredLeadSuit].name}</strong>` : ''}` : `${SUITS[card.suit].name} ${card.value}`}${isReserve ? ' da Reserva' : ''}.`,
  );
}

async function animateCardToTable(play, sourceInfo) {
  renderTableCards();
  const slot = $(`tableCard${play.playerId}`);
  slot.classList.add('active-drop', 'receiving-card');
  playSfx('card');
  if (sourceInfo) {
    const from = sourceInfo.rect,
      to = slot.getBoundingClientRect();
    const ghost = document.createElement('img');
    ghost.src = sourceInfo.src;
    ghost.style.cssText = `position:fixed;z-index:200;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;border-radius:8px;box-shadow:0 15px 40px #000;pointer-events:none;will-change:transform,opacity;`;
    document.body.appendChild(ghost);
    const anim = ghost.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        {
          transform: `translate(${(to.left - from.left) * 0.58}px,${(to.top - from.top) * 0.58}px) scale(.92)`,
          opacity: 0.98,
          offset: 0.64,
        },
        {
          transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width})`,
          opacity: 0.96,
        },
      ],
      { duration: 560 * animationScale, easing: 'cubic-bezier(.22,.75,.22,1)', fill: 'forwards' },
    );
    await anim.finished.catch(() => {});
    ghost.remove();
  } else await delay(420);
  slot.classList.remove('receiving-card');
  slot.classList.add('settling-card');
  await delay(260);
  slot.classList.remove('settling-card', 'active-drop');
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
  for (const play of game.plays) {
    if (play.hidden) {
      play.hidden = false;
      play.revealing = true;
    }
  }
  renderTableCards(true);
  await delay(450);
  for (const play of game.plays) play.revealing = false;
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

  markWinners(crown.playerId, shadow.playerId);
  const crownShown = crown.modifier
    ? `${crown.card.value} ${crown.modifier > 0 ? '+3' : '-3'} → ${playValue(crown)}`
    : `${crown.card.value}`;
  const shadowShown = shadow.modifier
    ? `${shadow.card.value} ${shadow.modifier > 0 ? '+3' : '-3'} → ${playValue(shadow)}`
    : `${shadow.card.value}`;
  logEvent(
    `<strong>${LAWS[game.currentLaw].name}</strong> — <strong>Coroa:</strong> ${crownP.name} (${SUITS[crown.card.suit].name} ${crownShown}). <strong>Sombra:</strong> ${shadowP.name} (${SUITS[shadow.card.suit].name} ${shadowShown})${game.currentLaw === 'estandarte' && game.trump ? ` • Trunfo: ${SUITS[game.trump].glyph} ${SUITS[game.trump].name}` : ''}.`,
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
  clearTableHighlights();
  await delay(350);
  await beginTrick();
}

async function showTrickOutcome(crownP, shadowP) {
  const wrap = $('trickOutcome'),
    crown = $('crownOutcome'),
    shadow = $('shadowOutcome');
  $('crownOutcomeName').textContent = crownP.name;
  $('shadowOutcomeName').textContent = shadowP.name;
  wrap.classList.remove('hidden');

  crown.classList.remove('hidden');
  crown.classList.remove('play');
  void crown.offsetWidth;
  crown.classList.add('play');
  playSfx('crown');
  await delay(3000);
  crown.classList.add('hidden');
  crown.classList.remove('play');

  await delay(220);
  shadow.classList.remove('hidden');
  shadow.classList.remove('play');
  void shadow.offsetWidth;
  shadow.classList.add('play');
  playSfx('shadow');
  await delay(3000);
  shadow.classList.add('hidden');
  shadow.classList.remove('play');
  wrap.classList.add('hidden');
}

function showInfluenceGains(gains) {
  if (!gains?.length) return;
  playSfx('influence');
  for (const gain of gains) {
    const panel = $(`playerEffects${gain.player.id}`);
    if (!panel) continue;
    const el = document.createElement('div');
    el.className = 'influence-gain-float';
    el.textContent = gain.after >= 2 ? '✦ +1 INFLUÊNCIA • PRONTA' : '✦ +1 INFLUÊNCIA';
    panel.appendChild(el);
    setTimeout(() => el.remove(), 1900);
    logEvent(
      `<strong>Influência:</strong> ${gain.player.name} não recebeu Coroa nem Sombra e ganhou +1 (${gain.after}/2).`,
    );
    if (gain.player.id === (onlineGameMode ? game.localPlayerId : 0)) {
      toast(
        gain.after >= 2
          ? '✦ Influência 2/2 — você pode jogar uma carta oculta!'
          : '✦ Você recebeu +1 Influência.',
        1800,
      );
    }
  }
  syncLocalSeats();
  for (const gain of gains) {
    const bank = $(`coinBank${gain.player.id}`);
    if (bank) {
      bank.classList.add('gain-flash');
      setTimeout(() => bank.classList.remove('gain-flash'), 950);
    }
  }
  renderHand();
}

async function revealForChallenge(p) {
  const privateCards = p.hand.filter((c) => !c.public);
  if (!privateCards.length) return;
  let card = p.ai
    ? privateCards[rand(privateCards.length)]
    : await chooseCardFromHand(
        p,
        'Desafio',
        'Sua Coroa exige um preço: revele 1 carta da sua mão. Ela permanecerá pública até ser usada.',
        privateCards,
      );
  card.public = true;
  card.publicReason = 'Desafio';
  logEvent(`<strong>Desafio:</strong> ${p.name} revelou ${SUITS[card.suit].name} ${card.value}.`);
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
    else
      card = await chooseCardFromHand(
        p,
        'Rotação',
        `Fim da vaza ${game.trick}: escolha 1 carta para passar ao jogador à esquerda.`,
      );
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
  logEvent(
    `<strong>Rotação:</strong> quatro cartas ocultas foram passadas simultaneamente para a esquerda.`,
  );
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
    logEvent(`${shadowP.name}, como Sombra, escolheu <strong>${LAWS[choice].name}</strong>.`);
    return choice;
  }
  const choice = await chooseLawModal(shadowP, valid);
  logEvent(`${shadowP.name}, como Sombra, escolheu <strong>${LAWS[choice].name}</strong>.`);
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
  const html = rows
    .map(
      ({ p, pairs, score, cumulativePrestige }) =>
        `<div class="score-row"><strong>${p.name}</strong><span>♛ ${p.roundCrowns}</span><span>☾ ${p.roundShadows}</span><span>Pares da rodada ${pairs}</span><b>+${score} · Total ${cumulativePrestige}</b></div>`,
    )
    .join('');
  await infoModal({
    icon: '♛',
    title: `Fim da Rodada ${game.round}`,
    text: `${html}<p class="score-note">Influências não usadas foram perdidas.</p>`,
    button: game.round === 3 ? 'Ver resultado final' : 'Iniciar próxima rodada',
  });
  logEvent(`<strong>Rodada ${game.round} encerrada.</strong>`);
  if (game.round >= 3) {
    await endGame();
    return;
  }
  game.round++;
  game.leader = nextStarter;
  logEvent(
    `${playerLabel(game.leader)} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`,
  );
  clearTableHighlights();
  renderTableCards(true, true);
  await startRound();
}

async function endGame() {
  game.gameOver = true;
  for (const p of game.players) {
    p.totalPairs = totalPairs(p);
    p.prestige = totalPrestige(p);
  }
  const sorted = [...game.players].sort(
    (a, b) =>
      b.prestige - a.prestige ||
      b.totalPairs - a.totalPairs ||
      b.totalCrowns - a.totalCrowns ||
      b.totalShadows - a.totalShadows,
  );
  const top = sorted[0];
  const tied = sorted.filter(
    (p) =>
      p.prestige === top.prestige &&
      p.totalPairs === top.totalPairs &&
      p.totalCrowns === top.totalCrowns &&
      p.totalShadows === top.totalShadows,
  );
  const winnerText =
    tied.length > 1
      ? `Vitória compartilhada: ${tied.map((p) => p.name).join(' e ')}`
      : `${top.name} ocupa o Trono.`;
  const html = sorted
    .map(
      (p, i) =>
        `<div class="score-row final"><strong>${i + 1}º ${p.name}</strong><span>Pares ${p.totalPairs}</span><span>♛ ${p.totalCrowns}</span><span>☾ ${p.totalShadows}</span><b>${p.prestige} Prestígio</b></div>`,
    )
    .join('');
  await infoModal({
    icon: '♛',
    title: 'Fim da Partida',
    text: `<h3 class="winner-title">${winnerText}</h3>${html}${renderFinalLogHtml(clientLogHistory)}`,
    button: 'Jogar novamente',
  });
  backToLobby();
}

function sortHand(p) {
  p.hand.sort(
    (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.value - b.value,
  );
}

function animateCourtArrival() {
  for (const [node, kind, value, key] of [
    [
      document.querySelector('.law-mini'),
      'law',
      game.currentLaw,
      `${game.round}:${game.trick}:${game.currentLaw}`,
    ],
    [$('decreeBadge'), 'decree', game.decree?.id, `${game.round}:${game.decree?.id}`],
  ]) {
    if (!node || !value || node.dataset.arrivalKey === key) continue;
    node.dataset.arrivalKey = key;
    node.dataset[kind] = value;
    node.classList.remove('court-arrival');
    if (
      !$('gameScreen').classList.contains('hidden') &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !document.body.classList.contains('voice-light-mode')
    ) {
      void node.offsetWidth;
      node.classList.add('court-arrival');
    }
  }
}
function renderAll(includeHand = true) {
  if (!game) return;
  syncLocalStatus();
  $('currentLawName').textContent = LAWS[game.currentLaw].name.toUpperCase();
  $('currentLawImg').src = LAWS[game.currentLaw].img;
  $('lawUsesText').textContent = `Uso ${Math.min(2, game.lawUsage[game.currentLaw] || 1)} de 2`;
  const lawMini = document.querySelector('.law-mini');
  if (lawMini) lawMini.dataset.tooltip = lawTooltip(game.currentLaw);
  const decree = game.decree;
  $('decreeBadge').innerHTML = decree
    ? `<small>DECRETO</small><strong>${decree.icon} ${decree.name}</strong>`
    : `<small>DECRETO</small><strong>Escolhendo...</strong>`;
  $('decreeBadge').dataset.tooltip = decreeTooltip(decree);
  $('decreeBadge').tabIndex = decree?.id === 'espionagem' ? 0 : -1;
  if (decree?.id === 'espionagem') {
    $('decreeBadge').setAttribute('role', 'button');
    $('decreeBadge').setAttribute('aria-label', 'Espionagem: consultar sua informação privada');
  } else {
    $('decreeBadge').removeAttribute('role');
    $('decreeBadge').removeAttribute('aria-label');
  }
  $('trumpInfo').classList.toggle('hidden', !game.trump);
  $('trumpSuitText').innerHTML = game.trump
    ? `<span class="trump-glyph" style="color:${SUITS[game.trump].color}">${SUITS[game.trump].glyph}</span>`
    : '—';
  const announced = game.declaredLeadSuit;
  $('leadSuitInfo').classList.toggle('hidden', !announced);
  $('leadSuitText').textContent = announced ? SUITS[announced].name : '—';
  animateCourtArrival();
  syncLocalSeats();
  renderLawTracker();
  renderTableCards();
  if (includeHand) renderHand();
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

function renderLawTracker() {
  $('lawTrackerList').innerHTML = LAW_ORDER.map(
    (l) =>
      `<div class="law-track-row ${l === game.currentLaw ? 'current' : ''}" data-tooltip="${escAttr(lawTooltip(l))}"><span>${LAWS[l].name}</span><span class="law-pips">${[0, 1].map((i) => `<i class="law-pip ${i < game.lawUsage[l] ? 'used' : ''}"></i>`).join('')}</span></div>`,
  ).join('');
}
function renderTableCards(revealHidden = false, clear = false) {
  for (let id = 0; id < 4; id++) {
    const slot = $(`tableCard${id}`);
    slot.classList.remove('winner-crown', 'winner-shadow');
    if (clear) {
      slot.innerHTML = `<span>J${id + 1}</span>`;
      continue;
    }
    const play = game.plays.find((p) => p.playerId === id);
    if (!play) {
      slot.innerHTML = `<span>${escAttr(game.players[id]?.name || `J${id + 1}`)}</span>`;
      continue;
    }
    if (play.hidden && !revealHidden) {
      const mine = onlineGameMode ? play.playerId === game.localPlayerId : play.playerId === 0;
      const canPeek = mine && play.card,
        action = play.influenceAction || 'none';
      const publicBadge =
        action === 'sigilo'
          ? '<b class="public-influence-badge">✦ SIGILO</b>'
          : action === 'plus'
            ? '<b class="public-influence-badge plus">✦✦ +3</b>'
            : action === 'minus'
              ? '<b class="public-influence-badge minus">✦✦ -3</b>'
              : '';
      slot.innerHTML = canPeek
        ? `<div class="card-back private-hidden-card" tabindex="0"><span>♛</span><img class="private-hidden-peek" src="${cardAsset(play.card)}" alt="Sua carta oculta"><em>${play.modifier ? `${play.modifier > 0 ? '+3' : '-3'} → ${playValue(play)}` : 'passe o mouse'}</em>${publicBadge}</div>`
        : `<div class="card-back"><span>♛</span>${publicBadge}</div>`;
      slot
        .querySelector('.private-hidden-card')
        ?.addEventListener('click', (e) => e.currentTarget.classList.toggle('peek'));
    } else {
      const eff = playValue(play);
      const mod = play.modifier
        ? `<span class="maneuver-badge ${play.modifier > 0 ? 'plus' : 'minus'}">${play.modifier > 0 ? '+3' : '-3'} → ${eff}</span>`
        : '';
      slot.innerHTML = `<div class="revealed-card-wrap"><img class="card-face ${play.revealing ? 'flip-reveal' : ''}" src="${cardAsset(play.card)}" alt="${SUITS[play.card.suit].name} ${play.card.value}">${mod}</div>`;
    }
  }
}
function markWinners(crownId, shadowId) {
  $(`tableCard${crownId}`).classList.add('winner-crown');
  $(`tableCard${shadowId}`).classList.add('winner-shadow');
}
function clearTableHighlights() {
  for (let i = 0; i < 4; i++) $(`tableCard${i}`).classList.remove('winner-crown', 'winner-shadow');
}

function renderHand() {
  if (onlineGameMode) return;
  return renderHandLocal();
}
function selectedInfluenceCost(action) {
  return action === 'sigilo' ? 1 : action === 'plus' || action === 'minus' ? 2 : 0;
}
function selectedInfluenceModifier(action) {
  return action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
}
function influenceActionName(action) {
  return action === 'sigilo'
    ? 'Sigilo'
    : action === 'plus'
      ? 'Manobra +3'
      : action === 'minus'
        ? 'Manobra -3'
        : 'Nenhuma';
}
async function chooseInfluenceAction(balance, canManeuver) {
  const opts = [
    {
      value: 'sigilo',
      title: 'Sigilo — gastar 1',
      subtitle: 'Jogue a carta virada para baixo. O valor não muda.',
    },
  ];
  if (canManeuver && balance >= 2) {
    opts.push(
      {
        value: 'plus',
        title: 'Manobra +3 — gastar 2',
        subtitle: 'Carta oculta conta com +3 nesta vaza, máximo 12.',
      },
      {
        value: 'minus',
        title: 'Manobra -3 — gastar 2',
        subtitle: 'Carta oculta conta com -3 nesta vaza, mínimo 1.',
      },
    );
  }
  return choiceModal({
    icon: '✦',
    title: 'Influência da Corte',
    text: 'Escolha como usar sua Influência. A carta continua oculta, mas o uso de Influência e a escolha +3 ou -3 serão anunciados para todos imediatamente.',
    options: opts,
  });
}
function renderHandLocal() {
  if (!game) return;
  const p = game.players[0],
    hand = $('humanHand');
  if (p.ai) {
    hand.innerHTML =
      '<div style="color:#746a55;align-self:center">Modo simulação: quatro casas jogam automaticamente.</div>';
    $('handTitle').textContent = 'Modo demonstração';
    $('instructionText').textContent = 'Acompanhe a Crônica da Corte.';
    $('influenceToggleWrap').classList.add('disabled');
    $('influenceToggleWrap').classList.remove('ready');
    if ($('influenceStatusText')) $('influenceStatusText').textContent = '—';
    return;
  }
  $('handTitle').textContent = `Sua mão • ${p.hand.length}${p.reserve ? ' + Reserva' : ''}`;
  const awaiting = humanPlayResolver && humanPlayResolver.playerId === 0,
    baseLegalIds = awaiting ? humanPlayResolver.legalIds : new Set(),
    action = humanPlayResolver?.influenceAction || 'none';
  const openingHidden =
      awaiting &&
      game.plays.length === 0 &&
      $('influenceToggle')?.checked &&
      humanPlayResolver?.declaredSuit,
    hiddenMode =
      awaiting &&
      $('influenceToggle')?.checked &&
      action !== 'none' &&
      canUseInfluence(p, selectedInfluenceCost(action));
  const hiddenLegalIds = new Set(
      p.hand
        .filter((c) => baseLegalIds.has(c.id) && c.publicReason !== 'Corte Aberta')
        .map((c) => c.id),
    ),
    legalIds = hiddenMode
      ? openingHidden
        ? new Set(
            p.hand
              .filter((c) => hiddenLegalIds.has(c.id) && c.suit === humanPlayResolver.declaredSuit)
              .map((c) => c.id),
          )
        : hiddenLegalIds
      : baseLegalIds;
  hand.innerHTML = p.hand
    .map(
      (c) =>
        `<div class="hand-card ${c.public ? 'public' : ''} ${c.publicReason === 'Corte Aberta' ? 'corte-open-hand' : ''} ${c.publicReason === 'Desafio' ? 'desafio-open-hand' : ''} ${awaiting && !legalIds.has(c.id) ? 'illegal' : ''} ${!awaiting ? 'locked' : ''}" data-card="${c.id}"><img src="${cardAsset(c)}" alt="${SUITS[c.suit].name} ${c.value}"></div>`,
    )
    .join('');
  const available = p.influence >= 1 && !isInfluenceBlocked(),
    usable =
      awaiting &&
      canUseInfluence(p, 1) &&
      getLegalCards(p).some((c) => c.publicReason !== 'Corte Aberta'),
    wrap = $('influenceToggleWrap');
  wrap.classList.toggle('ready', available);
  wrap.classList.toggle('opening-ready', usable && game.plays.length === 0 && p.id === game.leader);
  wrap.classList.toggle('disabled', !usable);
  $('influenceToggle').disabled = !usable;
  if (!usable) {
    $('influenceToggle').checked = false;
    if (humanPlayResolver) {
      humanPlayResolver.influenceAction = 'none';
      humanPlayResolver.declaredSuit = null;
    }
  }
  const status = $('influenceStatusText');
  if (status) {
    if (isInfluenceBlocked())
      status.textContent = `${p.influence}/2 • ${game.decree?.name || 'Decreto'} bloqueia o uso`;
    else if (!p.influence) status.textContent = '0/2 • ganhe 1 ao ficar sem Coroa/Sombra';
    else if (hiddenMode)
      status.textContent = `${p.influence}/2 • ${influenceActionName(action)} selecionado`;
    else if (p.influence === 1) status.textContent = '1/2 • Sigilo disponível';
    else status.textContent = '2/2 • Sigilo ou Manobra disponíveis';
  }
  hand
    .querySelectorAll('.hand-card')
    .forEach((el) => el.addEventListener('click', () => onHumanCardClick(el)));
}
function onHumanCardClick(el) {
  if (!humanPlayResolver) return;
  const id = el.dataset.card,
    p = game.players[0],
    card = p.hand.find((c) => c.id === id),
    action = $('influenceToggle').checked ? humanPlayResolver.influenceAction || 'none' : 'none',
    cost = selectedInfluenceCost(action),
    hidden = action !== 'none',
    declared = humanPlayResolver.declaredSuit || null;
  const baseLegal = humanPlayResolver.legalIds.has(id),
    legal =
      baseLegal &&
      (!hidden || card?.publicReason !== 'Corte Aberta') &&
      (!hidden || game.plays.length > 0 || (declared && card?.suit === declared));
  if (!legal) {
    toast(
      hidden && card?.publicReason === 'Corte Aberta'
        ? 'A carta da Corte Aberta não pode usar Influência.'
        : hidden && game.plays.length === 0
          ? 'Escolha uma carta do naipe anunciado.'
          : 'Esta carta não pode ser jogada agora.',
      1300,
    );
    return;
  }
  const r = el.getBoundingClientRect(),
    sourceInfo = {
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      src: el.querySelector('img')?.src || cardAsset(card),
    };
  if (hidden) {
    p.influence -= cost;
    if (game.plays.length === 0) announceHiddenLead(p, declared);
  }
  clearLocalTurnTimer();
  const res = humanPlayResolver.resolve;
  humanPlayResolver = null;
  $('influenceToggle').checked = false;
  $('instructionText').textContent = 'Carta escolhida.';
  renderHand();
  syncLocalSeats();
  res({
    card,
    hidden,
    sourceInfo,
    influenceAction: action,
    modifier: selectedInfluenceModifier(action),
  });
}

async function chooseCardFromHand(p, title, text, candidates = null) {
  const cards = candidates || p.hand;
  if (p.ai) return cards[rand(cards.length)];
  const value = await choiceModal({
    icon: '♛',
    title,
    text,
    options: cards.map((c) => ({
      value: c.id,
      type: 'card',
      title: `${SUITS[c.suit].name} ${c.value}`,
      img: cardAsset(c),
    })),
  });
  return p.hand.find((c) => c.id === value);
}

function chooseLawModal(player, valid) {
  return new Promise((resolve, reject) => {
    modalResolver = resolve;
    modalReject = reject;
    const renderLawView = () => {
      $('modalIcon').textContent = '☾';
      $('modalTitle').textContent = 'Escolha a próxima Lei';
      $('modalText').textContent =
        'Como Sombra, você controla a Lei da próxima vaza. Antes de decidir, você pode consultar sua mão.';
      $('modalChoices').innerHTML = valid
        .map(
          (l, i) =>
            `<button class="choice-card" data-law="${l}" data-tooltip="${escAttr(lawTooltip(l))}"><img src="${LAWS[l].img}"><strong>${LAWS[l].name}</strong><small>Restam ${2 - game.lawUsage[l]} uso(s) antes desta escolha.</small></button>`,
        )
        .join('');
      $('modalFooter').innerHTML =
        `<button id="viewShadowDeckBtn" class="royal-btn deck-view-btn">🂠 Ver meu deck / mão (${player.hand.length}${player.reserve ? ' + Reserva' : ''})</button>`;
      $('modalChoices')
        .querySelectorAll('[data-law]')
        .forEach(
          (btn) =>
            (btn.onclick = () => {
              const value = btn.dataset.law;
              closeModal();
              const r = modalResolver;
              modalResolver = null;
              r(value);
            }),
        );
      $('viewShadowDeckBtn').onclick = renderHandView;
    };
    const renderHandView = () => {
      $('modalIcon').textContent = '🂠';
      $('modalTitle').textContent = `Mão de ${player.name}`;
      $('modalText').textContent =
        'Consulte suas cartas e depois volte para escolher a Lei. As cartas públicas permanecem destacadas.';
      const cards = [...player.hand];
      $('modalChoices').innerHTML =
        `<div class="deck-preview">${cards.map((c) => `<div class="deck-preview-card ${c.public ? 'public' : ''} ${c.publicReason === 'Corte Aberta' ? 'corte-open' : ''}"><img src="${cardAsset(c)}"><span>${SUITS[c.suit].name} ${c.value}</span>${c.public ? `<b>${c.publicReason}</b>` : ''}</div>`).join('')}${player.reserve ? `<div class="deck-preview-card reserve-preview"><img src="${cardAsset(player.reserve)}"><span>Reserva</span><b>Obrigatória na 10ª</b></div>` : ''}</div>`;
      $('modalFooter').innerHTML =
        '<button id="backToLawChoiceBtn" class="royal-btn primary">← Voltar para escolher a Lei</button>';
      $('backToLawChoiceBtn').onclick = renderLawView;
    };
    renderLawView();
    $('modal').classList.remove('hidden');
  });
}

function choiceModal({ icon = '♛', title, text, options }) {
  return new Promise((resolve, reject) => {
    modalResolver = resolve;
    modalReject = reject;
    $('modalIcon').textContent = icon;
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    $('modalFooter').textContent = '';
    $('modalChoices').innerHTML = options
      .map((o, i) => {
        if (o.type === 'card' || o.type === 'law')
          return `<button class="choice-card" data-i="${i}">${o.img ? `<img src="${o.img}">` : ''}<strong>${o.title}</strong>${o.subtitle ? `<small>${o.subtitle}</small>` : ''}</button>`;
        if (o.type === 'suit')
          return `<button class="choice-card suit-choice" data-i="${i}" style="border-color:${o.color}"><span class="suit-glyph" style="color:${o.color}">${o.icon}</span><strong>${o.title}</strong></button>`;
        if (o.type === 'decree')
          return `<button class="choice-card decree-choice" data-i="${i}" data-tooltip="${escAttr(o.subtitle || 'Este Decreto permanecerá ativo durante toda a rodada.')}" ><span class="decree-icon">${o.icon}</span><strong>${o.title}</strong><p>${o.subtitle}</p></button>`;
        if (o.type === 'hidden-card')
          return `<button class="choice-card hidden-card-choice" data-i="${i}"><span class="hidden-card-back">♛</span><strong>${o.title}</strong><small>${o.subtitle || 'Carta fechada'}</small></button>`;
        return `<button class="choice-card" data-i="${i}"><strong>${o.title}</strong></button>`;
      })
      .join('');
    $('modalChoices')
      .querySelectorAll('button')
      .forEach(
        (btn) =>
          (btn.onclick = () => {
            const opt = options[Number(btn.dataset.i)];
            closeModal();
            const r = modalResolver;
            modalResolver = null;
            r(opt.value);
          }),
      );
    $('modal').classList.remove('hidden');
  });
}
function infoModal({ icon = '♛', title, text, button = 'Continuar' }) {
  return new Promise((resolve, reject) => {
    modalResolver = resolve;
    modalReject = reject;
    $('modalIcon').textContent = icon;
    $('modalTitle').textContent = title;
    $('modalText').innerHTML = text;
    $('modalChoices').innerHTML =
      `<button id="continueModal" class="royal-btn primary">${button}</button>`;
    $('modalFooter').textContent = '';
    $('modal').classList.remove('hidden');
    $('continueModal').onclick = () => {
      closeModal();
      const r = modalResolver;
      modalResolver = null;
      r();
    };
  });
}
function closeModal() {
  $('modal').classList.add('hidden');
  modalReject = null;
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

async function chooseOpeningInfluenceSuit() {
  if (!humanPlayResolver || game.plays.length !== 0 || game.leader !== 0) return;
  const p = game.players[0];
  const suits = influenceOpeningSuits(p);
  if (!suits.length) {
    $('influenceToggle').checked = false;
    return;
  }
  const suit = await choiceModal({
    icon: '✦',
    title: 'Anuncie o naipe',
    text: 'Ao abrir a vaza com Influência, anuncie o naipe real da carta antes de jogar. Esse será o naipe inicial quando a Lei exigir seguimento.',
    options: suits.map((s) => ({
      value: s,
      type: 'suit',
      title: SUITS[s].name,
      icon: SUITS[s].glyph,
      color: SUITS[s].color,
    })),
  });
  if (!humanPlayResolver) return;
  humanPlayResolver.declaredSuit = suit;
  $('instructionText').textContent =
    `Influência ativa: escolha uma carta de ${SUITS[suit].name} para jogar oculta.`;
  renderHand();
  renderAll(false);
}

function enterOnlineBoard() {
  onlineGameMode = true;
  animationScale = 1;
  if ($('speedBtn')) {
    $('speedBtn').textContent = '⏱ Online';
    $('speedBtn').disabled = true;
  }
  window.TronoPortal?.showOnly?.('gameScreen');
  $('versionLabel').textContent =
    'Protótipo digital v' + window.TronoNetwork.CLIENT_VERSION + ' • Multiplayer';
  clearLog();
}
// Presentation bridge only. Network parsing and clock state belong to TronoThroneMatch.
function presentOnlineMatch(state) {
  if (!state) {
    if (game?.online) game = null;
    return;
  }
  if (leavingGame) return;
  if (!onlineGameMode) enterOnlineBoard();
  const previousTurn = isLocalPlayersTurn() ? `${game.round}:${game.trick}` : null;
  const next = {
    ...state,
    decree: state.decree ? DECREES.find((d) => d.id === state.decree) : null,
    gameOver: state.phase === 'game-over',
  };
  // Preserve the presentation session so pending exchange/reveal effects remain valid.
  if (game?.online) Object.assign(game, next);
  else game = next;
  if (isLocalPlayersTurn() && previousTurn !== `${game.round}:${game.trick}`) showYourTurnNotice();
  renderAll();
}
async function handleOnlineGameEvent(msg) {
  const session = game;
  const ev = msg.event;
  if (ev === 'log') {
    logEvent(msg.message);
    return;
  }
  if (ev === 'influence-used') {
    showInfluenceUseFeedback(msg);
    return;
  }
  if (ev === 'card-played') {
    playSfx('card');
    const slot = $(`tableCard${msg.playerId}`);
    slot?.classList.add('receiving-card');
    setTimeout(() => slot?.classList.remove('receiving-card'), 520 * animationScale);
    return;
  }
  if (ev === 'exchange') {
    const release = thronePrivate.holdExchange();
    try {
      await showExchangeAnimation({
        kind: msg.kind,
        title: msg.title || 'Troca de cartas',
        subtitle:
          msg.kind === 'rotation'
            ? 'Todos passam simultaneamente 1 carta oculta ao jogador à esquerda.'
            : 'As cartas estão mudando de mãos.',
        moves: msg.moves || [],
      });
    } finally {
      release();
    }
    return;
  }
  if (ev === 'trick-result') {
    if (msg.crownId === msg.shadowId) {
      fatalError(new Error('O servidor tentou atribuir Coroa e Sombra ao mesmo jogador.'));
      return;
    }
    if (game) {
      game.plays = (msg.revealedPlays || []).map((pl) => ({
        ...pl,
        hidden: false,
        modifier: pl.modifier || 0,
        influenceAction: pl.influenceAction || 'none',
      }));
      renderTableCards(true);
      markWinners(msg.crownId, msg.shadowId);
    }
    const crown = game?.players[msg.crownId],
      shadow = game?.players[msg.shadowId];
    if (crown && shadow) await showTrickOutcome(crown, shadow);
    if (game !== session) return;
    if (msg.influenceGains?.length && game) {
      const gains = msg.influenceGains.map((x) => ({
        player: game.players[x.seat],
        after: x.after,
      }));
      showInfluenceGains(gains);
    }
    return;
  }
  if (ev === 'challenge-reveal') {
    if (game && msg.card) showChallengeReveal(msg.seat, msg.card);
    return;
  }
  if (ev === 'turn-timeout') {
    const p = game?.players[msg.seat];
    toast(`⌛ ${p?.name || 'Jogador'} excedeu 1 minuto — carta aleatória.`, 2000);
    return;
  }
  if (ev === 'round-ended') {
    const me = msg.scores?.find((x) => x.seat === game?.localPlayerId);
    toast(`Fim da Rodada ${msg.round}${me ? ` • ${me.prestige} Prestígio` : ''}`, 2400);
    return;
  }
  if (ev === 'game-ended') {
    const rows = (msg.scores || [])
      .map(
        (p, i) =>
          `<div class="score-row final"><strong>${i + 1}º ${escAttr(p.name)}</strong><span>Pares ${p.pairs}</span><span>♛ ${p.crowns}</span><span>☾ ${p.shadows}</span><b>${p.prestige} Prestígio</b></div>`,
      )
      .join('');
    const winners = (msg.winners || [])
      .map((id) => msg.scores.find((s) => s.seat === id)?.name)
      .filter(Boolean);
    const finalLog = renderFinalLogHtml(msg.finalLog || clientLogHistory);
    await infoModal({
      icon: '♛',
      title: 'Fim da Partida Online',
      text: `<h3 class="winner-title">${winners.length > 1 ? 'Vitória compartilhada: ' + winners.map(escAttr).join(' e ') : escAttr(winners[0] || 'A partida terminou.')}</h3>${rows}${finalLog}`,
      button: 'Voltar aos salões',
    });
    backToLobby();
    return;
  }
  if (ev === 'player-replaced-by-bot') {
    showConnectionNotice(msg.name, msg.botName, msg.reason || 'disconnect');
    return;
  }
  if (ev === 'server-error') {
    toast(`Erro do servidor: ${msg.message}`, 3000);
    return;
  }
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
  throneChoices.clear();
  throneHand.clear();
  leavingGame = true;
  clearLocalTurnTimer();
  exchangeSequence++;
  $('exchangeCinematic').classList.add('hidden');
  $('exchangeCinematic').setAttribute('aria-hidden', 'true');
  $('exchangeStage').replaceChildren();
  const cancelled = Object.assign(new Error('A mesa foi encerrada neste aparelho.'), {
    name: 'AbortError',
  });
  humanPlayResolver?.reject?.(cancelled);
  humanPlayResolver = null;
  modalReject?.(cancelled);
  modalResolver = null;
  closeModal();
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
  if (msg.type === 'game-started') {
    enterOnlineBoard();
    toast('♛ Partida online iniciada — o servidor controla a mesa.', 2200);
    window.TronoNetwork?.requestState();
  }
  if (msg.type === 'game-event' && !leavingGame) handleOnlineGameEvent(msg).catch(fatalError);
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

$('influenceToggle').addEventListener('change', async () => {
  const checked = $('influenceToggle').checked;
  if (onlineGameMode) return;
  if (!checked) {
    if (humanPlayResolver) {
      humanPlayResolver.declaredSuit = null;
      humanPlayResolver.influenceAction = 'none';
    }
    renderHand();
    return;
  }
  const p = game?.players?.[0];
  if (!p || !humanPlayResolver) {
    $('influenceToggle').checked = false;
    return;
  }
  humanPlayResolver.influenceAction = await chooseInfluenceAction(p.influence, p.influence >= 2);
  if (!humanPlayResolver?.influenceAction) {
    $('influenceToggle').checked = false;
    return;
  }
  if (game && game.plays.length === 0 && game.leader === 0) await chooseOpeningInfluenceSuit();
  else renderHand();
});
function openManual() {
  if (window.TronoDesktop?.openManual) return window.TronoDesktop.openManual();
  return window.open('manual/index.html', '_blank', 'noopener');
}
$('manualBtn').onclick = openManual;
$('rulesManualBtn').onclick = openManual;
$('rulesLaws').innerHTML =
  '<h3>As cinco Leis</h3>' +
  LAW_ORDER.map(
    (id) => `<p><b>${escAttr(LAWS[id].name)}:</b> ${escAttr(LAWS[id].description)}</p>`,
  ).join('');
$('rulesDecrees').innerHTML =
  '<h3>Os dez Decretos</h3>' +
  DECREES.map((d) => `<p><b>${escAttr(d.name)}:</b> ${escAttr(d.text)}</p>`).join('');

$('startHumanBtn').onclick = () => startGame(false).catch(fatalError);
$('startDemoBtn').onclick = () => startGame(true).catch(fatalError);
$('restartBtn').onclick = () => {
  if (confirm('Sair desta mesa e voltar aos salões? Sua chamada do M&N continua conectada.'))
    backToLobby();
};
$('rulesBtn').onclick = () => $('rulesDrawer').classList.remove('hidden');
$('rulesClose').onclick = () => $('rulesDrawer').classList.add('hidden');
$('rulesDrawer').addEventListener('click', (e) => {
  if (e.target === $('rulesDrawer')) $('rulesDrawer').classList.add('hidden');
});
$('clearLogBtn').onclick = clearLog;
$('logBtn').onclick = () => toggleFloatingLog();
$('logHideBtn').onclick = () => toggleFloatingLog(false);
$('logResetBtn').onclick = () => resetFloatingLog();
initFloatingLog();
$('sortHandBtn').onclick = () => {
  if (!game || onlineGameMode) return;
  const p = game.players[0];
  if (p && !p.ai) {
    sortHand(p);
    renderHand();
  }
};
$('speedBtn').onclick = () => {
  if (onlineGameMode) return;
  animationScale = animationScale === 1 ? 0.38 : animationScale === 0.38 ? 1.65 : 1;
  $('speedBtn').textContent =
    animationScale === 1 ? '⏱ Normal' : animationScale === 0.38 ? '⚡ Rápido' : '🐢 Lento';
};

function showChallengeReveal(seat, card) {
  const panel = $(`player${seat}`);
  if (!panel || !card) return;
  const r = panel.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'challenge-reveal-float';
  const x = Math.max(12, Math.min(window.innerWidth - 170, r.left + r.width / 2 - 75));
  const y = Math.max(90, Math.min(window.innerHeight - 240, r.top + r.height / 2 - 95));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `<div class="challenge-bubble">⚔ DESAFIO</div><img src="${cardAsset(card)}" alt="${SUITS[card.suit].name} ${card.value}"><strong>${SUITS[card.suit].name} ${card.value}</strong>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function renderFinalLogHtml(entries = []) {
  const rows = (entries || [])
    .slice(-300)
    .map(
      (e) =>
        `<div class="final-log-row"><span>R${e.round || '-'} · V${e.trick || '-'}</span><p>${escAttr(String(e.message || '').replace(/<[^>]+>/g, ''))}</p></div>`,
    )
    .join('');
  return `<details class="final-log" open><summary>Crônica final da partida (${entries.length} registros)</summary><div class="final-log-list">${rows || '<em>Sem registros.</em>'}</div></details>`;
}
function toggleFloatingLog(force) {
  const panel = $('eventLogPanel');
  if (!panel) return;
  const show = force === undefined ? panel.classList.contains('log-hidden') : !!force;
  panel.classList.toggle('log-hidden', !show);
  $('logBtn')?.classList.toggle('music-active', show);
}
function resetFloatingLog() {
  const panel = $('eventLogPanel');
  if (!panel) return;
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '18px';
  panel.style.bottom = '244px';
  panel.style.width = '390px';
  panel.style.height = '250px';
  storage.removeItem('tronoLogGeometry');
}
function saveFloatingLogGeometry() {
  const panel = $('eventLogPanel');
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  storage.setItem(
    'tronoLogGeometry',
    JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height }),
  );
}
function restoreFloatingLogGeometry() {
  const panel = $('eventLogPanel');
  if (!panel || window.innerWidth <= 900) return;
  try {
    const geo = JSON.parse(storage.getItem('tronoLogGeometry') || 'null');
    if (!geo) return;
    const w = Math.max(280, Math.min(window.innerWidth - 12, geo.width || 390));
    const h = Math.max(170, Math.min(window.innerHeight - 74, geo.height || 250));
    const x = Math.max(4, Math.min(window.innerWidth - w - 4, geo.left || 18));
    const y = Math.max(70, Math.min(window.innerHeight - h - 4, geo.top || 100));
    Object.assign(panel.style, {
      left: `${x}px`,
      top: `${y}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${w}px`,
      height: `${h}px`,
    });
  } catch (_) {
    /* geometria antiga inválida */
  }
}
function initFloatingLog() {
  const panel = $('eventLogPanel'),
    handle = $('eventDragHandle'),
    grip = $('logResizeGrip');
  if (!panel || !handle) return;
  restoreFloatingLogGeometry();
  let drag = null,
    resize = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    panel.classList.add('dragging');
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.max(4, Math.min(window.innerWidth - panel.offsetWidth - 4, e.clientX - drag.dx));
    const y = Math.max(
      70,
      Math.min(window.innerHeight - panel.offsetHeight - 4, e.clientY - drag.dy),
    );
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  const stopDrag = () => {
    if (drag) saveFloatingLogGeometry();
    drag = null;
    panel.classList.remove('dragging');
  };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
  if (grip) {
    grip.addEventListener('pointerdown', (e) => {
      if (window.innerWidth <= 900) return;
      const r = panel.getBoundingClientRect();
      resize = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      grip.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!resize) return;
      const w = Math.max(
        280,
        Math.min(
          window.innerWidth - panel.getBoundingClientRect().left - 4,
          resize.w + e.clientX - resize.x,
        ),
      );
      const h = Math.max(
        170,
        Math.min(
          window.innerHeight - panel.getBoundingClientRect().top - 4,
          resize.h + e.clientY - resize.y,
        ),
      );
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
    });
    const stopResize = () => {
      if (resize) saveFloatingLogGeometry();
      resize = null;
    };
    grip.addEventListener('pointerup', stopResize);
    grip.addEventListener('pointercancel', stopResize);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (!drag && !resize && !panel.classList.contains('log-hidden')) saveFloatingLogGeometry();
    }).observe(panel);
  }
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
  logEvent(`<strong>Erro de execução:</strong> ${err.message}`);
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
    animationScale = 0.05;
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
