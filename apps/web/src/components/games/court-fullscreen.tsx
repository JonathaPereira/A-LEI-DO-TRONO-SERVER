import { useSyncExternalStore } from 'react';
import type { CourtFullscreen } from '../../lib/games/court-fullscreen';
export function CourtFullscreenButton({ controller }: { controller: CourtFullscreen }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <button
      id="courtFullscreen"
      className="icon-btn"
      type="button"
      aria-pressed={state.fullscreen}
      disabled={state.pending}
      title={state.title}
      onClick={() => void controller.toggle()}
    >
      {state.fullscreen ? '⛶ Sair da tela cheia' : '⛶ Tela cheia'}
    </button>
  );
}
