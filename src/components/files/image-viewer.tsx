'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FilesClient } from '../../lib/files/client';

interface ImageSelection {
  readonly client: FilesClient;
  readonly id: string;
  readonly epoch: number;
  readonly url: string;
}
let selection: ImageSelection | null = null;
let request = 0;
const listeners = new Set<() => void>();
const snapshot = () => selection;
const emptySnapshot = () => null;
const emptySubscribe = () => () => {};
function update(next: ImageSelection | null) {
  selection = next;
  listeners.forEach((listener) => listener());
}
function close(expected: ImageSelection) {
  if (selection !== expected) return;
  request++;
  update(null);
}
export async function openAttachmentImage(client: FilesClient, id: string): Promise<void> {
  const pending = ++request;
  const epoch = client.getSnapshot().epoch;
  const url = await client.url(id);
  const state = client.getSnapshot();
  if (pending !== request || state.epoch !== epoch || Object.hasOwn(state.deleted, id)) return;
  update(Object.freeze({ client, id, epoch, url }));
}

/** One viewer for chat and legacy attachment hosts; identity/deletion invalidate the selection. */
export function AttachmentImageViewer() {
  const selected = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    emptySnapshot,
  );
  const files = useSyncExternalStore(
    selected?.client.subscribe ?? emptySubscribe,
    selected?.client.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const valid =
    !!selected && files?.epoch === selected.epoch && !Object.hasOwn(files.deleted, selected.id);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selected) return;
    if (!valid) {
      close(selected);
      return;
    }
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selected, valid]);
  if (!selected || !valid) return null;
  return (
    <dialog
      ref={dialog}
      className="attachment-image-viewer"
      data-image-file={selected.id}
      aria-label="Imagem anexada"
      onClose={() => close(selected)}
      onClick={(event) => {
        if (event.target === event.currentTarget) close(selected);
      }}
    >
      <img src={selected.url} alt="Imagem anexada" />
      <button type="button" aria-label="Fechar imagem" onClick={() => close(selected)}>
        ×
      </button>
    </dialog>
  );
}
