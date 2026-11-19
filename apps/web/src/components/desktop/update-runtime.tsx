import {
  createDesktopUpdates,
  type DesktopUpdatePort,
  type DesktopUpdates,
} from '../../lib/desktop/updates';
interface Runtime extends Window {
  TronoDesktop?: DesktopUpdatePort;
  TronoDesktopUpdates?: DesktopUpdates;
}
/** A page owns one projection of the native updater; React only observes it. */
export function initializeDesktopUpdates(target: Window): () => void {
  const runtime = target as Runtime;
  if (runtime.TronoDesktopUpdates) return runtime.TronoDesktopUpdates.dispose;
  const native = runtime.TronoDesktop;
  if (
    !native ||
    !['getUpdateState', 'onUpdateState', 'checkUpdates', 'installUpdate'].every(
      (key) => typeof Reflect.get(native, key) === 'function',
    )
  )
    return () => {};
  const client = createDesktopUpdates(native);
  runtime.TronoDesktopUpdates = client;
  const dispose = client.dispose;
  const leave = () => client.dispose();
  client.dispose = () => {
    target.removeEventListener('pagehide', leave);
    dispose();
    if (runtime.TronoDesktopUpdates === client) delete runtime.TronoDesktopUpdates;
  };
  target.addEventListener('pagehide', leave, { once: true });
  client.start();
  return client.dispose;
}
