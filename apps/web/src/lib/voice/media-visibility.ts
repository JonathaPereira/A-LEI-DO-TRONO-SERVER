/** Detaches borrowed display players before hiding; never stops received tracks. */
export function createMediaVisibility(options: {
  document: Document;
  releaseFocus(tile: HTMLElement): Promise<void>;
}) {
  const document = options.document;
  return {
    async hide(id: string, kind: 'camera' | 'screen') {
      const tiles = [
        ...document.querySelectorAll<HTMLElement>(
          kind === 'camera'
            ? '#socialPanel .camera-tile, [data-call-video] .camera-tile'
            : '#socialPanel .screen-share-tile, [data-call-video] .screen-share-tile',
        ),
      ].filter((tile) => tile.dataset.peer === id);
      const releases: Promise<void>[] = [];
      for (const tile of tiles) {
        // Release synchronously before detaching; native exit may finish asynchronously.
        releases.push(options.releaseFocus(tile));
        const video = tile.querySelector('video');
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      }

      await Promise.all(releases);
    },
  };
}
