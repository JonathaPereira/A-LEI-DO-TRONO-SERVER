import type { CommunityPresence, GamePresence } from '../../types/community';
import type { AccountRole } from '../../types/domain';
import { readChannelParticipant } from '../channels/protocol.ts';
import { invalidResponse } from '../socket/protocol.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function unique<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw invalidResponse('Presença duplicada.');
  return Object.freeze(rows);
}
export function readPresence(value: unknown): CommunityPresence {
  if (
    !record(value) ||
    (value.scope !== 'community' && value.scope !== 'game') ||
    typeof value.directoryReady !== 'boolean' ||
    !Array.isArray(value.members)
  )
    throw invalidResponse('Presença inválida.');
  const members = unique(
    value.members.map((row: unknown) => {
      const person = readChannelParticipant(row);
      if (
        !record(row) ||
        typeof row.online !== 'boolean' ||
        typeof row.role !== 'string' ||
        !['guest', 'member', 'admin', 'creator'].includes(row.role) ||
        person.guest !== (row.role === 'guest') ||
        (row.roomName !== null && typeof row.roomName !== 'string') ||
        (row.activity !== null && (!record(row.activity) || typeof row.activity.name !== 'string'))
      )
        throw invalidResponse('Pessoa inválida.');
      return Object.freeze({
        ...person,
        role: row.role as AccountRole,
        online: row.online,
        roomName: row.roomName as string | null,
        activity:
          row.activity === null ? null : Object.freeze({ name: row.activity.name as string }),
      });
    }),
  );
  return Object.freeze({
    scope: value.scope as CommunityPresence['scope'],
    directoryReady: value.directoryReady,
    members,
  });
}

/** Public game rows are presentation data, separate from the channel catalog and call roster. */
export function readGamePresence(value: unknown): readonly GamePresence[] {
  if (!Array.isArray(value)) throw invalidResponse('Mesas inválidas.');
  return unique(
    value.map((row: unknown) => {
      if (!record(row) || typeof row.id !== 'string' || !row.id || !Array.isArray(row.players))
        throw invalidResponse('Mesa inválida.');
      return Object.freeze({
        id: row.id,
        players: unique(
          row.players.map((person: unknown) =>
            // Public game rows deliberately omit private voice membership.
            readChannelParticipant(
              record(person) ? { ...person, inVoice: person.inVoice ?? false } : person,
            ),
          ),
        ),
      });
    }),
  );
}
