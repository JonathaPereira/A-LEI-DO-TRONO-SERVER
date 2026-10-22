interface FocusOptions {
  document: Document;
  call(): { joined: boolean; generation: number };
  closeMosaic(): void;
  expandScreen(tile: HTMLElement): void;
  setLayer(tile: HTMLElement, maximized: boolean): Promise<void>;
  restoreLayers(): Promise<unknown>;
  onChange(): void;
  warn?(error: unknown): void;
}
interface FullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?(): void;
  webkitExitFullscreen?(): void;
}
/** Owns media focus and its listeners, borrowing the original tile and every stream. */
export function createMediaFocus(options: FocusOptions) {
  const doc = options.document;
  const warn = options.warn ?? ((error: unknown) => console.warn('[MediaFocus]', error));
  const requests = new WeakMap<HTMLElement, number>();
  let fallback: HTMLElement | null = null;
  let native = doc.fullscreenElement;
  let pending: { tile: HTMLElement; token: number } | null = null;
  let webkit: { tile: HTMLElement; video: FullscreenVideo; end(): void } | null = null;
  let revision = 0,
    started = false,
    disposed = false;
  function syncClasses() {
    doc.body.classList.toggle('media-focus-open', !!fallback);
    doc.body.classList.toggle('native-fullscreen-media', !!doc.fullscreenElement);
  }
  const layer = (tile: HTMLElement, maximized: boolean) =>
    options.setLayer(tile, maximized).catch(warn);
  function clearFallback() {
    if (!fallback) return false;
    const tile = fallback;
    fallback = null;
    tile.classList.remove('media-maximized');
    syncClasses();
    void layer(tile, false);
    return true;
  }
  function clearWebkit() {
    if (!webkit) return;
    const { video, end } = webkit;
    video.removeEventListener('webkitendfullscreen', end);
    webkit = null;
  }
  async function release(tile: HTMLElement) {
    const affected =
      pending?.tile === tile ||
      fallback === tile ||
      webkit?.tile === tile ||
      doc.fullscreenElement === tile;
    if (!affected) return;
    ++revision;
    if (pending?.tile === tile) pending = null;
    if (fallback === tile) clearFallback();
    if (webkit?.tile === tile) {
      const video = webkit.video;
      clearWebkit();
      try {
        video.webkitExitFullscreen?.();
      } catch (error) {
        warn(error);
      }
      void layer(tile, false);
    }
    if (doc.fullscreenElement === tile) {
      await doc.exitFullscreen().catch(warn);
      await layer(tile, false);
    }
    syncClasses();
    options.onChange();
  }
  async function toggle(tile: HTMLElement) {
    if (disposed || !options.call().joined || !tile.isConnected) return;
    const generation = options.call().generation,
      token = ++revision;
    const current = () =>
      !disposed &&
      revision === token &&
      options.call().joined &&
      options.call().generation === generation &&
      tile.isConnected;
    const wasFallback = fallback === tile;
    options.closeMosaic();
    if (doc.fullscreenElement === tile || webkit?.tile === tile) {
      await release(tile);
      return;
    }
    clearFallback();
    if (wasFallback) {
      options.onChange();
      return;
    }
    if (tile.classList.contains('screen-share-tile')) options.expandScreen(tile);
    if (doc.fullscreenElement) {
      await doc.exitFullscreen().catch(warn);
      return;
    }
    if (webkit) {
      await release(webkit.tile);
      return;
    }
    pending = { tile, token };
    try {
      if (tile.requestFullscreen) {
        // Must run in the original gesture, before any await or quality request.
        requests.set(tile, token);
        await tile.requestFullscreen();
        if (!current()) {
          if (requests.get(tile) === token && doc.fullscreenElement === tile)
            await doc.exitFullscreen().catch(warn);
          return;
        }
        await layer(tile, true);
        return;
      }
      const video = tile.querySelector<FullscreenVideo>('video');
      if (video?.webkitEnterFullscreen) {
        const end = () => {
          ++revision;
          clearWebkit();
          void layer(tile, false);
          options.onChange();
        };
        webkit = { tile, video, end };
        video.addEventListener('webkitendfullscreen', end);
        video.webkitEnterFullscreen();
        await layer(tile, true);
        return;
      }
    } catch (error) {
      if (!current()) return;
      clearWebkit();
      warn(error);
    } finally {
      if (pending?.token === token) pending = null;
    }
    if (!current()) return;
    fallback = tile;
    tile.classList.add('media-maximized');
    syncClasses();
    options.onChange();
    await layer(tile, true);
  }
  function fullscreenChanged() {
    const previous = native;
    native = doc.fullscreenElement;
    syncClasses();
    if (!native) {
      if (pending?.tile === previous) ++revision;
      options.onChange();
      void options.restoreLayers().catch(warn);
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !fallback || event.defaultPrevented) return;
    ++revision;
    clearFallback();
    event.preventDefault();
    options.onChange();
  }
  async function reset() {
    ++revision;
    const tiles = new Set([pending?.tile, fallback, webkit?.tile, doc.fullscreenElement]);
    const releases: Promise<void>[] = [];
    for (const tile of tiles)
      if (
        tile instanceof doc.defaultView!.HTMLElement &&
        tile.matches('.camera-tile,.screen-share-tile')
      )
        releases.push(release(tile));
    await Promise.all(releases);
    syncClasses();
  }
  return {
    toggle,
    release,
    reset,
    start() {
      if (started || disposed) return;
      started = true;
      doc.addEventListener('fullscreenchange', fullscreenChanged);
      doc.addEventListener('keydown', keydown);
      syncClasses();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('fullscreenchange', fullscreenChanged);
      doc.removeEventListener('keydown', keydown);
      void reset();
    },
  };
}
