import { clampAudioGain } from './audio-playback.ts';
import type { Microphone } from './microphone';
import type { Camera } from './camera';
import type { VoiceCallSnapshot } from '../../types/voice-call';
import type {
  VoiceControlsSnapshot,
  VoiceControlChange,
  VoiceNoiseState,
  NoiseEngine,
} from '../../types/voice-controls';

interface ControlOptions {
  desktop: boolean;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  call(): Pick<VoiceCallSnapshot, 'generation' | 'joined'>;
  join(): Promise<boolean>;
  microphone: Pick<Microphone, 'getSnapshot' | 'acquire' | 'refresh' | 'setGain' | 'setMuted'>;
  camera: Pick<Camera, 'getSnapshot' | 'acquire' | 'stop'>;
  watchMicrophone(): Promise<void>;
  setDeafened(value: boolean): void;
  unlockAudio(): void;
  announce(): void;
  restartTelemetry(): void;
  isSfu(): boolean;
  onChange(change: VoiceControlChange): void;
  onStatus(message: string, kind?: 'ok' | 'error'): void;
  warn?(error: unknown): void;
}
const isEngine = (value: unknown): value is NoiseEngine =>
  value === 'native' || value === 'rnnoise' || value === 'off';
const keys = {
  microphoneVolume: 'mnMicrophoneGain',
  noiseSuppression: 'tronoNoiseSuppression',
  noiseEngine: 'mnDesktopNoiseMode',
  voiceLightMode: 'tronoVoiceLightMode',
  selectedInput: 'tronoVoiceInput',
  selectedCamera: 'tronoCameraInput',
} as const;
type Preference = keyof typeof keys;
type Processing = Pick<
  VoiceControlsSnapshot,
  'noiseEngine' | 'noiseSuppression' | 'voiceLightMode'
>;
function cameraError(error: unknown) {
  const { name, message } = (error ?? {}) as { name?: string; message?: string };
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Permita o acesso à câmera nas configurações deste site no navegador.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'A câmera está ocupada ou não iniciou. Feche outros aplicativos que usam a câmera e escolha a entrada em Configurações → Vídeo.';
  if (name === 'NotFoundError')
    return 'Nenhuma câmera disponível. Conecte uma câmera e escolha a entrada em Configurações → Vídeo.';
  if (name === 'OverconstrainedError')
    return 'Esta câmera não aceitou a captura. Escolha outra entrada em Configurações → Vídeo.';
  return message || 'Não foi possível abrir a câmera.';
}
const cancelled = (error: unknown, code: string) =>
  (error as { code?: unknown } | null)?.code === code;

