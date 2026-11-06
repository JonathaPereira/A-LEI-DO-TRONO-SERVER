import type { SplendorEvent, SplendorPhase, SplendorRules } from '../../types/splendor';
interface Options {
  content: HTMLElement;
  layer: HTMLElement;
  visible(): boolean;
  reduced(): boolean;
  rules: SplendorRules;
}
/** Animates disposable decorations only; the React table is measured, never rewritten. */
export function createSplendorAnimations(options: Options) {
  const { content, layer, rules } = options,
    frames = new Set<number>(),
    animations = new Map<HTMLElement, Animation>();
  let version = 0,
    disposed = false;
  function defer(fn: () => void) {
    if (disposed) return;
    const ticket = version,
      id = requestAnimationFrame(() => {
        frames.delete(id);
        if (!disposed && version === ticket && options.visible() && !options.reduced()) fn();
      });
    frames.add(id);
  }
  const player = (id: string) =>
    [...content.querySelectorAll<HTMLElement>('[data-player]')].find(
      (n) => n.dataset.player === id,
    );
  function source(e: SplendorEvent) {
    if (e.card)
      return [...content.querySelectorAll<HTMLElement>('[data-card]')].find(
        (n) => n.dataset.card === e.card!.id,
      );
    if (e.noble)
      return [...content.querySelectorAll<HTMLElement>('[data-noble]')].find(
        (n) => n.dataset.noble === e.noble!.id,
      );
    if (e.level) return content.querySelector<HTMLElement>('.sp-level-' + e.level);
  }
  function fly(
    from: Element | DOMRect | null | undefined,
    to: Element | null | undefined,
    decoration: Element | null | undefined,
    color: number | null = null,
    delay = 0,
  ) {
    const a = from instanceof Element ? from.getBoundingClientRect() : from,
      b = to?.getBoundingClientRect();
    if (!a?.width || !b?.width) return;
    const node = document.createElement('span');
    node.className = 'sp-flight';
    node.setAttribute('aria-hidden', 'true');
    if (color === null && decoration) {
      const clone = decoration.cloneNode(true) as HTMLElement;
      for (const item of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
        item.removeAttribute('id');
        if (item instanceof HTMLButtonElement) item.disabled = true;
      }
      node.append(clone);
    } else {
      const gem = document.createElement('span');
      gem.className = 'sp-gem sp-gem-' + (color ?? 5) + ' sp-chip';
      const symbol = document.createElement('i');
      symbol.textContent = rules.symbols[color ?? 5];
      gem.append(symbol);
      node.append(gem);
    }
    Object.assign(node.style, {
      left: a.left + 'px',
      top: a.top + 'px',
      width: (color === null ? Math.max(38, Math.min(110, a.width)) : 36) + 'px',
    });
    layer.append(node);
    const dx = b.left + b.width / 2 - a.left,
      dy = b.top + b.height / 2 - a.top;
    const animation = node.animate(
      [
        { transform: 'translate(0,0) rotate(-7deg)', opacity: 0 },
        { transform: 'translate(0,-12px) scale(1.08)', opacity: 1, offset: 0.15 },
        {
          transform: `translate(${dx * 0.5}px,${dy * 0.5 - 36}px) rotate(7deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0 },
      ],
      { duration: 1800, delay, easing: 'cubic-bezier(.22,.6,.23,1)', fill: 'both' },
    );
    animations.set(node, animation);
    void animation.finished
      .catch(() => {})
      .finally(() => {
        animations.delete(node);
        node.remove();
      });
  }
  function tokens(v: number[] | undefined, id: string, toBank: boolean) {
    let count = 0;
    for (let color = 0; color < 6; color++)
      for (let n = 0; n < (v?.[color] ?? 0); n++) {
        const bank = content.querySelector(`[data-token="${color}"]`),
          wallet = player(id)?.querySelector(`[data-wallet-color="${color}"]`);
        fly(
          toBank ? (wallet ?? undefined) : (bank ?? undefined),
          toBank ? bank : wallet,
          undefined,
          color,
          count++ * 90,
        );
      }
  }
  function effect(e: SplendorEvent, phase: SplendorPhase) {
    defer(() => {
      if (phase === 'payment') tokens(e.payment, e.playerId, true);
      else if (phase === 'returned') tokens(e.returned, e.playerId, true);
      else if (e.kind === 'take') tokens(e.tokens, e.playerId, false);
      else {
        const from = source(e);
        fly(
          from,
          player(e.playerId)?.querySelector(e.noble ? 'header' : '.sp-reserved'),
          e.card || e.noble ? from : undefined,
        );
        if (e.gold) tokens([0, 0, 0, 0, 0, e.gold], e.playerId, false);
      }
    });
  }
  function capturePurchase(e: SplendorEvent) {
    const hero = content.querySelector<HTMLElement>('.sp-purchase-showcase .sp-card'),
      rect = hero?.getBoundingClientRect();
    if (!hero || !rect || !e.card) return;
    const image = hero.cloneNode(true) as HTMLElement;
    return () =>
      defer(() =>
        fly(rect, player(e.playerId)?.querySelector(`[data-bonus="${e.card!.bonus}"]`), image),
      );
  }
  function cancel() {
    version++;
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
    animations.forEach((a, n) => {
      a.cancel();
      n.remove();
    });
    animations.clear();
  }
  return {
    effect,
    capturePurchase,
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
