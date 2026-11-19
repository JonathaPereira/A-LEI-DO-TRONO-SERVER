import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { VoiceEngineSnapshot } from '../../protocol/types.ts';
import {
  allocateOperation,
  resetRoomAndMediaState,
  type VoiceEngineTransitionResult,
} from '../state.ts';

export type ConnectionEvent = Extract<VoiceEngineEvent, { type: `connection/${string}` }>;

export function reduceConnection(
  snapshot: VoiceEngineSnapshot,
  event: ConnectionEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'connection/connectRequested': {
      const quality = event.quality ?? snapshot.connection.quality;
      const isSameSession =
        (snapshot.connection.status === 'connected' ||
          snapshot.connection.status === 'connecting') &&
        snapshot.connection.roomId === event.roomId &&
        snapshot.connection.participantId === event.participantId;

      if (isSameSession) {
        return { snapshot, commands: [] };
      }

      const wasActive = snapshot.connection.status !== 'disconnected';
      const cleaned = resetRoomAndMediaState(snapshot);
      const allocated = allocateOperation(cleaned, 'connection');

      return {
        snapshot: {
          ...allocated.snapshot,
          connection: {
            status: 'connecting',
            roomId: event.roomId,
            participantId: event.participantId,
            publisherSessionId: null,
            subscriberSessionId: null,
            quality,
            operationId: allocated.operationId,
            generation: wasActive
              ? snapshot.connection.generation + 1
              : snapshot.connection.generation,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'connection.connect',
            operationId: allocated.operationId,
            resourceKey: 'connection',
            roomId: event.roomId,
            participantId: event.participantId,
            quality,
            token: event.token,
            sfuUrl: event.sfuUrl,
          },
        ],
      };
    }

    case 'connection/connectSucceeded': {
      if (snapshot.connection.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          connection: {
            ...snapshot.connection,
            status: 'connected',
            roomId: event.roomId,
            participantId: event.participantId,
            publisherSessionId: event.publisherSessionId,
            subscriberSessionId: event.subscriberSessionId,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'connection/connectFailed': {
      if (snapshot.connection.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      const cleaned = resetRoomAndMediaState(snapshot);
      return {
        snapshot: {
          ...cleaned,
          connection: {
            ...cleaned.connection,
            status: 'disconnected',
            roomId: null,
            participantId: null,
            publisherSessionId: null,
            subscriberSessionId: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'connection/reconnecting': {
      if (
        snapshot.connection.status !== 'connected' &&
        snapshot.connection.status !== 'reconnecting'
      ) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          connection: {
            ...snapshot.connection,
            status: 'reconnecting',
            lastError: event.reason ?? snapshot.connection.lastError,
          },
        },
        commands: [],
      };
    }

    case 'connection/reconnected': {
      if (
        snapshot.connection.status !== 'reconnecting' &&
        snapshot.connection.status !== 'connected'
      ) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          connection: {
            ...snapshot.connection,
            status: 'connected',
            publisherSessionId: event.publisherSessionId ?? snapshot.connection.publisherSessionId,
            subscriberSessionId:
              event.subscriberSessionId ?? snapshot.connection.subscriberSessionId,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'connection/disconnectRequested': {
      if (
        snapshot.connection.status === 'disconnected' ||
        snapshot.connection.status === 'disconnecting'
      ) {
        return { snapshot, commands: [] };
      }

      const previousRoomId = snapshot.connection.roomId;
      const cleaned = resetRoomAndMediaState(snapshot);
      const allocated = allocateOperation(cleaned, 'connection');

      return {
        snapshot: {
          ...allocated.snapshot,
          connection: {
            ...allocated.snapshot.connection,
            status: 'disconnecting',
            operationId: allocated.operationId,
            generation: snapshot.connection.generation + 1,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'connection.disconnect',
            operationId: allocated.operationId,
            resourceKey: 'connection',
            roomId: previousRoomId,
            reason: event.reason,
          },
        ],
      };
    }

    case 'connection/disconnectSucceeded': {
      if (snapshot.connection.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      const cleaned = resetRoomAndMediaState(snapshot);
      return {
        snapshot: {
          ...cleaned,
          connection: {
            ...cleaned.connection,
            status: 'disconnected',
            roomId: null,
            participantId: null,
            publisherSessionId: null,
            subscriberSessionId: null,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'connection/disconnectFailed': {
      if (snapshot.connection.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      const cleaned = resetRoomAndMediaState(snapshot);
      return {
        snapshot: {
          ...cleaned,
          connection: {
            ...cleaned.connection,
            status: 'disconnected',
            roomId: null,
            participantId: null,
            publisherSessionId: null,
            subscriberSessionId: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'connection/lost': {
      const cleaned = resetRoomAndMediaState(snapshot);
      return {
        snapshot: {
          ...cleaned,
          connection: {
            ...cleaned.connection,
            status: 'disconnected',
            roomId: null,
            participantId: null,
            publisherSessionId: null,
            subscriberSessionId: null,
            operationId: null,
            generation: snapshot.connection.generation + 1,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }
  }
}
