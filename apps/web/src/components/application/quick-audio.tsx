'use client';
import { QuickPanel } from './quick-panel';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
export function QuickAudio({ runtime }: { runtime: ApplicationServices }) {
  const voice = runtime.TronoVoiceSettings,
    state = useModel(voice);
  return (
    <QuickPanel
      label="Ajustes rápidos da chamada"
      trigger={<Icon name="settings" size={18} />}
      hover
    >
      <strong>Áudio da chamada</strong>
      <label>
        Microfone
        <select
          value={state.controls.selectedInput}
          onChange={(e) => void voice.selectInput(e.target.value)}
        >
          <option value="">Dispositivo padrão</option>
          {state.devices.input.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Volume para mim · {state.outputVolume}%
        <input
          aria-label="Volume rápido da chamada"
          type="range"
          min="0"
          max="300"
          step="5"
          value={state.outputVolume}
          onChange={(e) => void voice.setOutputGain(e.target.value)}
        />
      </label>
      <button
        type="button"
        aria-pressed={state.noise.requested}
        onClick={() => void voice.toggleSuppression()}
      >
        <Icon name="microphone" size={18} />
        Supressão de ruído · {state.noise.requested ? 'Ligada' : 'Desligada'}
      </button>
      <button
        type="button"
        data-close-panel
        onClick={() => runtime.TronoCallSettings.open('audio')}
      >
        <Icon name="settings" size={18} />
        Todas as configurações de áudio
      </button>
      <button
        type="button"
        data-close-panel
        onClick={() => runtime.TronoCallSettings.open('connection')}
      >
        <Icon name="voice" size={18} />
        Conexão da chamada
      </button>
    </QuickPanel>
  );
}
