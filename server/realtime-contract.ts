import type { ChannelType } from '../src/types/domain';
import type {
  RealtimeKind,
  RealtimeQuality,
  RealtimeRid,
  BitratePublication,
} from './realtime-policy';

export interface RealtimeConnection {
  clientId: string;
  roomId?: string | null;
}
export interface RealtimePlayer {
  id: string;
  name: string;
  ws: RealtimeConnection;
  voiceJoined?: boolean;
  mediaTransport?: string;
  transmissionQuality?: RealtimeQuality;
}
export interface RealtimeRoom {
  id: string;
  kind: 'chat' | 'game';
  channelType?: ChannelType;
  voiceMode?: string;
  players: Map<string, RealtimePlayer>;
}
export interface RealtimeSession {
  ownerId: string;
  roomId: string;
  purpose: 'publish' | 'subscribe';
  kind: RealtimeKind;
  createdAt: number;
  pendingAnswer?: boolean;
  publisherId?: string;
  mid?: string;
}
export interface RealtimePublication extends BitratePublication {
  ownerId: string;
  ownerName: string;
  roomId: string;
  sessionId: string;
  trackName: string;
  mid: string;
  rids: RealtimeRid[];
  ready: boolean;
  createdAt: number;
  lastVerifiedAt: number;
  readyAt?: number;
  remoteStatus?: string;
}
export interface RealtimeSubscription {
  sessionId: string;
  ownerId: string;
  roomId: string;
  publisherId: string;
  publisherSessionId: string;
  kind: RealtimeKind;
  mid: string;
  preferredRid: RealtimeRid | null;
  estimatedBps: number;
  createdAt: number;
}
export interface RealtimeDescription {
  type: 'offer' | 'answer';
  sdp: string;
}
export interface ProviderIssue {
  errorCode: string;
  errorDescription: string;
}
export interface ProviderTrack {
  location?: 'local' | 'remote';
  mid?: string;
  trackName?: string;
  sessionId?: string;
  status?: 'active' | 'inactive';
  errorCode?: string;
  errorDescription?: string;
}
export interface RealtimeProviderResponse {
  sessionId?: string;
  sessionDescription?: RealtimeDescription;
  tracks?: ProviderTrack[];
  requiresImmediateRenegotiation?: boolean;
}
