import type { AvatarAppearance, Channel, ChannelType } from './domain';

export interface ChannelParticipant extends AvatarAppearance {
  readonly id: string;
  readonly name: string;
  readonly guest: boolean;
  readonly inVoice: boolean;
}

export interface CommunityChannel extends Readonly<Channel> {
  readonly players: readonly ChannelParticipant[];
}

export interface ChannelNotice {
  readonly unread: number;
  readonly muted: boolean;
}

export interface ChannelsSnapshot {
  readonly channels: readonly CommunityChannel[];
  readonly selectedId: string | null;
  readonly ready: boolean;
  /** Catalog/identity generation; guards HTTP responses against newer socket data or accounts. */
  readonly version: number;
  readonly avatarVersion: number;
  readonly notices: Readonly<Record<string, ChannelNotice>>;
}

export type ChannelGroup = Extract<ChannelType, 'text' | 'voice'>;
