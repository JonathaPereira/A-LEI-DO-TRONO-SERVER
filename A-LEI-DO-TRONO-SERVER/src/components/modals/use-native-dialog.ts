'use client';
import { useLayoutEffect } from 'react';

/** React owns content/state; native close is also available synchronously to media commands. */
export function useNativeDialog(dialog: HTMLDialogElement, open: boolean, close: () => void) {
  useLayoutEffect(() => {
    const onClose = () => {
      if (!dialog.open) close();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [dialog, close]);
  useLayoutEffect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [dialog, open]);
}
