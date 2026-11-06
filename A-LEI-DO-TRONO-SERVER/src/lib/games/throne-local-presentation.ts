import type { ThroneLocalPlayer, ThroneLocalState } from '../../types/throne-local';
import type { ThroneHandContext } from '../../types/throne-hand';
import type { ThroneHand } from './throne-hand';
import type { ThroneMatch } from './throne-match';
import type { ThroneSeats } from './throne-seats';
import type { ThroneTable } from './throne-table';

interface Owners {
  hand: Pick<ThroneHand, 'waitingLocal' | 'presentLocal'>;
  match: Pick<ThroneMatch, 'setLocal'>;
  seats: Pick<ThroneSeats, 'setLocal'>;
  table: Pick<ThroneTable, 'setLocal'>;
}
interface Rules {
  legalCards(player: ThroneLocalPlayer): ThroneLocalPlayer['hand'];
  canInfluence(player: ThroneLocalPlayer, cost: number): boolean;
  influenceBlocked(player: ThroneLocalPlayer): boolean;
  prestige(player: ThroneLocalPlayer): number;
  pairs(player: ThroneLocalPlayer): number;
}
/** Copies the human/private and public views to their existing owners; never publishes the engine. */
export function createThroneLocalPresentation(
  game: ThroneLocalState,
  owners: Owners,
  rules: Rules,
) {
  const throneHand = owners.hand,
    throneMatch = owners.match,
    throneSeats = owners.seats,
    throneTable = owners.table;
  return {
    renderAll,
    renderHand,
    projectLocalHand,
    syncLocalStatus,
    syncLocalSeats,
    syncLocalTable,
  };
  function renderAll(includeHand = true) {
    syncLocalStatus();
    syncLocalSeats();
    syncLocalTable();
    if (includeHand) renderHand();
  }
  // Project only visible plays; hidden opponents stay inside the local engine.
  function syncLocalTable(winners?: { crown: number; shadow: number } | null) {
    throneTable.setLocal(
      {
        round: game.round,
        trick: game.trick,
        phase: game.phase === 'setup' ? 'starting' : game.phase,
        currentLaw: game.currentLaw,
        lawUsage: game.lawUsage,
        trump: game.trump,
        declaredLeadSuit: game.declaredLeadSuit,
        decree: game.decree ? { id: game.decree!.id } : null,
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
        prestige: rules.prestige(p),
        pairs: rules.pairs(p),
      })),
    });
  }

  function projectLocalHand(awaiting = throneHand.waitingLocal): ThroneHandContext {
    const p = game.players[0],
      demo = p.ai;
    const automaticReserve =
      !demo && game.decree?.id === 'reserva' && game.trick === 10 && !!p.reserve;
    const legal = !demo && awaiting && !automaticReserve ? rules.legalCards(p) : [];
    const hiddenLegal = legal.filter((c) => c.publicReason !== 'Corte Aberta');
    const canInfluence = !!hiddenLegal.length && rules.canInfluence(p, 1);
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
      canUseManeuver: canInfluence && rules.canInfluence(p, 2),
      influenceBlocked: rules.influenceBlocked(p),
      decreeName: game.decree?.name || 'Decreto',
    };
  }

  function renderHand() {
    throneHand.presentLocal(game.handSession, projectLocalHand(), game.players[0].ai);
  }

  function syncLocalStatus() {
    throneMatch.setLocal({
      round: game.round,
      trick: game.trick,
      phase: game.phase,
      turnName: game.turn == null ? null : game.players[game.turn].name,
      yourTurn:
        game.phase === 'await-play' && game.turn != null && game.turn === game.localPlayerId,
      deadline: game.turnDeadline || null,
    });
  }
}
