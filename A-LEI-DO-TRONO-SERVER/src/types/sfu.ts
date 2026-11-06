import type { ScreenFormat, VoiceMediaKind } from './voice';

export type SfuRid = 'f' | 'h' | 'q';
export interface SfuPublication {
  readonly ownerId: string;
  readonly ownerName?: string;
  readonly kind: VoiceMediaKind;
  readonly sessionId: string;
  readonly trackName: string;
  readonly rids: readonly SfuRid[];
  readonly quality?: string;
  readonly screenBitrate?: number | null;
  readonly createdAt?: number;
}
/** Peer and sender references are borrowed by publication controls/diagnostics. */
export interface SfuLocalPublication {
  kind: VoiceMediaKind;
  pc: RTCPeerConnection;
  sessionId: string;
  mid: string;
  sender: RTCRtpSender;
  trackName: string;
  rids: readonly SfuRid[];
  ready: boolean;
}
export interface SfuSubscription {
  key: string;
  pc: RTCPeerConnection;
  sessionId: string;
  mid: string;
  publisherSessionId: string;
  publisherId: string;
  kind: VoiceMediaKind;
  preferredRid: SfuRid | null;
  track: MediaStreamTrack | null;
  negotiating: boolean;
  readyAt: number;
}
export interface SfuSettings {
  readonly enabled: boolean;
  readonly screenAllowed: boolean;
  readonly quality: string;
  readonly screenBitrate: number;
  readonly videoBitrate: number;
  readonly camera: ScreenFormat;
  readonly screen: ScreenFormat;
  readonly ice: RTCConfiguration;
}
