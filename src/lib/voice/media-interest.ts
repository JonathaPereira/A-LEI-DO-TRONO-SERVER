import type { VoiceMediaKind } from '../../types/voice';
import type { VoiceCallSnapshot } from '../../types/voice-call';

interface InterestOptions {
  call(): Pick<VoiceCallSnapshot, 'joined' | 'generation'>;
  localId(): string | null | undefined;
  participant(id: string): { camera: boolean; screen: boolean } | undefined;
  community(): boolean;
  isSfu(): boolean;
  cameraTracks(id: string): readonly MediaStreamTrack[];
  unlockAudio(): void;
  removeScreenAudio(id: string): void;
  attachScreenAudio(id: string): void;
  cancelRecovery(id: string): void;
  clearCameraRetry(id: string): void;
  closeSubscription(id: string, kind: 'camera' | 'screen' | 'screen-audio'): Promise<unknown>;
  syncSubscriptions(): Promise<unknown>;
  sendWatch(id: string, watching: boolean): void;
  hide(id: string, kind: 'camera' | 'screen'): Promise<void>;
  onChange(kind: 'camera' | 'screen'): void;
  warn?(error: unknown): void;
}

/** Owns viewing intent, never captures, players, peers or subscription resources. */
export function createMediaInterest(options: InterestOptions) {
  const watching = new Set<string>(),
    hidden = new Set<string>();
  const screenVersions = new Map<string, number>(),
    cameraVersions = new Map<string, number>();
  let version = 0,
    epoch = 0,
    disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[MediaInterest]', error));
  function background(action: () => Promise<unknown>) {
    try {
      void action().catch(warn);
    } catch (error) {
      warn(error);
    }
  }
  async function toggleScreen(id: string) {
    if (disposed || !options.call().joined || !options.participant(id)?.screen) return;
    const generation = options.call().generation,
      revision = epoch,
      token = ++version;
    screenVersions.set(id, token);
    const current = () =>
      !disposed &&
      epoch === revision &&
      options.call().generation === generation &&
      options.call().joined &&
      screenVersions.get(id) === token;
    if (watching.delete(id)) {
      options.removeScreenAudio(id);
      options.cancelRecovery(id);
      if (options.isSfu())
        for (const kind of ['screen', 'screen-audio'] as const)
          background(() => options.closeSubscription(id, kind));
      await options.hide(id, 'screen');
      if (!current()) return;
    } else {
      watching.add(id);
      options.unlockAudio();
    }
    if (options.isSfu()) background(options.syncSubscriptions);
    else options.sendWatch(id, watching.has(id));
    if (watching.has(id)) options.attachScreenAudio(id);
    options.onChange('screen');
  }
  async function toggleCamera(id: string) {
    if (
      disposed ||
      !options.call().joined ||
      id === options.localId() ||
      !options.participant(id)?.camera
    )
      return;
    const generation = options.call().generation,
      revision = epoch,
      token = ++version;
    cameraVersions.set(id, token);
    const current = () =>
      !disposed &&
      epoch === revision &&
      options.call().generation === generation &&
      options.call().joined &&
      cameraVersions.get(id) === token;
    const hide = !hidden.has(id);
    if (hide) hidden.add(id);
    else hidden.delete(id);
    for (const track of options.cameraTracks(id)) track.enabled = !hide;
    options.clearCameraRetry(id);
    if (hide) {
      if (options.isSfu()) background(() => options.closeSubscription(id, 'camera'));
      await options.hide(id, 'camera');
      if (!current()) return;
    }
    if (options.isSfu()) background(options.syncSubscriptions);
    options.onChange('camera');
  }
  function reset() {
    epoch++;
    version++;
    watching.clear();
    hidden.clear();
    screenVersions.clear();
    cameraVersions.clear();
  }
  return {
    isWatching: (id: string) => watching.has(id),
    isCameraHidden: (id: string) => hidden.has(id),
    watchVersion: (id: string) => screenVersions.get(id) ?? version,
    wants(publication: { ownerId: string; kind: VoiceMediaKind }) {
      return (
        publication.ownerId !== options.localId() &&
        (publication.kind !== 'camera' || !hidden.has(publication.ownerId)) &&
        (!['screen', 'screen-audio'].includes(publication.kind) ||
          (options.community() && watching.has(publication.ownerId)))
      );
    },
    toggleScreen,
    toggleCamera,
    reset,
    prune() {
      for (const id of watching)
        if (!options.participant(id)?.screen) {
          watching.delete(id);
          screenVersions.set(id, ++version);
          options.removeScreenAudio(id);
          options.cancelRecovery(id);
        }
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        reset();
      }
    },
  };
}
