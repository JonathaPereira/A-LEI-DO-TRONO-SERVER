import {
  createAndroidUpdates,
  type AndroidUpdatePort,
  type AndroidUpdates,
} from '../../lib/mobile/android-updates';

interface Runtime extends Window {
  TronoAndroidUpdates?: AndroidUpdates;
}

/** Single-owner projection of the native Android APK updater; React only observes snapshots. */
export function initializeAndroidUpdates(target: Window): () => void {
  const runtime = target as Runtime;
  if (runtime.TronoAndroidUpdates) return runtime.TronoAndroidUpdates.dispose;
  const native = runtime.TronoAndroid;
  if (
    !native ||
    !['getUpdateState', 'onUpdateState', 'checkUpdates', 'downloadUpdate', 'installUpdate'].every(
      (key) => typeof Reflect.get(native, key) === 'function',
    )
  )
    return () => {};
  const client = createAndroidUpdates(native as AndroidUpdatePort);
  runtime.TronoAndroidUpdates = client;
  const dispose = client.dispose;
  const leave = () => client.dispose();
  client.dispose = () => {
    target.removeEventListener('pagehide', leave);
    dispose();
    if (runtime.TronoAndroidUpdates === client) delete runtime.TronoAndroidUpdates;
  };
  target.addEventListener('pagehide', leave, { once: true });
  client.start();
  return client.dispose;
}
