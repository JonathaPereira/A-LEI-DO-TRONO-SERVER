import { observeLayout } from '../layout/observe-layout.ts';

interface HandSpace {
  count: number;
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  gap: number;
}
/** Keep the established card ratio and overlap when the desktop table is crowded. */
export function handGeometry(space: HandSpace) {
  const { count, width, height, paddingX, paddingY, gap } = space;
  if (!count || !width || !height) return null;
  const available = width - paddingX,
    cardWidth = (available - gap * (count - 1)) / count,
    room = Math.max(24, height - paddingY),
    cardHeight = Math.min(room, 126, Math.max(70, cardWidth * 1.4)),
    overlap =
      count > 1
        ? Math.min(0, (available - (count * cardHeight) / 1.4 - gap * (count - 1)) / (count - 1))
        : 0;
  return { height: cardHeight, overlap };
}
const installed = new WeakMap<Window, () => void>();
export function initializeHandLayout(target: Window) {
  if (installed.has(target)) return installed.get(target)!;
  const hand = target.document.getElementById('humanHand');
  if (!hand) return () => {};
  const stop = observeLayout(target, hand, () => {
    const style = target.getComputedStyle(hand),
      px = (value: string) => parseFloat(value) || 0;
    const size = handGeometry({
      count: hand.querySelectorAll('.hand-card').length,
      width: hand.clientWidth,
      height: hand.clientHeight,
      paddingX: px(style.paddingLeft) + px(style.paddingRight),
      paddingY: px(style.paddingTop) + px(style.paddingBottom),
      gap: px(style.columnGap),
    });
    if (!size) return;
    for (const [key, value] of [
      ['--hand-card-height', size.height],
      ['--hand-overlap', size.overlap],
    ] as const) {
      const pixels = value.toFixed(2) + 'px';
      if (hand.style.getPropertyValue(key) !== pixels) hand.style.setProperty(key, pixels);
    }
  });
  const dispose = () => {
    stop();
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
