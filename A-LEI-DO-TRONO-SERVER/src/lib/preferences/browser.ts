import { createPersonalPreferences, type PersonalPreferences } from './personal';
interface Runtime extends Window {
  TronoPersonal?: PersonalPreferences;
  TronoAuth?: { user?: { id?: string } | null };
}
export function initializePersonalPreferences(target: Window): PersonalPreferences {
  const runtime = target as Runtime;
  if (runtime.TronoPersonal) return runtime.TronoPersonal;
  const preferences = createPersonalPreferences({
    account: () => runtime.TronoAuth?.user?.id || null,
    storage: () => target.localStorage,
    changed: (key) =>
      target.dispatchEvent(new CustomEvent('trono-personal-change', { detail: { key } })),
  });
  runtime.TronoPersonal = preferences;
  return preferences;
}
