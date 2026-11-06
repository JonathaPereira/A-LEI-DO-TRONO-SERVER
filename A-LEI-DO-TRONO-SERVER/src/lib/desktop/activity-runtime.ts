import { createDesktopActivity } from './activity';
import type { DesktopActivityController } from './activity';
import type { DesktopActivityNative } from '../../types/desktop-activity';
import type { NetworkClient } from '../socket/client';

interface ActivityRuntime extends Window {
  TronoDesktop?: DesktopActivityNative;
  TronoDesktopActivity?: DesktopActivityController;
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoAuth: { user: { id: string } | null; ready: Promise<unknown> };
  TronoNetwork: NetworkClient;
  __LeiDoTrono?: { getState(): unknown };
}

/** Adapt the existing IPC and game screen; detecting processes remains owned by Electron. */
export function initializeDesktopActivity(target: Window): DesktopActivityController | undefined {
  const runtime = target as ActivityRuntime;
  if (runtime.TronoDesktopActivity) return runtime.TronoDesktopActivity;
  if (!runtime.TronoDesktop) return;
  const gameScreen = target.document.getElementById('gameScreen');
  const controller = createDesktopActivity({
    native: runtime.TronoDesktop,
    storage: runtime.TronoStorage ?? target.localStorage,
    readAccount: () => runtime.TronoAuth.user?.id ?? null,
    authReady: runtime.TronoAuth.ready,
    network: runtime.TronoNetwork,
    readGame: () =>
      !!runtime.__LeiDoTrono?.getState() &&
      !!gameScreen &&
      !gameScreen.classList.contains('hidden'),
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      return () => target.removeEventListener('trono-auth-change', listener);
    },
    subscribeGameVisibility(listener) {
      const observer = new MutationObserver(listener);
      if (gameScreen)
        observer.observe(gameScreen, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
  });
  runtime.TronoDesktopActivity = controller;
  target.addEventListener('trono:ready', controller.start, { once: true });
  return controller;
}
