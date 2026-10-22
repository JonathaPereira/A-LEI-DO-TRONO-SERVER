import type { VoiceParticipant, VoiceStateUpdate, VoiceNotice } from '../../types/voice-roster';
import { isQuality } from './quality-policy.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export const isParticipantId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const optionalId = (value: unknown) => value == null || isParticipantId(value);
const optionalSeat = (value: unknown) =>
  value === undefined || (Number.isInteger(value) && Number(value) >= 0);
const flags = (value: Record<string, unknown>) =>
  ['muted', 'serverMuted', 'mediaBlocked', 'deafened', 'camera', 'screen'].every(
    (key) => value[key] === undefined || typeof value[key] === 'boolean',
  );
const transport = (value: unknown) =>
  value === undefined || value === 'p2p' || value === 'sfu' || value === 'sfu-pending';
function validState(value: Record<string, unknown>) {
  return (
    flags(value) &&
    optionalString(value.name) &&
    optionalString(value.role) &&
    optionalSeat(value.seat) &&
    transport(value.transport) &&
    (value.quality === undefined || isQuality(value.quality))
  );
}

/** A malformed replacement must never evict valid members or close their peers. */
export function parseVoiceParticipants(value: unknown): readonly VoiceParticipant[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>(),
    participants: VoiceParticipant[] = [];
  for (const row of value) {
    if (
      !isRecord(row) ||
      !isParticipantId(row.id) ||
      ids.has(row.id) ||
      !validState(row) ||
      !optionalId(row.accountId) ||
      !optionalId(row.avatar_file_id) ||
      !optionalString(row.avatar_preset)
    )
      return null;
    ids.add(row.id);
    const serverMuted = row.serverMuted === true;
    const mediaBlocked = row.mediaBlocked === true;
    participants.push(
      Object.freeze({
        id: row.id,
        accountId: (row.accountId as string | null | undefined) ?? null,
        name: (row.name as string | undefined) ?? 'Participante',
        avatar_preset: (row.avatar_preset as string | undefined) || 'crown',
        avatar_file_id: (row.avatar_file_id as string | null | undefined) ?? null,
        role: typeof row.role === 'string' && row.role ? row.role : undefined,
        seat: row.seat as number | undefined,
        joined: true,
        muted: row.muted === true || serverMuted,
        serverMuted,
        mediaBlocked,
        deafened: row.deafened === true,
        camera: !mediaBlocked && row.camera === true,
        screen: !mediaBlocked && row.screen === true,
        transport: (row.transport as VoiceParticipant['transport'] | undefined) ?? 'p2p',
        quality: (row.quality as VoiceParticipant['quality'] | undefined) ?? 'balanced',
      }),
    );
  }
  return Object.freeze(participants);
}
export function parseVoiceState(value: unknown): VoiceStateUpdate | null {
  if (
    !isRecord(value) ||
    !isParticipantId(value.playerId) ||
    typeof value.joined !== 'boolean' ||
    !validState(value)
  )
    return null;
  const serverMuted = typeof value.serverMuted === 'boolean' ? value.serverMuted : undefined;
  const mediaBlocked = typeof value.mediaBlocked === 'boolean' ? value.mediaBlocked : undefined;
  return {
    playerId: value.playerId,
    joined: value.joined,
    name: value.name as string | undefined,
    seat: value.seat as number | undefined,
    muted: value.muted === true || serverMuted === true,
    serverMuted,
    mediaBlocked,
    deafened: value.deafened === true,
    camera: mediaBlocked !== true && value.camera === true,
    screen: mediaBlocked !== true && value.screen === true,
    transport: value.transport as VoiceParticipant['transport'] | undefined,
    quality: value.quality as VoiceParticipant['quality'] | undefined,
  };
}
export function parseVoiceNotice(value: unknown): VoiceNotice | null {
  if (
    !isRecord(value) ||
    !isParticipantId(value.playerId) ||
    !isParticipantId(value.roomId) ||
    (value.kind !== 'joined' && value.kind !== 'left' && value.kind !== 'disconnected') ||
    !optionalString(value.name) ||
    !optionalString(value.reason) ||
    !optionalString(value.id) ||
    (value.at !== undefined && (typeof value.at !== 'number' || !Number.isFinite(value.at))) ||
    (value.guest !== undefined && typeof value.guest !== 'boolean')
  )
    return null;
  return Object.freeze({
    playerId: value.playerId,
    roomId: value.roomId,
    kind: value.kind as VoiceNotice['kind'],
    name: value.name as string | undefined,
    reason: value.reason as string | undefined,
    id: value.id as string | undefined,
    at: value.at as number | undefined,
    guest: value.guest as boolean | undefined,
  });
}
