export type AccountRole = 'guest' | 'member' | 'admin' | 'creator';
export type ChannelType = 'text' | 'voice' | 'mixed';
export type MediaTransport = 'p2p' | 'sfu' | 'sfu-pending';

export interface AvatarAppearance {
  readonly avatar_preset?: string;
  readonly avatar_file_id?: string | null;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  count: number;
  voiceActive: boolean;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  ownerId?: string;
  roomId?: string | null;
  kind?: string;
  createdAt?: string;
  deleted?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  name: string;
  text: string;
  senderId: string;
  seat: number;
  accountId: string | null;
  ts: number;
  avatar_preset?: string;
  avatar_file_id?: string | null;
  attachment?: ChatAttachment | null;
}

export interface VoiceControlState {
  readonly voiceJoined: boolean;
  readonly cameraOn: boolean;
  readonly screenSharing: boolean;
}
