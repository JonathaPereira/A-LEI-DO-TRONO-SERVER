import { clampAudioGain } from './audio-playback.ts';
import type { VoiceParticipant } from '../../types/voice-roster';
import type { SocketMessage } from '../../types/socket';
export type ProfileMedia = 'auto' | 'camera' | 'screen' | 'stage';
export interface StagePerson extends VoiceParticipant {
  self: boolean;
  hiddenCamera: boolean;
  watching: boolean;
  speaking: boolean;
  volume: number;
  screenVolume: number;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraLive: boolean;
  screenLive: boolean;
  hasScreenAudio: boolean;
}
export interface StageSource {
  generation: number;
  joined: boolean;
  community: boolean;
  hub: boolean;
  publicActive: boolean;
  roomName: string;
  previewPaused: boolean;
  previewCollapsed: boolean;
  participants: readonly StagePerson[];
}
interface StageOptions {
  read(): StageSource;
  onMessage(listener: (message: SocketMessage) => void): () => void;
  authEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  toggleScreen(id: string): Promise<void>;
  toggleCamera(id: string): Promise<void>;
  setVolume(id: string, value: unknown): void;
  setScreenVolume(id: string, value: unknown): void;
  togglePreview(): void;
  toggleCollapsed(): void;
  switchSource(): Promise<unknown>;
  prune(): void;
  recover(id: string, live: boolean): void;
  fullscreen(tile: HTMLElement): Promise<void>;
  releaseFocus(tile: HTMLElement): Promise<void>;
  warn?(error: unknown): void;
}
const isMode = (value: string): value is ProfileMedia =>
  ['auto', 'camera', 'screen', 'stage'].includes(value);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Presentation preferences and subscriptions only. Original streams and resource owners are borrowed. */
