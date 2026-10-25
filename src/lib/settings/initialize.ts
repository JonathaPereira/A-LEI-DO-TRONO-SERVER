import { createSettingsController } from './controller';
import type { SettingsRuntime } from './runtime';
/** Prepare state without mounting a presentation or acquiring media. */
export function prepareCallSettings(target: Window) {
  const runtime = target as unknown as SettingsRuntime;
  runtime.TronoCallSettings ??= createSettingsController(
    !!runtime.TronoDesktop,
    runtime.TronoStorage ?? target.localStorage,
  );
  if (runtime.TronoDesktop) runtime.TronoDesktopSettings = runtime.TronoCallSettings;
  return runtime.TronoCallSettings;
}
