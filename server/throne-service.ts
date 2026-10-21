import crypto from 'node:crypto';
import { throneRules as Rules } from '../src/lib/games/throne-rules.ts';
import * as Bots from '../src/lib/games/bot-names.ts';
import { safeThroneLawChoices } from '../src/lib/games/throne-law-planner.ts';
import { readThroneCommand, type ThronePlayInput } from './throne-protocol.ts';
import type {
  ThroneLaw,
  ThroneDecree,
  ThroneSuit,
  ThronePrompt,
} from '../src/types/throne-choices';
import type { ThroneInfluenceAction } from '../src/types/throne-hand';
import type {
  ThroneConnection,
  ThroneRoom,
  ThroneMember,
  ThroneGame,
  ThroneMatchPlayer,
  ThroneServerCard,
  ThroneServerPlay,
  ThronePending,
  ThroneMultiChoice,
} from './throne-contract';
type WireEvent = { type: string; [key: string]: unknown };
type Draft<P> = P extends unknown
  ? Omit<P, 'id' | 'number' | 'otherName'> & { title: string; otherName?: string; note?: string }
  : never;
type Prompt = Draft<ThronePrompt>;
interface Options {
  rooms: ReadonlyMap<string, ThroneRoom>;
  send(ws: ThroneConnection, payload: WireEvent): void;
  safeRoom(room: ThroneRoom): unknown;
  broadcastRoom(room: ThroneRoom): void;
  broadcastRooms(): void;
  version: string;
  scheduleDelay?(ms: number): number;
  chooseDecrees?(decrees: typeof Rules.decrees): ThroneDecree[];
  random?(): number;
}
const SUITS: ThroneSuit[] = ['cetro', 'chave', 'lamina', 'mascara'];
const DECREES = Rules.decrees;
const decreeById = Object.fromEntries(DECREES.map((decree) => [decree.id, decree]));
const TURN_MS = 60_000;
const emptyLawUsage = (): Record<ThroneLaw, number> => ({
  ordem: 0,
  estandarte: 0,
  revolta: 0,
  anarquia: 0,
  usurpacao: 0,
});
function isMultiPending(pending: ThronePending | null): pending is ThroneMultiChoice {
  return (
    !!pending &&
    (pending.kind === 'reserva' ||
      pending.kind === 'corte' ||
      pending.kind === 'conselho' ||
      pending.kind === 'rotation')
  );
}
/** Owns authoritative match phases, private cards, bots and every match timer.
 * Internal phase transitions require an active game; scheduled work checks its token first.
 */
