/** Detaches borrowed display players before hiding; never stops received tracks. */
export function createMediaVisibility(options: { document: Document }) {
  const document = options.document;
  return {
    async hide(id: string, kind: 'camera' | 'screen') {
      const tiles = [
        ...document.querySelectorAll<HTMLElement>(
          kind === 'camera' ? '#socialPanel .camera-tile' : '#socialPanel .screen-share-tile',
        ),
      ].filter((tile) => tile.dataset.peer === id);
      const full = document.fullscreenElement;
      const exit =
        kind === 'camera'
          ? full?.classList.contains('camera-tile') && (full as HTMLElement).dataset.peer === id
          : tiles.includes(full as HTMLElement);
      for (const tile of tiles) {
        tile.classList.remove('media-maximized');
        const video = tile.querySelector('video');
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      }
      if (!document.querySelector('.media-maximized'))
        document.body.classList.remove('media-focus-open');
      if (exit) await document.exitFullscreen().catch(() => {});
    },
  };
}
