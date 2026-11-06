import type { FilesClient } from '../files/client.ts';
import { record } from '../files/protocol.ts';
import { abortable } from '../http/abortable.ts';

export type SocialAction = 'snapshot' | 'friend' | 'read' | 'mark-read' | 'send';
interface SocialOptions {
  identity: Pick<FilesClient, 'getSnapshot' | 'subscribe'>;
  backendHttp: string;
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
}
/** One account-scoped HTTP transport. The existing socket remains the owner of live delivery. */
export function createSocialClient(options: SocialOptions) {
  let epoch = options.identity.getSnapshot().epoch,
    disposed = false;
  const requests = new Set<AbortController>();
  const unsubscribe = options.identity.subscribe(() => {
    const next = options.identity.getSnapshot().epoch;
    if (next === epoch) return;
    epoch = next;
    for (const request of requests) request.abort();
  });
  return {
    async request(action: SocialAction, body: object = {}, signal?: AbortSignal): Promise<unknown> {
      if (!['snapshot', 'friend', 'read', 'mark-read', 'send'].includes(action))
        throw new Error('Operação privada inválida.');
      const scope = options.identity.getSnapshot();
      if (disposed || !scope.accountId)
        throw new Error('Entre na sua conta para usar amigos e conversas.');
      const controller = new AbortController();
      requests.add(controller);
      const combined = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(15000),
        ...(signal ? [signal] : []),
      ]);
      const current = () => {
        if (disposed || options.identity.getSnapshot().epoch !== scope.epoch)
          throw new Error('A conta mudou. Abra a conversa novamente.');
        combined.throwIfAborted();
      };
      try {
        current();
        const token = await abortable(options.getAccessToken(), combined);
        current();
        if (!token) throw new Error('Entre na sua conta para usar amigos e conversas.');
        const response = await options.fetch(options.backendHttp + '/social/' + action, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: combined,
        });
        const data: unknown = await response.json().catch(() => null);
        current();
        if (!response.ok)
          throw new Error(
            record(data) && record(data.error) && typeof data.error.message === 'string'
              ? data.error.message
              : 'Não foi possível completar a operação.',
          );
        if (!record(data)) throw new Error('Resposta da conversa inválida.');
        return data;
      } finally {
        requests.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const request of requests) request.abort();
      requests.clear();
      unsubscribe();
    },
  };
}
export type SocialClient = ReturnType<typeof createSocialClient>;
