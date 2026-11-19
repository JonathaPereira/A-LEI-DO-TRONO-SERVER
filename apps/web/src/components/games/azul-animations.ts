import type { AzulDetail, AzulRoom } from '../../types/azul';

interface Options {
  screen: HTMLElement;
  content: HTMLElement;
  layer: HTMLElement;
  visible(): boolean;
  reducedMotion(): boolean;
  sound(kind: string): void;
}
/** The empty effects layer is the only DOM this adapter writes. Board cells remain React-owned. */
export function createAzulAnimations(options: Options) {
  const { screen, content, layer } = options,
    frames = new Set<number>(),
    running = new Map<HTMLElement, Animation>();
  let version = 0,
    disposed = false;
  function defer(fn: () => void) {
    const operation = version;
    const id = requestAnimationFrame(() => {
      frames.delete(id);
      if (!disposed && operation === version && options.visible() && !options.reducedMotion()) fn();
    });
    frames.add(id);
  }
  function animate(node: HTMLElement, keys: Keyframe[], duration: number, easing: string) {
    layer.append(node);
    const animation = node.animate(keys, { duration, easing, fill: 'forwards' });
    running.set(node, animation);
    void animation.finished
      .catch(() => {})
      .finally(() => {
        running.delete(node);
        node.remove();
      });
  }
  function fly(
    color: number,
    from: DOMRect | undefined,
    to: Element | null | undefined,
    duration = 700,
  ) {
    const a = from,
      b = to?.getBoundingClientRect();
    if (!a?.width || !b?.width) return;
    const node = document.createElement('span');
    node.className = 'az-tile az-color-' + color + ' az-flying-tile';
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, {
      left: a.left + 'px',
      top: a.top + 'px',
      width: a.width + 'px',
      height: a.height + 'px',
    });
    animate(
      node,
      [
        { transform: 'translate(0,0) rotate(-5deg) scale(1)', opacity: 1 },
        {
          transform: `translate(${(b.left - a.left) * 0.5}px,${(b.top - a.top) * 0.5 - 25}px) rotate(8deg) scale(1.15)`,
          offset: 0.5,
        },
        {
          transform: `translate(${b.left - a.left}px,${b.top - a.top}px) rotate(0) scale(${b.width / a.width})`,
          opacity: 1,
        },
      ],
      duration,
      'cubic-bezier(.3,.1,.2,1)',
    );
  }
  function boardFor(id: string) {
    return [...content.querySelectorAll<HTMLElement>('[data-azul-player]')].find(
      (node) => node.dataset.azulPlayer === id,
    );
  }
  function focusFor(step: AzulDetail) {
    const board = boardFor(step.playerId);
    return step.kind === 'placement'
      ? board?.querySelector(`[data-cell="${step.row},${step.col}"]`)
      : step.kind === 'floor'
        ? board?.querySelector('.az-floor')
        : board;
  }
  function step(step: AzulDetail, points: boolean) {
    defer(() => {
      const board = boardFor(step.playerId),
        source = focusFor(step);
      if (!points) {
        const bounds = source?.getBoundingClientRect(),
          area = screen.getBoundingClientRect(),
          banner = content.querySelector<HTMLElement>('.az-scoring-banner')?.offsetHeight ?? 0;
        if (bounds && (bounds.top < area.top + banner + 12 || bounds.bottom > area.bottom - 12))
          source?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        if (step.kind === 'placement')
          fly(
            step.color,
            board
              ?.querySelector(`[data-azul-row="${step.row}"] .az-tile:last-child`)
              ?.getBoundingClientRect(),
            source,
          );
        return;
      }
      const a = source?.getBoundingClientRect(),
        b = board?.querySelector('.az-score-plaque')?.getBoundingClientRect();
      if (!a || !b) return;
      const node = document.createElement('b');
      node.className = 'az-score-flight';
      node.textContent = step.kind === 'floor' ? '−' + step.applied : '+' + step.points;
      node.setAttribute('aria-hidden', 'true');
      Object.assign(node.style, {
        left: a.left + a.width / 2 + 'px',
        top: a.top + a.height / 2 + 'px',
      });
      animate(
        node,
        [
          { transform: 'translate(-50%,-50%) scale(.75)', opacity: 0 },
          { transform: 'translate(-50%,-65%) scale(1.2)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%,-90%) scale(1)', opacity: 1, offset: 0.55 },
          {
            transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top - a.top - a.height / 2}px) scale(.65)`,
            opacity: 0,
          },
        ],
        1850,
        'ease-in-out',
      );
    });
  }
  function captureMove(room: AzulRoom) {
    const move = room.state?.last;
    if (!move || !options.visible() || options.reducedMotion()) return;
    const rect = content
      .querySelector(`.az-pick[data-source="${move.source}"][data-color="${move.color}"]`)
      ?.getBoundingClientRect();
    if (!rect) return;
    return () =>
      defer(() => {
        const board = boardFor(move.playerId),
          target =
            move.row >= 0
              ? board?.querySelector(`[data-azul-row="${move.row}"] .az-tile`)
              : [...(board?.querySelectorAll('.az-floor-slot .az-tile') ?? [])].at(-1);
        fly(move.color, rect, target, 650);
        options.sound('azul-place');
      });
  }
  function cancel() {
    version++;
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
    running.forEach((animation, node) => {
      animation.cancel();
      node.remove();
    });
    running.clear();
  }
  return {
    step,
    captureMove,
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
