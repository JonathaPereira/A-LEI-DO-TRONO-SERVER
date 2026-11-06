'use client';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { VoiceSettings, VoiceSettingsSnapshot } from '../../lib/voice/settings';
import { AppIcon as Icon } from '../application/icons';
import { SCREEN_FORMATS, SCREEN_BITRATES } from '../../lib/voice/quality-policy';

const screenFormats = Object.entries(SCREEN_FORMATS).sort(
  ([, a], [, b]) => a.height - b.height || a.fps - b.fps,
);

const useSettings = (client: VoiceSettings) =>
  useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
function DeviceSelect({
  id,
  label,
  fallback,
  value,
  rows,
  disabled,
  className,
  title,
  select,
}: {
  id: string;
  label: string;
  fallback: string;
  value: string;
  rows: VoiceSettingsSnapshot['devices']['input'];
  disabled?: boolean;
  className?: string;
  title?: string;
  select(value: string): Promise<void>;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        title={title}
        onChange={(event) => {
          void select(event.target.value);
        }}
      >
        <option value="">{fallback}</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
        {value && !rows.some((row) => row.id === value) && (
          <option value={value}>Dispositivo selecionado</option>
        )}
      </select>
    </label>
  );
}
function Gain({
  id,
  label,
  value,
  set,
}: {
  id: 'mic' | 'output';
  label: string;
  value: number;
  set(value: string): Promise<void>;
}) {
  return (
    <label className="mn-gain-label">
      <span>{label}</span>
      <output id={id + 'GainValue'}>{value}%</output>
      <input
        id={id + 'GainSlider'}
        type="range"
        min={0}
        max={300}
        step={5}
        value={value}
        onInput={(event) => {
          void set(event.currentTarget.value);
        }}
        onChange={(event) => {
          void set(event.target.value);
        }}
      />
    </label>
  );
}
function noisePresentation(state: VoiceSettingsSnapshot) {
  const { mode } = state.noise;
  const labels = {
    off: ['Desligado', 'Supressão desligada. O controle de volume continua ativo.'],
    idle: [
      'Preparado',
      state.controls.voiceLightMode || state.controls.noiseEngine === 'native'
        ? 'A redução nativa será solicitada ao entrar na voz.'
        : 'O RNNoise será ativado no seu microfone ao entrar na voz.',
    ],
    loading: ['Iniciando…', 'Carregando o processamento do microfone…'],
    rnnoise: [
      'RNNoise',
      'RNNoise ativo no seu microfone. Processamento local, antes de enviar a voz.',
    ],
    native: ['Navegador', 'Redução nativa ativa no microfone.'],
    paused: ['Pausado', 'Processamento pausado. Use Liberar áudio para retomá-lo.'],
    unavailable: [
      'Indisponível',
      'Não foi possível ativar a supressão. O microfone continua transmitindo.',
    ],
  };
  return labels[mode];
}
export function VoiceAudioSettings({
  client,
  desktop,
  children,
}: {
  client: VoiceSettings;
  desktop: boolean;
  children: ReactNode;
}) {
  const state = useSettings(client),
    controls = state.controls,
    [noise, detail] = noisePresentation(state);
  return (
    <>
      <div className="settings-section-heading">
        <div>
          <small>ENTRADA &amp; SAÍDA</small>
          <strong>Áudio da chamada</strong>
        </div>
        <span>Dispositivos e processamento</span>
      </div>
      <div className="voice-devices voice-devices-vertical">
        <DeviceSelect
          id="voiceInputSelect"
          label="Microfone"
          fallback="Microfone padrão"
          value={controls.selectedInput}
          rows={state.devices.input}
          select={client.selectInput}
        />
        <DeviceSelect
          id="voiceOutputSelect"
          title={
            !state.outputSupported
              ? 'Este navegador não permite escolher a saída de áudio pelo site.'
              : undefined
          }
          label="Saída de áudio"
          fallback="Saída padrão"
          value={state.output}
          rows={state.devices.output}
          disabled={!state.outputSupported}
          select={client.setOutput}
        />
      </div>
      <div className="mn-gain-controls" aria-label="Controles de ganho de áudio">
        <Gain
          id="mic"
          label="Meu microfone"
          value={controls.microphoneVolume}
          set={client.setMicrophoneGain}
        />
        <Gain
          id="output"
          label="Áudio de saída"
          value={state.outputVolume}
          set={client.setOutputGain}
        />
        <p>
          Volumes individuais de outros usuários aparecem nos participantes quando você entra na
          chamada.
        </p>
      </div>
      <button
        id="noiseSuppressionBtn"
        hidden={desktop}
        type="button"
        className={
          'royal-btn settings-secondary ' +
          (controls.noiseSuppression ? 'noise-active' : 'danger-active')
        }
        disabled={state.microphoneLoading}
        aria-pressed={controls.noiseSuppression}
        title={detail}
        data-engine={state.noise.mode}
        onClick={() => {
          void client.toggleSuppression();
        }}
      >
        Supressor: {noise}
      </button>
      <label id="noiseModeLabel" className="desktop-noise-mode" hidden={!desktop}>
        Redução de ruído
        <select
          id="noiseModeSelect"
          value={controls.noiseSuppression ? controls.noiseEngine : 'off'}
          disabled={state.microphoneLoading}
          onChange={(event) => {
            void client.setNoiseMode(event.target.value);
          }}
        >
          <option value="native">Nativa · padrão</option>
          <option value="rnnoise">RNNoise · redução mais forte</option>
          <option value="off">Desligada</option>
        </select>
      </label>
      <small
        id="noiseSuppressionStatus"
        className="noise-suppression-status"
        role="status"
        aria-live="polite"
      >
        {detail}
      </small>
      <button
        id="voiceLightModeBtn"
        className={
          'royal-btn settings-secondary' + (controls.voiceLightMode ? ' noise-active' : '')
        }
        type="button"
        disabled={state.microphoneLoading}
        aria-pressed={controls.voiceLightMode}
        aria-describedby="voiceLightModeHelp"
        onClick={() => {
          void client.toggleLightMode();
        }}
      >
        Modo leve para jogar: {controls.voiceLightMode ? 'Ligado' : 'Desligado'}
      </button>
      <small id="voiceLightModeHelp" className="noise-suppression-status">
        Usa a redução nativa e reduz animações e medições. Pode ajudar em jogos pesados; não reserva
        recursos nem garante áudio sem cortes. Vale apenas neste aparelho.
      </small>
      {children}
    </>
  );
}
function QualityHint({ state }: { state: VoiceSettingsSnapshot }) {
  const { profile, effectiveQuality, preferences } = state.quality;
  return (
    <small id="qualityHint" className="quality-hint">
      {profile.screen.height}p / {profile.screen.fps} FPS · Bitrate máximo:{' '}
      {profile.screenBitrate / 1000000} Mbps.
      {effectiveQuality !== preferences.transmissionQuality
        ? ' • Freio de uso ativo: qualidade reduzida automaticamente.'
        : ''}{' '}
      A taxa real depende da rede e do conteúdo.
    </small>
  );
}
export function VoiceCaptureSettings({
  client,
  desktop,
}: {
  client: VoiceSettings;
  desktop: boolean;
}) {
  const state = useSettings(client),
    preferences = state.quality.preferences;
  return (
    <>
      {desktop && (
        <>
          <h2>Captura de tela</h2>
          <p className="appearance-help">
            Qualidade e áudio da transmissão. Você escolhe a tela ou janela ao compartilhar, e pode
            trocar sem interromper a anterior.
          </p>
        </>
      )}
      <div className="voice-devices voice-devices-vertical">
        <label>
          <span>Qualidade da stream</span>
          <select
            id="screenFormatSelect"
            value={preferences.screenFormat}
            onChange={(event) => {
              void client.selectFormat(event.target.value);
            }}
          >
            {screenFormats.map(([id, format]) => (
              <option key={id} value={id}>
                {format.height}p / {format.fps} FPS
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Bitrate da tela</span>
          <select
            id="screenBitrateSelect"
            value={preferences.screenBitrateMbps}
            onChange={(event) => {
              void client.selectBitrate(event.target.value);
            }}
          >
            {SCREEN_BITRATES.map((value) => (
              <option key={value} value={value} disabled={state.highLimited && value > 6}>
                {value} Mbps{value === 8 ? ' • recomendado' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Conteúdo compartilhado</span>
          <select
            id="screenContentSelect"
            value={preferences.screenContent}
            onChange={(event) => {
              void client.selectContent(event.target.value);
            }}
          >
            <option value="detail">Nitidez • jogos, textos e detalhes</option>
            <option value="motion">Movimento • vídeo e animações</option>
          </select>
        </label>
      </div>
      <label className="mn-share-audio">
        <input
          id="shareStreamAudio"
          type="checkbox"
          checked={state.shareAudio}
          onChange={(event) => client.setShareAudio(event.target.checked)}
        />
        <span>Compartilhar áudio da stream</span>
      </label>
      <small className="settings-context-help">
        {desktop
          ? 'Para áudio isolado, escolha o aplicativo/jogo no seletor. O áudio do computador inteiro pode incluir as vozes da chamada.'
          : 'No seletor do navegador, marque Compartilhar áudio. Para enviar o som de um vídeo, prefira compartilhar a aba que o reproduz. Esta opção vale para a próxima transmissão.'}
      </small>
      {desktop && <QualityHint state={state} />}
    </>
  );
}
export function VoiceVideoSettings({
  client,
  desktop,
}: {
  client: VoiceSettings;
  desktop: boolean;
}) {
  const state = useSettings(client);
  return (
    <>
      <div className="settings-section-heading">
        <div>
          <small>{desktop ? 'VÍDEO DA CHAMADA' : 'CÂMERA & TRANSMISSÃO'}</small>
          <strong>{desktop ? 'Câmera' : 'Vídeo'}</strong>
        </div>
        <span>Qualidade adaptativa</span>
      </div>
      <div className="voice-devices voice-devices-vertical">
        <DeviceSelect
          id="cameraInputSelect"
          className="camera-device-label"
          label="Câmera"
          fallback="Câmera padrão"
          value={state.controls.selectedCamera}
          rows={state.devices.camera}
          disabled={state.controls.cameraTogglePending || state.cameraLoading}
          select={client.selectCamera}
        />
        <label className="quality-device-label">
          <span>Perfil de câmera e áudio</span>
          <select
            id="transmissionQualitySelect"
            value={state.quality.preferences.transmissionQuality}
            onChange={(event) => {
              void client.selectQuality(event.target.value);
            }}
          >
            <option value="economy">Economia • 720p / 30 FPS</option>
            <option value="balanced">Equilibrada • 720p / 30 FPS</option>
            <option value="high" disabled={state.highLimited}>
              Alta • 720p / 30 FPS
            </option>
          </select>
        </label>
      </div>
      {!desktop && <VoiceCaptureSettings client={client} desktop={false} />}
      <div className="settings-action-grid">
        <button
          id="refreshDevicesBtn"
          className="small-btn settings-secondary"
          onClick={() => {
            void client.enumerate();
          }}
        >
          <Icon name="swap" size={15} /> Atualizar dispositivos
        </button>
      </div>
      {!desktop && <QualityHint state={state} />}
    </>
  );
}
