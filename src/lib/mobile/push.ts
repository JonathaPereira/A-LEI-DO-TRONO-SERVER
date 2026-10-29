import type { AccountSession } from '../auth/session';
import type { NetworkClient } from '../socket/client';

/** Registration uses the current account's authenticated HTTP port, never another socket. */
export function initializeAndroidPush(target: Window) {
  const host = target.TronoAndroid;
  if (!host) return;
  const runtime = target as Window & {
    TronoAuth: Pick<AccountSession, 'getSnapshot' | 'getAccessToken' | 'ready'>;
    TronoNetwork: NetworkClient;
    TronoPersonal: { get(key: string, fallback: unknown): unknown };
  };
  let generation = 0;
  const sync = async () => {
    const expected = ++generation;
    const id = runtime.TronoAuth.getSnapshot().user?.id ?? null;
    await host.setAccount(id);
    if (!id) return;
    const registration = await host.pushRegistration();
    if (!registration.configured || !registration.token || expected !== generation) return;
    const token = await runtime.TronoAuth.getAccessToken();
    if (!token || expected !== generation || runtime.TronoAuth.getSnapshot().user?.id !== id)
      return;
    const response = await target.fetch(
      `${runtime.TronoNetwork.BACKEND_HTTP}/mobile-push/register`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: registration.deviceId,
          token: registration.token,
          enabled:
            host.getPermission() === 'granted' &&
            runtime.TronoPersonal.get('notifications', 'mentions') !== 'off',
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok && response.status !== 503)
      throw Error('Não foi possível ativar as notificações push.');
  };
  const refresh = () => {
    void sync().catch((error) => console.warn('[Android] Avisos:', error));
  };
  target.addEventListener('trono-auth-change', refresh);
  target.addEventListener('trono-personal-change', refresh);
  target.addEventListener('trono-android-permission', refresh);
  target.document.addEventListener('visibilitychange', () => {
    if (target.document.visibilityState === 'visible') refresh();
  });
  target.addEventListener(
    'trono:ready',
    () => {
      void runtime.TronoAuth.ready.then(refresh);
    },
    { once: true },
  );
}
