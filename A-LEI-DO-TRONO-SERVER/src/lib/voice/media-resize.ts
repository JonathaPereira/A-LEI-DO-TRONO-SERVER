export function bindMediaResize(
  tile: HTMLElement,
  kind: 'camera' | 'screen',
  options: { storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; inChatHub(): boolean },
) {
  const events = new AbortController();
  if (!tile || tile.dataset.mediaResizeBound) return;
  if (options.inChatHub()) return;
  tile.dataset.mediaResizeBound = '1';
  const grip = tile.querySelector<HTMLElement>('.media-resize-grip');
  if (!grip) return;
  function listen<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ) {
    grip!.addEventListener(type, listener, { signal: events.signal });
  }
  try {
    const saved = JSON.parse(options.storage.getItem(`tronoMediaTileSize:${kind}`) || 'null');
    if (saved?.w && saved?.h && innerWidth > 760) {
      tile.style.width = `${Math.min(saved.w, innerWidth - 80)}px`;
      tile.style.height = `${Math.min(saved.h, innerHeight - 130)}px`;
      tile.style.aspectRatio = 'auto';
      tile.style.justifySelf = 'start';
    }
  } catch {}
  let resize: { x: number; y: number; w: number; h: number } | null = null;
  listen('pointerdown', (e) => {
    if (options.inChatHub() || innerWidth <= 760) return;
    e.stopPropagation();
    const r = tile.getBoundingClientRect();
    resize = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    grip.setPointerCapture?.(e.pointerId);
    tile.classList.add('media-resizing');
    e.preventDefault();
  });
  listen('pointermove', (e) => {
    if (!resize) return;
    const maxW = Math.max(280, Math.min(innerWidth - 80, 1000)),
      maxH = Math.max(170, Math.min(innerHeight - 130, 680));
    const w = Math.max(240, Math.min(maxW, resize.w + (e.clientX - resize.x))),
      h = Math.max(135, Math.min(maxH, resize.h + (e.clientY - resize.y)));
    tile.style.width = `${w}px`;
    tile.style.height = `${h}px`;
    tile.style.aspectRatio = 'auto';
    tile.style.justifySelf = 'start';
  });
  const stop = () => {
    if (!resize) return;
    resize = null;
    tile.classList.remove('media-resizing');
    const r = tile.getBoundingClientRect();
    options.storage.setItem(
      `tronoMediaTileSize:${kind}`,
      JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }),
    );
  };
  listen('pointerup', stop);
  listen('pointercancel', stop);
  listen('dblclick', (e) => {
    e.stopPropagation();
    options.storage.removeItem(`tronoMediaTileSize:${kind}`);
    tile.style.width = '';
    tile.style.height = '';
    tile.style.aspectRatio = '';
    tile.style.justifySelf = '';
  });
  return () => {
    events.abort();
    delete tile.dataset.mediaResizeBound;
  };
}
