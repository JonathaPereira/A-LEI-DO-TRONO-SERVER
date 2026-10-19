import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createProfileEditor } from '../../lib/profiles/editor';
import type { ProfileEditor as EditorController } from '../../lib/profiles/editor';
import type { ProfilesClient } from '../../lib/profiles/client';
import type { ProfileViewer } from '../../lib/profiles/viewer';
import type { FilesClient } from '../../lib/files/client';
import type { NetworkAccount } from '../../types/network';
import type { ProfileUpdate } from '../../types/profile-editor';
import type { AvatarAppearance } from '../../types/domain';
import type { SettingsController } from '../../lib/settings/controller';
import { ProfileEditor } from './editor-fields';
import { initializeProfileGifs } from './gif-picker-runtime';
import { initializeRegisteredAccounts } from './registered-accounts-runtime';

interface EditorRuntime extends Window {
  TronoProfileEditor?: EditorController;
  TronoProfiles: ProfilesClient;
  TronoProfileViewer: ProfileViewer;
  TronoFiles: FilesClient;
  TronoAuth: {
    readonly user: NetworkAccount | null;
    readonly ready: Promise<unknown>;
    open(mode: 'login'): void;
    updateProfile(profile: ProfileUpdate): Promise<unknown>;
  };
  TronoAvatars: {
    avatarHtml(person?: AvatarAppearance): string;
    hydrate(host?: ParentNode): void;
  };
  TronoDesktopSettings?: SettingsController;
}

/** Mount once; both settings shells move the host, preserving React and draft ownership. */
export function initializeProfileEditor(target: Window): EditorController {
  const runtime = target as EditorRuntime;
  if (runtime.TronoProfileEditor) return runtime.TronoProfileEditor;
  const gifs = initializeProfileGifs(target);
  const accounts = initializeRegisteredAccounts(target);
  const document = target.document;
  const controller = createProfileEditor({
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
  runtime.TronoProfileEditor = controller;
  const dialog = document.getElementById('profileDialog') as HTMLDialogElement;
  const host = document.getElementById('profileEditorHost')!;
  const open = async ({ inline = false } = {}) => {
    await runtime.TronoAuth.ready;
    if (runtime.TronoDesktopSettings && !inline) {
      runtime.TronoDesktopSettings.open('account');
      return;
    }
    if (!runtime.TronoAuth.user) {
      runtime.TronoAuth.open('login');
      return;
    }
    const state = controller.getSnapshot();
    if (state.busy || (inline && (state.loaded || state.loading))) return;
    if (!inline) {
      document.querySelector<HTMLButtonElement>('[data-profile-section="profile"]')?.click();
      if (!dialog.open) dialog.showModal();
    }
    gifs.close();
    await controller.load();
  };
  Object.assign(runtime, {
    TronoProfile: {
      open,
      avatarHtml: runtime.TronoAvatars.avatarHtml,
      hydrate: runtime.TronoAvatars.hydrate,
      openMini: runtime.TronoProfileViewer.open,
      getProtectedFileIds: controller.getProtectedFileIds,
    },
  });
  flushSync(() =>
    createRoot(host).render(
      <ProfileEditor
        controller={controller}
        accounts={accounts}
        chooseGif={(key) => {
          const state = controller.getSnapshot();
          if (!state.loaded || state.busy) return;
          gifs.open({
            target: key,
            onSelect: controller.createMediaPicker(key),
          });
        }}
      />,
    ),
  );
  target.addEventListener(
    'trono:ready',
    () => {
      for (const id of ['accountProfileBtn', 'chatProfileBtn'])
        document.getElementById(id)?.addEventListener('click', () => void open());
      runtime.TronoDesktopSettings?.subscribe(() => {
        if (!runtime.TronoDesktopSettings?.getSnapshot().open) {
          controller.reset();
          gifs.close();
        }
      });
    },
    { once: true },
  );
  document.getElementById('profileClose')!.onclick = () => {
    if (!controller.getSnapshot().busy) dialog.close();
  };
  dialog.addEventListener('cancel', (event) => {
    if (controller.getSnapshot().busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    controller.reset();
    gifs.close();
  });
  let accountId = runtime.TronoAuth.user?.id;
  target.addEventListener('trono-auth-change', () => {
    const next = runtime.TronoAuth.user?.id;
    if (next === accountId) return;
    accountId = next;
    dialog.close();
    gifs.close();
  });
  return controller;
}
