/** Geometry for the existing soundboard menu; playback and actions remain with its owner. */
export function createDesktopEffectsLayout(target: Window) {
  const doc = target.document,
    menu = doc.getElementById('soundboardDialog');
  if (!menu) return () => {};
  let frame: number | undefined,
    disposed = false;
  function bounds(id: string) {
    const element = doc.getElementById(id),
      rect = element?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function position() {
    frame = undefined;
    if (disposed || !menu || menu.hidden) return;
    const button = doc.getElementById('soundboardToggle');
    if (!button) return;
    const topbar = bounds('workspaceHeader') ?? bounds('desktopTopBar'),
      bottom = bounds('callFocusDock') ?? bounds('layoutVoicePanel') ?? bounds('desktopCallDock'),
      topBound = (topbar?.bottom ?? 0) + 12,
      bottomBound = (bottom?.top ?? target.innerHeight) - 12;
    const height = Math.max(120, bottomBound - topBound) + 'px';
    if (menu.style.getPropertyValue('--desktop-effects-height') !== height)
      menu.style.setProperty('--desktop-effects-height', height);
    const top = Math.max(
        topBound,
        Math.min(button.getBoundingClientRect().top, bottomBound - menu.offsetHeight),
      ),
      value = top + 'px';
    if (menu.style.getPropertyValue('--desktop-effects-top') !== value)
      menu.style.setProperty('--desktop-effects-top', value);
  }
  function schedule() {
    if (!disposed && frame === undefined) frame = target.requestAnimationFrame(position);
  }
  const visibility = new MutationObserver(schedule),
    size = new ResizeObserver(schedule);
  visibility.observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  size.observe(menu);
  target.addEventListener('resize', schedule);
  target.addEventListener('trono-layout-change', schedule);
  schedule();
  return () => {
    disposed = true;
    if (frame !== undefined) target.cancelAnimationFrame(frame);
    visibility.disconnect();
    size.disconnect();
    target.removeEventListener('resize', schedule);
    target.removeEventListener('trono-layout-change', schedule);
    menu.style.removeProperty('--desktop-effects-top');
    menu.style.removeProperty('--desktop-effects-height');
  };
}
