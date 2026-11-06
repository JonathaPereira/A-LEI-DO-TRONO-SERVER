import type { NetworkRuntime } from '../socket/browser.ts';
import { initializeNetwork } from '../socket/browser.ts';
import { createFiles } from './client.ts';
import type { FilesClient } from './client.ts';

export interface FilesRuntime
  extends NetworkRuntime, Pick<Window, 'addEventListener' | 'removeEventListener'> {
  TronoFiles?: FilesClient;
}
export function initializeFiles(runtime: FilesRuntime): FilesClient {
  if (runtime.TronoFiles) return runtime.TronoFiles;
  const network = initializeNetwork(runtime);
  const client = createFiles({
    backendHttp: network.BACKEND_HTTP,
    getAccount: () => runtime.TronoAuth?.user ?? null,
    getAccessToken: () => runtime.TronoAuth?.getAccessToken() ?? Promise.resolve(null),
    fetch: (input, options) => fetch(input, options),
    createUpload: () => new XMLHttpRequest(),
    subscribeIdentity: (listener) => {
      runtime.addEventListener('trono-auth-change', listener);
      runtime.addEventListener('trono-role-change', listener);
      return () => {
        runtime.removeEventListener('trono-auth-change', listener);
        runtime.removeEventListener('trono-role-change', listener);
      };
    },
    subscribeMessages: network.onMessage,
  });
  runtime.TronoFiles = client;
  return client;
}
