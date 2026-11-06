import type { AccountSession } from '../auth/session';
import type { NetworkClient } from '../socket/client';

/** Registration uses the current account's authenticated HTTP port, never another socket. */
export function initializeAndroidPush(target: Window) {
  const host = target.TronoAndroid;
  if (!host) return;
  const runtime = target as Window & {
    TronoAuth: Pick<AccountSession, 'getSnapshot' | 'getAccessToken' | 'ready'>;
    TronoNetwork: NetworkClient;
    TronoPersonal: {
      get(key: string, fallback: unknown): unknown;
      mutedTargets(): readonly string[];
    };
  };
  let generation = 0;
  let sessionReady = false;
  let registrations = Promise.resolve();
  const sync = async (expected: number, id: string | null) => {
    if (!id || expected !== generation) return;
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
    if (!sessionReady) return;
    const expected = ++generation;
    const id = runtime.TronoAuth.getSnapshot().user?.id ?? null;
    const enabled =
      host.getPermission() === 'granted' &&
      runtime.TronoPersonal.get('notifications', 'mentions') !== 'off';
    void host.setAccount(id, enabled, runtime.TronoPersonal.mutedTargets()).catch(console.warn);
    // A replacement must not race an already committed registration from the previous account.
    registrations = registrations.catch(() => {}).then(() => sync(expected, id));
    void registrations.catch((error) => console.warn('[Android] Avisos:', error));
  };
  target.addEventListener('trono-auth-change', refresh);
  target.addEventListener('trono-personal-change', (event) => {
    const key: unknown = (event as CustomEvent<{ key?: unknown }>).detail?.key;
    if (key === 'notifications' || (typeof key === 'string' && key.startsWith('mute:'))) refresh();
  });
  target.addEventListener('trono-android-permission', refresh);
  target.document.addEventListener('visibilitychange', () => {
    if (target.document.visibilityState === 'visible') refresh();
  });
  target.addEventListener(
    'trono:ready',
    () => {
      void runtime.TronoAuth.ready.then(() => {
        sessionReady = true;
        refresh();
      });
    },
    { once: true },
  );
}