export function createCallStage(options: StageOptions) {
  const layouts = new Map<string, ProfileMedia>(),
    collapsed = new Set<string>(),
    activities = new Map<string, string>();
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallStage]', error));
  let generation: number | undefined,
    switching: object | null = null,
    disposed = false;
  let unsubscribe: (() => void) | undefined;
  function read() {
    const source = options.read();
    if (generation !== undefined && generation !== source.generation) {
      layouts.clear();
      collapsed.clear();
      switching = null;
    }
    generation = source.generation;
    const ids = new Set(source.participants.map((p) => p.id));
    for (const id of layouts.keys()) if (!ids.has(id)) layouts.delete(id);
    for (const id of collapsed)
      if (!ids.has(id) || !source.participants.find((p) => p.id === id)?.screen)
        collapsed.delete(id);
    const participants = Object.freeze(
      (source.joined ? source.participants : []).map((p) => {
        const mode = layouts.get(p.id) || 'auto',
          cameraDock = mode === 'camera' || mode === 'auto',
          screenDock = mode === 'screen';
        const summary =
          (p.muted ? 'microfone mutado' : p.speaking ? 'falando…' : 'na voz') +
          (p.deafened ? ' • áudio silenciado' : '') +
          (p.camera ? (p.hiddenCamera ? ' • câmera oculta' : ' • 📷 câmera') : '') +
          (p.screen ? ' • 🖥 tela' : '') +
          (p.transport === 'sfu'
            ? ' • ☁ SFU'
            : p.transport === 'sfu-pending'
              ? ' • conectando…'
              : '');
        return Object.freeze({
          ...p,
          mode,
          cameraDock,
          screenDock,
          summary,
          activity: activities.get(p.accountId || '') || '',
          collapsed: p.watching && (p.self ? source.previewCollapsed : collapsed.has(p.id)),
        });
      }),
    );
    const cameras = participants.filter((p) => p.camera && !p.hiddenCamera),
      screens = source.community ? participants.filter((p) => p.screen) : [];
    const screensLayout = source.hub && participants.some((p) => p.screen);
    return Object.freeze({
      ...source,
      participants,
      cameras: Object.freeze(cameras),
      screens: Object.freeze(screens),
      switching: !!switching,
      screensLayout,
      cameraDocked: cameras.length ? cameras.every((p) => p.cameraDock) : screensLayout,
      hasCamera: cameras.length > 0,
      hasScreen: participants.some((p) => !p.screenDock && p.screen && p.watching),
      idle: source.joined && !participants.some((p) => (p.camera && !p.hiddenCamera) || p.screen),
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    options.prune();
    snapshot = read();
    for (const listener of listeners) listener();
  }
  function resetActivities() {
    activities.clear();
    refresh();
  }
  function message(message: SocketMessage) {
    if (message.type === 'presence') {
      activities.clear();
      if (message.scope === 'community' && Array.isArray(message.members))
        for (const value of message.members) {
          const person = record(value),
            activity = record(person?.activity);
          if (
            person?.online === true &&
            typeof person.id === 'string' &&
            typeof activity?.name === 'string' &&
            activity.name.trim()
          )
            activities.set(person.id, activity.name);
        }
      refresh();
    } else if (message.type === 'connection' && !message.connected) resetActivities();
  }
  async function run(action: () => unknown) {
    if (disposed) return;
    try {
      const pending = action();
      refresh();
      await pending;
    } catch (error) {
      warn(error);
    } finally {
      refresh();
    }
  }
  function setLayout(id: string, mode: string) {
    if (!disposed && isMode(mode) && getSnapshot().participants.some((p) => p.id === id)) {
      layouts.set(id, mode);
      refresh();
    }
  }
  return {
    getSnapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (disposed || unsubscribe) return;
      unsubscribe = options.onMessage(message);
      options.authEvents.addEventListener('trono-auth-change', resetActivities);
      refresh();
    },
    setLayout,
    dockCamera(id: string) {
      const person = getSnapshot().participants.find((p) => p.id === id);
      if (person) setLayout(id, person.cameraDock ? 'stage' : 'camera');
    },
    expandScreen(id: string) {
      if (disposed) return;
      collapsed.delete(id);
      refresh();
    },
    resetLayouts() {
      if (disposed) return;
      layouts.clear();
      collapsed.clear();
      refresh();
    },
    fullscreen: (tile: HTMLElement) => run(() => options.fullscreen(tile)),
    releaseFocus: (tile: HTMLElement) => options.releaseFocus(tile),
    collapse(id: string, tile: HTMLElement) {
      return run(async () => {
        const call = options.read().generation;
        await options.releaseFocus(tile);
        if (disposed || options.read().generation !== call) return;
        const person = getSnapshot().screens.find((p) => p.id === id);
        if (!person?.watching) return;
        if (person.self) options.toggleCollapsed();
        else if (!collapsed.delete(id)) collapsed.add(id);
      });
    },
    togglePreview: () => run(options.togglePreview),
    toggleScreen: (id: string) => run(() => options.toggleScreen(id)),
    toggleCamera: (id: string) => run(() => options.toggleCamera(id)),
    setVolume: (id: string, value: unknown) =>
      run(() => {
        const p = getSnapshot().participants.find((p) => p.id === id);
        if (p && !p.self && p.volume !== clampAudioGain(value)) options.setVolume(id, value);
      }),
    setScreenVolume: (id: string, value: unknown) =>
      run(() => {
        const p = getSnapshot().screens.find((p) => p.id === id);
        if (p && !p.self && p.watching && p.screenVolume !== clampAudioGain(value))
          options.setScreenVolume(id, value);
      }),
    recoverVisible() {
      if (disposed) return;
      for (const p of getSnapshot().participants)
        if (!p.self) {
          const missing =
            (p.camera && !p.hiddenCamera && !p.cameraLive) ||
            (p.screen && p.watching && !p.screenLive);
          options.recover(p.id, !missing);
        }
    },
    switchSource() {
      return run(async () => {
        if (switching) return;
        const request = {},
          call = options.read().generation;
        switching = request;
        try {
          const pending = options.switchSource();
          refresh();
          await pending;
        } finally {
          if (generation === call && switching === request) switching = null;
        }
      });
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      options.authEvents.removeEventListener('trono-auth-change', resetActivities);
      listeners.clear();
    },
  };
}
export type CallStage = ReturnType<typeof createCallStage>;
export type StageSnapshot = ReturnType<CallStage['getSnapshot']>;
export type ParticipantView = StageSnapshot['participants'][number];
