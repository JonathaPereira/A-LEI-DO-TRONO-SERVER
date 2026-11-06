import type { CommunityChannel } from './channels';
import type { AccountRole } from './domain';

export interface ChannelDraft {
  readonly name: string;
  readonly type: 'text' | 'voice';
  readonly description: string;
}
export interface RoleTarget {
  readonly id: string;
  readonly name: string;
  readonly role: AccountRole;
  readonly guest: boolean;
}
export interface ChannelManagementSnapshot {
  readonly accountId: string | null;
  readonly role: Exclude<AccountRole, 'guest'> | null;
  readonly canManageChannels: boolean;
  readonly canManageRoles: boolean;
  /** Projection of the shared catalog, never a separate administrative channel list. */
  readonly channels: readonly CommunityChannel[];
  readonly manager: {
    readonly open: boolean;
    readonly loading: boolean;
    readonly busy: boolean;
    readonly message: string;
    readonly draft: ChannelDraft;
  };
  readonly roleEditor: {
    readonly target: RoleTarget | null;
    readonly selected: 'member' | 'admin';
    readonly busy: boolean;
    readonly message: string;
  };
}
