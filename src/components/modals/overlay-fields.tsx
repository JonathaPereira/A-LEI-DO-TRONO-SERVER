'use client';

import type { DesktopOverlayController, OverlayCorner } from '../../lib/desktop/overlay';
import { useModel } from '../application/services';

const CORNER_OPTIONS: ReadonlyArray<{ value: OverlayCorner; label: string }> = [
  { value: 'top-left', label: 'Superior esquerdo (estilo Discord)' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'bottom-right', label: 'Inferior direito' },
];

export function OverlaySettingsFields({ client }: { client: DesktopOverlayController }) {
  const state = useModel(client);
  if (!state.available) return null;
  const { config } = state;
  const opacityPercent = Math.round(config.opacity * 100);
  return (
    <div id="overlaySettings">
      <h3>Overlay em Jogos (Windows)</h3>
      <p className="appearance-help">
        Sobreposição discreta e sem captura de foco para jogos em janela ou tela cheia sem bordas
        (100% compatível com anti-cheats). Mostra quem está falando na call, espectadores da sua
        transmissão e mini-avisos de mensagens.
      </p>
      <label className="auth-check">
        <input
          id="overlayEnabledToggle"
          type="checkbox"
          checked={config.enabled}
          disabled={state.busy}
          onChange={(event) => void client.configure({ enabled: event.target.checked })}
        />{' '}
        Ativar Overlay em Jogos
      </label>
      <label className="social-setting">
        Canto da tela
        <select
          id="overlayCornerSelect"
          value={config.corner}
          disabled={state.busy}
          onChange={(event) =>
            void client.configure({ corner: event.target.value as OverlayCorner })
          }
        >
          {CORNER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="social-setting">
        Opacidade do overlay ({opacityPercent}%)
        <input
          id="overlayOpacityRange"
          type="range"
          min={35}
          max={100}
          step={5}
          value={opacityPercent}
          disabled={state.busy}
          onChange={(event) => void client.configure({ opacity: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="auth-check">
        <input
          id="overlayHideIdleToggle"
          type="checkbox"
          checked={config.hideWhenIdle}
          disabled={state.busy}
          onChange={(event) => void client.configure({ hideWhenIdle: event.target.checked })}
        />{' '}
        Ocultar automaticamente quando não estiver em chamada nem recebendo avisos
      </label>
      <label className="auth-check">
        <input
          id="overlayShortcutToggle"
          type="checkbox"
          checked={Boolean(config.shortcut)}
          disabled={state.busy}
          onChange={(event) =>
            void client.configure({ shortcut: event.target.checked ? 'Control+Shift+O' : '' })
          }
        />{' '}
        Atalho rápido global para alternar o overlay (Ctrl + Shift + O)
      </label>
      <div className="settings-action-grid">
        <button
          id="overlayPreviewButton"
          type="button"
          className="secondary-button"
          disabled={state.busy || !config.enabled}
          onClick={() => void client.testToast()}
        >
          Testar aviso no Overlay
        </button>
      </div>
      {state.status && (
        <p id="overlaySettingsStatus" className="appearance-help" role="status">
          {state.status}
        </p>
      )}
    </div>
  );
}
