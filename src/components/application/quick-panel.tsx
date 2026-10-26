'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './quick-panel.module.css';
/** A single anchored popover; hover never steals keyboard focus. */
export function QuickPanel({
  label,
  trigger,
  children,
  hover = false,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  hover?: boolean;
}) {
  const id = useId(),
    panel = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const position = () => {
    const n = panel.current,
      b = button.current?.getBoundingClientRect();
    if (!n || !b) return;
    const box = n.getBoundingClientRect();
    n.style.left = Math.max(12, Math.min(b.left, window.innerWidth - box.width - 12)) + 'px';
    n.style.top =
      Math.max(12, Math.min(b.top - box.height - 10, window.innerHeight - box.height - 12)) + 'px';
  };
  const show = () => {
    clear();
    if (!button.current?.getClientRects().length) return;
    panel.current?.showPopover();
    position();
  };
  const leave = () => {
    clear();
    timer.current = setTimeout(() => {
      if (!panel.current?.contains(document.activeElement)) panel.current?.hidePopover();
    }, 220);
  };
  useEffect(() => {
    const close = () => panel.current?.hidePopover();
    const resize = new ResizeObserver(() => {
      if (panel.current?.matches(':popover-open')) position();
    });
    if (panel.current) resize.observe(panel.current);
    window.addEventListener('resize', close);
    return () => {
      resize.disconnect();
      clear();
      window.removeEventListener('resize', close);
    };
  }, []);
  return (
    <span
      className={styles.host}
      onPointerEnter={(e) => {
        if (hover && e.pointerType === 'mouse') {
          clear();
          timer.current = setTimeout(show, 200);
        }
      }}
      onPointerLeave={hover ? leave : undefined}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        popoverTarget={id}
        onClick={() => {
          clear();
          requestAnimationFrame(position);
        }}
      >
        {trigger}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        className={styles.panel}
        onPointerEnter={clear}
        onPointerLeave={hover ? leave : undefined}
        onClick={(e) => {
          if ((e.target as Element).closest('[data-close-panel]')) panel.current?.hidePopover();
        }}
      >
        {children}
      </div>
    </span>
  );
}
