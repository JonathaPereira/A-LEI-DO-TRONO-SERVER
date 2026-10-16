import type { AvatarAppearance } from '../../types/domain';
import type { FilesRuntime } from '../files/browser.ts';
import { initializeFiles } from '../files/browser.ts';
import { AVATAR_PRESETS, avatarIcon, normalizePreset } from './icons.ts';

const installed = new WeakSet<object>();

export function avatarFile(person: AvatarAppearance): string | null {
  return person.avatar_file_id && /^[a-f0-9-]{36}$/i.test(person.avatar_file_id)
    ? person.avatar_file_id
    : null;
}

/** Compatibility for unconverted profiles and games; React avatars share the icon and file client. */
export function installLegacyAvatars(runtime: FilesRuntime): void {
  const files = initializeFiles(runtime);
  if (installed.has(files)) return;
  installed.add(files);
  const attempts = new WeakMap<HTMLImageElement, object>();
  function avatarHtml(person: AvatarAppearance = {}) {
    const preset = normalizePreset(person.avatar_preset),
      file = avatarFile(person);
    return file && files.getSnapshot().accountId
      ? `<img class="profile-avatar-photo" data-avatar-file="${file}" data-avatar-preset="${preset}" alt="Avatar">`
      : avatarIcon(preset);
  }
  function hydrate(host: ParentNode = document) {
    for (const img of host.querySelectorAll<HTMLImageElement>('img[data-avatar-file]')) {
      if (img.dataset.loading) continue;
      img.dataset.loading = '1';
      const epoch = files.getSnapshot().epoch;
      const attempt = {};
      attempts.set(img, attempt);
      const current = () =>
        img.isConnected && attempts.get(img) === attempt && files.getSnapshot().epoch === epoch;
      const fallback = () => {
        if (!current()) return;
        const element = document.createElement('span');
        element.innerHTML = avatarIcon(img.dataset.avatarPreset);
        img.replaceWith(element.firstElementChild!);
      };
      if (!files.getSnapshot().accountId) {
        fallback();
        continue;
      }
      void files.url(img.dataset.avatarFile!).then((url) => {
        if (current()) {
          img.src = url;
          img.onerror = fallback;
        }
      }, fallback);
    }
  }
  let epoch = files.getSnapshot().epoch;
  let deleted = files.getSnapshot().deleted;
  files.subscribe(() => {
    if (files.getSnapshot().epoch === epoch && files.getSnapshot().deleted === deleted) return;
    const changedAccount = files.getSnapshot().epoch !== epoch;
    epoch = files.getSnapshot().epoch;
    deleted = files.getSnapshot().deleted;
    for (const img of document.querySelectorAll<HTMLImageElement>('img[data-avatar-file]')) {
      if (!changedAccount && !Object.hasOwn(deleted, img.dataset.avatarFile ?? '')) continue;
      img.removeAttribute('src');
      delete img.dataset.loading;
    }
    hydrate();
  });
  Object.assign(runtime, {
    TronoAvatarIcons: { html: avatarIcon },
    TronoAvatars: { avatarHtml, hydrate, presets: AVATAR_PRESETS },
  });
}
