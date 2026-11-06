import type { createCallControls } from './controls';
import type { createMicrophone } from './microphone';
import type { createCamera } from './camera';
import type { createAudioPlayback } from './audio-playback';
import type { createCallQuality } from './quality';
import type { createScreenSharing } from './screen-sharing';
import { clampAudioGain } from './audio-playback.ts';
import { isQuality, isScreenFormat, SCREEN_BITRATES } from './quality-policy.ts';

interface SettingsOptions {
  controls: ReturnType<typeof createCallControls>;
  microphone: Pick<ReturnType<typeof createMicrophone>, 'getSnapshot'>;
  camera: Pick<ReturnType<typeof createCamera>, 'getSnapshot'>;
  playback: Pick<ReturnType<typeof createAudioPlayback>, 'getSnapshot' | 'setVolume' | 'setOutput'>;
  quality: Pick<
    ReturnType<typeof createCallQuality>,
    'getSnapshot' | 'configure' | 'selectQuality' | 'applyAll'
  >;
  sharing: Pick<ReturnType<typeof createScreenSharing>, 'getSnapshot' | 'setAudio'>;
  storage: Pick<Storage, 'setItem'>;
  mediaDevices?: Pick<
    MediaDevices,
    'enumerateDevices' | 'addEventListener' | 'removeEventListener'
  >;
  outputSupported: boolean;
  call(): { generation: number };
  policy(): { sfu: boolean; highAllowed?: boolean };
  unlockAudio(): void;
  announce(): void;
  onOutputChanged(): void;
  setScreenBitrate(value: number): Promise<unknown>;
  onStatus(text: string, kind: 'ok' | 'warn'): void;
  warn?(error: unknown): void;
}
interface Device {
  readonly id: string;
  readonly label: string;
}
type Devices = Readonly<Record<'input' | 'output' | 'camera', readonly Device[]>>;

