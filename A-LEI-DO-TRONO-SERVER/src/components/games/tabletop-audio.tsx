import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  tabletopGames,
  type TabletopAudio,
  type TabletopGame,
} from '../../lib/games/tabletop-audio';

export function TabletopAudioControls({
  controller,
  hosts,
}: {
  controller: TabletopAudio;
  hosts: readonly { key: TabletopGame; host: HTMLElement }[];
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return hosts.map(({ key, host }) => {
    const value = state.volumes[key],
      label = tabletopGames[key].label,
      open = state.open === key;
    return createPortal(
      <details className="tt-audio" data-game-audio={key} open={open}>
        <summary
          aria-label={'Volume dos efeitos de ' + label}
          aria-expanded={open}
          className={!value || !state.enabled ? 'tt-muted' : undefined}
          onClick={(event) => {
            event.preventDefault();
            controller.setOpen(open ? null : key);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
          </svg>
          <span>Som</span>
        </summary>
        <div className="tt-audio-panel">
          <label>
            Efeitos · {label}
            <div className="tt-audio-row">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={value}
                aria-label={'Volume dos efeitos de ' + label}
                onChange={(event) => controller.setVolume(key, event.currentTarget.valueAsNumber)}
              />
              <output>{value}%</output>
            </div>
          </label>
          <div className="tt-audio-tools">
            <button type="button" onClick={() => controller.toggleMute(key)}>
              {value ? 'Silenciar' : 'Restaurar'}
            </button>
            <button
              type="button"
              data-no-click-sfx="1"
              onClick={() => void controller.playSample(key)}
            >
              Ouvir
            </button>
          </div>
          <small>
            {state.enabled
              ? 'Somente os efeitos deste jogo.'
              : 'Os efeitos gerais estão silenciados.'}
          </small>
          <button
            type="button"
            className="tt-audio-enable"
            hidden={state.enabled}
            onClick={controller.enableEffects}
          >
            Ativar efeitos gerais
          </button>
        </div>
      </details>,
      host,
      key,
    );
  });
}
