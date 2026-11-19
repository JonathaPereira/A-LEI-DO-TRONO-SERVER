import type {
  SfuMediaKind,
  SfuQualityPreset,
  SfuScreenCodec,
  SfuSimulcastRid,
} from '@trono/protocol';

/** Monotonically increasing identifier for asynchronous voice-engine operations. */
export type OperationId = number;

/** Media kinds supported on remote track subscriptions. */
export type RemoteTrackKind = SfuMediaKind;

export type SubscriptionResourceKey = `subscription:${string}:${RemoteTrackKind}`;

/** Serialized execution queue key per domain resource. */
export type ResourceKey =
  'connection' | 'microphone' | 'camera' | 'screen' | 'screenAudio' | SubscriptionResourceKey;

export function subscriptionResourceKey(
  participantId: string,
  kind: RemoteTrackKind,
): SubscriptionResourceKey {
  return `subscription:${participantId}:${kind}`;
}

export function subscriptionMapKey(participantId: string, kind: RemoteTrackKind): string {
  return `${participantId}:${kind}`;
}

export type ConnectionStatus =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting';

export type LocalMediaStatus = 'stopped' | 'starting' | 'published' | 'stopping';

export type ScreenShareStatus =
  'stopped' | 'starting' | 'published' | 'updating' | 'republishing' | 'stopping';

export type SubscriptionStatus = 'unsubscribed' | 'subscribing' | 'subscribed' | 'unsubscribing';

export type ScreenContentHint = 'motion' | 'detail' | 'text';

export interface MicrophoneOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  muted?: boolean;
}

export interface CameraOptions {
  deviceId?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateBps?: number;
  codec?: string;
}

export interface ScreenShareOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  maxBitrateBps?: number;
  codec?: SfuScreenCodec;
  hardwareEncoding?: boolean;
  zeroCopyRequired?: boolean;
  contentHint?: ScreenContentHint;
  captureAudio?: boolean;
  simulcast?: boolean;
  quality?: SfuQualityPreset;
  sourceId?: string;
}

export interface ScreenAudioOptions {
  captureId?: string;
  sourceId?: string;
  maxBitrateBps?: number;
  muted?: boolean;
}

export interface ActiveOperation {
  operationId: OperationId;
  resourceKey: ResourceKey;
}

export interface ConnectionState {
  status: ConnectionStatus;
  roomId: string | null;
  participantId: string | null;
  publisherSessionId: string | null;
  subscriberSessionId: string | null;
  quality: SfuQualityPreset;
  operationId: OperationId | null;
  generation: number;
  lastError: string | null;
}

export interface RemoteTrackPublication {
  participantId: string;
  kind: RemoteTrackKind;
  trackName?: string;
  sessionId?: string;
  mid?: string;
  rids?: SfuSimulcastRid[];
  available: boolean;
}

export interface RemoteParticipantState {
  participantId: string;
  displayName?: string;
  speaking?: boolean;
  muted?: boolean;
  tracks: Partial<Record<RemoteTrackKind, RemoteTrackPublication>>;
}

export interface RoomState {
  participants: Record<string, RemoteParticipantState>;
}

export interface MicrophoneState {
  status: LocalMediaStatus;
  muted: boolean;
  options: MicrophoneOptions | null;
  trackId: string | null;
  mid: string | null;
  operationId: OperationId | null;
  lastError: string | null;
}

export interface CameraState {
  status: LocalMediaStatus;
  options: CameraOptions | null;
  trackId: string | null;
  mid: string | null;
  operationId: OperationId | null;
  lastError: string | null;
}

export interface ScreenState {
  status: ScreenShareStatus;
  captureId: string | null;
  options: ScreenShareOptions | null;
  pendingOptions: ScreenShareOptions | null;
  trackId: string | null;
  mid: string | null;
  operationId: OperationId | null;
  lastError: string | null;
}

export interface ScreenAudioState {
  status: LocalMediaStatus;
  captureId: string | null;
  options: ScreenAudioOptions | null;
  trackId: string | null;
  mid: string | null;
  operationId: OperationId | null;
  lastError: string | null;
}

export interface RemoteTrackSubscriptionState {
  key: string;
  participantId: string;
  kind: RemoteTrackKind;
  status: SubscriptionStatus;
  desiredSubscribed: boolean;
  preferredRid: SfuSimulcastRid | null;
  operationId: OperationId | null;
  lastError: string | null;
}

export interface VoiceEngineSnapshot {
  nextOperationId: OperationId;
  connection: ConnectionState;
  room: RoomState;
  microphone: MicrophoneState;
  camera: CameraState;
  screen: ScreenState;
  screenAudio: ScreenAudioState;
  subscriptions: Record<string, RemoteTrackSubscriptionState>;
}
