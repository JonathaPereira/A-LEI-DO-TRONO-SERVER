import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createFileLibrary } from '../../lib/files/library';
import type { FileLibrary } from '../../lib/files/library';
import type { FilesClient } from '../../lib/files/client';
import { openFile } from '../../lib/files/open';
import { FileLibraryFields } from './library';

interface LibraryRuntime extends Window {
  TronoFiles: FilesClient;
  TronoFileLibrary?: FileLibrary;
  TronoProfile?: { getProtectedFileIds(): readonly string[] };
}

/** The legacy editor lends selected IDs; account/file state remains in the shared client. */
export function initializeFileLibrary(target: Window): FileLibrary {
  const runtime = target as LibraryRuntime;
  if (runtime.TronoFileLibrary) return runtime.TronoFileLibrary;
  const client = createFileLibrary({
    client: runtime.TronoFiles,
    getProtectedIds: () => runtime.TronoProfile?.getProtectedFileIds() ?? [],
    subscribeProfile(listener) {
      for (const event of ['trono-profile-change', 'trono-profile-draft-change'])
        target.addEventListener(event, listener);
      return () => {
        for (const event of ['trono-profile-change', 'trono-profile-draft-change'])
          target.removeEventListener(event, listener);
      };
    },
    openFile,
  });
  runtime.TronoFileLibrary = client;
  target.addEventListener('trono:ready', client.syncProtected, { once: true });
  const host = target.document.getElementById('profileFilesHost');
  if (host) flushSync(() => createRoot(host).render(<FileLibraryFields client={client} />));
  return client;
}