/** Projects existing owners into React; owns only device enumeration and UI subscriptions. */
export function createVoiceSettings(options: SettingsOptions) {
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[VoiceSettings]', error));
  let devices: Devices = Object.freeze({ input: [], output: [], camera: [] });
  let enumeration = 0,
    qualityRevision = 0,
    started = false,
    disposed = false;
  function read() {
    const playback = options.playback.getSnapshot();
    return Object.freeze({
      controls: options.controls.getSnapshot(),
      noise: options.controls.noiseState(),
      microphoneLoading: options.microphone.getSnapshot().loading,
      cameraLoading: options.camera.getSnapshot().loading,
      quality: options.quality.getSnapshot(),
      shareAudio: options.sharing.getSnapshot().audio,
      outputVolume: playback.volume,
      output: playback.output,
      outputSupported: options.outputSupported,
      devices,
      highLimited: options.policy().sfu && options.policy().highAllowed === false,
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    snapshot = read();
    for (const listener of listeners) listener();
  }
  async function run(action: () => unknown) {
    if (disposed) return;
    try {
      const pending = action(); // Preserve audio activation in the original event.
      refresh();
      await pending;
    } catch (error) {
      warn(error);
    } finally {
      refresh();
    }
  }
  async function enumerate() {
    if (disposed || !options.mediaDevices) return;
    const request = ++enumeration,
      observed = options.controls.getSnapshot(),
      observedOutput = options.playback.getSnapshot().output;
    try {
      const rows = await options.mediaDevices.enumerateDevices();
      if (disposed || request !== enumeration) return;
      const list = (kind: MediaDeviceKind, label: string) =>
        Object.freeze(
          rows
            .filter((row) => row.kind === kind && row.deviceId)
            .map((row, i) =>
              Object.freeze({ id: row.deviceId, label: row.label || `${label} ${i + 1}` }),
            ),
        );
      devices = Object.freeze({
        input: list('audioinput', 'Microfone'),
        output: list('audiooutput', 'Saída'),
        camera: list('videoinput', 'Câmera'),
      });
      options.controls.reconcileDevices(
        devices.input.map((row) => row.id),
        devices.camera.map((row) => row.id),
        observed,
      );
      const output = options.playback.getSnapshot().output;
      if (output && output === observedOutput && !devices.output.some((row) => row.id === output)) {
        await options.playback.setOutput('');
        options.storage.setItem('tronoVoiceOutput', options.playback.getSnapshot().output);
      }
      refresh();
    } catch (error) {
      if (!disposed && request === enumeration) warn(error);
    }
  }
  async function changeQuality(
    action: () => void,
    done?: (current: () => boolean) => Promise<void> | void,
  ) {
    const revision = ++qualityRevision,
      generation = options.call().generation;
    const current = () =>
      !disposed && revision === qualityRevision && generation === options.call().generation;
    await run(async () => {
      action();
      refresh();
      await options.quality.applyAll();
      if (current()) await done?.(current);
    });
  }
  const deviceChanged = () => {
    void enumerate();
  };
  return {
    getSnapshot,
    refresh,
    enumerate,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      options.mediaDevices?.addEventListener('devicechange', deviceChanged);
      void enumerate();
    },
    selectInput: (id: string) => run(() => options.controls.selectInput(id)),
    selectCamera: (id: string) => run(() => options.controls.selectCamera(id)),
    setNoiseMode: (mode: string) => run(() => options.controls.setNoiseMode(mode)),
    toggleSuppression: () => run(options.controls.toggleNoiseSuppression),
    toggleLightMode: () => run(options.controls.toggleVoiceLightMode),
    setMicrophoneGain(value: unknown) {
      if (options.controls.getSnapshot().microphoneVolume === clampAudioGain(value))
        return Promise.resolve();
      return run(() => options.controls.setMicrophoneGain(value));
    },
    setOutputGain(value: unknown) {
      if (options.playback.getSnapshot().volume === clampAudioGain(value)) return Promise.resolve();
      return run(() => {
        options.unlockAudio();
        options.playback.setVolume(value);
        options.storage.setItem('mnOutputGain', String(options.playback.getSnapshot().volume));
      });
    },
    setOutput(id: string) {
      return run(async () => {
        const pending = options.playback.setOutput(id);
        options.storage.setItem('tronoVoiceOutput', options.playback.getSnapshot().output);
        if (await pending)
          options.onStatus(
            options.playback.getSnapshot().output
              ? 'Saída de áudio alterada.'
              : 'Usando saída padrão.',
            'ok',
          );
        options.onOutputChanged();
      });
    },
    selectQuality(value: string) {
      if (!isQuality(value)) return Promise.resolve();
      return changeQuality(
        () => {
          if (options.quality.selectQuality(value))
            options.onStatus(
              `Freio de consumo: qualidade limitada a ${options.quality.getSnapshot().profile.label}.`,
              'warn',
            );
        },
        () => {
          options.announce();
          options.onStatus(
            `Qualidade ${options.quality.getSnapshot().profile.label.toLowerCase()} aplicada.`,
            'ok',
          );
        },
      );
    },
    selectFormat(value: string) {
      return isScreenFormat(value)
        ? changeQuality(() => options.quality.configure({ screenFormat: value }))
        : Promise.resolve();
    },
    selectContent(value: string) {
      return changeQuality(() =>
        options.quality.configure({ screenContent: value === 'motion' ? 'motion' : 'detail' }),
      );
    },
    selectBitrate(value: string) {
      const bitrate = Number(value);
      if (!SCREEN_BITRATES.includes(bitrate)) return Promise.resolve();
      return changeQuality(
        () => options.quality.configure({ screenBitrateMbps: bitrate }),
        async (current) => {
          if (options.policy().sfu)
            await options
              .setScreenBitrate(options.quality.getSnapshot().screenBitrate)
              .catch((error) => {
                if (current()) options.onStatus((error as Error).message, 'warn');
              });
          if (current()) options.onStatus(`Tela configurada para até ${bitrate} Mbps.`, 'ok');
        },
      );
    },
    setShareAudio(value: boolean) {
      if (disposed) return;
      options.sharing.setAudio(value);
      refresh();
      options.onStatus('Preferência de áudio aplicada ao próximo compartilhamento.', 'ok');
    },
    dispose() {
      disposed = true;
      enumeration++;
      qualityRevision++;
      listeners.clear();
      options.mediaDevices?.removeEventListener('devicechange', deviceChanged);
    },
  };
}
export type VoiceSettings = ReturnType<typeof createVoiceSettings>;
export type VoiceSettingsSnapshot = ReturnType<VoiceSettings['getSnapshot']>;
