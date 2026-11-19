import type { VoiceEngineEvent } from '../../protocol/events.ts';
import type { RemoteParticipantState, VoiceEngineSnapshot } from '../../protocol/types.ts';
import type { VoiceEngineTransitionResult } from '../state.ts';

export type RoomEvent = Extract<VoiceEngineEvent, { type: `room/${string}` }>;

export function reduceRoom(
  snapshot: VoiceEngineSnapshot,
  event: RoomEvent,
): VoiceEngineTransitionResult {
  switch (event.type) {
    case 'room/snapshotSynced': {
      const participants: Record<string, RemoteParticipantState> = {};
      for (const participant of event.participants) {
        participants[participant.participantId] = {
          ...participant,
          tracks: { ...participant.tracks },
        };
      }
      return {
        snapshot: {
          ...snapshot,
          room: { participants },
        },
        commands: [],
      };
    }

    case 'room/participantJoined': {
      const existing = snapshot.room.participants[event.participantId];
      const nextParticipant: RemoteParticipantState = existing
        ? {
            ...existing,
            displayName: event.displayName ?? existing.displayName,
          }
        : {
            participantId: event.participantId,
            displayName: event.displayName,
            tracks: {},
          };
      return {
        snapshot: {
          ...snapshot,
          room: {
            participants: {
              ...snapshot.room.participants,
              [event.participantId]: nextParticipant,
            },
          },
        },
        commands: [],
      };
    }

    case 'room/participantLeft': {
      if (!(event.participantId in snapshot.room.participants)) {
        return { snapshot, commands: [] };
      }
      const { [event.participantId]: _removed, ...rest } = snapshot.room.participants;
      return {
        snapshot: {
          ...snapshot,
          room: { participants: rest },
        },
        commands: [],
      };
    }

    case 'room/participantUpdated': {
      const existing = snapshot.room.participants[event.participantId] ?? {
        participantId: event.participantId,
        tracks: {},
      };
      return {
        snapshot: {
          ...snapshot,
          room: {
            participants: {
              ...snapshot.room.participants,
              [event.participantId]: {
                ...existing,
                displayName: event.displayName ?? existing.displayName,
                speaking: event.speaking ?? existing.speaking,
                muted: event.muted ?? existing.muted,
              },
            },
          },
        },
        commands: [],
      };
    }

    case 'room/trackPublished': {
      const existing = snapshot.room.participants[event.participantId] ?? {
        participantId: event.participantId,
        tracks: {},
      };
      return {
        snapshot: {
          ...snapshot,
          room: {
            participants: {
              ...snapshot.room.participants,
              [event.participantId]: {
                ...existing,
                tracks: {
                  ...existing.tracks,
                  [event.track.kind]: event.track,
                },
              },
            },
          },
        },
        commands: [],
      };
    }

    case 'room/trackUnpublished': {
      const existing = snapshot.room.participants[event.participantId];
      if (!existing || !(event.kind in existing.tracks)) {
        return { snapshot, commands: [] };
      }
      const { [event.kind]: _removed, ...remainingTracks } = existing.tracks;
      return {
        snapshot: {
          ...snapshot,
          room: {
            participants: {
              ...snapshot.room.participants,
              [event.participantId]: {
                ...existing,
                tracks: remainingTracks,
              },
            },
          },
        },
        commands: [],
      };
    }
  }
}
