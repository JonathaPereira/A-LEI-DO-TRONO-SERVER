import type { SfuQualityPreset, SfuSimulcastRid } from '@trono/protocol';
import type {
  CameraOptions,
  MicrophoneOptions,
  OperationId,
  RemoteTrackKind,
  ScreenAudioOptions,
  ScreenShareOptions,
  SubscriptionResourceKey,
} from './types.ts';

export type VoiceEngineCommand =
  | {
      type: 'connection.connect';
      operationId: OperationId;
      resourceKey: 'connection';
      roomId: string;
      participantId: string;
      quality: SfuQualityPreset;
      token?: string;
      sfuUrl?: string;
    }
  | {
      type: 'connection.disconnect';
      operationId: OperationId;
      resourceKey: 'connection';
      roomId: string | null;
      reason?: string;
    }
  | {
      type: 'microphone.start';
      operationId: OperationId;
      resourceKey: 'microphone';
      options: MicrophoneOptions;
    }
  | {
      type: 'microphone.setMuted';
      operationId: OperationId;
      resourceKey: 'microphone';
      muted: boolean;
    }
  | {
      type: 'microphone.stop';
      operationId: OperationId;
      resourceKey: 'microphone';
    }
  | {
      type: 'camera.start';
      operationId: OperationId;
      resourceKey: 'camera';
      options: CameraOptions;
    }
  | {
      type: 'camera.stop';
      operationId: OperationId;
      resourceKey: 'camera';
    }
  | {
      type: 'screen.start';
      operationId: OperationId;
      resourceKey: 'screen';
      captureId: string;
      options: ScreenShareOptions;
    }
  | {
      type: 'screen.updateEncoding';
      operationId: OperationId;
      resourceKey: 'screen';
      captureId: string;
      options: ScreenShareOptions;
    }
  | {
      type: 'screen.republish';
      operationId: OperationId;
      resourceKey: 'screen';
      captureId: string;
      options: ScreenShareOptions;
      previousOptions: ScreenShareOptions;
    }
  | {
      type: 'screen.stop';
      operationId: OperationId;
      resourceKey: 'screen';
      captureId: string | null;
      reason?: string;
    }
  | {
      type: 'screenAudio.start';
      operationId: OperationId;
      resourceKey: 'screenAudio';
      captureId: string;
      options: ScreenAudioOptions;
    }
  | {
      type: 'screenAudio.stop';
      operationId: OperationId;
      resourceKey: 'screenAudio';
      captureId: string | null;
    }
  | {
      type: 'subscription.subscribe';
      operationId: OperationId;
      resourceKey: SubscriptionResourceKey;
      participantId: string;
      kind: RemoteTrackKind;
      preferredRid: SfuSimulcastRid | null;
    }
  | {
      type: 'subscription.unsubscribe';
      operationId: OperationId;
      resourceKey: SubscriptionResourceKey;
      participantId: string;
      kind: RemoteTrackKind;
    };
