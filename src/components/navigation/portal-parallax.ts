import { useEffect, useRef } from 'react';

/** The stage alone owns its visual offsets. All pending frames/listeners are released. */
export function usePortalParallax() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const stage = ref.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      stage.style.setProperty('--px', '0');
      stage.style.setProperty('--py', '0');
    };
    const observer = new MutationObserver(reset);
    observer.observe(stage.closest('section')!, { attributes: true, attributeFilter: ['class'] });
    const move = (event: PointerEvent) => {
      if (frame || motion.matches || document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = stage.getBoundingClientRect();
        if (!r.width || !r.height) return reset();
        const offset = (point: number, start: number, size: number) =>
          Math.max(-1, Math.min(1, ((point - start) / size - 0.5) * 2)).toFixed(3);
        stage.style.setProperty('--px', offset(event.clientX, r.left, r.width));
        stage.style.setProperty('--py', offset(event.clientY, r.top, r.height));
      });
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', reset);
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    motion.addEventListener('change', reset);
    return () => {
      reset();
      observer.disconnect();
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', reset);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
      motion.removeEventListener('change', reset);
    };
  }, []);
  return ref;
}
