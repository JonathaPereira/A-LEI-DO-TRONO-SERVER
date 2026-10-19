import type { ThroneChoiceRules, ThroneLaw } from '../../types/throne-choices';
import { throneLawTooltip } from './throne-court-copy.ts';
import type { ThroneMatchSnapshot } from '../../types/throne-match';
import type { ThroneTableState, ThroneWinners } from '../../types/throne-table';
import { record } from '../files/protocol.ts';
import { freezeGame } from './freeze.ts';
import { readThroneCourt, readThronePlays } from './throne-match-protocol.ts';

interface Options {
  rules: ThroneChoiceRules;
  source(): ThroneMatchSnapshot;
  subscribeSource(fn: () => void): () => void;
  warn?(error: unknown): void;
}
const afterResult = [
  'trick-result',
  'challenge',
  'rotation',
  'choose-law',
  'round-end',
  'game-over',
];
function seat(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3)
    throw new Error('Assento da mesa inválido.');
  return value as number;
}
function winners(value: ThroneWinners | null): ThroneWinners | null {
  if (value === null) return null;
  const crown = seat(value.crown),
    shadow = seat(value.shadow);
  if (crown === null || shadow === null || crown === shadow)
    throw new Error('Resultado da mesa inválido.');
  return { crown, shadow };
}

export function createThroneTable(options: Options) {
  let state: ThroneTableState | null = null,
    sourceMatch: ThroneMatchSnapshot['match'] = null,
    release: (() => void) | null = null,
    disposed = false;
  const listeners = new Set<() => void>();
  function publish(next: ThroneTableState | null) {
    if (disposed || JSON.stringify(state) === JSON.stringify(next)) return;
    state = freezeGame(next);
    listeners.forEach((fn) => fn());
  }
  function present(next: ThroneTableState, preserveReveals: boolean) {
    const sameTrick = !!state && state.round === next.round && state.trick === next.trick;
    // Some later presence/choice snapshots mask already public plays again.
    // Retain only cards actually revealed in this same trick and post-result phase.
    const plays = next.plays.map((play) => {
      const old = sameTrick
        ? state!.plays.find((p) => p.playerId === play.playerId && p.order === play.order)
        : null;
      return preserveReveals &&
        afterResult.includes(next.phase) &&
        play.hidden &&
        old &&
        !old.hidden &&
        old.card &&
        old.modifier === play.modifier &&
        old.influenceAction === play.influenceAction
        ? { ...play, hidden: false, card: old.card }
        : play;
    });
    const flipping = sameTrick
      ? plays
          .filter(
            (p) =>
              !p.hidden &&
              p.card &&
              state!.plays.some((old) => old.playerId === p.playerId && old.hidden),
          )
          .map((p) => p.playerId)
      : [];
    const complete = plays.length === 4 && plays.every((p) => !p.hidden && p.card);
    publish({ ...next, plays, flipping, winners: complete ? next.winners : null });
  }
  function sync() {
    const s = options.source();
    if (s.mode === 'local') {
      sourceMatch = null;
      return;
    }
    const m = s.match;
    if (!m) {
      sourceMatch = null;
      publish(null);
      return;
    }
    if (m === sourceMatch) return;
    sourceMatch = m;
    present(
      {
        round: m.round,
        trick: m.trick,
        phase: m.phase,
        currentLaw: m.currentLaw,
        lawUsage: m.lawUsage,
        trump: m.trump,
        declaredLeadSuit: m.declaredLeadSuit,
        decree: m.decree,
        previousWinningSuit: m.previousWinningSuit,
        names: m.players.map((p) => p.name),
        localSeat: m.localPlayerId,
        plays: m.plays,
        flipping: [],
        winners:
          afterResult.includes(m.phase) &&
          m.lastCrown !== null &&
          m.lastShadow !== null &&
          m.lastCrown !== m.lastShadow
            ? { crown: m.lastCrown, shadow: m.lastShadow }
            : null,
      },
      true,
    );
  }
  return {
    getSnapshot: () => state,
    lawTooltip: (id: ThroneLaw) => throneLawTooltip(options.rules, state, id),
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setLocal(value: unknown, result?: ThroneWinners | null) {
      if (disposed || options.source().mode !== 'local') return;
      try {
        if (
          !record(value) ||
          !Array.isArray(value.names) ||
          value.names.length !== 4 ||
          value.names.some((n) => typeof n !== 'string' || !n.trim() || n.length > 100)
        )
          throw new Error('Mesa local inválida.');
        const court = readThroneCourt(value),
          localSeat = seat(value.localSeat),
          sameTrick = state?.round === court.round && state?.trick === court.trick;
        present(
          {
            ...court,
            localSeat,
            names: [...value.names] as string[],
            plays: readThronePlays(value.plays, localSeat),
            flipping: [],
            winners: result === undefined ? (sameTrick ? state!.winners : null) : winners(result),
          },
          false,
        );
      } catch (error) {
        publish(null);
        options.warn?.(error);
      }
    },
    start() {
      if (release || disposed) return;
      release = options.subscribeSource(sync);
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release?.();
      release = null;
      listeners.clear();
      sourceMatch = null;
      state = null;
    },
  };
}
export type ThroneTable = ReturnType<typeof createThroneTable>;
