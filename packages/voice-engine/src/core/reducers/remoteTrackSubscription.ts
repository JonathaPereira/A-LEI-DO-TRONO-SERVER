import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { RemoteTrackSubscriptionState, VoiceEngineSnapshot } from '../../protocol/types.ts';
import { subscriptionMapKey, subscriptionResourceKey } from '../../protocol/types.ts';
import { allocateOperation, type VoiceEngineTransitionResult } from '../state.ts';

export type SubscriptionEvent = Extract<VoiceEngineEvent, { type: `subscription/${string}` }>;

export function reduceRemoteTrackSubscription(
  snapshot: VoiceEngineSnapshot,
  event: SubscriptionEvent,
): VoiceEngineTransitionResult {
  const key = subscriptionMapKey(event.participantId, event.kind);
  const existing = snapshot.subscriptions[key];

  switch (event.type) {
    case 'subscription/setRequested': {
      if (snapshot.connection.status !== 'connected') {
        return { snapshot, commands: [] };
      }

      const resourceKey = subscriptionResourceKey(event.participantId, event.kind);
      const preferredRid =
        event.preferredRid !== undefined ? event.preferredRid : (existing?.preferredRid ?? null);

      if (event.subscribed) {
        const alreadyDesired =
          (existing?.status === 'subscribed' || existing?.status === 'subscribing') &&
          existing.preferredRid === preferredRid;

        if (alreadyDesired) {
          return { snapshot, commands: [] };
        }

        const allocated = allocateOperation(snapshot, resourceKey);
        const nextEntry: RemoteTrackSubscriptionState = {
          key,
          participantId: event.participantId,
          kind: event.kind,
          status: 'subscribing',
          desiredSubscribed: true,
          preferredRid,
          operationId: allocated.operationId,
          lastError: null,
        };

        return {
          snapshot: {
            ...allocated.snapshot,
            subscriptions: {
              ...allocated.snapshot.subscriptions,
              [key]: nextEntry,
            },
          },
          commands: [
            {
              type: 'subscription.subscribe',
              operationId: allocated.operationId,
              resourceKey,
              participantId: event.participantId,
              kind: event.kind,
              preferredRid,
            },
          ],
        };
      }

      if (!existing || existing.status === 'unsubscribed' || existing.status === 'unsubscribing') {
        return { snapshot, commands: [] };
      }

      const allocated = allocateOperation(snapshot, resourceKey);
      const nextEntry: RemoteTrackSubscriptionState = {
        ...existing,
        status: 'unsubscribing',
        desiredSubscribed: false,
        operationId: allocated.operationId,
        lastError: null,
      };

      return {
        snapshot: {
          ...allocated.snapshot,
          subscriptions: {
            ...allocated.snapshot.subscriptions,
            [key]: nextEntry,
          },
        },
        commands: [
          {
            type: 'subscription.unsubscribe',
            operationId: allocated.operationId,
            resourceKey,
            participantId: event.participantId,
            kind: event.kind,
          },
        ],
      };
    }

    case 'subscription/subscribeSucceeded': {
      if (!existing || existing.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          subscriptions: {
            ...snapshot.subscriptions,
            [key]: {
              ...existing,
              status: 'subscribed',
              preferredRid: event.preferredRid,
              operationId: null,
              lastError: null,
            },
          },
        },
        commands: [],
      };
    }

    case 'subscription/subscribeFailed': {
      if (!existing || existing.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          subscriptions: {
            ...snapshot.subscriptions,
            [key]: {
              ...existing,
              status: 'unsubscribed',
              operationId: null,
              lastError: event.error,
            },
          },
        },
        commands: [],
      };
    }

    case 'subscription/unsubscribeSucceeded': {
      if (!existing || existing.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          subscriptions: {
            ...snapshot.subscriptions,
            [key]: {
              ...existing,
              status: 'unsubscribed',
              operationId: null,
              lastError: null,
            },
          },
        },
        commands: [],
      };
    }

    case 'subscription/unsubscribeFailed': {
      if (!existing || existing.operationId !== event.operationId) {
        return { snapshot, commands: [] };
      }
      return {
        snapshot: {
          ...snapshot,
          subscriptions: {
            ...snapshot.subscriptions,
            [key]: {
              ...existing,
              status: 'unsubscribed',
              operationId: null,
              lastError: event.error,
            },
          },
        },
        commands: [],
      };
    }
  }
}
