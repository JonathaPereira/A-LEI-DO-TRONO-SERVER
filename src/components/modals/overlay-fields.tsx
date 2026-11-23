'use client';

import { useEffect, useState } from 'react';
import {
  buildShortcutFromKeyEvent,
  formatOverlayShortcut,
  type DesktopOverlayController,
  type OverlayCorner,
} from '../../lib/desktop/overlay';
import { useModel } from '../application/services';

const CORNER_OPTIONS: ReadonlyArray<{ value: OverlayCorner; label: string }> = [
  { value: 'top-left', label: 'Superior esquerdo (estilo Discord)' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'bottom-right', label: 'Inferior direito' },
];

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

export function OverlaySettingsFields({ client }: { client: DesktopOverlayController }) {
  const state = useModel(client);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setCapturing(false);
        setCaptureError('');
        return;
      }
      if (MODIFIER_CODES.has(event.code)) return;
      const parsed = buildShortcutFromKeyEvent(event);
      if (!parsed.ok) {
        setCaptureError(parsed.error);
        return;
      }
      setCapturing(false);
      setCaptureError('');
      void client.configure({ shortcut: parsed.shortcut });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, client]);

  if (!state.available) return null;
  const { config } = state;
  const opacityPercent = Math.round(config.opacity * 100);
  const shortcutDisplay = formatOverlayShortcut(config.shortcut);
  const statusText = captureError || config.shortcutError || state.status;

  return (
    <div id="overlaySettings">
      <h3>Overlay em Jogos (Windows)</h3>
      <p className="appearance-help">
        Sobreposição discreta e sem captura de foco para jogos em janela ou tela cheia sem bordas
        (100% compatível com anti-cheats). Funciona mesmo com o aplicativo minimizado ou em segundo
        plano.
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
      <div className="social-setting">
        <span>
          Atalho global do overlay:{' '}
          <strong id="overlayShortcutValue">
            {capturing ? 'Pressione a nova combinação (Esc cancela)…' : shortcutDisplay}
          </strong>
        </span>
        <div className="settings-action-grid">
          <button
            id="overlayShortcutCapture"
            type="button"
            className="secondary-button"
            disabled={state.busy}
            onClick={() => {
              setCaptureError('');
              setCapturing((current) => !current);
            }}
          >
            {capturing ? 'Cancelar captura' : 'Definir atalho'}
          </button>
          <button
            id="overlayShortcutReset"
            type="button"
            className="secondary-button"
            disabled={state.busy || config.shortcut === 'Control+Shift+O'}
            onClick={() => {
              setCapturing(false);
              setCaptureError('');
              void client.configure({ shortcut: 'Control+Shift+O' });
            }}
          >
            Restaurar padrão
          </button>
          <button
            id="overlayShortcutDisable"
            type="button"
            className="secondary-button"
            disabled={state.busy || !config.shortcut}
            onClick={() => {
              setCapturing(false);
              setCaptureError('');
              void client.configure({ shortcut: '' });
            }}
          >
            Remover atalho
          </button>
        </div>
        <p className="appearance-help">
          {config.shortcut
            ? config.shortcutRegistered
              ? `Atalho global ativo (${shortcutDisplay}): alterna o overlay mesmo com o Trono em segundo plano. Se um jogo abrir como Administrador, o Windows pode exigir que o Trono também seja aberto no mesmo nível.`
              : `Atalho configurado (${shortcutDisplay}).`
            : 'Nenhum atalho global definido. Clique em “Definir atalho” para escolher uma combinação (ex.: Ctrl + Shift + O ou F9).'}
        </p>
      </div>
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
      {statusText && (
        <p id="overlaySettingsStatus" className="appearance-help" role="status">
          {statusText}
        </p>
      )}
    </div>
  );
}
