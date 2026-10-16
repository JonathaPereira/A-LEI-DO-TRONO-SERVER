export type AccountRole = 'guest' | 'member' | 'admin' | 'creator';
export type ChannelType = 'text' | 'voice' | 'mixed';
export type MediaTransport = 'p2p' | 'sfu' | 'sfu-pending';

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  count: number;
  voiceActive: boolean;
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
  attachment?: { id: string; name: string; mime: string; bytes: number } | null;
}

export interface VoiceControlState {
  readonly voiceJoined: boolean;
  readonly cameraOn: boolean;
  readonly screenSharing: boolean;
}
