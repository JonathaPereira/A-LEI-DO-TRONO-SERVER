import type { SfuQualityPreset, SfuSimulcastRid } from '@trono/protocol';
import type { VoiceEngineEvent } from '../protocol/events.ts';
import type {
  CameraOptions,
  MicrophoneOptions,
  OperationId,
  RemoteTrackKind,
  ResourceKey,
  ScreenAudioOptions,
  ScreenShareOptions,
  VoiceEngineSnapshot,
} from '../protocol/types.ts';

export interface ConnectMediaParams {
  roomId: string;
  participantId: string;
  quality: SfuQualityPreset;
  token?: string;
  sfuUrl?: string;
  signal?: AbortSignal;
}

export interface ConnectMediaResult {
  publisherSessionId: string;
  subscriberSessionId: string;
}

export interface PublishedTrackResult {
  trackId: string;
  mid: string | null;
}

/** Port implemented by the Cloudflare Realtime SFU WebRTC media adapter. */
export interface CloudflareSfuMediaPort {
  connect(params: ConnectMediaParams): Promise<ConnectMediaResult>;
  disconnect(params: { roomId: string | null; reason?: string }): Promise<void>;
  startMicrophone(params: {
    options: MicrophoneOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult>;
  setMicrophoneMuted?(muted: boolean): Promise<void> | void;
  stopMicrophone(): Promise<void>;
  startCamera(params: {
    options: CameraOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult>;
  stopCamera(): Promise<void>;
  startScreenShare(params: {
    captureId: string;
    options: ScreenShareOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult>;
  updateScreenEncoding(params: {
    captureId: string;
    options: ScreenShareOptions;
    signal?: AbortSignal;
  }): Promise<void>;
  republishScreenShare(params: {
    captureId: string;
    options: ScreenShareOptions;
    previousOptions: ScreenShareOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult>;
  stopScreenShare(params: { captureId: string | null; reason?: string }): Promise<void>;
  startScreenAudio(params: {
    captureId: string;
    options: ScreenAudioOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult>;
  stopScreenAudio(params: { captureId: string | null }): Promise<void>;
}

/** Alias kept for compatibility with Fluxer MediaPort naming. */
export type MediaPort = CloudflareSfuMediaPort;

/** Port responsible for subscribing and unsubscribing remote participant tracks. */
export interface SubscriptionPort {
  subscribeTrack(params: {
    participantId: string;
    kind: RemoteTrackKind;
    preferredRid: SfuSimulcastRid | null;
    signal?: AbortSignal;
  }): Promise<void>;
  unsubscribeTrack(params: {
    participantId: string;
    kind: RemoteTrackKind;
    signal?: AbortSignal;
  }): Promise<void>;
}

/** Optional gateway signaling/telemetry hook provided by the host application. */
export interface GatewayPort {
  sendVoiceState?(state: {
    roomId: string | null;
    micMuted: boolean;
    cameraOn: boolean;
    screenSharing: boolean;
    screenAudioOn: boolean;
  }): Promise<void> | void;
  onGatewayEvent?(listener: (event: VoiceEngineEvent) => void): () => void;
  notifyEvent?(event: VoiceEngineEvent): void;
  reportError?(error: {
    resourceKey: ResourceKey;
    operationId: OperationId;
    message: string;
  }): void;
}

/** Host dependencies injected into VoiceEngineRuntime. */
export interface VoiceEngineHostPorts {
  media: CloudflareSfuMediaPort;
  subscriptions: SubscriptionPort;
  gateway?: GatewayPort;
}

export type SnapshotListener = (snapshot: VoiceEngineSnapshot, event: VoiceEngineEvent) => void;

/** Runtime driver contract consumed by VoiceEngineController and UI facades. */
export interface VoiceEngineDriver {
  getSnapshot(): VoiceEngineSnapshot;
  dispatch(event: VoiceEngineEvent): Promise<void>;
  subscribe(listener: SnapshotListener): () => void;
  dispose(): void;
}
