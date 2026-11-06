import type { ChannelParticipant } from './channels';
import type { AccountRole } from './domain';
import type { VoiceNotice } from './voice-roster';

export interface CommunityPerson extends ChannelParticipant {
  readonly role: AccountRole;
  readonly online: boolean;
  readonly roomName: string | null;
  readonly activity: { readonly name: string } | null;
}
export interface CommunityPresence {
  readonly scope: 'community' | 'game';
  readonly directoryReady: boolean;
  readonly members: readonly CommunityPerson[];
}
export interface GamePresence {
  readonly id: string;
  readonly players: readonly ChannelParticipant[];
}
export interface CommunityIdentity {
  readonly key: string;
  readonly accountId: string | null;
  readonly manageRoles: boolean;
}
export type CommunityVoiceNotice = Pick<VoiceNotice, 'id' | 'kind' | 'name'> & {
  readonly text?: string;
};
export interface CommunityActivity {
  readonly key: number;
  readonly kind: VoiceNotice['kind'];
  readonly text: string;
  readonly at: number;
}
export interface CommunitySnapshot {
  readonly identity: CommunityIdentity | null;
  readonly presence: CommunityPresence | null;
  readonly rooms: readonly GamePresence[];
  readonly connected: boolean;
  readonly open: boolean;
  readonly activities: readonly CommunityActivity[];
  readonly notices: readonly CommunityActivity[];
}
