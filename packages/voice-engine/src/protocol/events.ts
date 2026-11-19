import type { SfuQualityPreset, SfuSimulcastRid } from '@trono/protocol';
import type {
  CameraOptions,
  MicrophoneOptions,
  OperationId,
  RemoteParticipantState,
  RemoteTrackKind,
  RemoteTrackPublication,
  ScreenAudioOptions,
  ScreenShareOptions,
} from './types.ts';

export type VoiceEngineEvent =
  // Connection
  | {
      type: 'connection/connectRequested';
      roomId: string;
      participantId: string;
      quality?: SfuQualityPreset;
      token?: string;
      sfuUrl?: string;
    }
  | {
      type: 'connection/connectSucceeded';
      operationId: OperationId;
      roomId: string;
      participantId: string;
      publisherSessionId: string;
      subscriberSessionId: string;
    }
  | {
      type: 'connection/connectFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'connection/reconnecting';
      reason?: string;
    }
  | {
      type: 'connection/reconnected';
      publisherSessionId?: string;
      subscriberSessionId?: string;
    }
  | {
      type: 'connection/disconnectRequested';
      reason?: string;
    }
  | {
      type: 'connection/disconnectSucceeded';
      operationId: OperationId;
    }
  | {
      type: 'connection/disconnectFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'connection/lost';
      error: string;
    }
  // Room
  | {
      type: 'room/snapshotSynced';
      participants: RemoteParticipantState[];
    }
  | {
      type: 'room/participantJoined';
      participantId: string;
      displayName?: string;
    }
  | {
      type: 'room/participantLeft';
      participantId: string;
    }
  | {
      type: 'room/participantUpdated';
      participantId: string;
      displayName?: string;
      speaking?: boolean;
      muted?: boolean;
    }
  | {
      type: 'room/trackPublished';
      participantId: string;
      track: RemoteTrackPublication;
    }
  | {
      type: 'room/trackUnpublished';
      participantId: string;
      kind: RemoteTrackKind;
    }
  // Microphone
  | {
      type: 'microphone/startRequested';
      options?: MicrophoneOptions;
    }
  | {
      type: 'microphone/startSucceeded';
      operationId: OperationId;
      trackId: string;
      mid: string | null;
      options: MicrophoneOptions;
    }
  | {
      type: 'microphone/startFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'microphone/muteChanged';
      muted: boolean;
    }
  | {
      type: 'microphone/stopRequested';
    }
  | {
      type: 'microphone/stopSucceeded';
      operationId: OperationId;
    }
  | {
      type: 'microphone/stopFailed';
      operationId: OperationId;
      error: string;
    }
  // Camera
  | {
      type: 'camera/startRequested';
      options?: CameraOptions;
    }
  | {
      type: 'camera/startSucceeded';
      operationId: OperationId;
      trackId: string;
      mid: string | null;
      options: CameraOptions;
    }
  | {
      type: 'camera/startFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'camera/stopRequested';
    }
  | {
      type: 'camera/stopSucceeded';
      operationId: OperationId;
    }
  | {
      type: 'camera/stopFailed';
      operationId: OperationId;
      error: string;
    }
  // Screen
  | {
      type: 'screen/startRequested';
      captureId: string;
      options?: ScreenShareOptions;
    }
  | {
      type: 'screen/startSucceeded';
      operationId: OperationId;
      captureId: string;
      trackId: string;
      mid: string | null;
      options: ScreenShareOptions;
    }
  | {
      type: 'screen/startFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'screen/encodingUpdateRequested';
      captureId?: string;
      options: ScreenShareOptions;
      force?: boolean;
    }
  | {
      type: 'screen/encodingUpdateSucceeded';
      operationId: OperationId;
      captureId: string;
      options: ScreenShareOptions;
    }
  | {
      type: 'screen/encodingUpdateFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'screen/republishSucceeded';
      operationId: OperationId;
      captureId: string;
      trackId: string;
      mid: string | null;
      options: ScreenShareOptions;
    }
  | {
      type: 'screen/republishFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'screen/stopRequested';
      reason?: string;
    }
  | {
      type: 'screen/stopSucceeded';
      operationId: OperationId;
    }
  | {
      type: 'screen/stopFailed';
      operationId: OperationId;
      error: string;
    }
  // Screen Audio
  | {
      type: 'screenAudio/startRequested';
      captureId: string;
      options?: ScreenAudioOptions;
    }
  | {
      type: 'screenAudio/startSucceeded';
      operationId: OperationId;
      captureId: string;
      trackId: string;
      mid: string | null;
      options: ScreenAudioOptions;
    }
  | {
      type: 'screenAudio/startFailed';
      operationId: OperationId;
      error: string;
    }
  | {
      type: 'screenAudio/stopRequested';
    }
  | {
      type: 'screenAudio/stopSucceeded';
      operationId: OperationId;
    }
  | {
      type: 'screenAudio/stopFailed';
      operationId: OperationId;
      error: string;
    }
  // Remote Track Subscriptions
  | {
      type: 'subscription/setRequested';
      participantId: string;
      kind: RemoteTrackKind;
      subscribed: boolean;
      preferredRid?: SfuSimulcastRid | null;
    }
  | {
      type: 'subscription/subscribeSucceeded';
      operationId: OperationId;
      participantId: string;
      kind: RemoteTrackKind;
      preferredRid: SfuSimulcastRid | null;
    }
  | {
      type: 'subscription/subscribeFailed';
      operationId: OperationId;
      participantId: string;
      kind: RemoteTrackKind;
      error: string;
    }
  | {
      type: 'subscription/unsubscribeSucceeded';
      operationId: OperationId;
      participantId: string;
      kind: RemoteTrackKind;
    }
  | {
      type: 'subscription/unsubscribeFailed';
      operationId: OperationId;
      participantId: string;
      kind: RemoteTrackKind;
      error: string;
    };