export function createThroneService({
  rooms,
  send,
  safeRoom,
  broadcastRoom,
  broadcastRooms,
  version: VERSION,
  scheduleDelay = (ms) => ms,
  chooseDecrees,
  random = Math.random,
}: Options) {
  let closed = false;
  const scheduledTimers = new Set<NodeJS.Timeout>();
  const rand = (n: number) => Math.floor(random() * n);
  function shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function gameRoomFor(ws: ThroneConnection) {
    return rooms.get((ws.independentGames ? ws.gameRoomId : ws.roomId) || '');
  }
  function roomHostId(room: ThroneRoom) {
    return [...room.players.values()].sort((a, b) => a.seat - b.seat)[0]?.id || null;
  }
  function roomHumanBySeat(room: ThroneRoom, seat: number) {
    return [...room.players.values()].find((p) => p.seat === seat) || null;
  }
  function playerSocketBySeat(room: ThroneRoom, seat: number) {
    return roomHumanBySeat(room, seat)?.ws || null;
  }
  function clampCardValue(value: number) {
    return Math.max(1, Math.min(12, Number(value) || 0));
  }
  function playValue(play: ThroneServerPlay) {
    return clampCardValue((play?.card?.value || 0) + (play?.modifier || 0));
  }
  function influenceLabel(play: ThroneServerPlay) {
    if (!play?.influenceAction || play.influenceAction === 'none') return '';
    if (play.influenceAction === 'sigilo') return 'Sigilo';
    return play.influenceAction === 'plus' ? 'Manobra +3' : 'Manobra -3';
  }

  function makeDeck() {
    let id = 0;
    const deck: ThroneServerCard[] = [];
    for (const suit of SUITS)
      for (let value = 1; value <= 12; value++)
        deck.push({ id: `c${id++}`, suit, value, public: false, publicReason: null });
    return deck;
  }
  function sortHand(hand: ThroneServerCard[]) {
    hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.value - b.value);
  }
  function sendToSeat(room: ThroneRoom, seat: number, payload: WireEvent) {
    const ws = playerSocketBySeat(room, seat);
    if (ws) send(ws, payload);
  }
  function broadcastGameEvent(room: ThroneRoom, payload: Record<string, unknown>) {
    for (const p of room.players.values()) send(p.ws, { type: 'game-event', ...payload });
  }
  function broadcastLog(room: ThroneRoom, message: string) {
    const g = room.game!;
    if (g) {
      if (!Array.isArray(g.logHistory)) g.logHistory = [];
      g.logHistory.push({
        ts: Date.now(),
        round: g.round || 0,
        trick: g.trick || 0,
        message: String(message),
      });
      if (g.logHistory.length > 600) g.logHistory.splice(0, g.logHistory.length - 600);
    }
    broadcastGameEvent(room, { event: 'log', message });
  }
  function schedule(room: ThroneRoom, fn: () => void, ms = 450) {
    if (closed || !room.game) return;
    const token = room.game.token;
    const timer = setTimeout(() => {
      scheduledTimers.delete(timer);
      if (!closed && room.game?.token === token) {
        try {
          fn();
        } catch (err) {
          console.error(err);
          broadcastGameEvent(room, {
            event: 'server-error',
            message: err instanceof Error ? err.message : 'Falha ao avançar a partida.',
          });
        }
      }
    }, scheduleDelay(ms));
    scheduledTimers.add(timer);
  }

  function setReady(ws: ThroneConnection, ready: unknown) {
    if (closed) return;
    const room = gameRoomFor(ws),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws) {
      send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
      return;
    }
    if (room.kind !== 'game') {
      send(ws, {
        type: 'error',
        code: 'CHAT_ONLY_ROOM',
        message: 'O Salão Livre é somente para conversa.',
      });
      return;
    }
    if (room.game && room.game.phase !== 'game-over') {
      send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'A partida já começou.' });
      return;
    }
    if (typeof ready !== 'boolean') {
      send(ws, { type: 'error', code: 'INVALID_ACTION', message: 'Informe se está pronto.' });
      return;
    }
    player.ready = ready;
    broadcastRoom(room);
    broadcastRooms();
  }

  function makeMatchPlayer(room: ThroneRoom, seat: number): ThroneMatchPlayer {
    const hp = roomHumanBySeat(room, seat);
    return {
      id: seat,
      seat,
      clientId: hp?.id || null,
      name: hp?.name || `IA ${seat + 1}`,
      bot: !hp,
      hand: [],
      reserve: null,
      totalCrowns: 0,
      totalShadows: 0,
      roundCrowns: 0,
      roundShadows: 0,
      influence: 0,
      hadCrown: false,
      crownStreak: 0,
    };
  }
  function totalPairs(p: ThroneMatchPlayer) {
    return Math.min(p.totalCrowns, p.totalShadows);
  }
  function prestige(p: ThroneMatchPlayer) {
    return p.totalCrowns + p.totalShadows + 2 * totalPairs(p);
  }
  function rawAccumulated(p: ThroneMatchPlayer) {
    return p.totalCrowns + p.totalShadows;
  }

  function requestStart(ws: ThroneConnection) {
    if (closed) return;
    const room = gameRoomFor(ws),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws) {
      send(ws, { type: 'error', code: 'NOT_IN_ROOM', message: 'Você não está em uma sala.' });
      return;
    }
    if (room.kind !== 'game') {
      send(ws, {
        type: 'error',
        code: 'CHAT_ONLY_ROOM',
        message: 'O Salão Livre não inicia partidas.',
      });
      return;
    }
    if (roomHostId(room) !== ws.clientId) {
      send(ws, { type: 'error', code: 'NOT_HOST', message: 'Somente o anfitrião pode iniciar.' });
      return;
    }
    if (room.players.size < 2) {
      send(ws, {
        type: 'error',
        code: 'NOT_ENOUGH_PLAYERS',
        message:
          'São necessários pelo menos 2 jogadores online. As vagas restantes serão preenchidas por IAs.',
      });
      return;
    }
    const notReady = [...room.players.values()].filter((p) => !p.ready);
    if (notReady.length) {
      send(ws, {
        type: 'error',
        code: 'PLAYERS_NOT_READY',
        message: 'Todos os jogadores precisam marcar Pronto.',
      });
      return;
    }
    if (room.game && room.game.phase !== 'game-over') {
      send(ws, {
        type: 'error',
        code: 'GAME_ALREADY_STARTED',
        message: 'A partida já foi iniciada.',
      });
      return;
    }
    startGame(room);
  }

  function startGame(room: ThroneRoom) {
    const players = [0, 1, 2, 3].map((seat) => makeMatchPlayer(room, seat));
    let botIndex = 0;
    for (const p of players) if (p.bot) p.name = Bots.at(botIndex++);
    const firstStarter = rand(4);
    room.game = {
      token: crypto.randomUUID(),
      players,
      round: 1,
      trick: 1,
      undealt: [],
      decree: null,
      lawUsage: emptyLawUsage(),
      currentLaw: 'ordem',
      trump: null,
      declaredLeadSuit: null,
      leader: firstStarter,
      lastCrown: null,
      lastShadow: null,
      previousWinningSuit: null,
      plays: [],
      turn: null,
      phase: 'starting',
      pending: null,
      promptSeq: 0,
      turnDeadline: null,
      turnSerial: 0,
      turnTimer: null,
      logHistory: [],
    };
    for (const p of room.players.values()) p.ready = false;
    broadcastRoom(room);
    broadcastRooms();
    for (const hp of room.players.values())
      send(hp.ws, { type: 'game-started', seat: hp.seat, room: safeRoom(room), version: VERSION });
    broadcastLog(
      room,
      `Partida online iniciada. ${players[firstStarter].name} foi sorteado para abrir a primeira rodada.`,
    );
    setupRound(room);
  }

  function resetRoundStats(game: ThroneGame) {
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
  function setupRound(room: ThroneRoom) {
    const g = room.game!;
    if (!g) return;
    g.phase = 'round-start';
    g.trick = 1;
    g.currentLaw = 'ordem';
    g.trump = null;
    g.declaredLeadSuit = null;
    g.lawUsage = emptyLawUsage();
    g.lastCrown = null;
    g.lastShadow = null;
    g.previousWinningSuit = null;
    g.plays = [];
    g.turn = null;
    g.turnDeadline = null;
    g.pending = null;
    clearTurnTimer(g);
    resetRoundStats(g);
    const deck = shuffle(makeDeck());
    for (let i = 0; i < 10; i++)
      for (let seat = 0; seat < 4; seat++) g.players[seat].hand.push(deck.pop()!);
    g.undealt = deck;
    for (const p of g.players) sortHand(p.hand);
    broadcastLog(
      room,
      `Rodada ${g.round}: as cartas foram distribuídas. A primeira Lei será Ordem.`,
    );
    chooseDecreeStage(room);
  }
  function chooseDecreeStage(room: ThroneRoom) {
    const g = room.game!;
    const min = Math.min(...g.players.map(rawAccumulated));
    const tied = g.players.filter((p) => rawAccumulated(p) === min);
    const chooser = tied[rand(tied.length)];
    const picks = chooseDecrees
      ? chooseDecrees(DECREES)
      : shuffle(DECREES)
          .slice(0, 2)
          .map((d) => d.id);
    g.phase = 'choose-decree';
    g.pending = { kind: 'decree', seat: chooser.seat, options: picks };
    broadcastGameState(room);
    if (chooser.bot) {
      schedule(room, () => applyDecreeChoice(room, chooser.seat, picks[rand(picks.length)]), 650);
    } else
      sendPrompt(room, chooser.seat, {
        kind: 'choose-decree',
        title: 'Escolha o Decreto',
        options: picks,
      });
  }
  function applyDecreeChoice(room: ThroneRoom, seat: number, decreeId: ThroneDecree) {
    const g = room.game!;
    if (
      !g?.pending ||
      g.pending.kind !== 'decree' ||
      g.pending.seat !== seat ||
      !g.pending.options.includes(decreeId)
    )
      return false;
    g.decree = decreeById[decreeId];
    g.pending = null;
    broadcastLog(room, `${g.players[seat].name} escolheu o Decreto ${g.decree.name}.`);
    if (decreeId === 'reserva') startMultiCardStage(room, 'reserva');
    else if (decreeId === 'corte' || decreeId === 'conselho') startMultiCardStage(room, decreeId);
    else if (decreeId === 'espionagem') startIntelligence(room);
    else {
      if (decreeId === 'favor') for (const p of g.players) p.influence = 1;
      beginTrick(room);
    }
    return true;
  }
  function startMultiCardStage(room: ThroneRoom, kind: 'reserva' | 'corte' | 'conselho') {
    const g = room.game!;
    g.phase = `choose-${kind}`;
    g.pending = { kind, waiting: new Set(), choices: new Map() };
    for (const p of g.players) {
      if (p.bot) {
        g.pending.choices.set(p.seat, chooseBotCard(p, kind));
      } else {
        g.pending.waiting.add(p.seat);
        sendPrompt(room, p.seat, {
          kind: `choose-${kind}`,
          title:
            kind === 'reserva'
              ? 'Escolha sua Reserva'
              : kind === 'conselho'
                ? 'Conselho — passe uma carta à direita'
                : 'Corte Aberta',
          cardIds: p.hand.map((c) => c.id),
        });
      }
    }
    broadcastGameState(room);
    maybeFinishMultiStage(room);
  }
  function chooseBotCard(p: ThroneMatchPlayer, kind: string) {
    if (kind === 'reserva')
      return [...p.hand].sort((a, b) => Math.abs(a.value - 6.5) - Math.abs(b.value - 6.5))[0]?.id;
    return p.hand[rand(p.hand.length)]?.id;
  }
  function maybeFinishMultiStage(room: ThroneRoom) {
    const g = room.game!,
      p = g?.pending;
    if (!isMultiPending(p) || p.waiting.size) return;
    if (p.kind === 'reserva') {
      for (const pl of g.players) {
        const id = p.choices.get(pl.seat);
        const idx = pl.hand.findIndex((c) => c.id === id);
        if (idx < 0) continue;
        pl.reserve = pl.hand.splice(idx, 1)[0];
      }
      g.pending = null;
      broadcastLog(room, 'Todas as Casas separaram sua carta de Reserva.');
      broadcastGameState(room);
      beginTrick(room);
      return;
    }
    if (p.kind === 'corte') {
      for (const pl of g.players) {
        const id = p.choices.get(pl.seat);
        const c = pl.hand.find((c) => c.id === id);
        if (c) {
          c.public = true;
          c.publicReason = 'Corte Aberta';
        }
      }
      g.pending = null;
      broadcastLog(room, 'Corte Aberta: cada Casa revelou uma carta.');
      broadcastGameState(room);
      beginTrick(room);
      return;
    }
    if (p.kind === 'rotation' || p.kind === 'conselho') {
      const council = p.kind === 'conselho',
        direction = council ? -1 : 1;
      Rules.passCards(g.players, p.choices, direction);
      for (const pl of g.players) sortHand(pl.hand);
      g.pending = null;
      broadcastGameEvent(room, {
        event: 'exchange',
        kind: council ? 'conselho' : 'rotation',
        moves: g.players.map((pl) => ({
          from: pl.seat,
          to: (pl.seat + direction + 4) % 4,
          label: `${pl.name} → ${g.players[(pl.seat + direction + 4) % 4].name}`,
        })),
        title: council ? 'Conselho — pacto entre as Casas' : `Rotação — fim da vaza ${g.trick}`,
      });
      broadcastLog(
        room,
        `${council ? 'Conselho' : 'Rotação'}: quatro cartas ocultas foram passadas simultaneamente para a ${council ? 'direita' : 'esquerda'}.`,
      );
      broadcastGameState(room);
      schedule(room, () => (council ? beginTrick(room) : chooseNextLawStage(room)), 3500);
    }
  }

  function startIntelligence(room: ThroneRoom) {
    const g = room.game!;
    g.phase = 'private-intelligence';
    g.pending = { kind: 'intelligence-ack', waiting: new Set() };
    for (const p of g.players) {
      p.intelligence = Rules.intelligence(g.players, p.seat, random);
      if (!p.bot) {
        g.pending.waiting.add(p.seat);
        sendToSeat(room, p.seat, { type: 'private-intelligence', intelligence: p.intelligence });
      }
    }
    broadcastLog(
      room,
      'Espionagem: cada Casa recebeu uma informação privada sobre o jogador à direita.',
    );
    broadcastGameState(room);
    if (!g.pending.waiting.size) {
      g.pending = null;
      beginTrick(room);
    }
  }
  function acknowledgePrivate(
    room: ThroneRoom,
    seat: number,
    kind: 'usurp-ack' | 'intelligence-ack',
  ) {
    const g = room.game!,
      p = g.pending;
    if (
      !p ||
      (p.kind !== 'usurp-ack' && p.kind !== 'intelligence-ack') ||
      p.kind !== kind ||
      !p.waiting.has(seat)
    )
      return false;
    p.waiting.delete(seat);
    if (!p.waiting.size) {
      g.pending = null;
      schedule(
        room,
        () => (kind === 'intelligence-ack' ? beginTrick(room) : startTurns(room)),
        180,
      );
    }
    return true;
  }

  function beginTrick(room: ThroneRoom) {
    const g = room.game!;
    if (!g) return;
    g.phase = 'trick-start';
    g.plays = [];
    g.trump = null;
    g.declaredLeadSuit = null;
    g.turn = null;
    g.pending = null;
    g.lawUsage[g.currentLaw]++;
    broadcastLog(room, `Vaza ${g.trick}: ${lawName(g.currentLaw)}.`);
    broadcastGameState(room);
    if (g.currentLaw === 'estandarte') return declareTrumpStage(room);
    if (g.currentLaw === 'usurpacao') return usurpacaoGiveStage(room);
    startTurns(room);
  }
  function lawName(id: ThroneLaw) {
    return (
      {
        ordem: 'Ordem',
        estandarte: 'Estandarte',
        revolta: 'Revolta',
        anarquia: 'Anarquia',
        usurpacao: 'Usurpação',
      }[id] || id
    );
  }
  function declareTrumpStage(room: ThroneRoom) {
    const g = room.game!,
      seat = g.lastShadow;
    if (seat === null || seat === undefined) {
      g.trump = SUITS[rand(4)];
      return startTurns(room);
    }
    const p = g.players[seat];
    g.phase = 'choose-trump';
    g.pending = { kind: 'trump', seat, options: [...SUITS] };
    broadcastGameState(room);
    if (p.bot) schedule(room, () => applyTrump(room, seat, chooseBotTrump(p)), 500);
    else
      sendPrompt(room, seat, {
        kind: 'choose-trump',
        title: 'Declare o Trunfo',
        options: [...SUITS],
      });
  }
  function chooseBotTrump(p: ThroneMatchPlayer) {
    return SUITS.map((s) => ({
      s,
      score:
        p.hand.filter((c) => c.suit === s).reduce((a, c) => a + c.value, 0) +
        p.hand.filter((c) => c.suit === s).length * 5,
    })).sort((a, b) => b.score - a.score)[0].s;
  }
  function applyTrump(room: ThroneRoom, seat: number, suit: ThroneSuit) {
    const g = room.game!;
    if (
      !g?.pending ||
      g.pending.kind !== 'trump' ||
      g.pending.seat !== seat ||
      !SUITS.includes(suit)
    )
      return false;
    g.trump = suit;
    g.pending = null;
    broadcastLog(room, `${g.players[seat].name} declarou ${suitName(suit)} como Trunfo.`);
    broadcastGameState(room);
    startTurns(room);
    return true;
  }
  function suitName(s: ThroneSuit) {
    return { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' }[s] || s;
  }

  function usurpacaoEligibleCards(hand: ThroneServerCard[]) {
    return Rules.eligible(hand);
  }
  function usurpacaoGiveStage(room: ThroneRoom) {
    const g = room.game!,
      shadow = g.lastShadow === null ? undefined : g.players[g.lastShadow];
    if (!shadow) return startTurns(room);
    if (g.players.some((p) => p.hand.length < 4))
      throw new Error('Usurpação exige ao menos quatro cartas por Casa.');
    const options = g.players
      .filter((p) => p.seat !== shadow.seat && Rules.eligible(p.hand).length)
      .map((p) => p.seat);
    g.phase = 'usurp-target';
    g.pending = { kind: 'usurp-target', seat: shadow.seat, options };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(room, () => applyUsurpTarget(room, shadow.seat, options[rand(options.length)]), 500);
    else
      sendPrompt(room, shadow.seat, {
        kind: 'usurp-target',
        title: 'Usurpação — escolha uma Casa',
        options: options.map((seat) => ({ seat, name: g.players[seat].name })),
      });
  }
  function applyUsurpTarget(room: ThroneRoom, seat: number, targetSeat: number) {
    const g = room.game!,
      p = g?.pending;
    if (p?.kind !== 'usurp-target' || p.seat !== seat || !p.options.includes(targetSeat))
      return false;
    const shadow = g.players[seat],
      target = g.players[targetSeat],
      eligible = Rules.eligible(shadow.hand);
    g.phase = 'usurp-give';
    g.pending = {
      kind: 'usurp-give',
      seat,
      shadow: seat,
      target: targetSeat,
      eligibleIds: eligible.map((c) => c.id),
    };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(
        room,
        () => applyUsurpGive(room, seat, [...eligible].sort((a, b) => a.value - b.value)[0].id),
        500,
      );
    else
      sendPrompt(room, seat, {
        kind: 'usurp-give',
        title: 'Usurpação — separe uma carta',
        cardIds: eligible.map((c) => c.id),
        otherName: target.name,
      });
    return true;
  }
  function applyUsurpGive(room: ThroneRoom, seat: number, cardId: string) {
    const g = room.game!,
      p = g?.pending;
    if (p?.kind !== 'usurp-give' || p.seat !== seat || !p.eligibleIds.includes(cardId))
      return false;
    const shadow = g.players[p.shadow],
      target = g.players[p.target];
    const exchange = Rules.reserveExchange(g.players, shadow, target, cardId, shuffle);
    g.phase = 'usurp-pick';
    g.pending = { kind: 'usurp-pick', seat, shadow: seat, target: target.seat, ...exchange };
    broadcastGameState(room);
    if (shadow.bot)
      schedule(room, () => applyUsurpPick(room, seat, rand(exchange.pickableIds.length)), 500);
    else
      sendPrompt(room, seat, {
        kind: 'usurp-pick',
        title: 'Usurpação — escolha às cegas',
        count: exchange.pickableIds.length,
        otherName: target.name,
        note: 'Sua carta está separada e nunca pode retornar. Corte Aberta permanece protegida.',
      });
    return true;
  }
  function applyUsurpPick(room: ThroneRoom, seat: number, index: number) {
    const g = room.game!,
      p = g?.pending;
    if (
      p?.kind !== 'usurp-pick' ||
      p.seat !== seat ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= p.pickableIds.length
    )
      return false;
    const shadow = g.players[p.shadow],
      target = g.players[p.target],
      { given, taken } = Rules.finishExchange(shadow, target, p, index);
    sortHand(shadow.hand);
    sortHand(target.hand);
    const waiting = new Set([shadow, target].filter((x) => !x.bot).map((x) => x.seat));
    g.phase = 'usurp-reveal';
    g.pending = { kind: 'usurp-ack', waiting };
    broadcastGameEvent(room, {
      event: 'exchange',
      kind: 'usurpacao',
      title: 'Usurpação — troca de mãos',
      shadow: seat,
      target: target.seat,
      moves: [
        { from: target.seat, to: seat, label: 'Carta oculta → Sombra' },
        { from: seat, to: target.seat, label: 'Carta separada → Casa escolhida', delay: 220 },
      ],
    });
    if (!shadow.bot)
      sendToSeat(room, seat, {
        type: 'private-usurpation',
        role: 'shadow',
        outgoing: given,
        incoming: taken,
        otherName: target.name,
        returnedSameCard: false,
      });
    if (!target.bot)
      sendToSeat(room, target.seat, {
        type: 'private-usurpation',
        role: 'target',
        outgoing: taken,
        incoming: given,
        otherName: shadow.name,
        returnedSameCard: false,
      });
    broadcastLog(
      room,
      `Usurpação: ${shadow.name} e ${target.name} trocaram uma carta oculta. Nenhuma carta protegida foi movida.`,
    );
    broadcastGameState(room);
    if (!waiting.size)
      schedule(
        room,
        () => {
          g.pending = null;
          startTurns(room);
        },
        3200,
      );
    return true;
  }

  function clearTurnTimer(g: ThroneGame | null) {
    if (!g) return;
    if (g.turnTimer) {
      clearTimeout(g.turnTimer);
      g.turnTimer = null;
    }
    g.turnDeadline = null;
  }
  function armTurnTimer(room: ThroneRoom, seat: number) {
    const g = room.game!;
    if (!g) return;
    clearTurnTimer(g);
    const serial = ++g.turnSerial;
    g.turnDeadline = Date.now() + TURN_MS;
    g.turnTimer = setTimeout(() => {
      const live = room.game;
      if (
        !live ||
        live.token !== g.token ||
        live.phase !== 'await-play' ||
        live.turn !== seat ||
        live.turnSerial !== serial
      )
        return;
      const p = live.players[seat];
      const legal = legalCards(live, p);
      if (!legal.length) return;
      const card = legal[rand(legal.length)];
      broadcastGameEvent(room, { event: 'turn-timeout', seat, seconds: 60 });
      broadcastLog(room, `Tempo esgotado: ${p.name} recebeu uma jogada automática.`);
      commitPlay(room, p, card, {
        hidden: false,
        declaredSuit: null,
        isReserve: live.decree?.id === 'reserva' && live.trick === 10 && p.reserve?.id === card.id,
        timeout: true,
      });
    }, TURN_MS + 60);
  }
  function startTurns(room: ThroneRoom) {
    const g = room.game!;
    clearTurnTimer(g);
    g.phase = 'await-play';
    g.turn = g.leader;
    broadcastGameState(room);
    advanceTurn(room);
  }
  function influenceBlocked(g: ThroneGame, p: ThroneMatchPlayer) {
    return Rules.influenceBlocked(g, p);
  }
  function leadSuit(g: ThroneGame) {
    return g.declaredLeadSuit || g.plays[0]?.card?.suit || null;
  }
  function legalCards(g: ThroneGame, p: ThroneMatchPlayer) {
    let cards = [...p.hand];
    if (g.decree?.id === 'reserva' && g.trick === 10 && p.reserve) return [p.reserve];
    if (g.plays.length === 0 && g.decree?.id === 'sucessao' && g.previousWinningSuit) {
      const alt = cards.filter((c) => c.suit !== g.previousWinningSuit);
      if (alt.length) cards = alt;
    }
    if (g.plays.length === 0) return cards;
    if (['ordem', 'estandarte', 'revolta', 'usurpacao'].includes(g.currentLaw)) {
      return Rules.followCards(cards, g.currentLaw, leadSuit(g), g.trump);
    }
    return cards;
  }
  function canUseInfluence(g: ThroneGame, p: ThroneMatchPlayer, cost = 1) {
    if (p.influence < cost || influenceBlocked(g, p)) return false;
    if (g.plays.length === 0) return p.seat === g.leader;
    return true;
  }
  function influenceLegalCards(g: ThroneGame, p: ThroneMatchPlayer) {
    return legalCards(g, p).filter((c) => c.publicReason !== 'Corte Aberta');
  }
  function chooseBotPlay(g: ThroneGame, p: ThroneMatchPlayer, legal: ThroneServerCard[]) {
    const sorted = [...legal].sort((a, b) => a.value - b.value),
      seek = random() < 0.55;
    if (g.currentLaw === 'revolta') return seek ? sorted[0] : sorted[sorted.length - 1];
    if (g.currentLaw === 'anarquia') return seek ? sorted[sorted.length - 1] : sorted[0];
    if (g.currentLaw === 'estandarte' && g.trump) {
      const tr = legal.filter((c) => c.suit === g.trump).sort((a, b) => a.value - b.value);
      if (seek && tr.length) return tr[tr.length - 1];
    }
    return seek ? sorted[sorted.length - 1] : sorted[0];
  }
  function advanceTurn(room: ThroneRoom) {
    const g = room.game!;
    if (!g || g.phase !== 'await-play') return;
    if (g.plays.length >= 4) {
      clearTurnTimer(g);
      return resolveTrick(room);
    }
    const seat = (g.leader + g.plays.length) % 4;
    g.turn = seat;
    const p = g.players[seat],
      legal = legalCards(g, p);
    if (!p.bot) armTurnTimer(room, seat);
    else clearTurnTimer(g);
    broadcastGameState(room);
    if (g.decree?.id === 'reserva' && g.trick === 10 && p.reserve) {
      return schedule(
        room,
        () => {
          if (
            !room.game ||
            room.game.turn !== seat ||
            room.game.phase !== 'await-play' ||
            !p.reserve
          )
            return;
          commitPlay(room, p, p.reserve, { hidden: false, declaredSuit: null, isReserve: true });
        },
        620,
      );
    }
    if (p.bot) {
      schedule(
        room,
        () => {
          if (!room.game || room.game.turn !== seat || room.game.phase !== 'await-play') return;
          const card = chooseBotPlay(g, p, legal);
          let influenceAction: ThroneInfluenceAction = 'none',
            modifier = 0,
            declaredSuit: ThroneSuit | null = null;
          if (card.publicReason !== 'Corte Aberta' && !influenceBlocked(g, p)) {
            if (canUseInfluence(g, p, 2) && card.value >= 4 && card.value <= 9 && random() < 0.3) {
              const seekCrown = random() < 0.62;
              influenceAction =
                g.currentLaw === 'revolta'
                  ? seekCrown
                    ? 'minus'
                    : 'plus'
                  : seekCrown
                    ? 'plus'
                    : 'minus';
              modifier = influenceAction === 'plus' ? 3 : -3;
              p.influence -= 2;
            } else if (canUseInfluence(g, p, 1) && random() < 0.12) {
              influenceAction = 'sigilo';
              p.influence -= 1;
            }
            if (influenceAction !== 'none' && g.plays.length === 0) {
              declaredSuit = card.suit;
              g.declaredLeadSuit = declaredSuit;
            }
          }
          commitPlay(room, p, card, {
            hidden: influenceAction !== 'none',
            influenceAction,
            modifier,
            declaredSuit,
            isReserve: g.decree?.id === 'reserva' && g.trick === 10 && p.reserve?.id === card.id,
          });
        },
        620,
      );
    }
  }
  function handlePlay(room: ThroneRoom, seat: number, msg: ThronePlayInput) {
    const g = room.game!;
    if (!g || g.phase !== 'await-play' || g.turn !== seat) return false;
    const p = g.players[seat];
    if (p.bot) return false;
    const legal = legalCards(g, p);
    const card = legal.find((c) => c.id === msg.cardId);
    if (!card)
      return (
        sendToSeat(room, seat, {
          type: 'error',
          code: 'ILLEGAL_CARD',
          message: 'Esta carta não pode ser jogada agora.',
        }),
        false
      );
    const action = msg.influenceAction || (msg.hidden ? 'sigilo' : 'none');
    const hidden = action !== 'none',
      cost = action === 'sigilo' ? 1 : hidden ? 2 : 0,
      modifier = action === 'plus' ? 3 : action === 'minus' ? -3 : 0;
    const declaredSuit = msg.declaredSuit || null;
    if (hidden) {
      if (!canUseInfluence(g, p, cost))
        return (
          sendToSeat(room, seat, {
            type: 'error',
            code: 'NO_INFLUENCE',
            message: `Você precisa de ${cost} Influência${cost > 1 ? 's' : ''} para esta ação.`,
          }),
          false
        );
      if (card.publicReason === 'Corte Aberta')
        return (
          sendToSeat(room, seat, {
            type: 'error',
            code: 'CORTE_INFLUENCE_BLOCKED',
            message:
              'A carta revelada pela Corte Aberta não pode ser jogada oculta por Influência.',
          }),
          false
        );
      if (g.plays.length === 0) {
        if (!declaredSuit || card.suit !== declaredSuit)
          return (
            sendToSeat(room, seat, {
              type: 'error',
              code: 'BAD_DECLARATION',
              message: 'Ao abrir oculta, anuncie o mesmo naipe da carta jogada.',
            }),
            false
          );
        g.declaredLeadSuit = declaredSuit;
      }
      p.influence -= cost;
    }
    const isReserve = g.decree?.id === 'reserva' && g.trick === 10 && p.reserve?.id === card.id;
    commitPlay(room, p, card, {
      hidden,
      influenceAction: action,
      modifier,
      declaredSuit,
      isReserve,
    });
    return true;
  }
  function commitPlay(
    room: ThroneRoom,
    p: ThroneMatchPlayer,
    card: ThroneServerCard,
    {
      hidden = false,
      influenceAction = 'none',
      modifier = 0,
      declaredSuit = null,
      isReserve = false,
      timeout = false,
    }: {
      hidden?: boolean;
      influenceAction?: ThroneInfluenceAction;
      modifier?: number;
      declaredSuit?: ThroneSuit | null;
      isReserve?: boolean;
      timeout?: boolean;
    } = {},
  ) {
    const g = room.game!;
    clearTurnTimer(g);
    if (isReserve) {
      p.reserve = null;
    } else {
      const idx = p.hand.findIndex((c) => c.id === card.id);
      if (idx < 0) throw new Error('Carta não encontrada na mão.');
      p.hand.splice(idx, 1);
    }
    if (card.public) {
      card.public = false;
      card.publicReason = null;
    }
    const play: ThroneServerPlay = {
      playerId: p.seat,
      card,
      hidden,
      influenceAction,
      modifier,
      order: g.plays.length,
    };
    g.plays.push(play);
    if (influenceAction !== 'none') {
      const cost = influenceAction === 'sigilo' ? 1 : 2;
      broadcastGameEvent(room, {
        event: 'influence-used',
        playerId: p.seat,
        name: p.name,
        action: influenceAction,
        modifier,
        cost,
        declaredSuit: declaredSuit || null,
      });
      broadcastLog(
        room,
        `<strong>Influência:</strong> ${p.name} usou <strong>${influenceLabel(play)}</strong>${declaredSuit ? ` e anunciou ${suitName(declaredSuit)}` : ''}.`,
      );
    }
    broadcastGameEvent(room, {
      event: 'card-played',
      playerId: p.seat,
      hidden,
      card: hidden ? null : card,
      declaredSuit: declaredSuit || null,
      isReserve,
    });
    if (hidden && g.plays.length === 1 && declaredSuit)
      broadcastLog(
        room,
        `${p.name} anunciou ${suitName(declaredSuit)} e abriu com uma carta oculta usando Influência.`,
      );
    else
      broadcastLog(
        room,
        `${p.name} jogou ${hidden ? 'uma carta oculta' : `${suitName(card.suit)} ${card.value}`}${isReserve ? ' da Reserva' : ''}.`,
      );
    g.turn = null;
    broadcastGameState(room);
    schedule(
      room,
      () => {
        g.phase = 'await-play';
        advanceTurn(room);
      },
      480,
    );
  }

  function evaluateTrick(g: ThroneGame) {
    return Rules.evaluate(g.plays, g.currentLaw, leadSuit(g), g.trump);
  }

  function resolveTrick(room: ThroneRoom) {
    const g = room.game!;
    if (!g) return;
    g.phase = 'resolve';
    g.turn = null;
    const { crown, shadow } = evaluateTrick(g);
    const cp = g.players[crown.playerId],
      sp = g.players[shadow.playerId];
    cp.roundCrowns++;
    cp.totalCrowns++;
    sp.roundShadows++;
    sp.totalShadows++;
    const influenceGains = [];
    for (const p of g.players) {
      if (p.seat !== cp.seat && p.seat !== sp.seat) {
        const before = p.influence;
        p.influence = Math.min(2, p.influence + 1);
        if (p.influence > before) influenceGains.push({ seat: p.seat, after: p.influence });
      }
    }
    const sameCrown = g.lastCrown === cp.seat;
    if (sameCrown) cp.crownStreak++;
    else {
      for (const p of g.players) p.crownStreak = 0;
      cp.crownStreak = 1;
    }
    const revealedPlays = g.plays.map((x) => ({ ...x, hidden: false }));
    g.lastCrown = cp.seat;
    g.lastShadow = sp.seat;
    g.previousWinningSuit = crown.card.suit;
    g.leader = cp.seat;
    g.phase = 'trick-result';
    broadcastGameEvent(room, {
      event: 'trick-result',
      law: g.currentLaw,
      crownId: cp.seat,
      shadowId: sp.seat,
      revealedPlays,
      influenceGains,
    });
    const crownValue = playValue(crown),
      shadowValue = playValue(shadow);
    const crownShown = crown.modifier
      ? `${crown.card.value} ${crown.modifier > 0 ? '+3' : '-3'} → ${crownValue}`
      : `${crown.card.value}`;
    const shadowShown = shadow.modifier
      ? `${shadow.card.value} ${shadow.modifier > 0 ? '+3' : '-3'} → ${shadowValue}`
      : `${shadow.card.value}`;
    broadcastLog(
      room,
      `${lawName(g.currentLaw)} — Coroa: ${cp.name} (${suitName(crown.card.suit)} ${crownShown}). Sombra: ${sp.name} (${suitName(shadow.card.suit)} ${shadowShown})${g.currentLaw === 'estandarte' && g.trump ? ` • Trunfo: ${suitName(g.trump)}` : ''}.`,
    );
    broadcastGameState(room, true);
    schedule(room, () => afterTrickAnimation(room, sameCrown), 6400);
  }
  function afterTrickAnimation(room: ThroneRoom, sameCrown: boolean) {
    const g = room.game!;
    if (!g) return;
    const cp = g.players[g.lastCrown!];
    if (g.decree?.id === 'desafio') {
      const shouldReveal = !cp.hadCrown || sameCrown;
      cp.hadCrown = true;
      if (shouldReveal) {
        const privateCards = cp.hand.filter((c) => !c.public);
        if (privateCards.length) {
          return challengeStage(room, cp, privateCards);
        }
      }
    } else cp.hadCrown = true;
    continueAfterChallenge(room);
  }
  function challengeStage(room: ThroneRoom, p: ThroneMatchPlayer, cards: ThroneServerCard[]) {
    const g = room.game!;
    g.phase = 'challenge';
    g.pending = { kind: 'challenge', seat: p.seat, cardIds: cards.map((c) => c.id) };
    broadcastGameState(room);
    if (p.bot) {
      schedule(room, () => applyChallenge(room, p.seat, cards[rand(cards.length)].id), 400);
    } else
      sendPrompt(room, p.seat, {
        kind: 'challenge',
        title: 'Desafio — revele uma carta',
        cardIds: cards.map((c) => c.id),
      });
  }
  function applyChallenge(room: ThroneRoom, seat: number, cardId: string) {
    const g = room.game!,
      pending = g?.pending;
    if (
      !pending ||
      pending.kind !== 'challenge' ||
      pending.seat !== seat ||
      !pending.cardIds.includes(cardId)
    )
      return false;
    const p = g.players[seat],
      c = p.hand.find((x) => x.id === cardId);
    if (!c) return false;
    c.public = true;
    c.publicReason = 'Desafio';
    g.pending = null;
    broadcastGameEvent(room, { event: 'challenge-reveal', seat, card: c });
    broadcastLog(room, `Desafio: ${p.name} revelou ${suitName(c.suit)} ${c.value}.`);
    broadcastGameState(room);
    continueAfterChallenge(room);
    return true;
  }
  function continueAfterChallenge(room: ThroneRoom) {
    const g = room.game!;
    if (g.trick === 10) return endRound(room);
    if (g.decree?.id === 'rotacao' && [7, 8, 9].includes(g.trick)) return startRotationStage(room);
    chooseNextLawStage(room);
  }
  function startRotationStage(room: ThroneRoom) {
    const g = room.game!;
    g.phase = 'rotation';
    g.pending = { kind: 'rotation', waiting: new Set(), choices: new Map() };
    for (const p of g.players) {
      if (p.bot) g.pending.choices.set(p.seat, p.hand[rand(p.hand.length)].id);
      else {
        g.pending.waiting.add(p.seat);
        sendPrompt(room, p.seat, {
          kind: 'rotation',
          title: `Rotação — fim da vaza ${g.trick}`,
          cardIds: p.hand.map((c) => c.id),
        });
      }
    }
    broadcastGameState(room);
    maybeFinishMultiStage(room);
  }
  function chooseNextLawStage(room: ThroneRoom) {
    const g = room.game!,
      seat = g.lastShadow!,
      p = g.players[seat],
      valid = safeThroneLawChoices(g, g.trick + 1);
    if (!valid.length) throw new Error('Não há Lei válida para a próxima vaza.');
    g.phase = 'choose-law';
    g.pending = { kind: 'law', seat, options: valid };
    broadcastGameState(room);
    if (p.bot) schedule(room, () => applyLawChoice(room, seat, valid[rand(valid.length)]), 450);
    else
      sendPrompt(room, seat, {
        kind: 'choose-law',
        title: 'Escolha a próxima Lei',
        options: valid,
      });
  }
  function applyLawChoice(room: ThroneRoom, seat: number, law: ThroneLaw) {
    const g = room.game!,
      p = g?.pending;
    if (!p || p.kind !== 'law' || p.seat !== seat || !p.options.includes(law)) return false;
    g.currentLaw = law;
    g.pending = null;
    g.trick++;
    broadcastLog(room, `${g.players[seat].name}, como Sombra, escolheu ${lawName(law)}.`);
    beginTrick(room);
    return true;
  }
  function endRound(room: ThroneRoom) {
    const g = room.game!;
    g.phase = 'round-end';
    g.turn = null;
    for (const p of g.players) p.influence = 0;
    const scores = g.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      crowns: p.totalCrowns,
      shadows: p.totalShadows,
      pairs: totalPairs(p),
      prestige: prestige(p),
    }));
    broadcastGameEvent(room, { event: 'round-ended', round: g.round, scores });
    broadcastGameState(room);
    if (g.round >= 3) return schedule(room, () => endGame(room), 3500);
    const nextStarter = (g.lastCrown! + 1) % 4;
    schedule(
      room,
      () => {
        g.round++;
        g.leader = nextStarter;
        broadcastLog(
          room,
          `${g.players[nextStarter].name} iniciará a nova rodada por estar à esquerda do vencedor da 10ª vaza.`,
        );
        setupRound(room);
      },
      3500,
    );
  }
  function endGame(room: ThroneRoom) {
    const g = room.game!;
    g.phase = 'game-over';
    const sorted = [...g.players].sort(
      (a, b) =>
        prestige(b) - prestige(a) ||
        totalPairs(b) - totalPairs(a) ||
        b.totalCrowns - a.totalCrowns ||
        b.totalShadows - a.totalShadows,
    );
    const top = sorted[0];
    const tied = sorted.filter(
      (p) =>
        prestige(p) === prestige(top) &&
        totalPairs(p) === totalPairs(top) &&
        p.totalCrowns === top.totalCrowns &&
        p.totalShadows === top.totalShadows,
    );
    broadcastLog(
      room,
      `Partida encerrada. ${tied.map((p) => p.name).join(' e ')} ${tied.length > 1 ? 'dividem o Trono' : 'ocupa o Trono'}.`,
    );
    broadcastGameEvent(room, {
      event: 'game-ended',
      winners: tied.map((p) => p.seat),
      scores: sorted.map((p) => ({
        seat: p.seat,
        name: p.name,
        crowns: p.totalCrowns,
        shadows: p.totalShadows,
        pairs: totalPairs(p),
        prestige: prestige(p),
      })),
      finalLog: [...(g.logHistory || [])],
    });
    broadcastGameState(room);
  }

  function sendPrompt(room: ThroneRoom, seat: number, prompt: Prompt) {
    const g = room.game!;
    if (!g) return;
    const id = `p${++g.promptSeq}`;
    sendToSeat(room, seat, { type: 'game-prompt', prompt: { id, ...prompt } });
  }
  function handleGameAction(ws: ThroneConnection, message: unknown) {
    if (closed) return;
    const room = gameRoomFor(ws),
      hp = room?.players.get(ws.clientId),
      g = room?.game;
    if (!room || !hp || hp.ws !== ws || !g || g.players[hp.seat]?.clientId !== ws.clientId) {
      send(ws, { type: 'error', code: 'NO_GAME', message: 'Não existe partida ativa nesta sala.' });
      return;
    }
    const command = readThroneCommand(message);
    if (!command) {
      send(ws, {
        type: 'error',
        code: 'INVALID_ACTION',
        message: 'Essa ação não é válida neste momento.',
      });
      return;
    }
    const seat = hp.seat;
    let ok = false;
    if (command.action === 'choose-decree')
      ok = applyDecreeChoice(room, seat, command.payload.value);
    else if (command.action === 'choose-trump') ok = applyTrump(room, seat, command.payload.value);
    else if (command.action === 'choose-law')
      ok = applyLawChoice(room, seat, command.payload.value);
    else if (command.action === 'usurp-target')
      ok = applyUsurpTarget(room, seat, command.payload.targetSeat);
    else if (command.action === 'usurp-give')
      ok = applyUsurpGive(room, seat, command.payload.cardId);
    else if (command.action === 'usurp-pick')
      ok = applyUsurpPick(room, seat, command.payload.index);
    else if (command.action === 'challenge')
      ok = applyChallenge(room, seat, command.payload.cardId);
    else if (command.action === 'play-card') ok = handlePlay(room, seat, command.payload);
    else if (command.action === 'usurp-ack' || command.action === 'intelligence-ack')
      ok = acknowledgePrivate(room, seat, command.action);
    else if (
      ['choose-reserva', 'choose-corte', 'choose-conselho', 'rotation'].includes(command.action)
    ) {
      const p = g.pending,
        expected =
          command.action === 'choose-reserva'
            ? 'reserva'
            : command.action === 'choose-corte'
              ? 'corte'
              : command.action === 'choose-conselho'
                ? 'conselho'
                : 'rotation';
      if (
        isMultiPending(p) &&
        p.kind === expected &&
        p.waiting?.has(seat) &&
        g.players[seat].hand.some((c) => c.id === command.payload.cardId)
      ) {
        p.choices.set(seat, command.payload.cardId);
        p.waiting.delete(seat);
        ok = true;
        broadcastGameState(room);
        maybeFinishMultiStage(room);
      }
    }
    if (!ok && !['play-card'].includes(command.action))
      send(ws, {
        type: 'error',
        code: 'INVALID_ACTION',
        message: 'Essa ação não é válida neste momento.',
      });
  }
  function autoResolvePendingSeat(room: ThroneRoom, seat: number) {
    const g = room.game!,
      p = g?.pending;
    if (!g || !p) return;
    const gp = g.players[seat];
    gp.bot = true;
    gp.clientId = null;
    if ((p.kind === 'usurp-ack' || p.kind === 'intelligence-ack') && p.waiting.has(seat)) {
      acknowledgePrivate(room, seat, p.kind);
      return;
    }
    if (isMultiPending(p) && p.waiting.has(seat)) {
      let cardId = gp.hand[rand(gp.hand.length)]?.id;
      if (p.kind === 'reserva') cardId = chooseBotCard(gp, 'reserva');
      p.choices.set(seat, cardId);
      p.waiting.delete(seat);
      maybeFinishMultiStage(room);
      return;
    }
    if (p.seat !== seat) return;
    if (p.kind === 'decree') applyDecreeChoice(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'trump') applyTrump(room, seat, chooseBotTrump(gp));
    else if (p.kind === 'law') applyLawChoice(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'usurp-target')
      applyUsurpTarget(room, seat, p.options[rand(p.options.length)]);
    else if (p.kind === 'usurp-give') {
      const eligible = usurpacaoEligibleCards(gp.hand);
      const c = [...eligible].sort((a, b) => a.value - b.value)[0];
      if (c) applyUsurpGive(room, seat, c.id);
    } else if (p.kind === 'usurp-pick')
      applyUsurpPick(room, seat, rand(p.pickableIds?.length || 1));
    else if (p.kind === 'challenge') applyChallenge(room, seat, p.cardIds[rand(p.cardIds.length)]);
  }

  function privateGameState(room: ThroneRoom, viewerSeat: number, revealPlays = false) {
    const g = room.game!;
    if (closed || !g || !g.players[viewerSeat]) return null;
    const viewer = g.players[viewerSeat];
    const players = g.players.map((p) => ({
      id: p.seat,
      seat: p.seat,
      name: p.name,
      ai: p.bot,
      handCount: p.hand.length,
      reservePresent: !!p.reserve,
      hand: p.seat === viewerSeat ? p.hand : undefined,
      reserve: p.seat === viewerSeat ? p.reserve : undefined,
      publicCards: p.hand.filter((c) => c.public),
      totalCrowns: p.totalCrowns,
      totalShadows: p.totalShadows,
      roundCrowns: p.roundCrowns,
      roundShadows: p.roundShadows,
      influence: p.influence,
      prestige: prestige(p),
      pairs: totalPairs(p),
    }));
    const plays = g.plays.map((pl) => ({
      playerId: pl.playerId,
      order: pl.order,
      hidden: revealPlays ? false : pl.hidden,
      card: revealPlays || !pl.hidden || pl.playerId === viewerSeat ? pl.card : null,
      modifier: pl.modifier || 0,
      influenceAction: pl.influenceAction || 'none',
    }));
    const legal =
      g.phase === 'await-play' && g.turn === viewerSeat
        ? legalCards(g, viewer).map((c) => c.id)
        : [];
    const influenceLegal =
      g.phase === 'await-play' && g.turn === viewerSeat && canUseInfluence(g, viewer, 1)
        ? influenceLegalCards(g, viewer).map((c) => c.id)
        : [];
    return {
      online: true,
      youSeat: viewerSeat,
      round: g.round,
      trick: g.trick,
      phase: g.phase,
      currentLaw: g.currentLaw,
      lawUsage: g.lawUsage,
      trump: g.trump,
      declaredLeadSuit: g.declaredLeadSuit,
      decree: g.decree,
      lastCrown: g.lastCrown,
      lastShadow: g.lastShadow,
      previousWinningSuit: g.previousWinningSuit,
      leader: g.leader,
      turn: g.turn,
      turnDeadline: g.turnDeadline || null,
      plays,
      players,
      legalCardIds: legal,
      influenceLegalCardIds: influenceLegal,
      canUseInfluence:
        g.phase === 'await-play' &&
        g.turn === viewerSeat &&
        canUseInfluence(g, viewer, 1) &&
        influenceLegal.length > 0,
      canUseManeuver:
        g.phase === 'await-play' &&
        g.turn === viewerSeat &&
        canUseInfluence(g, viewer, 2) &&
        influenceLegal.length > 0,
      influenceBlocked: influenceBlocked(g, viewer),
      intelligence: viewer.intelligence || null,
    };
  }
  function broadcastGameState(room: ThroneRoom, revealPlays = false) {
    if (closed || !room.game) return;
    for (const hp of room.players.values())
      send(hp.ws, { type: 'game-state', state: privateGameState(room, hp.seat, revealPlays) });
  }

  function disconnect(room: ThroneRoom, leaving: ThroneMember, reason: string) {
    if (closed) return;
    if (room.game && leaving) {
      const gp = room.game.players[leaving.seat];
      if (gp && !gp.bot && gp.clientId === leaving.id) {
        gp.bot = true;
        gp.clientId = null;
        gp.name = Bots.next(room.game.players.filter((x) => x !== gp));
        broadcastGameEvent(room, {
          event: 'player-replaced-by-bot',
          seat: leaving.seat,
          name: leaving.name,
          botName: gp.name,
          reason,
        });
        broadcastLog(
          room,
          `<strong>${leaving.name}</strong> ${reason === 'disconnect' ? 'se desconectou' : 'deixou a sala'}. <strong>${gp.name}</strong> assumiu o assento.`,
        );
        broadcastGameState(room);
        if (room.game.turn === leaving.seat && room.game.phase === 'await-play') {
          clearTurnTimer(room.game);
          schedule(room, () => advanceTurn(room), 650);
        }
        if (
          room.game.pending &&
          (room.game.pending.waiting?.has(leaving.seat) || room.game.pending.seat === leaving.seat)
        ) {
          autoResolvePendingSeat(room, leaving.seat);
        }
      }
    }
  }
  return {
    setReady,
    start: requestStart,
    handle: handleGameAction,
    disconnect,
    privateState: privateGameState,
    broadcastState: broadcastGameState,
    rename(room: ThroneRoom, seat: number, name: string) {
      if (closed) return;
      const player = room.game?.players[seat];
      if (player && !player.bot) player.name = name;
    },
    stop() {
      if (closed) return;
      closed = true;
      for (const timer of scheduledTimers) clearTimeout(timer);
      scheduledTimers.clear();
      for (const room of rooms.values()) {
        clearTurnTimer(room.game);
        room.game = null;
      }
    },
  };
}
