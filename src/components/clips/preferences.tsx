'use client';
import { useSyncExternalStore } from 'react';
import { clipShortcutLabel, type ClipPreferences } from '../../lib/clips/preferences';
import type { ClipLibrary } from '../../lib/clips/library';

export function ClipPreferenceFields({
  preferences,
  library,
}: {
  preferences: ClipPreferences;
  library: ClipLibrary;
}) {
  const state = useSyncExternalStore(
      preferences.subscribe,
      preferences.getSnapshot,
      preferences.getSnapshot,
    ),
    files = useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot),
    settings = state.settings;
  const canChooseFolder =
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function';
  return (
    <>
      <div role="group" aria-label="Perfis de qualidade dos clipes">
        <button type="button" onClick={() => preferences.setPreset('excellent')}>
          Excelente · 1440p / 60 FPS
        </button>
        <button type="button" onClick={() => preferences.setPreset('economic')}>
          Econômica · 720p / 30 FPS
        </button>
      </div>
      <div className="clips-settings">
        <label>
          Qualidade do arquivo
          <select
            id="clipQuality"
            value={settings.quality}
            onChange={(event) => preferences.setSetting('quality', event.target.value)}
          >
            <option value="light">720p · Leve</option>
            <option value="balanced">1080p · Alta</option>
            <option value="high">1440p · Máxima</option>
          </select>
        </label>
        <label>
          FPS
          <select
            id="clipFps"
            value={settings.fps}
            onChange={(event) => preferences.setSetting('fps', Number(event.target.value))}
          >
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
          </select>
        </label>
        <label>
          Trecho recente
          <select
            id="clipSeconds"
            value={settings.seconds}
            onChange={(event) => preferences.setSetting('seconds', Number(event.target.value))}
          >
            <option value="15">15 segundos</option>
            <option value="30">30 segundos</option>
            <option value="60">60 segundos</option>
            <option value="120">2 minutos</option>
          </select>
        </label>
        <label>
          Atalho
          <button
            id="clipShortcut"
            type="button"
            aria-label="Escolher atalho para clipar"
            onClick={preferences.beginShortcut}
          >
            {state.choosingShortcut ? 'Pressione o atalho…' : clipShortcutLabel(settings.shortcut)}
          </button>
        </label>
      </div>
      <p className="clips-help">
        Áudio da tela incluído automaticamente quando disponível no compartilhamento. A resolução
        depende da origem; configure antes de compartilhar para capturar com a qualidade desejada.
        Mudar estas opções reinicia só o replay e descarta o buffer anterior.
      </p>
      <div className="clip-destination">
        <div>
          <small>SALVAR EM</small>
          <strong id="clipFolder">
            {files.directory?.name || 'Escolher arquivo ao salvar / Downloads'}
          </strong>
        </div>
        <button
          id="clipChooseFolder"
          type="button"
          hidden={!canChooseFolder}
          onClick={() => void library.chooseFolder()}
        >
          Escolher pasta
        </button>
        <button
          id="clipResetFolder"
          type="button"
          hidden={!files.directory}
          onClick={() => void library.resetFolder()}
        >
          Salvar como / Downloads
        </button>
      </div>
    </>
  );
}
