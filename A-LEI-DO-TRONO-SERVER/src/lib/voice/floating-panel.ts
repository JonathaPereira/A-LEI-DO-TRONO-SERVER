interface FloatingPanelOptions {
  document: Document;
  window: Pick<Window, 'innerWidth' | 'innerHeight' | 'addEventListener' | 'removeEventListener'>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  inChatHub(): boolean;
  onChange(): void;
}
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
const RECT_KEY = 'tronoSocialFloatingRectV3';
const properties = ['left', 'top', 'right', 'bottom', 'width', 'height'] as const;
/** Owns only the floating panel's geometry and pointer lifecycle, never its children. */
export function createFloatingPanel(options: FloatingPanelOptions) {
  const { document: doc, window: viewport, storage } = options;
  const get = (id: string) => doc.getElementById(id);
  const panel = () => get('socialPanel');
  const floating = () => !options.inChatHub();
  const enabled = () => floating() && viewport.innerWidth > 760;
  let disposed = false,
    started = false;
  const cleanups: (() => void)[] = [];
  let gesture: {
    pointer: number;
    handle: HTMLElement;
    x: number;
    y: number;
    rect: Rect;
    resize: boolean;
  } | null = null;
  function clear() {
    const style = panel()?.style;
    if (style) for (const property of properties) style[property] = '';
  }
  function cancel() {
    const previous = gesture;
    gesture = null;
    panel()?.classList.remove('resizing');
    if (previous?.handle.hasPointerCapture?.(previous.pointer))
      previous.handle.releasePointerCapture(previous.pointer);
  }
  function restore() {
    if (!enabled()) {
      clear();
      return;
    }
    const el = panel();
    if (!el) return;
    try {
      const value: unknown = JSON.parse(storage.getItem(RECT_KEY) || 'null');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const saved = value as Record<string, unknown>;
      const number = (key: string, fallback: number) =>
        typeof saved[key] === 'number' && Number.isFinite(saved[key])
          ? (saved[key] as number)
          : fallback;
      const width = Math.min(
          viewport.innerWidth - 16,
          Math.max(280, Math.min(number('width', 360), 460)),
        ),
        height = Math.min(
          viewport.innerHeight - 16,
          Math.max(220, Math.min(number('height', 360), 560)),
        ),
        left = Math.max(0, Math.min(number('left', 0), viewport.innerWidth - width)),
        top = Math.max(0, Math.min(number('top', 0), viewport.innerHeight - height));
      Object.assign(el.style, {
        width: width + 'px',
        height: height + 'px',
        left: left + 'px',
        top: top + 'px',
        right: 'auto',
        bottom: 'auto',
      });
    } catch {
      /* Invalid or unavailable local preferences use the stylesheet's defaults. */
    }
  }
  function persist() {
    if (!enabled()) return;
    const r = panel()?.getBoundingClientRect();
    if (r)
      storage.setItem(
        RECT_KEY,
        JSON.stringify({
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }),
      );
  }
  function apply() {
    if (disposed) return;
    cancel();
    const el = panel(),
      hub = options.inChatHub();
    if (!el) return;
    el.classList.toggle('social-chat-hub', hub);
    el.classList.remove('social-full');
    el.classList.toggle('social-floating', !hub);
    const mode = get('socialModeBtn');
    if (mode) {
      mode.classList.toggle('hidden', hub);
      mode.textContent = 'Ampliar';
      mode.title = 'Ampliar câmeras e telas da chamada';
    }
    clear();
    restore();
    storage.setItem('tronoSocialMode', 'floating');
    options.onChange();
  }
  function bind(handle: HTMLElement, resize: boolean) {
    function down(event: PointerEvent) {
      const el = panel();
      if (
        !el ||
        !enabled() ||
        gesture ||
        event.button !== 0 ||
        (event.target as Element).closest('button')
      )
        return;
      const rect = el.getBoundingClientRect();
      gesture = {
        pointer: event.pointerId,
        handle,
        x: event.clientX,
        y: event.clientY,
        rect,
        resize,
      };
      handle.setPointerCapture?.(event.pointerId);
      el.classList.toggle('resizing', resize);
      event.preventDefault();
      if (resize) event.stopPropagation();
    }
    function move(event: PointerEvent) {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (!enabled()) {
        cancel();
        return;
      }
      const el = panel();
      if (!el) return;
      const { rect, x, y } = gesture;
      if (resize) {
        const maxW = Math.max(0, viewport.innerWidth - rect.left - 4),
          maxH = Math.max(0, viewport.innerHeight - rect.top - 4);
        el.style.width = Math.min(maxW, Math.max(330, rect.width + event.clientX - x)) + 'px';
        el.style.height = Math.min(maxH, Math.max(330, rect.height + event.clientY - y)) + 'px';
      } else {
        el.style.left =
          Math.max(
            0,
            Math.min(viewport.innerWidth - el.offsetWidth, rect.left + event.clientX - x),
          ) + 'px';
        el.style.top =
          Math.max(
            0,
            Math.min(viewport.innerHeight - el.offsetHeight, rect.top + event.clientY - y),
          ) + 'px';
      }
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    function up(event: PointerEvent) {
      if (gesture?.pointer !== event.pointerId) return;
      persist();
      cancel();
    }
    function reset(event: MouseEvent) {
      event.stopPropagation();
      cancel();
      storage.removeItem(RECT_KEY);
      clear();
    }
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      handle.addEventListener(event, up);
    if (resize) handle.addEventListener('dblclick', reset);
    cleanups.push(() => {
      handle.removeEventListener('pointerdown', down);
      handle.removeEventListener('pointermove', move);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
        handle.removeEventListener(event, up);
      handle.removeEventListener('dblclick', reset);
    });
  }
  function resized() {
    cancel();
    restore();
    options.onChange();
  }
  return {
    apply,
    start() {
      if (started || disposed) return;
      started = true;
      const handle = get('socialDragHandle'),
        grip = get('socialResizeGrip');
      if (handle) bind(handle, false);
      if (grip) bind(grip, true);
      viewport.addEventListener('resize', resized);
    },
    dispose() {
      disposed = true;
      cancel();
      for (const cleanup of cleanups.splice(0)) cleanup();
      viewport.removeEventListener('resize', resized);
    },
  };
}
