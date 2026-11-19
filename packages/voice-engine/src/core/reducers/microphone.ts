import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { MicrophoneOptions, VoiceEngineSnapshot } from '../../protocol/types.ts';
import { allocateOperation, type VoiceEngineTransitionResult } from '../state.ts';

export type MicrophoneEvent = Extract<VoiceEngineEvent, { type: `microphone/${string}` }>;

function sameMicOptions(
  a: MicrophoneOptions | null | undefined,
  b: MicrophoneOptions | null | undefined,
): boolean {
  return (
    a?.deviceId === b?.deviceId &&
    a?.echoCancellation === b?.echoCancellation &&
    a?.noiseSuppression === b?.noiseSuppression &&
    a?.autoGainControl === b?.autoGainControl &&
    a?.muted === b?.muted
  );
}

export function reduceMicrophone(
  snapshot: VoiceEngineSnapshot,
  event: MicrophoneEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'microphone/startRequested': {
      if (snapshot.connection.status !== 'connected') {
        return {
          snapshot: {
            ...snapshot,
            microphone: {
              ...snapshot.microphone,
              lastError: 'Cannot start microphone while disconnected',
            },
          },
          commands: [],
        };
      }

      const nextOptions: MicrophoneOptions = event.options ?? {};
      if (
        (snapshot.microphone.status === 'starting' || snapshot.microphone.status === 'published') &&
        sameMicOptions(snapshot.microphone.options, nextOptions)
      ) {
        return { snapshot, commands: [] };
      }

      const allocated = allocateOperation(snapshot, 'microphone');
      const nextMuted = nextOptions.muted ?? snapshot.microphone.muted;

      return {
        snapshot: {
          ...allocated.snapshot,
          microphone: {
            ...allocated.snapshot.microphone,
            status: 'starting',
            muted: nextMuted,
            options: nextOptions,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'microphone.start',
            operationId: allocated.operationId,
            resourceKey: 'microphone',
            options: nextOptions,
          },
        ],
      };
    }

    case 'microphone/startSucceeded': {
      if (snapshot.microphone.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          microphone: {
            ...snapshot.microphone,
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

    case 'microphone/startFailed': {
      if (snapshot.microphone.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          microphone: {
            ...snapshot.microphone,
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

    case 'microphone/muteChanged': {
      if (snapshot.microphone.muted === event.muted) {
        return { snapshot, commands: [] };
      }
      const allocated = allocateOperation(snapshot, 'microphone');
      const shouldNotifyPort =
        snapshot.microphone.status === 'starting' || snapshot.microphone.status === 'published';

      return {
        snapshot: {
          ...allocated.snapshot,
          microphone: {
            ...allocated.snapshot.microphone,
            muted: event.muted,
          },
        },
        commands: shouldNotifyPort
          ? [
              {
                type: 'microphone.setMuted',
                operationId: allocated.operationId,
                resourceKey: 'microphone',
                muted: event.muted,
              },
            ]
          : [],
      };
    }

    case 'microphone/stopRequested': {
      if (snapshot.microphone.status === 'stopped' || snapshot.microphone.status === 'stopping') {
        return { snapshot, commands: [] };
      }

      const allocated = allocateOperation(snapshot, 'microphone');
      return {
        snapshot: {
          ...allocated.snapshot,
          microphone: {
            ...allocated.snapshot.microphone,
            status: 'stopping',
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'microphone.stop',
            operationId: allocated.operationId,
            resourceKey: 'microphone',
          },
        ],
      };
    }

    case 'microphone/stopSucceeded': {
      if (snapshot.microphone.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          microphone: {
            ...snapshot.microphone,
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

    case 'microphone/stopFailed': {
      if (snapshot.microphone.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          microphone: {
            ...snapshot.microphone,
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
