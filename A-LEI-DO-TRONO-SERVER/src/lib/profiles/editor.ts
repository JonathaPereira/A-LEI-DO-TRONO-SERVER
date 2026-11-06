import type {
  ProfileEditorFields,
  ProfileEditorSnapshot,
  ProfileUpdate,
} from '../../types/profile-editor';
import type {
  ProfileLink,
  ProfileMediaCredit,
  ProfileMediaKind,
  ProfilePersonalization,
} from '../../types/profiles';
import type { FilesClient } from '../files/client';
import type { ProfilesClient } from './client';
import { normalizePreset } from './icons.ts';
import { normalizeProfileLinks, profileTags, validateEditorDraft } from './editor-validation.ts';
import { formatProfilePhoto } from './media.ts';
import { readProfilePersonalization } from './protocol.ts';

export type { ProfileEditorSnapshot } from '../../types/profile-editor';
export interface ProfileEditorAccount {
  readonly id: string;
  readonly nickname: string;
  readonly avatar_preset?: string;
  readonly avatar_file_id?: string | null;
}
export interface ProfileEditorOptions {
  getAccount(): ProfileEditorAccount | null;
  profiles: Pick<ProfilesClient, 'readProfile'>;
  files: Pick<FilesClient, 'upload'>;
  updateProfile(profile: ProfileUpdate): Promise<unknown>;
  subscribeIdentity(listener: () => void): () => void;
  onChange?(): void;
  onDraftChange?(): void;
  formatPhoto?: typeof formatProfilePhoto;
  createObjectURL?(file: File): string;
  revokeObjectURL?(url: string): void;
  warn?(error: unknown): void;
}
const MEDIA = ['avatar', 'cover', 'background'] as const;
const DEFAULT_DRAFT = readProfilePersonalization({});
export const EMPTY_PROFILE_EDITOR: ProfileEditorSnapshot = Object.freeze({
  accountId: null,
  nickname: '',
  avatarPreset: 'crown',
  avatarFileId: null,
  createdAt: null,
  draft: DEFAULT_DRAFT,
  tags: '',
  links: Object.freeze([]),
  urls: Object.freeze({}),
  pending: Object.freeze([]),
  loading: false,
  busy: false,
  loaded: false,
  message: '',
  error: false,
});
function immutableDraft(draft: ProfilePersonalization): ProfilePersonalization {
  const credits: Partial<Record<ProfileMediaKind, ProfileMediaCredit>> = {};
  for (const key of MEDIA) {
    const credit = draft.media_credits[key];
    if (credit) credits[key] = Object.freeze({ ...credit });
  }
  return Object.freeze({
    ...draft,
    tags: Object.freeze([...draft.tags]),
    links: Object.freeze(draft.links.map((link) => Object.freeze({ ...link }))),
    media_credits: Object.freeze(credits),
  });
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível atualizar o perfil.';

/** One account-scoped draft owns its files and object URLs; views never upload or mutate it. */
export function createProfileEditor(options: ProfileEditorOptions) {
  let state = EMPTY_PROFILE_EDITOR,
    disposed = false,
    epoch = 0;
  let request: AbortController | null = null;
  const pending = new Map<ProfileMediaKind, File>();
  const urls: Partial<Record<ProfileMediaKind, string>> = {};
  const pickSequence: Record<ProfileMediaKind, number> = { avatar: 0, cover: 0, background: 0 };
  const preparing = new Set<ProfileMediaKind>();
  const listeners = new Set<() => void>();
  const formatPhoto = options.formatPhoto ?? formatProfilePhoto;
  const createUrl = options.createObjectURL ?? ((file: File) => URL.createObjectURL(file));
  const revokeUrl = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  function invoke(callback: (() => void) | undefined) {
    try {
      callback?.();
    } catch (error) {
      options.warn?.(error);
    }
  }
  function update(patch: Partial<ProfileEditorSnapshot>, draftChanged = false) {
    if (disposed) return;
    const next = { ...state, ...patch };
    state = Object.freeze({
      ...next,
      draft: immutableDraft({
        ...next.draft,
        tags: profileTags(next.tags),
        links: normalizeProfileLinks(next.links, { strict: false }),
      }),
      links: Object.freeze(next.links.map((link) => Object.freeze({ ...link }))),
      urls: Object.freeze({ ...urls }),
      pending: Object.freeze([...pending.keys()]),
    });
    for (const listener of listeners) invoke(listener);
    if (draftChanged) invoke(options.onDraftChange);
  }
  function clearUrl(key: ProfileMediaKind) {
    const url = urls[key];
    delete urls[key];
    if (url) revokeUrl(url);
  }
  function clearResources() {
    for (const key of MEDIA) {
      pickSequence[key]++;
      clearUrl(key);
    }
    preparing.clear();
    pending.clear();
  }
  function cancel() {
    epoch++;
    request?.abort();
    request = null;
    clearResources();
  }
  function syncIdentity() {
    if (disposed) return;
    const accountId = options.getAccount()?.id ?? null;
    if (accountId === state.accountId) return;
    cancel();
    update({ ...EMPTY_PROFILE_EDITOR, accountId }, true);
  }
  function current(operation: number, accountId: string) {
    return (
      !disposed &&
      operation === epoch &&
      state.accountId === accountId &&
      options.getAccount()?.id === accountId
    );
  }
  function editable() {
    syncIdentity();
    return !disposed && state.loaded && !state.busy;
  }
  function changed(patch: Partial<ProfileEditorSnapshot>) {
    update({ ...patch, message: '', error: false }, true);
  }
  async function load(): Promise<void> {
    if (disposed) return;
    cancel();
    const account = options.getAccount();
    if (!account) {
      update({ ...EMPTY_PROFILE_EDITOR, message: 'Entre na sua conta.', error: true }, true);
      return;
    }
    const operation = epoch;
    request = new AbortController();
    const signal = request.signal;
    update(
      {
        ...EMPTY_PROFILE_EDITOR,
        accountId: account.id,
        nickname: account.nickname,
        avatarPreset: normalizePreset(account.avatar_preset),
        avatarFileId: account.avatar_file_id ?? null,
        loading: true,
        message: 'Carregando seu perfil…',
      },
      true,
    );
    try {
      const profile = await options.profiles.readProfile(account.id, { signal });
      if (!current(operation, account.id)) return;
      update(
        {
          draft: profile.personalization,
          tags: profile.personalization.tags.join(', '),
          links: profile.personalization.links.length
            ? profile.personalization.links
            : [{ label: '', url: '' }],
          createdAt: profile.created_at,
          loaded: true,
          loading: false,
          message: '',
          error: false,
        },
        true,
      );
    } catch (error) {
      if (current(operation, account.id))
        update({ loading: false, message: errorMessage(error), error: true });
    } finally {
      if (current(operation, account.id)) request = null;
    }
  }
  function withoutMedia(key: ProfileMediaKind): Partial<ProfileEditorSnapshot> {
    pickSequence[key]++;
    preparing.delete(key);
    pending.delete(key);
    clearUrl(key);
    const media_credits = { ...state.draft.media_credits };
    delete media_credits[key];
    return {
      avatarFileId: key === 'avatar' ? null : state.avatarFileId,
      draft: {
        ...state.draft,
        media_credits,
        ...(key === 'cover'
          ? { cover_file_id: null }
          : key === 'background'
            ? { background_file_id: null }
            : {}),
      },
    };
  }
  function removeMedia(key: ProfileMediaKind) {
    if (editable()) changed(withoutMedia(key));
  }
  async function pick(
    file: File,
    key: ProfileMediaKind,
    credit?: ProfileMediaCredit,
  ): Promise<void> {
    if (!editable()) return;
    const operation = epoch,
      accountId = state.accountId!,
      selection = ++pickSequence[key];
    preparing.add(key);
    const valid = () => current(operation, accountId) && selection === pickSequence[key];
    try {
      const formatted = await formatPhoto(file, { avatar: key === 'avatar' });
      if (!valid()) return;
      const url = createUrl(formatted);
      clearUrl(key);
      urls[key] = url;
      pending.set(key, formatted);
      const media_credits = { ...state.draft.media_credits };
      delete media_credits[key];
      if (credit) media_credits[key] = { ...credit };
      update(
        {
          draft: { ...state.draft, media_credits },
          avatarFileId: key === 'avatar' ? null : state.avatarFileId,
          message: 'Prévia atualizada. Salve para aplicar.',
          error: false,
        },
        true,
      );
    } catch (error) {
      if (valid()) {
        update({ message: errorMessage(error), error: true });
        throw error;
      }
    } finally {
      if (valid()) preparing.delete(key);
    }
  }
  async function save(): Promise<void> {
    if (!editable()) return;
    if (preparing.size) {
      update({ message: 'Aguarde a preparação da imagem antes de salvar.', error: true });
      return;
    }
    let data: ProfilePersonalization;
    try {
      data = validateEditorDraft(state.draft, state.links, state.tags);
    } catch (error) {
      update({ message: errorMessage(error), error: true });
      return;
    }
    const operation = epoch,
      accountId = state.accountId!;
    request = new AbortController();
    const signal = request.signal;
    update({ busy: true, message: 'Salvando…', error: false });
    try {
      for (const key of MEDIA) {
        const file = pending.get(key);
        if (!file) continue;
        const uploaded = await options.files.upload(file, {
          kind: 'avatar',
          signal,
          onProgress(progress) {
            if (current(operation, accountId))
              update({
                message: `Enviando ${{ avatar: 'avatar', cover: 'capa', background: 'fundo' }[key]}: ${progress}%`,
              });
          },
        });
        if (!current(operation, accountId)) return;
        pending.delete(key);
        if (key === 'avatar') update({ avatarFileId: uploaded.id }, true);
        else {
          data = {
            ...data,
            ...(key === 'cover'
              ? { cover_file_id: uploaded.id }
              : { background_file_id: uploaded.id }),
          };
          update({ draft: data }, true);
        }
      }
      if (!current(operation, accountId)) return;
      update({ draft: data });
      await options.updateProfile({
        nickname: state.nickname,
        avatar_preset: state.avatarPreset,
        avatar_file_id: state.avatarFileId,
        personalization: data,
      });
      if (!current(operation, accountId)) return;
      update({ message: 'Perfil atualizado.', error: false }, true);
      invoke(options.onChange);
    } catch (error) {
      if (current(operation, accountId)) update({ message: errorMessage(error), error: true });
    } finally {
      if (current(operation, accountId)) {
        request = null;
        update({ busy: false });
      }
    }
  }
  const unsubscribeIdentity = options.subscribeIdentity(syncIdentity);
  syncIdentity();
  return {
    load,
    save,
    pick,
    removeMedia,
    /** External GIF dialogs may outlive the editor or open another account's draft. */
    createMediaPicker(key: ProfileMediaKind) {
      if (!editable()) return async (_file: File, _credit?: ProfileMediaCredit) => {};
      const operation = epoch,
        accountId = state.accountId!,
        selection = ++pickSequence[key];
      preparing.delete(key);
      return async (file: File, credit?: ProfileMediaCredit): Promise<void> => {
        if (current(operation, accountId) && selection === pickSequence[key])
          await pick(file, key, credit);
      };
    },
    setNickname(nickname: string) {
      if (editable()) changed({ nickname });
    },
    setField<K extends keyof ProfileEditorFields>(key: K, value: ProfileEditorFields[K]) {
      if (editable()) changed({ draft: { ...state.draft, [key]: value } });
    },
    setTags(tags: string) {
      if (editable()) changed({ tags });
    },
    setLink(index: number, key: keyof ProfileLink, value: string) {
      if (!editable() || !Number.isInteger(index) || !state.links[index]) return;
      changed({
        links: state.links.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
      });
    },
    addLink() {
      if (editable() && state.links.length < 8)
        changed({ links: [...state.links, { label: '', url: '' }] });
    },
    removeLink(index: number) {
      if (editable() && Number.isInteger(index))
        changed({ links: state.links.filter((_, i) => i !== index) });
    },
    selectPreset(preset: string) {
      if (!editable()) return;
      changed({ ...withoutMedia('avatar'), avatarPreset: normalizePreset(preset) });
    },
    getProtectedFileIds(): string[] {
      const account = options.getAccount();
      if (!account || disposed) return [];
      return [
        ...new Set(
          (state.loaded && state.accountId === account.id
            ? [state.avatarFileId, state.draft.cover_file_id, state.draft.background_file_id]
            : [account.avatar_file_id]
          ).filter((id): id is string => typeof id === 'string' && !!id),
        ),
      ];
    },
    reset() {
      if (disposed) return;
      cancel();
      update({ ...EMPTY_PROFILE_EDITOR, accountId: options.getAccount()?.id ?? null }, true);
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      unsubscribeIdentity();
      state = EMPTY_PROFILE_EDITOR;
      for (const listener of listeners) invoke(listener);
      invoke(options.onDraftChange);
      listeners.clear();
    },
  };
}
export type ProfileEditor = ReturnType<typeof createProfileEditor>;
