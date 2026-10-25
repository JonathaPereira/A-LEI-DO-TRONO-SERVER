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
export type VoiceModerationAction = 'mute' | 'unmute' | 'block-media' | 'allow-media' | 'kick';
export interface StageSource {
  generation: number;
  joined: boolean;
  community: boolean;
  hub: boolean;
  publicActive: boolean;
  roomName: string;
  localRole?: string;
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
  moderateVoice?(targetId: string, action: VoiceModerationAction, requestId: string): boolean;
  confirmKick?(name: string): boolean;
  onStatus?(text: string, kind: 'ok' | 'warn' | 'error'): void;
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
    activities = new Map<string, string>(),
    pendingModeration = new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallStage]', error));
  let focused: Readonly<{ id: string; kind: 'person' | 'screen' }> | null = null;
  let generation: number | undefined,
    switching: object | null = null,
    disposed = false;
  let unsubscribe: (() => void) | undefined;
  const isModerationPending = (targetId: string, action: string) =>
    [...pendingModeration.values()].some((job) => job.key === `${targetId}:${action}`);
  function read() {
    const source = options.read();
    if (generation !== undefined && generation !== source.generation) {
      layouts.clear();
      collapsed.clear();
      switching = null;
      focused = null;
    }
    generation = source.generation;
    const selected = source.participants.find(p => p.id === focused?.id);
    if (!source.joined || !selected || (focused?.kind === "screen" && (!selected.screen || !selected.watching))) focused = null;
    const ids = new Set(source.participants.map((p) => p.id));
    for (const id of layouts.keys()) if (!ids.has(id)) layouts.delete(id);
    for (const id of collapsed)
      if (!ids.has(id) || !source.participants.find((p) => p.id === id)?.screen)
        collapsed.delete(id);
    const localRole = source.localRole || 'member';
    const canModerateAny = localRole === 'admin' || localRole === 'creator';
    const participants = Object.freeze(
      (source.joined ? source.participants : []).map((p) => {
        const mode = layouts.get(p.id) || 'auto',
          cameraDock = mode === 'camera' || mode === 'auto',
          screenDock = mode === 'screen';
        const targetRole = p.role || 'member';
        const canModerate =
          canModerateAny &&
          !p.self &&
          targetRole !== 'creator' &&
          (localRole === 'creator' || targetRole !== 'admin');
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
          canModerate,
          pendingModeration: Object.freeze({
            mute: isModerationPending(p.id, p.serverMuted ? 'unmute' : 'mute'),
            media: isModerationPending(p.id, p.mediaBlocked ? 'allow-media' : 'block-media'),
            kick: isModerationPending(p.id, 'kick'),
          }),
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
      focused,
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
    } else if (message.type === 'connection' && !message.connected) {
      for (const job of pendingModeration.values()) clearTimeout(job.timer);
      pendingModeration.clear();
      resetActivities();
    } else if (
      message.type === 'voice-moderation-result' &&
      typeof message.requestId === 'string'
    ) {
      const job = pendingModeration.get(message.requestId);
      if (job) {
        clearTimeout(job.timer);
        pendingModeration.delete(message.requestId);
        options.onStatus?.(
          message.ok
            ? 'Moderação aplicada.'
            : (typeof message.error === 'string' && message.error) || 'Não foi possível moderar.',
          message.ok ? 'ok' : 'error',
        );
        refresh();
      }
    } else if (message.type === 'role-updated') {
      refresh();
    }
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
    focus(id: string, kind: 'person' | 'screen') {
      if (disposed) return;
      const person = getSnapshot().participants.find(p => p.id === id);
      if (!person || (kind === 'screen' && (!person.screen || !person.watching))) return;
      focused = Object.freeze({ id, kind });
      refresh();
    },
    grid() {
      if (disposed) return;
      focused = null;
      refresh();
    },
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
    moderate(id: string, action: VoiceModerationAction, name = 'Participante') {
      if (disposed || !options.moderateVoice) return;
      if (action === 'kick' && options.confirmKick && !options.confirmKick(name)) return;
      const requestId = crypto.randomUUID(),
        key = `${id}:${action}`;
      const timer = setTimeout(() => {
        if (!pendingModeration.delete(requestId)) return;
        options.onStatus?.('A moderação não respondeu.', 'warn');
        refresh();
      }, 8000);
      pendingModeration.set(requestId, { key, timer });
      refresh();
      if (!options.moderateVoice(id, action, requestId)) {
        clearTimeout(timer);
        pendingModeration.delete(requestId);
        refresh();
      }
    },
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
      for (const job of pendingModeration.values()) clearTimeout(job.timer);
      pendingModeration.clear();
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
