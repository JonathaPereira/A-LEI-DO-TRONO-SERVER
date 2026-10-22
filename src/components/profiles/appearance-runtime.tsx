import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createAppearancePreferences } from '../../lib/profiles/appearance';
import { AppearanceFields } from './appearance-fields';

interface AppearanceRuntime {
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoAuth: { user: { id: string } | null; ready: Promise<unknown> };
}
const installed = new WeakSet<Window>();
/** Register where the previous appearance script lived so settings capture the React fields. */
export function initializeAppearance(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as AppearanceRuntime;
  const client = createAppearancePreferences({
    storage: runtime.TronoStorage || target.localStorage,
    style: target.document.documentElement.style,
    events: target,
    accountId: () => runtime.TronoAuth.user?.id ?? null,
    authReady: runtime.TronoAuth.ready,
    applyTheme(theme) {
      target.document.documentElement.dataset.theme = theme;
      target.dispatchEvent(new CustomEvent('trono-theme-change', { detail: { theme } }));
    },
  });
  target.addEventListener(
    'trono:ready',
    () => {
      client.start();
      const host = target.document.getElementById('appearanceFieldsHost');
      if (host) flushSync(() => createRoot(host).render(<AppearanceFields client={client} />));
    },
    { once: true },
  );
}
