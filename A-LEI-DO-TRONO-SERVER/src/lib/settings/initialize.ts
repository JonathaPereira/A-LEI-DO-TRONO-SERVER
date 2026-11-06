import { createSettingsController } from './controller';
import type { SettingsRuntime } from './runtime';
/** Prepare state without mounting a presentation or acquiring media. */
export function prepareCallSettings(target: Window) {
  const runtime = target as unknown as SettingsRuntime;
  if (runtime.TronoCallSettings) return runtime.TronoCallSettings;
  runtime.TronoCallSettings = createSettingsController(
    !!runtime.TronoDesktop,
    runtime.TronoStorage ?? target.localStorage,
  );
  if (runtime.TronoDesktop) runtime.TronoDesktopSettings = runtime.TronoCallSettings;
  const identity = () => runtime.TronoAuth.user?.id ?? runtime.TronoAuth.guest?.id ?? null;
  let owner = identity();
  target.addEventListener('trono-auth-change', () => {
    const next = identity();
    if (owner === next) return;
    owner = next;
    runtime.TronoCallSettings?.close();
  });
  return runtime.TronoCallSettings;
}
