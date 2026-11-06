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
          Codificador
          <select
            id="clipEncoder"
            value={settings.encoder}
            onChange={(event) => preferences.setSetting('encoder', event.target.value)}
          >
            <option value="auto">Automático · prefere NVENC disponível</option>
            <option value="nvenc">NVIDIA NVENC · aplicativo Windows</option>
            <option value="compatible">Compatível · navegador</option>
          </select>
        </label>
        <label>
          Qualidade do clipe
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
          Fluidez do vídeo
          <select
            id="clipFps"
            value={settings.fps}
            onChange={(event) => preferences.setSetting('fps', Number(event.target.value))}
          >
            <option value="30">30 FPS · menor consumo</option>
            <option value="60">60 FPS · mais fluido</option>
          </select>
        </label>
        <label>
          Quanto tempo salvar
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
          Atalho para salvar clipe
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
      <p id="clipGlobalShortcutStatus" className="clips-help" role="status" hidden />
      <p className="clips-help">
        O áudio depende da permissão e da fonte selecionada. Configure a qualidade antes de ativar a
        captura ou transmitir a tela. Mudar estas opções reinicia a preparação dos clipes e descarta
        os segundos temporários anteriores. Para mudar o áudio escolhido no seletor de tela,
        desligue e inicie uma nova captura.
      </p>
      <p className="clips-help">
        NVENC usa o codificador da placa NVIDIA no aplicativo Windows. Automático testa a
        disponibilidade e usa Compatível quando não puder ativá-lo.
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
