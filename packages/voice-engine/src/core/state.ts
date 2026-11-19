import type { VoiceEngineCommand } from '../protocol/commands.ts';
import type {
  ActiveOperation,
  OperationId,
  RemoteTrackKind,
  ResourceKey,
  VoiceEngineSnapshot,
} from '../protocol/types.ts';
import { subscriptionMapKey } from '../protocol/types.ts';

export interface VoiceEngineTransitionResult {
  snapshot: VoiceEngineSnapshot;
  commands: VoiceEngineCommand[];
}

export function createInitialVoiceEngineSnapshot(): VoiceEngineSnapshot {
  return {
    nextOperationId: 1,
    connection: {
      status: 'disconnected',
      roomId: null,
      participantId: null,
      publisherSessionId: null,
      subscriberSessionId: null,
      quality: 'balanced',
      operationId: null,
      generation: 0,
      lastError: null,
    },
    room: {
      participants: {},
    },
    microphone: {
      status: 'stopped',
      muted: false,
      options: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    camera: {
      status: 'stopped',
      options: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    screen: {
      status: 'stopped',
      captureId: null,
      options: null,
      pendingOptions: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    screenAudio: {
      status: 'stopped',
      captureId: null,
      options: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    subscriptions: {},
  };
}

/** Allocates a monotonically increasing operationId for a resource transition. */
export function allocateOperation(
  snapshot: VoiceEngineSnapshot,
  resourceKey: ResourceKey,
): {
  snapshot: VoiceEngineSnapshot;
  operationId: OperationId;
  operation: ActiveOperation;
} {
  const operationId = snapshot.nextOperationId;
  return {
    snapshot: {
      ...snapshot,
      nextOperationId: operationId + 1,
    },
    operationId,
    operation: {
      operationId,
      resourceKey,
    },
  };
}

export function getActiveOperationId(
  snapshot: VoiceEngineSnapshot,
  resourceKey: ResourceKey,
): OperationId | null {
  switch (resourceKey) {
    case 'connection':
      return snapshot.connection.operationId;
    case 'microphone':
      return snapshot.microphone.operationId;
    case 'camera':
      return snapshot.camera.operationId;
    case 'screen':
      return snapshot.screen.operationId;
    case 'screenAudio':
      return snapshot.screenAudio.operationId;
    default: {
      // subscription:${participantId}:${kind}
      const prefix = 'subscription:';
      if (!resourceKey.startsWith(prefix)) return null;
      const rest = resourceKey.slice(prefix.length);
      const separatorIndex = rest.lastIndexOf(':');
      if (separatorIndex <= 0) return null;
      const participantId = rest.slice(0, separatorIndex);
      const kind = rest.slice(separatorIndex + 1) as RemoteTrackKind;
      return snapshot.subscriptions[subscriptionMapKey(participantId, kind)]?.operationId ?? null;
    }
  }
}

/**
 * Returns true when an async command's operationId no longer matches the
 * currently active operation for its resourceKey (superseded, cancelled, or reset).
 */
export function isCommandCompletionStale(
  snapshot: VoiceEngineSnapshot,
  command: Pick<VoiceEngineCommand, 'resourceKey' | 'operationId'>,
): boolean {
  const activeOpId = getActiveOperationId(snapshot, command.resourceKey);
  return activeOpId === null || activeOpId !== command.operationId;
}

/** Clears room participants, local media tracks, and remote subscriptions on session teardown. */
export function resetRoomAndMediaState(snapshot: VoiceEngineSnapshot): VoiceEngineSnapshot {
  return {
    ...snapshot,
    room: {
      participants: {},
    },
    microphone: {
      ...snapshot.microphone,
      status: 'stopped',
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    camera: {
      ...snapshot.camera,
      status: 'stopped',
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    screen: {
      ...snapshot.screen,
      status: 'stopped',
      captureId: null,
      pendingOptions: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    screenAudio: {
      ...snapshot.screenAudio,
      status: 'stopped',
      captureId: null,
      trackId: null,
      mid: null,
      operationId: null,
      lastError: null,
    },
    subscriptions: {},
  };
}
