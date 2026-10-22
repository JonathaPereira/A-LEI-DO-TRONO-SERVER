import type { NavigationRoom } from '../../types/call-navigation';
import { isRecord, isParticipantId } from './roster-protocol.ts';

export function readNavigationRoom(value: unknown): NavigationRoom | null {
  if (
    !isRecord(value) ||
    !isParticipantId(value.id) ||
    (value.kind !== 'chat' && value.kind !== 'game') ||
    (value.name !== undefined && typeof value.name !== 'string') ||
    (value.channelType !== undefined &&
      !(value.kind === 'game' && value.channelType === null) &&
      (typeof value.channelType !== 'string' ||
        !['text', 'voice', 'mixed'].includes(value.channelType))) ||
    (value.voiceActive !== undefined && typeof value.voiceActive !== 'boolean')
  )
    return null;
  // Game rooms are mixed media rooms; the server represents their missing
  // community-channel classification as null. Keep the internal domain non-null.
  return Object.freeze({
    ...value,
    ...(value.kind === 'game' && value.channelType === null ? { channelType: 'mixed' } : {}),
  }) as NavigationRoom;
}
