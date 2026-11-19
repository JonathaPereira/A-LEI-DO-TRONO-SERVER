import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { CameraOptions, VoiceEngineSnapshot } from '../../protocol/types.ts';
import { allocateOperation, type VoiceEngineTransitionResult } from '../state.ts';

export type CameraEvent = Extract<VoiceEngineEvent, { type: `camera/${string}` }>;

function sameCameraOptions(
  a: CameraOptions | null | undefined,
  b: CameraOptions | null | undefined,
): boolean {
  return (
    a?.deviceId === b?.deviceId &&
    a?.width === b?.width &&
    a?.height === b?.height &&
    a?.frameRate === b?.frameRate &&
    a?.maxBitrateBps === b?.maxBitrateBps &&
    a?.codec === b?.codec
  );
}

export function reduceCamera(
  snapshot: VoiceEngineSnapshot,
  event: CameraEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'camera/startRequested': {
      if (snapshot.connection.status !== 'connected') {
        return {
          snapshot: {
            ...snapshot,
            camera: {
              ...snapshot.camera,
              lastError: 'Cannot start camera while disconnected',
            },
          },
          commands: [],
        };
      }

      const nextOptions: CameraOptions = event.options ?? {};
      if (
        (snapshot.camera.status === 'starting' || snapshot.camera.status === 'published') &&
        sameCameraOptions(snapshot.camera.options, nextOptions)
      ) {
        return { snapshot, commands: [] };
      }

      const allocated = allocateOperation(snapshot, 'camera');
      return {
        snapshot: {
          ...allocated.snapshot,
          camera: {
            ...allocated.snapshot.camera,
            status: 'starting',
            options: nextOptions,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'camera.start',
            operationId: allocated.operationId,
            resourceKey: 'camera',
            options: nextOptions,
          },
        ],
      };
    }

    case 'camera/startSucceeded': {
      if (snapshot.camera.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          camera: {
            ...snapshot.camera,
            status: 'published',
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

    case 'camera/startFailed': {
      if (snapshot.camera.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          camera: {
            ...snapshot.camera,
            status: 'stopped',
            trackId: null,
            mid: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'camera/stopRequested': {
      if (snapshot.camera.status === 'stopped' || snapshot.camera.status === 'stopping') {
        return { snapshot, commands: [] };
      }
      const allocated = allocateOperation(snapshot, 'camera');
      return {
        snapshot: {
          ...allocated.snapshot,
          camera: {
            ...allocated.snapshot.camera,
            status: 'stopping',
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'camera.stop',
            operationId: allocated.operationId,
            resourceKey: 'camera',
          },
        ],
      };
    }

    case 'camera/stopSucceeded': {
      if (snapshot.camera.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          camera: {
            ...snapshot.camera,
            status: 'stopped',
            trackId: null,
            mid: null,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'camera/stopFailed': {
      if (snapshot.camera.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          camera: {
            ...snapshot.camera,
            status: 'stopped',
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
