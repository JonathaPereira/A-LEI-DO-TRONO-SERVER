import type {
  RemoteParticipantState,
  RemoteTrackKind,
  RemoteTrackPublication,
  RemoteTrackSubscriptionState,
  ResourceKey,
  VoiceEngineSnapshot,
} from '../protocol/types.ts';
import { subscriptionMapKey } from '../protocol/types.ts';
import { getActiveOperationId } from './state.ts';

export function isConnected(snapshot: VoiceEngineSnapshot): boolean {
  return snapshot.connection.status === 'connected';
}

export function isConnecting(snapshot: VoiceEngineSnapshot): boolean {
  return (
    snapshot.connection.status === 'connecting' || snapshot.connection.status === 'reconnecting'
  );
}

export function isMicrophonePublished(snapshot: VoiceEngineSnapshot): boolean {
  return snapshot.microphone.status === 'published';
}

export function isCameraPublished(snapshot: VoiceEngineSnapshot): boolean {
  return snapshot.camera.status === 'published';
}

export function isScreenPublished(snapshot: VoiceEngineSnapshot): boolean {
  return (
    snapshot.screen.status === 'published' ||
    snapshot.screen.status === 'updating' ||
    snapshot.screen.status === 'republishing'
  );
}

export function isScreenAudioPublished(snapshot: VoiceEngineSnapshot): boolean {
  return snapshot.screenAudio.status === 'published';
}

export function selectParticipants(snapshot: VoiceEngineSnapshot): RemoteParticipantState[] {
  return Object.values(snapshot.room.participants);
}

export function selectParticipant(
  snapshot: VoiceEngineSnapshot,
  participantId: string,
): RemoteParticipantState | undefined {
  return snapshot.room.participants[participantId];
}

export function selectRemoteTrack(
  snapshot: VoiceEngineSnapshot,
  participantId: string,
  kind: RemoteTrackKind,
): RemoteTrackPublication | undefined {
  return snapshot.room.participants[participantId]?.tracks[kind];
}

export function selectSubscription(
  snapshot: VoiceEngineSnapshot,
  participantId: string,
  kind: RemoteTrackKind,
): RemoteTrackSubscriptionState | undefined {
  return snapshot.subscriptions[subscriptionMapKey(participantId, kind)];
}

export function selectActiveResourceOperation(
  snapshot: VoiceEngineSnapshot,
  resourceKey: ResourceKey,
) {
  return getActiveOperationId(snapshot, resourceKey);
}
