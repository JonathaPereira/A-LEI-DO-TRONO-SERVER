import { createProfileEditor } from './editor';
import type { ProfileEditor } from './editor';
import type { ProfilesClient } from './client';
import type { ProfileViewer } from './viewer';
import type { FilesClient } from '../files/client';
import type { NetworkAccount } from '../../types/network';
import type { AccountSession } from '../auth/session';
import type { SettingsController } from '../settings/controller';
import { initializeProfileGifs } from '../../components/profiles/gif-picker-runtime';
import { initializeRegisteredAccounts } from '../../components/profiles/registered-accounts-runtime';
import { initializeFileLibrary } from '../../components/files/library-runtime';
import { createAppearancePreferences } from './appearance';
interface Runtime extends Window {
  TronoAuth: AccountSession & { readonly user: NetworkAccount | null; open(mode: 'login'): void };
  TronoProfiles: ProfilesClient;
  TronoFiles: FilesClient;
  TronoProfileViewer: ProfileViewer;
  TronoCallSettings: SettingsController;
  TronoProfileEditor?: ProfileEditor;
}
/** Account-scoped owners are prepared once; views only subscribe and submit commands. */
export function initializeAccountResources(target: Window) {
  const runtime = target as Runtime;
  if (runtime.TronoProfileEditor) return;
  const gifs = initializeProfileGifs(target, { mount: false });
  const accounts = initializeRegisteredAccounts(target, { mount: false });
  const editor = createProfileEditor({
    getAccount: () => runtime.TronoAuth.user,
    profiles: runtime.TronoProfiles,
    files: runtime.TronoFiles,
    updateProfile: (profile) => runtime.TronoAuth.updateProfile(profile),
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      return () => target.removeEventListener('trono-auth-change', listener);
    },
    onChange: () => target.dispatchEvent(new Event('trono-profile-change')),
    onDraftChange: () => target.dispatchEvent(new Event('trono-profile-draft-change')),
  });
  runtime.TronoProfileEditor = editor;
  const appearance = createAppearancePreferences({
    storage: target.localStorage,
    style: target.document.documentElement.style,
    events: target,
    accountId: () => runtime.TronoAuth.user?.id ?? null,
    authReady: runtime.TronoAuth.ready,
    applyTheme(theme) {
      target.document.documentElement.dataset.theme = theme;
      const gameSurface = target.document.getElementById('gameSurface');
      if (gameSurface) gameSurface.dataset.theme = theme;
      target.dispatchEvent(new CustomEvent('trono-theme-change', { detail: { theme } }));
    },
  });
  Object.assign(target, {
    TronoProfileGifs: gifs,
    TronoRegisteredAccounts: accounts,
    TronoAppearance: appearance,
    TronoProfile: {
      async open() {
        await runtime.TronoAuth.ready;
        if (!runtime.TronoAuth.user) {
          runtime.TronoAuth.open('login');
          return;
        }
        runtime.TronoCallSettings.open('account');
      },
      openMini: runtime.TronoProfileViewer.open,
      getProtectedFileIds: editor.getProtectedFileIds,
    },
  });
  initializeFileLibrary(target);
  appearance.start();
}
