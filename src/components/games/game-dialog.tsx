import { useRef, useLayoutEffect } from 'react';
import type { ComponentProps } from 'react';
export function GameDialog({
  visible,
  onDismiss,
  ...props
}: Omit<ComponentProps<'dialog'>, 'open' | 'onClose' | 'onCancel'> & {
  visible: boolean;
  onDismiss(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    if (visible && !dialog.open) dialog.showModal();
    else if (!visible && dialog.open) dialog.close();
  }, [visible]);
  return (
    <dialog
      {...props}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
      onClose={() => {
        if (visible && !ref.current?.open) onDismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onDismiss();
        }
      }}
    />
  );
}