/** Owns control intent/preferences; capture, playback, transport and call membership stay borrowed. */
export function createCallControls(options: ControlOptions) {
  const storage = options.storage,
    suppression = storage.getItem(keys.noiseSuppression) !== '0';
  const storedEngine = options.desktop
    ? storage.getItem(keys.noiseEngine) || (suppression ? 'native' : 'off')
    : 'rnnoise';
  const engine = isEngine(storedEngine) ? storedEngine : 'native';
  let snapshot: VoiceControlsSnapshot = Object.freeze({
    micMuted: false,
    deafened: false,
    cameraTogglePending: false,
    microphoneVolume: clampAudioGain(storage.getItem(keys.microphoneVolume) ?? 100),
    noiseEngine: engine,
    noiseSuppression: options.desktop ? engine !== 'off' : suppression,
    voiceLightMode: storage.getItem(keys.voiceLightMode) === '1',
    selectedInput: storage.getItem(keys.selectedInput) || '',
    selectedCamera: storage.getItem(keys.selectedCamera) || '',
  });
  let mutedBeforeDeafen = false,
    audioRevision = 0,
    cameraRevision = 0,
    disposed = false;
  let cameraIntent: object | undefined;
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallControls]', error));
  function update(patch: Partial<VoiceControlsSnapshot>, change: VoiceControlChange) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    options.onChange(change);
  }
  function save(fields: readonly Preference[]) {
    for (const key of fields)
      storage.setItem(
        keys[key],
        typeof snapshot[key] === 'boolean' ? (snapshot[key] ? '1' : '0') : String(snapshot[key]),
      );
  }
  function noiseState(): VoiceNoiseState {
    const { capture, loading } = options.microphone.getSnapshot(),
      processor = capture?.processor;
    const settings = capture?.rawStream.getAudioTracks()[0]?.getSettings() ?? {};
    const activeMode = processor?.mode === 'gain-only' ? null : processor?.mode;
    const mode = loading
      ? 'loading'
      : !options.call().joined
        ? 'idle'
        : processor &&
            capture?.outgoingTrack === processor.track &&
            processor.ctx.state !== 'running'
          ? 'paused'
          : activeMode || (settings.noiseSuppression ? 'native' : 'unavailable');
    return Object.freeze({
      requested: snapshot.noiseSuppression,
      mode: snapshot.noiseSuppression ? mode : 'off',
      nativeSuppression: settings.noiseSuppression === true,
      sampleRate: processor?.ctx.sampleRate || settings.sampleRate || null,
    });
  }
  async function processing(
    patch: Partial<Processing>,
    success: () => string,
    failure: string,
    telemetry: boolean,
    outsideStatus = false,
  ) {
    if (disposed || options.microphone.getSnapshot().loading) return false;
    const before = snapshot,
      revision = ++audioRevision,
      generation = options.call().generation;
    const fields = Object.keys(patch) as (keyof Processing)[];
    const current = () =>
      !disposed && revision === audioRevision && generation === options.call().generation;
    snapshot = Object.freeze({ ...snapshot, ...patch });
    save(fields);
    options.onChange('processing');
    if (telemetry) options.restartTelemetry();
    if (!options.call().joined) {
      if (outsideStatus) options.onStatus(success(), 'ok');
      return true;
    }
    try {
      await options.microphone.acquire();
      if (!current()) return false;
      await options.watchMicrophone();
      if (!current()) return false;
      options.onStatus(success(), 'ok');
      return true;
    } catch (error) {
      if (!current()) return false;
      const rollback = Object.fromEntries(fields.map((key) => [key, before[key]]));
      snapshot = Object.freeze({ ...snapshot, ...rollback });
      save(fields);
      options.onChange('processing');
      if (telemetry) options.restartTelemetry();
      if (!cancelled(error, 'VOICE_CANCELLED')) options.onStatus(failure, 'error');
      return false;
    }
  }
  function toggleMute() {
    if (disposed || !options.call().joined || snapshot.deafened) return false;
    snapshot = Object.freeze({ ...snapshot, micMuted: !snapshot.micMuted });
    options.microphone.setMuted(snapshot.micMuted);
    options.announce();
    options.onChange('mute');
    return true;
  }
  function toggleDeafen() {
    if (disposed || !options.call().joined) return false;
    if (!snapshot.deafened) mutedBeforeDeafen = snapshot.micMuted;
    const deafened = !snapshot.deafened;
    snapshot = Object.freeze({ ...snapshot, deafened, micMuted: deafened || mutedBeforeDeafen });
    options.microphone.setMuted(snapshot.micMuted);
    options.setDeafened(snapshot.deafened);
    if (!snapshot.deafened) options.unlockAudio();
    options.announce();
    options.onChange('mute');
    return true;
  }
  async function selectInput(value: unknown) {
    if (disposed) return false;
    const revision = ++audioRevision,
      generation = options.call().generation;
    update({ selectedInput: typeof value === 'string' ? value : '' }, 'device');
    save(['selectedInput']);
    if (!options.call().joined) return true;
    const current = () =>
      !disposed && revision === audioRevision && generation === options.call().generation;
    try {
      await options.microphone.acquire();
      if (!current()) return false;
      await options.watchMicrophone();
      if (!current()) return false;
      options.onStatus('Microfone alterado.', 'ok');
      return true;
    } catch {
      if (current()) options.onStatus('Não foi possível trocar o microfone.', 'error');
      return false;
    }
  }
  async function selectCamera(value: unknown) {
    if (disposed || options.camera.getSnapshot().loading) return false;
    const revision = ++cameraRevision,
      generation = options.call().generation;
    update({ selectedCamera: typeof value === 'string' ? value : '' }, 'device');
    save(['selectedCamera']);
    if (!options.camera.getSnapshot().capture) return true;
    const current = () =>
      !disposed && revision === cameraRevision && generation === options.call().generation;
    try {
      await options.camera.acquire();
      if (!current()) return false;
      options.onStatus('Câmera alterada.', 'ok');
      return true;
    } catch (error) {
      if (current() && !cancelled(error, 'CAMERA_CANCELLED'))
        options.onStatus(cameraError(error), 'error');
      return false;
    }
  }
  async function toggleCamera() {
    if (disposed) return false;
    if (options.camera.getSnapshot().capture) {
      options.camera.stop();
      options.onStatus('Câmera desligada.', 'ok');
      return true;
    }
    if (cameraIntent || options.camera.getSnapshot().loading) return false;
    const intent = {};
    cameraIntent = intent;
    update({ cameraTogglePending: true }, 'camera');
    const current = () => !disposed && cameraIntent === intent;
    try {
      if (!options.call().joined && !(await options.join())) return false;
      if (!current()) return false;
      options.onStatus('Solicitando acesso à câmera...');
      await options.camera.acquire();
      if (!current()) return false;
      options.onStatus(
        options.isSfu()
          ? 'Câmera publicada no Cloudflare SFU.'
          : 'Câmera ligada e distribuída à malha P2P.',
        'ok',
      );
      return true;
    } catch (error) {
      if (current() && !cancelled(error, 'CAMERA_CANCELLED'))
        options.onStatus(cameraError(error), 'error');
      return false;
    } finally {
      if (current()) {
        cameraIntent = undefined;
        update({ cameraTogglePending: false }, 'camera');
      }
    }
  }
  function forgetCamera(id: string) {
    if (disposed || snapshot.selectedCamera !== id) return;
    update({ selectedCamera: '' }, 'device');
    storage.removeItem(keys.selectedCamera);
  }
  function cancelPending() {
    audioRevision++;
    cameraRevision++;
    cameraIntent = undefined;
    update({ cameraTogglePending: false }, 'camera');
  }
  return {
    getSnapshot: () => snapshot,
    noiseState,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    selectInput,
    selectCamera,
    forgetCamera,
    cancelPending,
    resetParticipation() {
      if (disposed) return;
      mutedBeforeDeafen = false;
      update({ micMuted: false, deafened: false }, 'mute');
    },
    async setMicrophoneGain(value: unknown) {
      if (disposed) return;
      update({ microphoneVolume: clampAudioGain(value) }, 'gain');
      save(['microphoneVolume']);
      options.microphone.setGain(snapshot.microphoneVolume);
      try {
        await options.microphone.refresh();
      } catch (error) {
        if (!disposed) warn(error);
      }
    },
    toggleNoiseSuppression: () =>
      processing(
        { noiseSuppression: !snapshot.noiseSuppression },
        () =>
          noiseState().mode === 'rnnoise'
            ? 'RNNoise ativo no microfone.'
            : snapshot.noiseSuppression
              ? 'Processamento do microfone atualizado.'
              : 'Supressor desligado.',
        'Não foi possível atualizar o processamento do microfone.',
        false,
      ),
    setNoiseMode(value: unknown) {
      if (!options.desktop || !isEngine(value)) return Promise.resolve(false);
      return processing(
        {
          noiseEngine: value,
          noiseSuppression: value !== 'off',
          voiceLightMode: value === 'rnnoise' ? false : snapshot.voiceLightMode,
        },
        () =>
          value === 'native'
            ? 'Redução nativa selecionada.'
            : value === 'rnnoise'
              ? 'RNNoise selecionado.'
              : 'Redução de ruído desligada.',
        'Não foi possível mudar a redução de ruído. A opção anterior foi mantida.',
        true,
        true,
      );
    },
    toggleVoiceLightMode() {
      const light = !snapshot.voiceLightMode;
      const patch: Partial<Processing> = {
        voiceLightMode: light,
        ...(options.desktop && light && snapshot.noiseSuppression
          ? { noiseEngine: 'native' as const }
          : {}),
      };
      return processing(
        patch,
        () =>
          snapshot.voiceLightMode
            ? 'Modo leve ativo: redução nativa e menos trabalho visual.'
            : 'Modo leve desligado. Preferências de áudio restauradas.',
        'Não foi possível mudar o processamento. O modo anterior foi mantido.',
        true,
      );
    },
    reconcileDevices(
      inputs: readonly string[],
      cameras: readonly string[],
      observed: Pick<VoiceControlsSnapshot, 'selectedInput' | 'selectedCamera'>,
    ) {
      if (disposed) return;
      if (
        snapshot.selectedInput === observed.selectedInput &&
        !inputs.includes(snapshot.selectedInput)
      )
        update({ selectedInput: '' }, 'device');
      if (
        snapshot.selectedCamera === observed.selectedCamera &&
        cameras.some(Boolean) &&
        !cameras.includes(snapshot.selectedCamera)
      )
        forgetCamera(snapshot.selectedCamera);
    },
    dispose() {
      if (disposed) return;
      cancelPending();
      disposed = true;
    },
  };
}
