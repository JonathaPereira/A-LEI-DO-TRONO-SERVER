import type { createScreenCapture } from './screen-capture';
import type { createCallQuality } from './quality';
import type { VoicePeerConnection } from '../../types/voice';
import { SCREEN_FORMATS, isScreenFormat } from './quality-policy.ts';

interface SharingOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  call(): { joined: boolean; generation: number };
  community(): boolean;
  supported(): boolean;
  join(): Promise<boolean>;
  policy(): { sfu: boolean; screenAllowed?: boolean; highAllowed?: boolean };
  capture: Pick<ReturnType<typeof createScreenCapture>, 'getCapture' | 'start' | 'stop'>;
  quality: Pick<ReturnType<typeof createCallQuality>, 'getSnapshot' | 'configure'>;
  peers: ReadonlyMap<string, VoicePeerConnection>;
  stopWatching(peer: RTCPeerConnection): void;
  closePublication(kind: 'screen' | 'screen-audio'): Promise<unknown>;
  announceStopped(): void;
  onChange(kind: 'preview' | 'settings' | 'stopped'): void;
  onStatus(text: string, kind: 'ok' | 'warn' | 'error'): void;
  warn?(error: unknown): void;
}

interface SharingSnapshot {
  readonly audio: boolean;
  readonly previewPaused: boolean;
  readonly collapsed: boolean;
}

/** Owns sharing commands/preferences; the existing capture owner retains every track. */
export function createScreenSharing(options: SharingOptions) {
  let snapshot: SharingSnapshot = Object.freeze({
    audio: options.storage.getItem('mnShareStreamAudio') !== '0',
    previewPaused: false,
    collapsed: false,
  });
  let disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[ScreenSharing]', error));
  const active = () => options.capture.getCapture() !== null;
  function update(patch: Partial<typeof snapshot>, kind: 'preview' | 'settings' | 'stopped') {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    options.onChange(kind);
  }
  function resetPreview() {
    update({ previewPaused: false, collapsed: false }, 'preview');
  }
  async function start({ replace = false } = {}) {
    if (disposed || !options.community()) return false;
    if (active() && !replace) return true;
    if (!options.supported()) {
      options.onStatus('Compartilhamento de tela não é suportado neste navegador.', 'error');
      return false;
    }
    if (!options.call().joined && !(await options.join())) return false;
    if (disposed || !options.call().joined) return false;
    const generation = options.call().generation;
    if (options.policy().sfu && options.policy().screenAllowed === false) {
      options.onStatus('Compartilhamento bloqueado pelo freio mensal de consumo.', 'warn');
      return false;
    }
    try {
      return await options.capture.start({ replace });
    } catch (error) {
      if (disposed || generation !== options.call().generation || !options.call().joined)
        return false;
      const e = error as { name?: string; message?: string };
      options.onStatus(
        ['NotAllowedError', 'AbortError'].includes(e?.name ?? '')
          ? replace && active()
            ? 'Troca cancelada. A tela anterior continua sendo compartilhada.'
            : 'Compartilhamento de tela cancelado.'
          : e?.message || 'Não foi possível compartilhar a tela.',
        'error',
      );
      return false;
    }
  }
  async function stop(sendState = true) {
    if (disposed || !options.capture.stop()) return;
    snapshot = Object.freeze({ ...snapshot, previewPaused: false, collapsed: false });
    if (sendState) options.announceStopped();
    options.onChange('stopped');
    if (options.policy().sfu) {
      void options.closePublication('screen-audio').catch(warn);
      void options.closePublication('screen').catch(warn);
    } else {
      const jobs: Promise<unknown>[] = [];
      for (const peer of options.peers.values()) {
        options.stopWatching(peer);
        for (const sender of [peer._tronoScreenSender, peer._tronoScreenAudioSender])
          if (sender) jobs.push(sender.replaceTrack(null));
      }
      void Promise.allSettled(jobs);
    }
  }
  return {
    isActive: active,
    getSnapshot: () => snapshot,
    start,
    stop,
    resetPreview,
    switchSource: () => (active() ? start({ replace: true }) : Promise.resolve(false)),
    setAudio(value: boolean) {
      if (disposed) return;
      snapshot = Object.freeze({ ...snapshot, audio: value });
      options.storage.setItem('mnShareStreamAudio', value ? '1' : '0');
      options.onChange('settings');
    },
    dialogOptions() {
      const format = SCREEN_FORMATS[options.quality.getSnapshot().preferences.screenFormat];
      const limited = options.policy().sfu && options.policy().highAllowed === false;
      return {
        resolution: limited ? 720 : format.height,
        fps: limited && format.fps === 60 ? 30 : format.fps,
        limited,
        audio: snapshot.audio,
      };
    },
    configure(resolution: string, fps: string, audio: boolean) {
      const format = `${resolution}-${fps}`;
      if (disposed || !options.call().joined || !isScreenFormat(format)) return false;
      options.quality.configure({
        screenFormat: format,
        transmissionQuality: resolution === '1080' ? 'high' : 'balanced',
        screenBitrateMbps: resolution === '1080' ? (fps === '60' ? 10 : 8) : fps === '15' ? 4 : 6,
      });
      snapshot = Object.freeze({ ...snapshot, audio });
      options.storage.setItem('mnShareStreamAudio', audio ? '1' : '0');
      options.onChange('settings');
      return true;
    },
    togglePreview() {
      if (disposed || !active()) return;
      const paused = !snapshot.previewPaused;
      update({ previewPaused: paused, collapsed: paused || snapshot.collapsed }, 'preview');
      options.onStatus(
        paused
          ? 'Prévia local pausada. A transmissão continua normalmente.'
          : 'Prévia local restaurada.',
        'ok',
      );
    },
    toggleCollapsed() {
      if (!disposed && active()) update({ collapsed: !snapshot.collapsed }, 'preview');
    },
    dispose() {
      disposed = true;
    },
  };
}
