import type { ThroneMatchState } from '../../types/throne-match';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import {
  effectChallenge,
  effectExchange,
  effectInfluence,
  effectPlayers,
  effectResult,
  effectSeat,
  effectText,
} from './throne-effect-protocol.ts';

const event = <K extends string, T>(kind: K, data: T) => freezeGame({ kind, data });

/** Project transient facts only. The match owner remains responsible for table cards and scores. */
export function readThroneEvent(value: unknown, match: ThroneMatchState) {
  if (!record(value) || value.type !== 'game-event') return null;
  switch (value.event) {
    case 'influence-used': {
      const seat = effectSeat(value.playerId);
      return event(
        'influence-used',
        effectInfluence({
          name: match.players[seat].name,
          action: value.action,
          cost: value.cost,
          modifier: value.modifier,
          declaredSuit: value.declaredSuit,
        }),
      );
    }
    case 'card-played':
      // Never copy card/hidden/revealedPlays from an effect packet.
      return event('card-played', { seat: effectSeat(value.playerId) });
    case 'exchange':
      return event(
        'exchange',
        effectExchange({
          kind: value.kind,
          title: value.title ?? 'Troca de cartas',
          moves: value.moves,
          subtitle:
            value.kind === 'rotation'
              ? 'Todos passam simultaneamente 1 carta oculta ao jogador à esquerda.'
              : 'As cartas estão mudando de mãos.',
          players: match.players,
          crown: match.lastCrown,
          shadow: match.lastShadow,
        }),
      );
    case 'trick-result': {
      const result = effectResult({
        players: match.players,
        crownId: value.crownId,
        shadowId: value.shadowId,
        influenceGains: value.influenceGains,
      });
      return event('trick-result', {
        players: effectPlayers(match.players),
        crownId: result.crown.id,
        shadowId: result.shadow.id,
        influenceGains: result.gains.map((gain) => ({ seat: gain.player.id, after: gain.after })),
      });
    }
    case 'challenge-reveal':
      return event('challenge-reveal', effectChallenge(value));
    case 'turn-timeout': {
      const seat = effectSeat(value.seat);
      if (value.seconds !== 60) throw new Error('Prazo de jogada inválido.');
      return event('turn-timeout', { name: match.players[seat].name });
    }
    case 'player-replaced-by-bot':
      effectSeat(value.seat);
      return event('player-replaced-by-bot', {
        name: effectText(value.name),
        botName: effectText(value.botName),
        reason: value.reason == null ? 'disconnect' : effectText(value.reason, 80),
      });
    case 'server-error':
      return event('server-error', { message: effectText(value.message, 1000) });
    default:
      // Logs, results, prompts and private disclosures belong to their own consumers.
      return null;
  }
}
