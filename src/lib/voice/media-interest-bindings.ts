interface BindingOptions {
  document: Document;
  toggleScreen(id: string): Promise<void>;
  toggleCamera(id: string): Promise<void>;
  warn?(error: unknown): void;
}
/** Delegation follows dynamically rendered/moved tiles without per-tile handlers. */
export function createMediaInterestBindings(options: BindingOptions) {
  const document = options.document;
  let started = false,
    disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[MediaInterestBindings]', error));
  const click: EventListener = (event) => {
    if (disposed || !(event.target instanceof Element)) return;
    const button = event.target.closest('.participant-camera-toggle, .mn-watch-stream');
    const tile = button?.closest<HTMLElement>('[data-peer]');
    if (!button || !tile?.dataset.peer) return;
    const action = button.classList.contains('participant-camera-toggle')
      ? options.toggleCamera
      : options.toggleScreen;
    try {
      void action(tile.dataset.peer).catch(warn);
    } catch (error) {
      warn(error);
    }
  };
  return {
    start() {
      if (!started && !disposed) {
        started = true;
        document.addEventListener('click', click);
      }
    },
    async hide(id: string, kind: 'camera' | 'screen') {
      const tiles = [
        ...document.querySelectorAll<HTMLElement>(
          kind === 'camera' ? '#socialPanel .camera-tile' : '#screenShareGrid .screen-share-tile',
        ),
      ].filter((tile) => tile.dataset.peer === id);
      const full = document.fullscreenElement;
      const exit =
        kind === 'camera'
          ? full?.classList.contains('camera-tile') && (full as HTMLElement).dataset.peer === id
          : tiles.includes(full as HTMLElement);
      for (const tile of tiles) {
        if (kind === 'camera') tile.classList.remove('media-maximized');
        const video = tile.querySelector('video');
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      }
      if (kind === 'camera' && !document.querySelector('.media-maximized'))
        document.body.classList.remove('media-focus-open');
      if (exit) await document.exitFullscreen().catch(() => {});
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        document.removeEventListener('click', click);
      }
    },
  };
}
