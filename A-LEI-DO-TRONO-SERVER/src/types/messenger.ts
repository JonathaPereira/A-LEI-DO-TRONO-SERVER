import type { AvatarAppearance } from './domain';
import type { FileRecord } from './files';

export interface DirectPerson extends AvatarAppearance {
  readonly id: string;
  readonly name: string;
  readonly online?: boolean;
}
export interface Friend extends DirectPerson {
  readonly state: 'pending' | 'accepted';
  readonly incoming: boolean;
}
export interface DirectMessage {
  readonly id: string;
  readonly senderId: string;
  readonly text: string;
  readonly ts: string;
  readonly roomId: string | null;
  readonly attachment?: FileRecord;
}
export interface DirectThread extends DirectPerson {
  readonly peerId: string;
  readonly last: DirectMessage;
  readonly unread: number;
}
export interface SocialSnapshot {
  readonly friends: readonly Friend[];
  readonly threads: readonly DirectThread[];
}
export interface DirectPayload {
  readonly id: string;
  readonly peerId: string;
  readonly text: string;
  readonly roomId: string | null;
  readonly attachmentId: string | null;
}
export interface DirectDraft {
  readonly text: string;
  readonly file: File | null;
}
export interface DirectToast {
  readonly peerId: string;
  readonly name: string;
  readonly text: string;
}
export interface MessengerSnapshot extends SocialSnapshot {
  readonly accountId: string | null;
  readonly peerId: string | null;
  readonly open: boolean;
  readonly members: readonly DirectPerson[];
  readonly search: string;
  readonly messages: readonly DirectMessage[];
  readonly hasMore: boolean;
  readonly reading: boolean;
  readonly change: 'replace' | 'append' | 'prepend';
  readonly draft: DirectDraft;
  readonly sending: 'upload' | 'send' | null;
  readonly status: string;
  readonly toasts: readonly DirectToast[];
  readonly inviteOpen: boolean;
  readonly inviteChannel: string;
  readonly actionPending: readonly string[];
}
