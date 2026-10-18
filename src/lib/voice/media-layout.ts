import { observeLayout } from '../layout/observe-layout.ts';

export function screenGrid(count: number, width: number) {
  const columns = count <= 1 ? 1 : count > 2 || width >= 600 ? 2 : 1;
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) };
}
const installed = new WeakMap<Window, () => void>();
/** CSS geometry only. Docked streams keep their existing players outside this grid. */
export function initializeMediaLayout(target: Window) {
  if (installed.has(target)) return installed.get(target)!;
  const stage = target.document.querySelector<HTMLElement>('.mn-media-stage'),
    grid = target.document.getElementById('screenShareGrid');
  if (!stage || !grid) return () => {};
  const fit = () => {
    const count = [...grid.children].filter((el) =>
      el.classList.contains('screen-share-tile'),
    ).length;
    const { columns, rows } = screenGrid(count, stage.clientWidth);
    for (const [key, value] of [
      ['--stream-columns', columns],
      ['--stream-rows', rows],
    ] as const)
      if (grid.style.getPropertyValue(key) !== String(value))
        grid.style.setProperty(key, String(value));
  };
  // Stage resizing and direct grid child changes have separate observation boundaries.
  const stop = observeLayout(target, grid, fit, stage);
  const dispose = () => {
    stop();
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
