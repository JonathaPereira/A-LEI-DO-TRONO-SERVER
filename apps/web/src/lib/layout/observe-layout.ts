/** Coalesce size/child changes into one frame and release every observer on disposal. */
export function observeLayout(
  target: Window,
  element: HTMLElement,
  fit: () => void,
  sizeElement = element,
) {
  let frame: number | undefined,
    disposed = false;
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    frame = target.requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed) fit();
    });
  };
  const size = new ResizeObserver(schedule),
    children = new MutationObserver(schedule);
  size.observe(sizeElement);
  children.observe(element, { childList: true });
  schedule();
  return () => {
    disposed = true;
    if (frame !== undefined) target.cancelAnimationFrame(frame);
    size.disconnect();
    children.disconnect();
  };
}
