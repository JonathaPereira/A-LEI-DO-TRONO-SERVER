import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneMatch } from '../../lib/games/throne-match';

export function ThroneMatchStatus({
  controller,
  noticeClock,
}: {
  controller: ThroneMatch;
  noticeClock: HTMLElement;
}) {
  const { status } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <>
      <span id="roundBadge">Rodada {status.round}/3</span>
      <span id="trickBadge">Vaza {status.trick}/10</span>
      <span id="turnBadge" className={status.yourTurn ? 'your-turn-badge' : ''}>
        {status.turn}
      </span>
      <span id="turnTimer" className={`turn-timer ${status.clockClass}`.trim()}>
        {status.clock}
      </span>
      {createPortal(status.clock, noticeClock)}
    </>
  );
}
