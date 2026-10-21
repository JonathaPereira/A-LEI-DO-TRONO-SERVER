import type { BackendAccount } from './auth-contract';
import type { GuestIdentity } from './sessions';
import type { ChannelType, ChatMessage, MediaTransport } from '../src/types/domain';
import type { ThroneGame } from './throne-contract';
import type { RealtimeQuality } from './realtime-policy';

/** Membership and voice state use the same connection; media resources remain in the SFU/client owners. */
export interface ChannelConnection {
  clientId: string;
  roomId: string | null;
  textRoomId: string | null;
  gameRoomId: string | null;
  independentGames: boolean;
  account: BackendAccount | null;
  guest?: GuestIdentity | null;
}
export interface ChannelMember {
  id: string;
  name: string;
  guest: boolean;
  avatar_preset: string;
  avatar_file_id: string | null;
  seat: number;
  ready: boolean;
  joinedAt: number;
  ws: ChannelConnection;
  voiceJoined: boolean;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  mediaTransport: MediaTransport;
  transmissionQuality: RealtimeQuality;
  screenFps?: 15 | 30 | 60;
  lastChatAt: number;
}
export interface ChannelRoom {
  id: string;
  name: string;
  description?: string;
  channelType?: ChannelType;
  kind: 'game' | 'chat';
  max: number | null;
  players: Map<string, ChannelMember>;
  createdAt: number;
  game: ThroneGame | null;
  chatHistory: ChatMessage[];
  chatRevision?: number;
  nextSeat: number;
  voiceMode?: 'sfu' | 'p2p' | null;
  voiceRevision?: number;
  soundUntil?: number;
  soundFileId?: string;
}
