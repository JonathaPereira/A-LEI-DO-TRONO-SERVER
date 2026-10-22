import type { ProfileLink, ProfileMediaKind, ProfilePersonalization } from './profiles';

export type ProfileEditorFields = Pick<
  ProfilePersonalization,
  | 'handle'
  | 'bio'
  | 'status'
  | 'emoji'
  | 'accent'
  | 'darkness'
  | 'blur'
  | 'opacity'
  | 'reduce_motion'
  | 'cover_position'
  | 'cover_zoom'
>;
/** Raw link rows and tags stay separate from the tolerant live preview. */
export interface ProfileEditorSnapshot {
  readonly accountId: string | null;
  readonly nickname: string;
  readonly avatarPreset: string;
  readonly avatarFileId: string | null;
  readonly createdAt: string | null;
  readonly draft: ProfilePersonalization;
  readonly tags: string;
  readonly links: readonly ProfileLink[];
  readonly urls: Readonly<Partial<Record<ProfileMediaKind, string>>>;
  readonly pending: readonly ProfileMediaKind[];
  readonly loading: boolean;
  readonly busy: boolean;
  readonly loaded: boolean;
  readonly message: string;
  readonly error: boolean;
}
export interface ProfileUpdate {
  nickname: string;
  avatar_preset: string;
  avatar_file_id: string | null;
  personalization: ProfilePersonalization;
}
