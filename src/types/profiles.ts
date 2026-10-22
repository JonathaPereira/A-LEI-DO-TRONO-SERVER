import type { AccountRole, AvatarAppearance } from './domain';

export type ProfileMediaKind = 'avatar' | 'cover' | 'background';
export interface ProfileMediaCredit {
  readonly title: string;
  readonly author: string;
  readonly license: string;
  readonly source: string;
  readonly license_url: string;
}
export interface ProfileLink {
  readonly label: string;
  readonly url: string;
}
export interface ProfilePersonalization {
  readonly handle: string;
  readonly bio: string;
  readonly status: string;
  readonly emoji: string;
  readonly tags: readonly string[];
  readonly links: readonly ProfileLink[];
  readonly cover_file_id: string | null;
  readonly background_file_id: string | null;
  readonly accent: string;
  readonly darkness: number;
  readonly blur: number;
  readonly opacity: number;
  readonly reduce_motion: boolean;
  readonly cover_position: number;
  readonly cover_zoom: number;
  readonly media_credits: Readonly<Partial<Record<ProfileMediaKind, ProfileMediaCredit>>>;
}
/** Public member fields only; account credentials and private email never enter a profile. */
export interface MemberProfile extends AvatarAppearance {
  readonly id: string;
  readonly nickname: string;
  readonly avatar_preset: string;
  readonly avatar_file_id: string | null;
  readonly created_at: string | null;
  readonly personalization: ProfilePersonalization;
}
export interface RegisteredAccount {
  readonly id: string;
  readonly nickname: string;
  readonly email: string;
  readonly confirmed: boolean;
  readonly created_at: string | null;
}
export interface RegisteredAccountsPage {
  readonly accounts: readonly RegisteredAccount[];
  readonly hasMore: boolean;
  readonly nextOffset: number;
}
export interface ProfilesSnapshot {
  readonly accountId: string | null;
  readonly role: AccountRole | null;
  readonly epoch: number;
  readonly revision: number;
  readonly profileId: string | null;
}
export interface ProfileViewerSnapshot {
  readonly open: boolean;
  readonly full: boolean;
  readonly loading: boolean;
  readonly profile: MemberProfile | null;
  readonly message: string;
  readonly canMessage: boolean;
}
