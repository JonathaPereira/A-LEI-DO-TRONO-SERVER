interface InputMode {
  mode: 'pointer' | 'keyboard';
  users: number;
  release(): void;
}
const inputModes = new WeakMap<Document, InputMode>();
/** Share modality only. Activity in another player must never reset this player's clock. */
function acquireInput(doc: Document) {
  const previous = inputModes.get(doc);
  if (previous) {
    previous.users++;
    return previous;
  }
  const pointer = () => {
    input.mode = 'pointer';
  };
  const keyboard = () => {
    input.mode = 'keyboard';
  };
  const input: InputMode = {
    mode: 'pointer',
    users: 1,
    release() {
      if (--input.users) return;
      doc.removeEventListener('pointerdown', pointer, true);
      doc.removeEventListener('keydown', keyboard, true);
      inputModes.delete(doc);
    },
  };
  doc.addEventListener('pointerdown', pointer, true);
  doc.addEventListener('keydown', keyboard, true);
  inputModes.set(doc, input);
  return input;
}
interface Options {
  delay?(callback: () => void, milliseconds: number): () => void;
}
export interface StreamControls {
  update(active: boolean): void;
  dispose(): void;
}
const bindings = new WeakMap<HTMLElement, StreamControls>();
const delay = (callback: () => void, milliseconds: number) => {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
};

/** Owns visual idle state and listeners only; borrows the existing player and never touches media. */
export function bindStreamControls(tile: HTMLElement, options: Options = {}): StreamControls {
  const previous = bindings.get(tile);
  if (previous) return previous;
  const doc = tile.ownerDocument,
    input = acquireInput(doc),
    events = new AbortController(),
    signal = events.signal,
    pressed = new Set<number>(),
    tabIndex = tile.getAttribute('tabindex');
  let active = false,
    keyboardFocus = false,
    disposed = false,
    cancel: (() => void) | null = null;
  tile.tabIndex = 0;
  function clear() {
    cancel?.();
    cancel = null;
  }
  function arm() {
    clear();
    if (!active || pressed.size || keyboardFocus || disposed) return;
    cancel = (options.delay ?? delay)(() => {
      cancel = null;
      if (disposed || !active) return;
      if (!tile.isConnected) dispose();
      else tile.classList.add('screen-controls-idle');
    }, 3000);
  }
  function reveal() {
    tile.classList.remove('screen-controls-idle');
    arm();
  }
  const pointerActivity = () => {
    keyboardFocus = false;
    reveal();
  };
  const releasePointer = (event: PointerEvent) => {
    if (!pressed.delete(event.pointerId)) return;
    arm();
  };
  tile.addEventListener('pointerenter', pointerActivity, { signal });
  tile.addEventListener('pointermove', pointerActivity, { signal });
  tile.addEventListener(
    'pointerdown',
    (event) => {
      pressed.add(event.pointerId);
      pointerActivity();
    },
    { signal },
  );
  // Capture release even when a child handles the event or the drag ends outside the tile.
  doc.addEventListener('pointerup', releasePointer, { signal, capture: true });
  doc.addEventListener('pointercancel', releasePointer, { signal, capture: true });
  tile.addEventListener(
    'keydown',
    () => {
      keyboardFocus = true;
      reveal();
    },
    { signal },
  );
  tile.addEventListener(
    'focusin',
    () => {
      keyboardFocus = input.mode === 'keyboard';
      reveal();
    },
    { signal },
  );
  tile.addEventListener(
    'focusout',
    (event) => {
      if (!tile.contains(event.relatedTarget as Node | null)) {
        keyboardFocus = false;
        arm();
      }
    },
    { signal },
  );
  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    events.abort();
    input.release();
    bindings.delete(tile);
    tile.classList.remove('screen-controls-idle');
    if (tabIndex === null) tile.removeAttribute('tabindex');
    else tile.setAttribute('tabindex', tabIndex);
  }
  const controls: StreamControls = {
    update(next) {
      if (disposed || active === next) return;
      active = next;
      reveal();
    },
    dispose,
  };
  bindings.set(tile, controls);
  return controls;
}
