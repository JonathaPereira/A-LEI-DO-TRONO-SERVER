export interface LogGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function clampLogGeometry(
  value: unknown,
  viewport: { width: number; height: number },
): LogGeometry | null {
  if (
    !value ||
    typeof value !== 'object' ||
    viewport.width <= 900 ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.height < 12
  )
    return null;
  const g = value as Record<string, unknown>;
  if (
    ['left', 'top', 'width', 'height'].some(
      (key) => typeof g[key] !== 'number' || !Number.isFinite(g[key]),
    )
  )
    return null;
  const width = Math.max(280, Math.min(viewport.width - 12, g.width as number)),
    height = Math.max(
      Math.min(170, viewport.height - 8),
      Math.min(Math.max(1, viewport.height - 74), g.height as number),
    );
  return {
    width,
    height,
    left: Math.max(4, Math.min(viewport.width - width - 4, g.left as number)),
    top: Math.max(
      Math.min(70, viewport.height - height - 4),
      Math.min(g.top as number, viewport.height - height - 4),
    ),
  };
}

/** Owns geometry only; React owns the panel content and controls. */
export function installThroneLogLayout(
  target: Window,
  panel: HTMLElement,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
) {
  const handle = panel.querySelector<HTMLElement>('#eventDragHandle')!,
    grip = panel.querySelector<HTMLElement>('#logResizeGrip')!,
    abort = new AbortController(),
    key = 'tronoLogGeometry';
  let drag: { id: number; dx: number; dy: number } | null = null,
    resize: { id: number; x: number; y: number; width: number; height: number } | null = null,
    disposed = false;
  const viewport = () => ({ width: target.innerWidth, height: target.innerHeight });
  function clearStyle() {
    for (const property of ['left', 'top', 'right', 'bottom', 'width', 'height'])
      panel.style.removeProperty(property);
  }
  function apply(value: unknown) {
    const g = clampLogGeometry(value, viewport());
    if (!g) {
      clearStyle();
      return;
    }
    Object.assign(panel.style, {
      left: `${g.left}px`,
      top: `${g.top}px`,
      width: `${g.width}px`,
      height: `${g.height}px`,
      right: 'auto',
      bottom: 'auto',
    });
  }
  function save() {
    if (disposed || target.innerWidth <= 900 || panel.classList.contains('log-hidden')) return;
    const r = panel.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const g = clampLogGeometry(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      viewport(),
    );
    try {
      storage.setItem(key, JSON.stringify(g));
    } catch {
      /* Storage can be disabled. */
    }
  }
  function restore() {
    try {
      apply(JSON.parse(storage.getItem(key) || 'null'));
    } catch {
      clearStyle();
    }
  }
  function release(node: HTMLElement, id: number) {
    if (node.hasPointerCapture?.(id)) node.releasePointerCapture(id);
  }
  function stop() {
    const d = drag,
      r = resize;
    drag = null;
    resize = null;
    panel.classList.remove('dragging');
    if (d) release(handle, d.id);
    if (r) release(grip, r.id);
    if (d || r) save();
  }
  const opts = { signal: abort.signal };
  handle.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      panel.classList.add('dragging');
      e.preventDefault();
    },
    opts,
  );
  handle.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const r = panel.getBoundingClientRect();
      if (target.innerWidth <= 900) return;
      apply({
        left: e.clientX - drag.dx,
        top: e.clientY - drag.dy,
        width: r.width,
        height: r.height,
      });
    },
    opts,
  );
  grip.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || target.innerWidth <= 900) return;
      const r = panel.getBoundingClientRect();
      resize = { id: e.pointerId, x: e.clientX, y: e.clientY, width: r.width, height: r.height };
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    opts,
  );
  grip.addEventListener(
    'pointermove',
    (e) => {
      if (!resize || resize.id !== e.pointerId) return;
      const r = panel.getBoundingClientRect();
      apply({
        left: r.left,
        top: r.top,
        width: Math.min(target.innerWidth - r.left - 4, resize.width + e.clientX - resize.x),
        height: Math.min(target.innerHeight - r.top - 4, resize.height + e.clientY - resize.y),
      });
    },
    opts,
  );
  for (const node of [handle, grip])
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      node.addEventListener(type, stop, opts);
  target.addEventListener(
    'resize',
    () => {
      stop();
      restore();
    },
    opts,
  );
  const observer = new ResizeObserver(() => {
    if (!drag && !resize) save();
  });
  observer.observe(panel);
  restore();
  return {
    reset() {
      stop();
      clearStyle();
      try {
        storage.removeItem(key);
      } catch {
        /* Storage can be disabled. */
      }
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      abort.abort();
      observer.disconnect();
    },
  };
}
