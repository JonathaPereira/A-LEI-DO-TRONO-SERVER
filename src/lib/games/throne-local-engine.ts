import { createThroneLocalPresentation } from './throne-local-presentation.ts';
import type { ThroneLocalRun } from './throne-local-lifecycle';
import { safeThroneLawChoices } from './throne-law-planner.ts';
import { throneRules, type RuleExchange } from './throne-rules.ts';
import type {
  ThroneLocalState,
  ThroneLocalPlayer,
  ThroneLocalCard,
  ThroneLocalPlay,
  ThroneLocalRoom,
} from '../../types/throne-local';
import type {
  ThroneLaw,
  ThroneSuit,
  ThroneCardChoice,
  ThronePrompt,
} from '../../types/throne-choices';
import type { ThroneHandOrigin, ThroneInfluenceAction } from '../../types/throne-hand';
import type { ThroneHand } from './throne-hand';
import type { ThroneChoices } from './throne-choices';
import type { ThroneMatch } from './throne-match';
import type { ThroneSeats } from './throne-seats';
import type { ThroneTable } from './throne-table';
import type { ThronePrivate } from './throne-private';
import type { ThroneHistory } from './throne-history';
import type { ThroneEffects } from './throne-effects';

interface Options {
  hand: Pick<
    ThroneHand,
    | 'beginLocal'
    | 'presentLocal'
    | 'waitLocal'
    | 'waitingLocal'
    | 'getSnapshot'
    | 'timeoutLocal'
    | 'clear'
  >;
  choices: Pick<ThroneChoices, 'beginLocal' | 'showLocal' | 'clear'>;
  match: Pick<ThroneMatch, 'setLocal' | 'getSnapshot' | 'clear'>;
  seats: Pick<ThroneSeats, 'setLocal'>;
  table: Pick<ThroneTable, 'setLocal'>;
  private: Pick<ThronePrivate, 'showLocal' | 'clear'>;
  history: Pick<ThroneHistory, 'appendPublic' | 'clearEntries' | 'showLocal' | 'clear'>;
  effects: Pick<
    ThroneEffects,
    | 'toast'
    | 'influence'
    | 'turn'
    | 'exchange'
    | 'arrival'
    | 'outcome'
    | 'gains'
    | 'challenge'
    | 'clear'
  >;
  random(): number;
  botName(index: number): string;
  scale(): number;
  show(): void;
  leave(): void;
}
type PromptInput<P> = P extends { otherName: string }
  ? Omit<P, 'id' | 'number' | 'otherName'> & { readonly otherName?: string }
  : P extends unknown
    ? Omit<P, 'id' | 'number'>
    : never;
type LocalPrompt = PromptInput<ThronePrompt>;
type LocalAnswer<P extends LocalPrompt> = P extends { kind: 'choose-law' }
  ? ThroneLaw
  : P extends { kind: 'choose-trump' }
    ? ThroneSuit
    : P extends { kind: 'usurp-target' | 'usurp-pick' }
      ? number
      : string;
const SUITS = {
  cetro: { name: 'Cetro', glyph: '♜' },
  chave: { name: 'Chave', glyph: '⚿' },
  lamina: { name: 'Lâmina', glyph: '⚔' },
  mascara: { name: 'Máscara', glyph: '◉' },
};
const SUIT_ORDER: ThroneSuit[] = ['cetro', 'chave', 'lamina', 'mascara'];
const LAWS = throneRules.laws,
  LAW_ORDER = throneRules.lawOrder,
  DECREES = throneRules.decrees;

/** Owns private local cards and phases. UI owners receive only their existing projections. */
export function createThroneLocalEngine(options: Options) {
  let active: ThroneLocalState | null = null;
  return {
    getState: () => active,
    cancel(run: ThroneLocalRun) {
      if (active?.localSession !== run) return;
      active = null;
      if (options.match.getSnapshot().mode === 'online') return;
      options.choices.clear();
      options.hand.clear();
      options.private.clear();
      options.history.clear();
      options.effects.clear();
      options.match.clear();
    },
    async start(
      run: ThroneLocalRun,
      demo: boolean,
      names: readonly string[],
      room: ThroneLocalRoom | null,
    ) {
      run.assert();
      if (active) throw new Error('Já existe uma execução local.');
      if (names.length !== 4) throw new Error('A mesa local precisa de quatro Casas.');
      const execution = createLocalExecution(options, run, demo, names, room);
      active = execution.state;
      await execution.execute();
    },
  };
}

