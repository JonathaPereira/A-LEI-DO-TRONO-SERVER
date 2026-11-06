'use client';

import { useSyncExternalStore } from 'react';
import { formatFileSize } from '../../lib/files/client';
import type { FileLibrary } from '../../lib/files/library';

/** One library view moves intact between web profile and desktop settings. */
export function FileLibraryFields({ client }: { client: FileLibrary }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <h3>Meus arquivos</h3>
      <button
        className="profile-files-load"
        type="button"
        disabled={!state.accountId || state.loading}
        onClick={() => {
          void client.refresh();
        }}
      >
        Ver meus arquivos
      </button>
      <p id="storageUsage" role="status">
        {state.loading
          ? 'Consultando…'
          : state.used !== null
            ? 'Uso compartilhado: ' + formatFileSize(state.used) + ' de 8 GB.'
            : ''}
      </p>
      <p id="profileFilesMessage" role="status" aria-live="polite">
        {state.message}
      </p>
      <div id="profileFiles">
        {state.files.map((file) => (
          <div key={file.id} className="profile-file-row" data-library-file={file.id}>
            <button
              type="button"
              onClick={() => {
                void client.download(file.id);
              }}
            >
              {file.name + ' · ' + formatFileSize(file.bytes)}
            </button>
            <button
              type="button"
              disabled={state.protectedIds.includes(file.id) || state.deletingIds.includes(file.id)}
              onClick={() => {
                void client.remove(file.id);
              }}
            >
              {state.deletingIds.includes(file.id) ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        ))}
        {state.hasMore && <p>A lista mostra seus 200 arquivos mais recentes.</p>}
      </div>
    </>
  );
}
