import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { Roguelite } from '../../lib/games/roguelite';
import { GameAction } from './library-controls';

export function RogueliteContents({ controller }: { controller: Roguelite }) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    frame = useRef<HTMLIFrameElement>(null);
  const visibility = () =>
    frame.current?.contentWindow?.postMessage(
      { type: 'mn-game-visibility', visible: state.active },
      location.origin,
    );
  useLayoutEffect(visibility, [state.active, state.frameId, state.ready]);
  return (
    <>
      <header className="rg-heading">
        <GameAction
          id="rogueliteBack"
          destination="library"
          aria-label="Voltar ao catálogo de jogos"
        >
          ‹ Jogos
        </GameAction>
        <div>
          <h1>
            Cinzas do Abismo <small>v0.5</small>
          </h1>
          <p>Sua chamada continua · Progresso salvo neste dispositivo · Backup no menu do jogo</p>
        </div>
        <button
          id="rogueliteFullscreen"
          type="button"
          aria-pressed={state.fullscreen}
          disabled={state.fullscreenPending}
          onClick={() => void controller.toggleFullscreen()}
        >
          {state.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </header>
      <div id="rogueliteViewport" className="rg-viewport">
        <section id="rogueliteLoading" className="rg-loading" role="status" hidden={state.ready}>
          <strong id="rogueliteLoadStatus">{state.message}</strong>
          <progress
            id="rogueliteProgress"
            max={100}
            value={state.progress}
            aria-label="Preparação do jogo"
          />
          <p>
            No aplicativo, os recursos são guardados neste computador na primeira abertura para
            jogar novamente sem conexão.
          </p>
          <button
            id="rogueliteRetry"
            type="button"
            hidden={!state.error}
            disabled={state.loading}
            onClick={() => void controller.prepare()}
          >
            Tentar novamente
          </button>
        </section>
        {state.frameId !== null && (
          <iframe
            key={state.frameId}
            ref={frame}
            id="rogueliteFrame"
            title="Cinzas do Abismo · demo v0.5"
            src="roguelite/index.html"
            allow="fullscreen; gamepad"
            sandbox="allow-scripts allow-same-origin allow-downloads allow-pointer-lock"
            allowFullScreen
            onLoad={() => {
              visibility();
              if (state.active) frame.current?.focus();
            }}
          />
        )}
      </div>
    </>
  );
}
