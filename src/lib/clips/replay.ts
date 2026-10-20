import type { LocalClip } from '../../types/clips';
import type { ClipSnapshot } from './buffer';
import type { ClipLibrary } from './library';
import type { ClipPreferences } from './preferences';
import type { ReplaySession, ReplaySessionOptions } from './session';

export interface ReplaySnapshot {
  readonly owner: string;
  readonly active: boolean;
  readonly ready: boolean;
  readonly preparing: boolean;
  readonly shared: boolean;
  readonly seconds: number;
  readonly hasAudio: boolean;
  readonly message: string;
  readonly messageVersion: number;
}
interface ReplayOptions {
  library: ClipLibrary;
  preferences: ClipPreferences;
  createSession(options: ReplaySessionOptions): Promise<ReplaySession | null>;
  supported(): boolean;
  saved(count: number): void;
  createId(): string;
  now(): number;
}
/** Borrows a shared source. The session owns its clones, recorder, reads and worker. */
export function createReplayController(options: ReplayOptions) {
  const { library, preferences } = options;
  let owner = 'local',
    generation = 0,
    starting = false,
    disposed = false;
  let source: MediaStream | null = null,
    session: ReplaySession | null = null;
  let settings = preferences.getSnapshot().settings;
  const listeners = new Set<() => void>();
  let state: ReplaySnapshot = Object.freeze({
    owner,
    active: false,
    ready: false,
    preparing: false,
    shared: false,
    seconds: 0,
    hasAudio: false,
    message: '',
    messageVersion: 0,
  });
  function publish(message?: string) {
    if (disposed) return;
    const active = !!session && !session.stopping;
    state = Object.freeze({
      ...state,
      owner,
      active,
      ready: !!(active && session?.status?.ready),
      preparing: starting,
      shared: source !== null,
      seconds: session?.status?.seconds ?? 0,
      hasAudio: session?.hasAudio ?? false,
      ...(message === undefined ? {} : { message, messageVersion: state.messageVersion + 1 }),
    });
    for (const listener of listeners) listener();
  }
  function stopSession(target = session) {
    const current = target === session;
    if (current || !target) {
      generation++;
      starting = false;
    }
    if (current) session = null;
    target?.stop();
    if (current || !target)
      publish(
        target
          ? 'Buffer temporário descartado. Os clipes já criados continuam na biblioteca.'
          : undefined,
      );
  }
  async function retain(target: ReplaySession, result: ClipSnapshot & { id: string }) {
    const createdAt = options.now(),
      stamp = new Date(createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const clip: LocalClip = {
      id: result.id,
      owner: target.owner,
      name: 'Clipe ' + new Date(createdAt).toLocaleString('pt-BR'),
      filename: 'Trono_Clipe_' + stamp + '_' + result.id.slice(0, 8) + '.webm',
      createdAt,
      quality: target.quality,
      fps: target.fps,
      duration: result.duration,
      bytes: result.bytes,
      blob: result.blob,
      state: 'pending',
    };
    await library.retain(clip, () => {
      if (session === target) stopSession(target);
    });
    if (!disposed && owner === target.owner) options.saved(library.getSnapshot().pendingCount);
  }
  async function sharedStarted(next: MediaStream, { force = false } = {}) {
    if (disposed) return;
    stopSession();
    source = next;
    publish();
    if (!settings.auto && !force) return;
    if (library.hasUnsavedMemory(owner)) {
      publish(
        'Salve ou descarte os clipes guardados somente nesta sessão antes de retomar o replay.',
      );
      return;
    }
    if (!options.supported()) {
      publish('Replay indisponível neste navegador. O compartilhamento continua.');
      return;
    }
    const request = ++generation,
      account = owner;
    const current = () =>
      !disposed && request === generation && account === owner && source === next;
    starting = true;
    publish();
    try {
      let prepared: ReplaySession | null = null;
      prepared = await options.createSession({
        source: next,
        owner: account,
        quality: preferences.getQuality(),
        fps: settings.fps,
        seconds: settings.seconds,
        isCurrent: current,
        onStatus: () => {
          if (prepared && session === prepared && !disposed) publish();
        },
        onClip: retain,
        onError: (text) => {
          if (disposed || !prepared || session !== prepared) return;
          if (prepared.stopping) stopSession(prepared);
          publish(text);
        },
        onEnded: () => {
          if (prepared) stopSession(prepared);
        },
      });
      if (!prepared) {
        if (current()) {
          starting = false;
          publish();
        }
        return;
      }
      if (!current()) {
        prepared.stop();
        return;
      }
      session = prepared;
      prepared.start();
      starting = false;
      publish(
        prepared.hasAudio
          ? 'Replay automático ativo com o áudio da tela.'
          : 'Replay ativo sem áudio: o navegador não forneceu áudio da tela. Habilite-o no seletor de compartilhamento, quando disponível.',
      );
    } catch (error) {
      if (!current()) return;
      session?.stop();
      session = null;
      starting = false;
      publish(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o replay. O compartilhamento continua.',
      );
    }
  }
  function sharedStopped(previous?: MediaStream) {
    if (disposed || (previous && source !== previous)) return;
    source = null;
    stopSession();
  }
  function clip() {
    if (disposed) return;
    const target = session;
    if (!target?.status?.ready || target.stopping) {
      publish('Compartilhe sua tela e aguarde o replay ficar pronto para clipar.');
      return;
    }
    if (target.pendingCount >= 4) {
      publish('Aguarde os clipes em preparação antes de clipar novamente.');
      return;
    }
    publish('Preparando clipe…');
    try {
      target.requestClip(options.createId());
    } catch {
      publish('A captura não está disponível. Os clipes anteriores continuam armazenados.');
    }
  }
  const unsubscribe = preferences.subscribe(() => {
    const next = preferences.getSnapshot(),
      previous = settings;
    settings = next.settings;
    if (disposed || next.owner !== owner) return;
    const changed = (['quality', 'fps', 'seconds', 'auto'] as const).some(
      (key) => previous[key] !== settings[key],
    );
    if (source && changed) void sharedStarted(source);
  });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async setOwner(next: string) {
      if (disposed) return;
      source = null;
      stopSession();
      owner = next;
      publish('');
      preferences.setOwner(owner);
      settings = preferences.getSnapshot().settings;
      await library.setOwner(owner);
    },
    sharedStarted,
    sharedStopped,
    clip,
    stop: () => {
      if (!disposed) stopSession();
    },
    resume: () => (source ? sharedStarted(source) : Promise.resolve()),
    captureProfile: preferences.captureProfile,
    hasUnsavedWork: () => !disposed && (!!session || starting || library.hasUnsavedMemory()),
    getReplayStatus: () =>
      session
        ? {
            ...session.status,
            quality: session.quality,
            fps: session.fps,
            maxBytes: session.maxBytes,
            hasAudio: session.hasAudio,
          }
        : null,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      starting = false;
      source = null;
      session?.stop();
      session = null;
      unsubscribe();
      listeners.clear();
      state = Object.freeze({
        ...state,
        active: false,
        ready: false,
        preparing: false,
        shared: false,
        seconds: 0,
        hasAudio: false,
      });
    },
  };
}
export type ReplayController = ReturnType<typeof createReplayController>;
