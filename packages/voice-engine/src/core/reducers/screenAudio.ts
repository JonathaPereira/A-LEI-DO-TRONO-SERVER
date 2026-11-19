import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { ScreenAudioOptions, VoiceEngineSnapshot } from '../../protocol/types.ts';
import { allocateOperation, type VoiceEngineTransitionResult } from '../state.ts';

export type ScreenAudioEvent = Extract<VoiceEngineEvent, { type: `screenAudio/${string}` }>;

export function reduceScreenAudio(
  snapshot: VoiceEngineSnapshot,
  event: ScreenAudioEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'screenAudio/startRequested': {
      if (snapshot.connection.status !== 'connected') {
        return {
          snapshot: {
            ...snapshot,
            screenAudio: {
              ...snapshot.screenAudio,
              lastError: 'Cannot start screen audio while disconnected',
            },
          },
          commands: [],
        };
      }

      if (
        (snapshot.screenAudio.status === 'starting' ||
          snapshot.screenAudio.status === 'published') &&
        snapshot.screenAudio.captureId === event.captureId
      ) {
        return { snapshot, commands: [] };
      }

      const nextOptions: ScreenAudioOptions = event.options ?? {};
      const allocated = allocateOperation(snapshot, 'screenAudio');

      return {
        snapshot: {
          ...allocated.snapshot,
          screenAudio: {
            ...allocated.snapshot.screenAudio,
            status: 'starting',
            captureId: event.captureId,
            options: nextOptions,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'screenAudio.start',
            operationId: allocated.operationId,
            resourceKey: 'screenAudio',
            captureId: event.captureId,
            options: nextOptions,
          },
        ],
      };
    }

    case 'screenAudio/startSucceeded': {
      if (snapshot.screenAudio.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screenAudio: {
            ...snapshot.screenAudio,
            status: 'published',
            captureId: event.captureId,
            options: event.options,
            trackId: event.trackId,
            mid: event.mid,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'screenAudio/startFailed': {
      if (snapshot.screenAudio.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screenAudio: {
            ...snapshot.screenAudio,
            status: 'stopped',
            captureId: null,
            trackId: null,
            mid: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'screenAudio/stopRequested': {
      if (snapshot.screenAudio.status === 'stopped' || snapshot.screenAudio.status === 'stopping') {
        return { snapshot, commands: [] };
      }

      const captureId = snapshot.screenAudio.captureId;
      const allocated = allocateOperation(snapshot, 'screenAudio');

      return {
        snapshot: {
          ...allocated.snapshot,
          screenAudio: {
            ...allocated.snapshot.screenAudio,
            status: 'stopping',
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'screenAudio.stop',
            operationId: allocated.operationId,
            resourceKey: 'screenAudio',
            captureId,
          },
        ],
      };
    }

    case 'screenAudio/stopSucceeded': {
      if (snapshot.screenAudio.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screenAudio: {
            ...snapshot.screenAudio,
            status: 'stopped',
            captureId: null,
            trackId: null,
            mid: null,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'screenAudio/stopFailed': {
      if (snapshot.screenAudio.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screenAudio: {
            ...snapshot.screenAudio,
            status: 'stopped',
            captureId: null,
            trackId: null,
            mid: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }
  }
}
