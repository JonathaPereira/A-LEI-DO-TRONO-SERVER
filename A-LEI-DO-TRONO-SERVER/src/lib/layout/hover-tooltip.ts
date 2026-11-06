export interface TooltipContent {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}
export function tooltipPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const pad = 14,
    gap = 16;
  let x = point.x + gap,
    y = point.y - size.height - gap;
  if (x + size.width + pad > viewport.width) x = point.x - size.width - gap;
  if (y < pad) y = point.y + gap;
  return {
    x: Math.max(pad, Math.min(x, viewport.width - size.width - pad)),
    y: Math.max(pad, Math.min(y, viewport.height - size.height - pad)),
  };
}
/** One delegated interaction owner; React alone writes the tooltip contents and geometry. */
export function bindHoverTooltip(target: Window, publish: (view: TooltipContent | null) => void) {
  const doc = target.document;
  let hovered: HTMLElement | null = null,
    focused: HTMLElement | null = null;
  let described: HTMLElement | null = null,
    addedDescription = false;
  let frame: number | null = null,
    observing = false;
  let point = { x: 0, y: 0 },
    view: TooltipContent | null = null;
  const observer = new MutationObserver(() => {
    if (hovered || focused) present();
  });
  function watch(active: boolean) {
    if (active === observing) return;
    observing = active;
    if (!active) observer.disconnect();
    else
      observer.observe(doc.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-tooltip', 'class', 'style', 'hidden', 'open'],
      });
  }
  const find = (node: EventTarget | null) =>
    node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null;
  function describe(node: HTMLElement | null) {
    if (described === node) return;
    if (described && addedDescription) {
      const ids = (described.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== 'hoverTooltip');
      if (ids.length) described.setAttribute('aria-describedby', ids.join(' '));
      else described.removeAttribute('aria-describedby');
    }
    described = node;
    addedDescription = false;
    if (node) {
      const ids = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      addedDescription = !ids.includes('hoverTooltip');
      if (addedDescription)
        node.setAttribute('aria-describedby', [...ids, 'hoverTooltip'].join(' '));
    }
  }
  function update(next: TooltipContent | null) {
    if (view?.text === next?.text && view?.x === next?.x && view?.y === next?.y) return;
    view = next;
    publish(next);
  }
  function clear() {
    hovered = focused = null;
    watch(false);
    if (frame !== null) target.cancelAnimationFrame(frame);
    frame = null;
    describe(null);
    update(null);
  }
  function present() {
    const anchor = hovered || focused;
    if (!anchor) {
      watch(false);
      describe(null);
      update(null);
      return;
    }
    const text = anchor.dataset.tooltip?.trim();
    if (
      !anchor.isConnected ||
      !anchor.getClientRects().length ||
      !text ||
      doc.hidden ||
      doc.querySelector('dialog[open]')
    ) {
      clear();
      return;
    }
    watch(true);
    describe(anchor);
    const rect = anchor.getBoundingClientRect();
    const at = anchor === hovered ? point : { x: rect.left + rect.width / 2, y: rect.bottom };
    update({ text, ...at });
  }
  const over = (event: PointerEvent) => {
    const node = find(event.target);
    if (!node || node.contains(event.relatedTarget as Node | null)) return;
    hovered = node;
    point = { x: event.clientX, y: event.clientY };
    present();
  };
  const move = (event: PointerEvent) => {
    if (!hovered) return;
    point = { x: event.clientX, y: event.clientY };
    if (frame === null)
      frame = target.requestAnimationFrame(() => {
        frame = null;
        present();
      });
  };
  const out = (event: PointerEvent) => {
    if (!hovered || hovered.contains(event.relatedTarget as Node | null)) return;
    hovered = null;
    present();
  };
  const focus = (event: FocusEvent) => {
    focused = find(event.target);
    present();
  };
  const blur = (event: FocusEvent) => {
    focused = find(event.relatedTarget);
    present();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    clear();
  };
  const visibility = () => {
    if (doc.hidden) clear();
  };
  doc.addEventListener('pointerover', over);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerout', out);
  doc.addEventListener('focusin', focus);
  doc.addEventListener('focusout', blur);
  doc.addEventListener('keydown', key);
  doc.addEventListener('scroll', clear, true);
  doc.addEventListener('visibilitychange', visibility);
  target.addEventListener('blur', clear);
  target.addEventListener('resize', clear);
  return () => {
    observer.disconnect();
    doc.removeEventListener('pointerover', over);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerout', out);
    doc.removeEventListener('focusin', focus);
    doc.removeEventListener('focusout', blur);
    doc.removeEventListener('keydown', key);
    doc.removeEventListener('scroll', clear, true);
    doc.removeEventListener('visibilitychange', visibility);
    target.removeEventListener('blur', clear);
    target.removeEventListener('resize', clear);
    clear();
  };
}
