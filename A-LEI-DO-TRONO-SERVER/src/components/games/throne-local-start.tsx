import { useSyncExternalStore } from 'react';
import type { ThroneLocalLifecycle } from '../../lib/games/throne-local-lifecycle';

export function ThroneLocalStart({ controller }: { controller: ThroneLocalLifecycle }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const busy = state.phase !== 'idle';
  return (
    <>
      <button
        id="startHumanBtn"
        className="royal-btn"
        type="button"
        disabled={busy || !state.available}
        onClick={() => void controller.start(false)}
      >
        {state.phase === 'preparing' && !state.demo
          ? 'Preparando partida…'
          : 'Preencher vagas com IAs e jogar local'}
      </button>
      <button
        id="startDemoBtn"
        className="royal-btn"
        type="button"
        disabled={busy || !state.available}
        onClick={() => void controller.start(true)}
      >
        {state.phase === 'preparing' && state.demo ? 'Preparando simulação…' : 'Simular 4 IAs'}
      </button>
    </>
  );
}
