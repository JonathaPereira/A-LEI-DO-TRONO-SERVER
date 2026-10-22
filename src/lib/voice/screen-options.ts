import type { createScreenSharing } from './screen-sharing';

interface ScreenOptions {
  sharing: Pick<ReturnType<typeof createScreenSharing>, 'dialogOptions' | 'configure' | 'start'>;
  call(): { joined: boolean; generation: number; mediaBlocked?: boolean };
  replayEnabled(): boolean;
  closeDialog(): void;
  onBlocked?(): void;
}
interface ScreenOptionsSnapshot {
  readonly open: boolean;
  readonly resolution: string;
  readonly fps: string;
  readonly audio: boolean;
  readonly limited: boolean;
  readonly replay: boolean;
}
/** Drafts belong to this dialog; persisted preferences and capture belong to sharing. */
export function createScreenOptions(options: ScreenOptions) {
  const listeners = new Set<() => void>();
  let snapshot: ScreenOptionsSnapshot = Object.freeze({
    open: false,
    resolution: '720',
    fps: '30',
    audio: true,
    limited: false,
    replay: false,
  });
  let generation: number | undefined;
  function update(patch: Partial<typeof snapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  }
  function close() {
    options.closeDialog();
    if (snapshot.open) update({ open: false });
  }
  function refresh() {
    if (!snapshot.open) return;
    const call = options.call();
    if (!call.joined || call.mediaBlocked || generation !== call.generation) {
      close();
      return;
    }
    const limited = options.sharing.dialogOptions().limited;
    update({
      limited,
      replay: options.replayEnabled(),
      resolution: limited ? '720' : snapshot.resolution,
      fps: limited && snapshot.fps === '60' ? '30' : snapshot.fps,
    });
  }
  return {
    getSnapshot: () => snapshot,
    refresh,
    close,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open() {
      const call = options.call();
      if (!call.joined) return;
      if (call.mediaBlocked) {
        options.onBlocked?.();
        return;
      }
      generation = call.generation;
      const value = options.sharing.dialogOptions();
      update({
        open: true,
        resolution: String(value.resolution),
        fps: String(value.fps),
        audio: value.audio,
        limited: value.limited,
        replay: options.replayEnabled(),
      });
    },
    setResolution(value: string) {
      if (
        snapshot.open &&
        ['720', '1080'].includes(value) &&
        !(snapshot.limited && value === '1080')
      )
        update({ resolution: value });
    },
    setFps(value: string) {
      if (
        snapshot.open &&
        ['15', '30', '60'].includes(value) &&
        !(snapshot.limited && value === '60')
      )
        update({ fps: value });
    },
    setAudio(value: boolean) {
      if (snapshot.open) update({ audio: value });
    },
    confirm() {
      refresh();
      if (!snapshot.open) return;
      const { resolution, fps, audio } = snapshot;
      if (!options.sharing.configure(resolution, fps, audio)) return;
      close();
      // No await, timer or React effect before the native picker: preserve user activation.
      return options.sharing.start();
    },
  };
}
export type ScreenOptionsClient = ReturnType<typeof createScreenOptions>;
