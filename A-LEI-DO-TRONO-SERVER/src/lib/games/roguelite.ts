import { record } from '../files/protocol.ts';
import { abortable } from '../http/abortable.ts';

export interface RogueliteSnapshot {
  readonly active: boolean;
  readonly loading: boolean;
  readonly ready: boolean;
  readonly frameId: number | null;
  readonly progress: number;
  readonly message: string;
  readonly error: boolean;
  readonly immersive: boolean;
  readonly fullscreen: boolean;
  readonly fullscreenPending: boolean;
}
interface RogueliteOptions {
  desktop: boolean;
  fetch: typeof fetch;
  readActive(): boolean;
  subscribeVisibility(listener: () => void): () => void;
  fullscreenOwned(): boolean;
  requestFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  schedule?: (callback: () => void, delay: number) => () => void;
}
function readManifest(value: unknown) {
  if (
    !record(value) ||
    value.schema !== 1 ||
    value.id !== 'cinzas-do-abismo' ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) <= 0
  )
    throw new Error('Manifesto do jogo inválido.');
  const seen = new Set<string>();
  const files = value.files.map((file: unknown) => {
    if (
      !record(file) ||
      typeof file.path !== 'string' ||
      !/^[a-zA-Z0-9_./-]+$/.test(file.path) ||
      file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      seen.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      (file.bytes as number) < 0
    )
      throw new Error('Recurso do jogo inválido.');
    seen.add(file.path);
    return { path: file.path, bytes: file.bytes as number };
  });
  if (files.reduce((sum, file) => sum + file.bytes, 0) !== value.bytes)
    throw new Error('Tamanho do jogo inválido.');
  return { files, bytes: value.bytes as number };
}
const initial: RogueliteSnapshot = Object.freeze({
  active: false,
  loading: false,
  ready: false,
  frameId: null,
  progress: 0,
  message: 'Abrindo Cinzas do Abismo…',
  error: false,
  immersive: false,
  fullscreen: false,
  fullscreenPending: false,
});

/** Owns preparation/readiness and one persistent iframe identity; the embedded game owns its run/save. */
export function createRoguelite(options: RogueliteOptions) {
  let state = initial,
    generation = 0,
    frameSerial = 0,
    fullscreenVersion = 0,
    disposed = false,
    started = false;
  let pending: AbortController | null = null,
    bootTimer: (() => void) | null = null,
    unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    });
  function update(patch: Partial<RogueliteSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function cancel() {
    generation++;
    pending?.abort();
    pending = null;
    bootTimer?.();
    bootTimer = null;
  }
  async function prepare() {
    if (disposed || !state.active || state.frameId !== null || state.loading) return;
    cancel();
    const operation = generation,
      controller = new AbortController();
    pending = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    const current = () => !disposed && operation === generation && state.active;
    update({
      loading: true,
      ready: false,
      progress: 0,
      error: false,
      message: options.desktop
        ? 'Preparando o jogo neste computador…'
        : 'Abrindo Cinzas do Abismo…',
    });
    try {
      if (options.desktop) {
        const response = await abortable(
          options.fetch('roguelite/asset-manifest.json', { signal }),
          signal,
        );
        if (!response.ok) throw new Error('Manifest unavailable');
        const manifest = readManifest(await abortable(response.json(), signal));
        let cursor = 0,
          done = 0;
        async function worker() {
          while (cursor < manifest.files.length) {
            signal.throwIfAborted();
            const file = manifest.files[cursor++];
            const resource = await abortable(
              options.fetch('roguelite/' + file.path, { signal }),
              signal,
            );
            if (!resource.ok) throw new Error('Asset unavailable');
            const bytes = await abortable(resource.arrayBuffer(), signal);
            if (bytes.byteLength !== file.bytes) throw new Error('Incomplete asset');
            if (!current()) return;
            done += file.bytes;
            const progress = Math.round((done / manifest.bytes) * 100);
            update({ progress, message: `Preparando o jogo · ${progress}%` });
          }
        }
        await Promise.all([worker(), worker()]);
      }
      if (!current()) return;
      const frameId = ++frameSerial;
      update({ frameId });
      bootTimer = schedule(() => {
        if (!current() || state.frameId !== frameId || state.ready) return;
        cancel();
        update({
          frameId: null,
          loading: false,
          error: true,
          message: 'Não foi possível abrir o jogo. Tente novamente.',
        });
      }, 20000);
    } catch (error) {
      controller.abort();
      if (current())
        update({
          loading: false,
          error: true,
          message: 'Não foi possível preparar o jogo. Verifique a conexão e tente novamente.',
        });
    } finally {
      if (operation === generation) pending = null;
    }
  }
  function sync() {
    if (disposed) return;
    const active = options.readActive();
    if (!active) {
      fullscreenVersion++;
      cancel();
      update({
        active: false,
        loading: false,
        immersive: false,
        fullscreenPending: false,
        fullscreen: false,
        ...(state.ready ? {} : { frameId: null }),
      });
      if (options.fullscreenOwned()) void options.exitFullscreen().catch(() => {});
    } else {
      update({ active: true, fullscreen: state.immersive || options.fullscreenOwned() });
      if (!state.error) void prepare();
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      unsubscribe = options.subscribeVisibility(sync);
      sync();
    },
    sync,
    prepare,
    ready(frameId: number) {
      if (disposed || state.frameId !== frameId || !state.loading) return;
      bootTimer?.();
      bootTimer = null;
      update({ ready: true, loading: false, error: false });
    },
    fullscreenChanged() {
      update({ fullscreen: state.immersive || options.fullscreenOwned() });
    },
    escape() {
      if (state.immersive) update({ immersive: false, fullscreen: options.fullscreenOwned() });
    },
    async toggleFullscreen() {
      if (disposed || !state.active || state.fullscreenPending) return;
      const operation = ++fullscreenVersion;
      update({ fullscreenPending: true });
      try {
        if (state.immersive || options.fullscreenOwned()) {
          update({ immersive: false });
          if (options.fullscreenOwned()) await options.exitFullscreen().catch(() => {});
        } else {
          try {
            await options.requestFullscreen();
          } catch {
            if (!disposed && state.active && operation === fullscreenVersion)
              update({ immersive: true });
          }
        }
        if (
          (disposed || !state.active || operation !== fullscreenVersion) &&
          options.fullscreenOwned()
        )
          await options.exitFullscreen().catch(() => {});
      } finally {
        if (!disposed && operation === fullscreenVersion)
          update({
            fullscreenPending: false,
            fullscreen: state.immersive || options.fullscreenOwned(),
          });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fullscreenVersion++;
      cancel();
      unsubscribe?.();
      if (options.fullscreenOwned()) void options.exitFullscreen().catch(() => {});
      state = initial;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type Roguelite = ReturnType<typeof createRoguelite>;
