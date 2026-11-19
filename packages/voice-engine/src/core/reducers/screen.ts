import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { ScreenShareOptions, VoiceEngineSnapshot } from '../../protocol/types.ts';
import { allocateOperation, type VoiceEngineTransitionResult } from '../state.ts';

export type ScreenEvent = Extract<VoiceEngineEvent, { type: `screen/${string}` }>;

/** Compares two ScreenShareOptions values using normalized codec and boolean flags. */
export function sameScreenOptions(
  a: ScreenShareOptions | null | undefined,
  b: ScreenShareOptions | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.frameRate === b.frameRate &&
    a.maxBitrateBps === b.maxBitrateBps &&
    (a.codec ?? 'auto') === (b.codec ?? 'auto') &&
    Boolean(a.hardwareEncoding) === Boolean(b.hardwareEncoding) &&
    Boolean(a.zeroCopyRequired) === Boolean(b.zeroCopyRequired) &&
    a.contentHint === b.contentHint &&
    Boolean(a.captureAudio) === Boolean(b.captureAudio) &&
    Boolean(a.simulcast) === Boolean(b.simulcast) &&
    a.quality === b.quality &&
    a.sourceId === b.sourceId
  );
}

function requiresRepublish(current: ScreenShareOptions, next: ScreenShareOptions): boolean {
  return (
    (current.codec ?? 'auto') !== (next.codec ?? 'auto') ||
    Boolean(current.hardwareEncoding) !== Boolean(next.hardwareEncoding) ||
    Boolean(current.zeroCopyRequired) !== Boolean(next.zeroCopyRequired)
  );
}

export function reduceScreen(
  snapshot: VoiceEngineSnapshot,
  event: ScreenEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'screen/startRequested': {
      if (snapshot.connection.status !== 'connected') {
        return {
          snapshot: {
            ...snapshot,
            screen: {
              ...snapshot.screen,
              lastError: 'Cannot start screen share while disconnected',
            },
          },
          commands: [],
        };
      }

      const nextOptions: ScreenShareOptions = event.options ?? {};
      if (
        (snapshot.screen.status === 'starting' || snapshot.screen.status === 'published') &&
        snapshot.screen.captureId === event.captureId &&
        sameScreenOptions(snapshot.screen.options, nextOptions)
      ) {
        return { snapshot, commands: [] };
      }

      const allocated = allocateOperation(snapshot, 'screen');
      return {
        snapshot: {
          ...allocated.snapshot,
          screen: {
            ...allocated.snapshot.screen,
            status: 'starting',
            captureId: event.captureId,
            options: nextOptions,
            pendingOptions: null,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'screen.start',
            operationId: allocated.operationId,
            resourceKey: 'screen',
            captureId: event.captureId,
            options: nextOptions,
          },
        ],
      };
    }

    case 'screen/startSucceeded': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'published',
            captureId: event.captureId,
            options: event.options,
            pendingOptions: null,
            trackId: event.trackId,
            mid: event.mid,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'screen/startFailed': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'stopped',
            captureId: null,
            pendingOptions: null,
            trackId: null,
            mid: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'screen/encodingUpdateRequested': {
      if (snapshot.screen.status !== 'published' || !snapshot.screen.captureId) {
        return {
          snapshot: {
            ...snapshot,
            screen: {
              ...snapshot.screen,
              lastError: 'Screen share is not published',
            },
          },
          commands: [],
        };
      }

      if (event.captureId !== undefined && event.captureId !== snapshot.screen.captureId) {
        return {
          snapshot: {
            ...snapshot,
            screen: {
              ...snapshot.screen,
              lastError: 'Screen share captureId mismatch',
            },
          },
          commands: [],
        };
      }

      const currentOptions: ScreenShareOptions = snapshot.screen.options ?? {};
      const nextOptions: ScreenShareOptions = {
        ...currentOptions,
        ...event.options,
      };

      if (sameScreenOptions(currentOptions, nextOptions)) {
        return {
          snapshot: {
            ...snapshot,
            screen: {
              ...snapshot.screen,
              lastError: null,
            },
          },
          commands: [],
        };
      }

      const captureId = snapshot.screen.captureId;
      const allocated = allocateOperation(snapshot, 'screen');

      if (requiresRepublish(currentOptions, nextOptions)) {
        return {
          snapshot: {
            ...allocated.snapshot,
            screen: {
              ...allocated.snapshot.screen,
              status: 'republishing',
              pendingOptions: nextOptions,
              operationId: allocated.operationId,
              lastError: null,
            },
          },
          commands: [
            {
              type: 'screen.republish',
              operationId: allocated.operationId,
              resourceKey: 'screen',
              captureId,
              options: nextOptions,
              previousOptions: currentOptions,
            },
          ],
        };
      }

      return {
        snapshot: {
          ...allocated.snapshot,
          screen: {
            ...allocated.snapshot.screen,
            status: 'updating',
            pendingOptions: nextOptions,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'screen.updateEncoding',
            operationId: allocated.operationId,
            resourceKey: 'screen',
            captureId,
            options: nextOptions,
          },
        ],
      };
    }

    case 'screen/encodingUpdateSucceeded': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'published',
            captureId: event.captureId,
            options: event.options,
            pendingOptions: null,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'screen/encodingUpdateFailed': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'published',
            pendingOptions: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'screen/republishSucceeded': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'published',
            captureId: event.captureId,
            options: event.options,
            pendingOptions: null,
            trackId: event.trackId,
            mid: event.mid,
            operationId: null,
            lastError: null,
          },
        },
        commands: [],
      };
    }

    case 'screen/republishFailed': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'stopped',
            captureId: null,
            pendingOptions: null,
            trackId: null,
            mid: null,
            operationId: null,
            lastError: event.error,
          },
        },
        commands: [],
      };
    }

    case 'screen/stopRequested': {
      if (snapshot.screen.status === 'stopped' || snapshot.screen.status === 'stopping') {
        return { snapshot, commands: [] };
      }

      const captureId = snapshot.screen.captureId;
      const allocated = allocateOperation(snapshot, 'screen');
      return {
        snapshot: {
          ...allocated.snapshot,
          screen: {
            ...allocated.snapshot.screen,
            status: 'stopping',
            pendingOptions: null,
            operationId: allocated.operationId,
            lastError: null,
          },
        },
        commands: [
          {
            type: 'screen.stop',
            operationId: allocated.operationId,
            resourceKey: 'screen',
            captureId,
            reason: event.reason,
          },
        ],
      };
    }

    case 'screen/stopSucceeded': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
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
        },
        commands: [],
      };
    }

    case 'screen/stopFailed': {
      if (snapshot.screen.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          screen: {
            ...snapshot.screen,
            status: 'stopped',
            captureId: null,
            pendingOptions: null,
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