function createLocalExecution(
  options: Options,
  run: ThroneLocalRun,
  demo: boolean,
  names: readonly string[],
  room: ThroneLocalRoom | null,
) {
  const throneHand = options.hand,
    throneChoices = options.choices,
    thronePrivate = options.private,
    throneHistory = options.history,
    throneEffects = options.effects;
  const rand = (n: number) => Math.floor(options.random() * n);
  const shuffle = <T>(arr: readonly T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const firstStarter = rand(4);
  const game: ThroneLocalState = {
    localSession: run,
    players: createPlayers(names, demo),
    round: 1,
    trick: 1,
    undealt: [],
    decree: null,
    lawUsage: Object.fromEntries(LAW_ORDER.map((x) => [x, 0])) as Record<ThroneLaw, number>,
    currentLaw: 'ordem',
    trump: null,
    firstRoundStarter: firstStarter,
    leader: firstStarter,
    lastCrown: null,
    lastShadow: null,
    previousWinningSuit: null,
    plays: [],
    turn: null,
    turnDeadline: null,
    phase: 'setup',
    allAI: demo,
    handSession: throneHand.beginLocal(),
    choiceSession: throneChoices.beginLocal(),
    gameOver: false,
    declaredLeadSuit: null,
    room,
    localPlayerId: demo ? null : 0,
  };
  const {
    renderAll,
    renderHand,
    projectLocalHand,
    syncLocalStatus,
    syncLocalSeats,
    syncLocalTable,
  } = createThroneLocalPresentation(game, options, {
    legalCards: getLegalCards,
    canInfluence: canUseInfluence,
    influenceBlocked: isInfluenceBlocked,
    prestige: totalPrestige,
    pairs: totalPairs,
  });
  return { state: game, execute: startGame };
  function makeDeck() {
    let id = 0;
    const deck: ThroneLocalCard[] = [];
    for (const suit of SUIT_ORDER)
      for (let value = 1; value <= 12; value++)
        deck.push({ id: `c${id++}`, suit, value, public: false, publicReason: null });
    return deck;
  }

  function roundPairs(p: ThroneLocalPlayer) {
    return Math.min(p.roundCrowns, p.roundShadows);
  }
  // Prestígio é calculado sobre o total acumulado da partida.
  // Assim, jogadores com a mesma quantidade total de Coroas e Sombras
  // sempre possuem o mesmo Prestígio, independentemente da rodada em que
  // conquistaram esses marcadores.
  function totalPairs(p: ThroneLocalPlayer) {
    return Math.min(p.totalCrowns, p.totalShadows);
  }

  function totalPrestige(p: ThroneLocalPlayer) {
    return p.totalCrowns + p.totalShadows + 2 * totalPairs(p);
  }

  function rawAccumulated(p: ThroneLocalPlayer) {
    return p.totalCrowns + p.totalShadows;
  }

  function playerLabel(id: number) {
    return game.players[id].name;
  }

  function delay(base: number) {
    return game.localSession.delay(Math.max(30, base * options.scale()));
  }
  // Rules and public effects emit text; the typed owner handles history and rendering.
  function logEvent(message: string) {
    throneHistory.appendPublic(message, game.round, game.trick);
  }

  function toast(text: string, ms = 1500) {
    throneEffects.toast(text, ms, options.scale());
  }

  function showInfluenceUseFeedback(value: Parameters<ThroneEffects['influence']>[0]) {
    throneEffects.influence(value);
  }

  function showYourTurnNotice() {
    throneEffects.turn(LAWS[game.currentLaw]?.name || 'Lei ativa', options.scale());
  }

  function createPlayers(names: readonly string[], allAI = false): ThroneLocalPlayer[] {
    let botIndex = 0;
    return names.map((name, id) => {
      const ai = allAI || id !== 0;
      const resolvedName = ai ? options.botName(botIndex++) : name.trim() || `Jogador ${id + 1}`;
      return {
        id,
        name: resolvedName,
        ai,
        hand: [],
        reserve: null,
        intelligence: null,
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

  async function startGame() {
    const run = game.localSession;
    run.assert();
    syncLocalStatus();
    options.show();
    throneHistory.clearEntries();
    logEvent(
      `Partida iniciada${game.room ? ` em ${game.room.name}` : ''}. O sorteio definiu ${playerLabel(game.leader)} como primeiro líder.`,
    );
    renderAll();
    run.check(await run.wait(startRound()));
  }

  async function startRound() {
    const run = game.localSession;
    run.assert();
    game.phase = 'round-start';
    game.trick = 1;
    game.currentLaw = 'ordem';
    game.trump = null;
    game.lawUsage = Object.fromEntries(LAW_ORDER.map((x) => [x, 0])) as Record<ThroneLaw, number>;
    game.lastCrown = null;
    game.lastShadow = null;
    game.previousWinningSuit = null;
    game.plays = [];
    resetRoundStats();
    const deck = shuffle(makeDeck());
    for (let i = 0; i < 10; i++) for (let p = 0; p < 4; p++) game.players[p].hand.push(deck.pop()!);
    game.undealt = deck;
    for (const p of game.players) sortHand(p);
    renderAll();
    toast(`Rodada ${game.round} — a corte se reúne`, 1800);
    run.check(await run.wait(delay(800)));
    game.decree = run.check(await run.wait(chooseDecree()));
    logEvent(`Decreto: ${game.decree!.name} vigorará durante toda a rodada.`);
    renderAll();
    run.check(await run.wait(applyDecreeRoundStart()));
    run.check(await run.wait(beginTrick()));
  }

  async function chooseDecree() {
    const run = game.localSession;
    run.assert();
    const min = Math.min(...game.players.map(rawAccumulated));
    const tied = game.players.filter((p) => rawAccumulated(p) === min);
    const chooser = tied[rand(tied.length)];
    const picks = shuffle(DECREES).slice(0, 2);
    logEvent(
      `${chooser.name} possui o menor total bruto de Coroas + Sombras e recebe a escolha do Decreto.`,
    );
    if (!chooser.ai) {
      const choice = run.check(
        await run.wait(
          chooseLocal({
            kind: 'choose-decree',
            options: picks.map((d) => d.id),
          }),
        ),
      );
      return DECREES.find((d) => d.id === choice)!;
    }
    run.check(await run.wait(delay(700)));
    const chosen = picks[rand(picks.length)];
    toast(`${chooser.name} escolheu ${chosen.name}`);
    return chosen;
  }

  async function applyDecreeRoundStart() {
    const run = game.localSession;
    run.assert();
    if (game.decree!.id === 'reserva') {
      for (const p of game.players) {
        let card;
        if (p.ai) {
          card = chooseCpuReserve(p);
        } else card = run.check(await run.wait(chooseCardFromHand(p, 'choose-reserva')));
        p.reserve = card;
        p.hand = p.hand.filter((c) => c.id !== card.id);
        logEvent(`${p.name} separou uma carta na Reserva.`);
      }
    }
    if (game.decree!.id === 'corte') {
      for (const p of game.players) {
        const candidates = p.hand.filter((c) => !c.public);
        let card = p.ai
          ? candidates[rand(candidates.length)]
          : run.check(await run.wait(chooseCardFromHand(p, 'choose-corte', candidates)));
        card.public = true;
        card.publicReason = 'Corte Aberta';
        logEvent(`${p.name} revelou ${SUITS[card.suit].name} ${card.value} pela Corte Aberta.`);
      }
    }
    if (game.decree!.id === 'favor') for (const p of game.players) p.influence = 1;
    if (game.decree!.id === 'conselho') {
      const choices = new Map();
      for (const p of game.players) {
        const card = p.ai
          ? p.hand[rand(p.hand.length)]
          : run.check(await run.wait(chooseCardFromHand(p, 'choose-conselho')));
        choices.set(p.id, card.id);
      }
      throneRules.passCards(game.players, choices, -1);
      for (const p of game.players) sortHand(p);
      logEvent('Conselho: todas as Casas passaram uma carta fechada à direita.');
      run.check(
        await run.wait(
          showExchangeAnimation({
            kind: 'conselho',
            title: 'Conselho — pacto entre as Casas',
            subtitle: 'Quatro cartas passam simultaneamente à direita.',
            moves: game.players.map((p) => ({
              from: p.id,
              to: (p.id + 3) % 4,
              label: 'Carta fechada → direita',
            })),
          }),
        ),
      );
    }
    if (game.decree!.id === 'espionagem') {
      for (const p of game.players)
        p.intelligence = throneRules.intelligence(game.players, p.id, options.random);
      logEvent('Espionagem: cada Casa recebeu uma informação privada sobre o jogador à direita.');
      const clue =
        game.localPlayerId == null ? null : game.players[game.localPlayerId]?.intelligence;
      if (clue)
        run.check(
          await run.wait(
            thronePrivate.showLocal({
              kind: 'intelligence',
              clue,
            }),
          ),
        );
    }
    renderAll();
  }

  function chooseCpuReserve(p: ThroneLocalPlayer) {
    const sorted = [...p.hand].sort((a, b) => Math.abs(a.value - 6.5) - Math.abs(b.value - 6.5));
    return sorted[0] || p.hand[0];
  }

  async function beginTrick() {
    const run = game.localSession;
    run.assert();
    if (game.gameOver) return;
    game.phase = 'trick-start';
    game.plays = [];
    game.trump = null;
    game.declaredLeadSuit = null;
    game.lawUsage[game.currentLaw]++;
    renderAll();
    logEvent(`Vaza ${game.trick}: ${LAWS[game.currentLaw].name}.`);
    toast(`Vaza ${game.trick} • ${LAWS[game.currentLaw].name}`, 900);
    if (game.currentLaw === 'estandarte') run.check(await run.wait(declareTrump()));
    if (game.currentLaw === 'usurpacao') run.check(await run.wait(performUsurpacao()));
    game.phase = 'await-play';
    game.turn = game.leader;
    for (let n = 0; n < 4; n++) {
      const pid = (game.leader + n) % 4;
      game.turn = pid;
      renderAll();
      run.check(await run.wait(playTurn(pid)));
    }
    clearLocalTurnTimer();
    game.turn = null;
    renderAll();
    run.check(await run.wait(resolveTrick()));
  }

  async function declareTrump() {
    const run = game.localSession;
    run.assert();
    const chooser = game.lastShadow == null ? null : game.players[game.lastShadow];
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
      run.check(await run.wait(delay(500)));
    } else {
      game.trump = run.check(
        await run.wait(
          chooseLocal({
            kind: 'choose-trump',
            options: SUIT_ORDER,
          }),
        ),
      );
    }
    logEvent(`${chooser.name} declarou ${SUITS[game.trump].name} como Trunfo.`);
    renderAll();
  }

  async function showExchangeAnimation(value: Record<string, unknown>) {
    const run = game.localSession;
    run.assert();
    run.check(
      await run.wait(
        throneEffects.exchange(
          {
            ...value,
            players: game.players,
            crown: game.lastCrown,
            shadow: game.lastShadow,
          },
          options.scale(),
        ),
      ),
    );
  }

  function prepareUsurpacaoExchange(
    shadow: ThroneLocalPlayer,
    target: ThroneLocalPlayer,
    given: ThroneLocalCard,
  ) {
    return throneRules.reserveExchange(game.players, shadow, target, given?.id, shuffle);
  }

  function finishUsurpacaoExchange(
    shadow: ThroneLocalPlayer,
    target: ThroneLocalPlayer,
    index: number,
    state: RuleExchange<ThroneLocalCard>,
  ) {
    return throneRules.finishExchange(shadow, target, state, index);
  }

  async function chooseUsurpacaoReturnIndex(shadow: ThroneLocalPlayer, crown: ThroneLocalPlayer) {
    const run = game.localSession;
    run.assert();
    const pickable = crown.hand.filter((c) => c.publicReason !== 'Corte Aberta');
    if (shadow.ai) return rand(pickable.length);
    return run.check(
      await run.wait(
        chooseLocal({
          kind: 'usurp-pick',
          count: pickable.length,
          otherName: crown.name,
        }),
      ),
    );
  }

  async function showPrivateUsurpationResult(
    shadow: ThroneLocalPlayer,
    crown: ThroneLocalPlayer,
    given: ThroneLocalCard,
    taken: ThroneLocalCard,
  ) {
    const run = game.localSession;
    run.assert();
    const localId = game?.localPlayerId;
    if (localId == null || (localId !== shadow.id && localId !== crown.id)) return;
    const isShadow = localId === shadow.id;
    run.check(
      await run.wait(
        thronePrivate.showLocal({
          kind: 'usurpation',
          role: isShadow ? 'shadow' : 'target',
          otherName: isShadow ? crown.name : shadow.name,
          outgoing: isShadow ? given : taken,
          incoming: isShadow ? taken : given,
        }),
      ),
    );
  }

  async function performUsurpacao() {
    const run = game.localSession;
    run.assert();
    const shadow = game.lastShadow == null ? null : game.players[game.lastShadow];
    if (!shadow) return;
    const targets = game.players.filter(
      (p) => p.id !== shadow.id && throneRules.eligible(p.hand).length,
    );
    const targetId = shadow.ai
      ? targets[rand(targets.length)].id
      : run.check(
          await run.wait(
            chooseLocal({
              kind: 'usurp-target',
              options: targets.map((p) => ({
                seat: p.id,
                name: p.name,
              })),
            }),
          ),
        );
    const crown = game.players[targetId];
    let given;
    if (shadow.ai) {
      const pool = shadow.hand
        .filter((c) => c.publicReason !== 'Corte Aberta')
        .sort((a, b) => a.value - b.value);
      given = pool[0];
    } else {
      given = run.check(
        await run.wait(
          chooseCardFromHand(
            shadow,
            'usurp-give',
            shadow.hand.filter((c) => c.publicReason !== 'Corte Aberta'),
            crown.name,
          ),
        ),
      );
    }

    // A carta fica separada até a escolha cega na mão do adversário.
    const before = prepareUsurpacaoExchange(shadow, crown, given);

    // Se a Sombra for humana, ela escolhe VISUALMENTE uma posição entre cartas fechadas.
    // Nenhum valor ou naipe é mostrado neste momento.
    const pickIndex = run.check(await run.wait(chooseUsurpacaoReturnIndex(shadow, crown)));
    const { taken } = finishUsurpacaoExchange(shadow, crown, pickIndex, before);
    run.check(
      await run.wait(
        showExchangeAnimation({
          kind: 'usurpacao',
          title: 'Usurpação — troca de mãos',
          subtitle: `${shadow.name} escolhe uma carta fechada de ${crown.name}; a carta separada segue então para a Casa escolhida.`,
          moves: [
            {
              from: shadow.id,
              to: crown.id,
              role: 'shadow',
              label: 'Carta separada → Casa escolhida',
            },
            {
              from: crown.id,
              to: shadow.id,
              role: 'crown',
              label: 'Carta aleatória → Sombra',
              delay: 220,
            },
          ],
        }),
      ),
    );
    sortHand(shadow);
    sortHand(crown);
    logEvent(
      `Usurpação: ${shadow.name} entregou 1 carta oculta a ${crown.name}; uma carta elegível da Casa escolhida passou à Sombra antes da entrega. A Corte Aberta permaneceu protegida.`,
    );
    renderAll();

    // Só o cliente de um dos dois envolvidos recebe a revelação das cartas.
    run.check(await run.wait(showPrivateUsurpationResult(shadow, crown, given, taken)));
    toast('Usurpação resolvida', 900);
    renderAll();
    run.check(await run.wait(delay(420)));
  }

  function isInfluenceBlocked(p?: ThroneLocalPlayer) {
    return throneRules.influenceBlocked(game, p);
  }

  function getLeadSuit() {
    return game.declaredLeadSuit || game.plays?.[0]?.card?.suit || null;
  }

  function canUseInfluence(p: ThroneLocalPlayer, cost = 1) {
    if (!p || p.influence < cost || isInfluenceBlocked(p)) return false;
    // Regra v0.5.5: a Coroa/líder também pode abrir a vaza com carta oculta.
    if (game.plays.length === 0) return p.id === game.leader;
    return true;
  }

  function announceHiddenLead(p: ThroneLocalPlayer, suit: ThroneSuit) {
    game.declaredLeadSuit = suit;
    logEvent(
      `Influência: ${p.name}, como Coroa, anunciou ${SUITS[suit].name} antes de abrir a vaza com uma carta oculta.`,
    );
    toast(`✦ ${p.name} anuncia ${SUITS[suit].name} e abre com carta oculta`, 1800);
    renderAll();
  }

  async function playTurn(pid: number) {
    const run = game.localSession;
    run.assert();
    const p = game.players[pid];
    if (game.decree!.id === 'reserva' && game.trick === 10) {
      const card = p.reserve!;
      p.reserve = null;
      run.check(await run.wait(commitPlay(p, card, false, null, true, 'none', 0)));
      return;
    }
    const legal = getLegalCards(p);
    if (p.ai) {
      run.check(await run.wait(delay(480)));
      const card = chooseCpuCard(legal);
      const inf = maybeCpuInfluence(p, card);
      if (inf.action !== 'none') {
        p.influence -= inf.cost;
        if (game.plays.length === 0) {
          game.declaredLeadSuit = card.suit;
          announceHiddenLead(p, card.suit);
        }
      }
      run.check(
        await run.wait(
          commitPlay(p, card, inf.action !== 'none', null, false, inf.action, inf.modifier),
        ),
      );
    } else {
      renderHand();
      const result = run.check(await run.wait(waitHumanPlay(legal, p)));
      run.check(
        await run.wait(
          commitPlay(
            p,
            result.card,
            result.hidden,
            result.sourceInfo,
            false,
            result.influenceAction || 'none',
            result.modifier || 0,
          ),
        ),
      );
    }
  }

  function maybeCpuInfluence(
    p: ThroneLocalPlayer,
    card: ThroneLocalCard,
  ): { action: ThroneInfluenceAction; cost: number; modifier: number } {
    if (card?.publicReason === 'Corte Aberta' || isInfluenceBlocked(p))
      return { action: 'none', cost: 0, modifier: 0 };
    if (canUseInfluence(p, 2) && card.value >= 4 && card.value <= 9 && options.random() < 0.3) {
      const seekCrown = options.random() < 0.62;
      const action =
        game.currentLaw === 'revolta'
          ? seekCrown
            ? 'minus'
            : 'plus'
          : seekCrown
            ? 'plus'
            : 'minus';
      return { action, cost: 2, modifier: action === 'plus' ? 3 : -3 };
    }
    if (canUseInfluence(p, 1) && options.random() < 0.12)
      return { action: 'sigilo', cost: 1, modifier: 0 };
    return { action: 'none', cost: 0, modifier: 0 };
  }

  function getLegalCards(p: ThroneLocalPlayer) {
    let cards = [...p.hand];
    if (game.plays.length === 0 && game.decree!.id === 'sucessao' && game.previousWinningSuit) {
      const alternatives = cards.filter((c) => c.suit !== game.previousWinningSuit);
      if (alternatives.length) cards = alternatives;
    }
    if (game.plays.length === 0) return cards;
    const leadSuit = getLeadSuit();
    return throneRules.followCards(cards, game.currentLaw, leadSuit, game.trump);
  }

  function chooseCpuCard(legal: ThroneLocalCard[]) {
    const sorted = [...legal].sort((a, b) => a.value - b.value);
    const seekCrown = options.random() < 0.55;
    if (game.currentLaw === 'revolta') return seekCrown ? sorted[0] : sorted[sorted.length - 1];
    if (game.currentLaw === 'anarquia') return seekCrown ? sorted[sorted.length - 1] : sorted[0];
    if (game.currentLaw === 'estandarte' && game.trump) {
      const tr = legal.filter((c) => c.suit === game.trump).sort((a, b) => a.value - b.value);
      if (seekCrown && tr.length) return tr[tr.length - 1];
    }
    return seekCrown ? sorted[sorted.length - 1] : sorted[0];
  }

  function clearLocalTurnTimer() {
    game.localSession.clearTurn();
    game.turnDeadline = null;
    syncLocalStatus();
  }

  async function waitHumanPlay(legal: ThroneLocalCard[], p: ThroneLocalPlayer) {
    const run = game.localSession;
    run.assert();
    clearLocalTurnTimer();
    const pending = throneHand.waitLocal(game.handSession, projectLocalHand(true));
    const offered = throneHand.getSnapshot().context;
    if (!offered) throw new Error('A mão local não ofereceu o turno.');
    const turn = run.turn(60_000, () => {
      const card = legal[rand(legal.length)];
      if (!throneHand.timeoutLocal(offered, card.id)) return;
      game.turnDeadline = null;
      logEvent(`Tempo esgotado: ${p.name} recebeu uma jogada automática.`);
      toast('⌛ Tempo esgotado — carta aleatória jogada.', 1800);
      syncLocalStatus();
    });
    game.turnDeadline = turn.deadline;
    showYourTurnNotice();
    renderAll(false);
    try {
      const move = run.check(await run.wait(pending));
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
      turn.cancel();
      game.turnDeadline = null;
      if (hidden) {
        p.influence -= cost;
        if (!game.plays.length) announceHiddenLead(p, move.declaredSuit!);
      }
      renderHand();
      syncLocalSeats();
      return {
        card,
        hidden,
        sourceInfo: move.origin
          ? {
              rect: move.origin,
            }
          : null,
        influenceAction: action,
        modifier: selectedInfluenceModifier(action),
      };
    } finally {
      const active = turn.current();
      turn.cancel();
      if (active) {
        game.turnDeadline = null;
        syncLocalStatus();
      }
    }
  }

  async function commitPlay(
    p: ThroneLocalPlayer,
    card: ThroneLocalCard,
    hidden: boolean,
    sourceInfo: { rect: ThroneHandOrigin } | null,
    isReserve: boolean,
    influenceAction: ThroneInfluenceAction = 'none',
    modifier = 0,
  ) {
    const run = game.localSession;
    run.assert();
    if (!isReserve) p.hand = p.hand.filter((c) => c.id !== card.id);
    const play: ThroneLocalPlay = {
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
    run.check(await run.wait(animateCardToTable(play, sourceInfo)));
    logEvent(
      `${p.name} jogou ${hidden ? `uma carta oculta${play.order === 0 && game.declaredLeadSuit ? ` após anunciar ${SUITS[game.declaredLeadSuit].name}` : ''}` : `${SUITS[card.suit].name} ${card.value}`}${isReserve ? ' da Reserva' : ''}.`,
    );
  }

  async function animateCardToTable(
    play: ThroneLocalPlay,
    sourceInfo: { rect: ThroneHandOrigin } | null,
  ) {
    const run = game.localSession;
    run.assert();
    syncLocalTable();
    run.check(
      await run.wait(
        throneEffects.arrival(
          {
            seat: play.playerId,
            from: sourceInfo?.rect || null,
            card: play.card,
          },
          options.scale(),
        ),
      ),
    );
  }

  function evaluateTrick() {
    return throneRules.evaluate(game.plays, game.currentLaw, getLeadSuit(), game.trump);
  }

  async function resolveTrick() {
    const run = game.localSession;
    run.assert();
    game.phase = 'resolve';
    for (const play of game.plays) play.hidden = false;
    syncLocalTable();
    run.check(await run.wait(delay(450)));
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
        if (p.influence > before)
          influenceGains.push({
            player: p,
            before,
            after: p.influence,
          });
      }
    }
    if (game.lastCrown === crown.playerId) crownP.crownStreak++;
    else {
      for (const p of game.players) p.crownStreak = 0;
      crownP.crownStreak = 1;
    }
    syncLocalTable({
      crown: crown.playerId,
      shadow: shadow.playerId,
    });
    const crownShown = crown.modifier
      ? `${crown.card.value} ${crown.modifier > 0 ? '+3' : '-3'} → ${throneRules.effective(crown)}`
      : `${crown.card.value}`;
    const shadowShown = shadow.modifier
      ? `${shadow.card.value} ${shadow.modifier > 0 ? '+3' : '-3'} → ${throneRules.effective(shadow)}`
      : `${shadow.card.value}`;
    logEvent(
      `${LAWS[game.currentLaw].name} — Coroa: ${crownP.name} (${SUITS[crown.card.suit].name} ${crownShown}). Sombra: ${shadowP.name} (${SUITS[shadow.card.suit].name} ${shadowShown})${game.currentLaw === 'estandarte' && game.trump ? ` • Trunfo: ${SUITS[game.trump].glyph} ${SUITS[game.trump].name}` : ''}.`,
    );
    run.check(await run.wait(showTrickOutcome(crownP, shadowP)));
    toast(`♛ ${crownP.name} • Sombra: ${shadowP.name}`, 1400);
    if (influenceGains.length) {
      renderAll();
      showInfluenceGains(influenceGains);
      run.check(await run.wait(delay(1750)));
    }
    if (game.decree!.id === 'desafio') {
      const shouldReveal = !crownP.hadCrown || game.lastCrown === crown.playerId;
      if (shouldReveal) run.check(await run.wait(revealForChallenge(crownP)));
    }
    crownP.hadCrown = true;
    game.lastCrown = crown.playerId;
    game.lastShadow = shadow.playerId;
    game.previousWinningSuit = crown.card.suit;
    game.leader = crown.playerId;
    renderAll();
    run.check(await run.wait(delay(900)));
    if (game.trick === 10) {
      run.check(await run.wait(endRound()));
      return;
    }
    if (game.decree!.id === 'rotacao' && [7, 8, 9].includes(game.trick))
      run.check(await run.wait(performRotation()));
    const nextLaw = run.check(await run.wait(chooseNextLaw(shadowP)));
    game.currentLaw = nextLaw;
    game.trick++;
    syncLocalTable(null);
    run.check(await run.wait(delay(350)));
    run.check(await run.wait(beginTrick()));
  }

  async function showTrickOutcome(crown: ThroneLocalPlayer, shadow: ThroneLocalPlayer) {
    const run = game.localSession;
    run.assert();
    run.check(
      await run.wait(
        throneEffects.outcome(
          {
            crown,
            shadow,
          },
          options.scale(),
        ),
      ),
    );
  }

  function showInfluenceGains(
    gains: { player: ThroneLocalPlayer; before: number; after: number }[],
  ) {
    syncLocalSeats();
    throneEffects.gains(gains, options.scale());
    renderHand();
  }

  async function revealForChallenge(p: ThroneLocalPlayer) {
    const run = game.localSession;
    run.assert();
    const privateCards = p.hand.filter((c) => !c.public);
    if (!privateCards.length) return;
    let card = p.ai
      ? privateCards[rand(privateCards.length)]
      : run.check(await run.wait(chooseCardFromHand(p, 'challenge', privateCards)));
    card.public = true;
    card.publicReason = 'Desafio';
    logEvent(`Desafio: ${p.name} revelou ${SUITS[card.suit].name} ${card.value}.`);
    renderAll();
    showChallengeReveal(p.id, card);
    run.check(await run.wait(delay(2100)));
  }

  async function performRotation() {
    const run = game.localSession;
    run.assert();
    toast('Rotação — passe 1 carta à esquerda', 1200);
    const choices = [];
    for (const p of game.players) {
      let card;
      if (p.ai) card = p.hand[rand(p.hand.length)];
      else card = run.check(await run.wait(chooseCardFromHand(p, 'rotation')));
      choices[p.id] = card;
    }
    run.check(
      await run.wait(
        showExchangeAnimation({
          kind: 'rotation',
          title: `Rotação — fim da vaza ${game.trick}`,
          subtitle: 'Todos passam simultaneamente 1 carta oculta ao jogador à esquerda.',
          moves: game.players.map((p) => ({
            from: p.id,
            to: (p.id + 1) % 4,
            label: `${p.name} → ${game.players[(p.id + 1) % 4].name}`,
          })),
        }),
      ),
    );
    const incoming: ThroneLocalCard[] = Array(4);
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
    run.check(await run.wait(delay(420)));
  }

  async function chooseNextLaw(shadowP: ThroneLocalPlayer) {
    const run = game.localSession;
    run.assert();
    const valid = getSafeLawChoices(game.trick + 1);
    if (!valid.length) {
      throw new Error(
        'Não há Lei válida para a próxima vaza. O planejador de Leis deveria impedir este estado.',
      );
    }
    if (shadowP.ai) {
      run.check(await run.wait(delay(500)));
      const choice = valid[rand(valid.length)];
      logEvent(`${shadowP.name}, como Sombra, escolheu ${LAWS[choice].name}.`);
      return choice;
    }
    const choice = run.check(
      await run.wait(
        chooseLocal({
          kind: 'choose-law',
          options: valid,
        }),
      ),
    );
    logEvent(`${shadowP.name}, como Sombra, escolheu ${LAWS[choice].name}.`);
    return choice;
  }

  function getSafeLawChoices(nextTrick: number) {
    return safeThroneLawChoices(game, nextTrick);
  }

  async function endRound() {
    const run = game.localSession;
    run.assert();
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
      return {
        p,
        pairs,
        score,
        cumulativePairs,
        cumulativePrestige,
      };
    });
    const nextStarter = (game.lastCrown! + 1) % 4;
    syncLocalStatus();
    run.check(
      await run.wait(
        throneHistory.showLocal({
          kind: 'round',
          round: game.round,
          scores: rows.map(({ p, pairs, score, cumulativePrestige }) => ({
            seat: p.id,
            name: p.name,
            crowns: p.totalCrowns,
            shadows: p.totalShadows,
            pairs: p.totalPairs,
            prestige: cumulativePrestige,
            roundScore: {
              crowns: p.roundCrowns,
              shadows: p.roundShadows,
              pairs,
              gained: score,
            },
          })),
        }),
      ),
    );
    logEvent(`Rodada ${game.round} encerrada.`);
    if (game.round >= 3) {
      run.check(await run.wait(endGame()));
      return;
    }
    game.round++;
    game.leader = nextStarter;
    logEvent(
      `${playerLabel(game.leader)} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`,
    );
    syncLocalTable(null);
    run.check(await run.wait(startRound()));
  }

  async function endGame() {
    const run = game.localSession;
    run.assert();
    game.gameOver = true;
    for (const p of game.players) {
      p.totalPairs = totalPairs(p);
      p.prestige = totalPrestige(p);
    }
    game.phase = 'game-over';
    syncLocalStatus();
    run.check(
      await run.wait(
        throneHistory.showLocal({
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
        }),
      ),
    );
    options.leave();
  }

  function sortHand(p: ThroneLocalPlayer) {
    p.hand.sort(
      (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.value - b.value,
    );
  }

  function selectedInfluenceCost(action: ThroneInfluenceAction) {
    return action === 'sigilo' ? 1 : action === 'plus' || action === 'minus' ? 2 : 0;
  }

  function selectedInfluenceModifier(action: ThroneInfluenceAction) {
    return action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
  }
  // Copy only the human's own cards and public seats into the shared choices owner.
  // The local engine retains the rules, mutable cards and simultaneous exchanges.
  async function chooseLocal<P extends LocalPrompt>(prompt: P): Promise<LocalAnswer<P>> {
    const run = game.localSession;
    run.assert();
    const session = game,
      own = session.players[0];
    if (own.ai) throw new Error('A mesa não possui uma escolha humana local.');
    const value = run.check(
      await run.wait(
        throneChoices.showLocal(
          session.choiceSession,
          {
            you: 0,
            round: session.round,
            trick: session.trick,
            phase: prompt.kind,
            // Desafio is paid by this trick's Crown, before previous-trick markers advance.
            lastCrown: prompt.kind === 'challenge' ? own.id : session.lastCrown,
            lastShadow: session.lastShadow,
            hand: own.hand,
            reserve: own.reserve,
            players: session.players.map((p) => ({
              seat: p.id,
              name: p.name,
            })),
            lawUsage: session.lawUsage,
          },
          prompt,
        ),
      ),
    );
    return value as LocalAnswer<P>;
  }

  async function chooseCardFromHand(
    p: ThroneLocalPlayer,
    kind: ThroneCardChoice,
    candidates = p.hand,
    otherName?: string,
  ) {
    const run = game.localSession;
    run.assert();
    if (p.ai) return candidates[rand(candidates.length)];
    if (p !== game.players[0]) throw new Error('Assento humano local inválido.');
    const ids = candidates.map((c) => c.id);
    const value = run.check(
      await run.wait(
        chooseLocal({
          kind,
          cardIds: ids,
          otherName,
        }),
      ),
    );
    const card = p.hand.find((c) => c.id === value && ids.includes(c.id));
    if (
      !card ||
      (kind === 'usurp-give' && card.publicReason === 'Corte Aberta') ||
      (kind === 'challenge' && card.public)
    )
      throw new Error('Carta local indisponível.');
    return card;
  }

  function showChallengeReveal(seat: number, card: ThroneLocalCard) {
    throneEffects.challenge({ seat, card });
  }
}
export type ThroneLocalEngine = ReturnType<typeof createThroneLocalEngine>;
