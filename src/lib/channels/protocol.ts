import type { ChannelParticipant, CommunityChannel } from '../../types/channels';
import type { ChannelType } from '../../types/domain';
import { invalidResponse } from '../socket/protocol.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value) throw invalidResponse('Canal inválido.');
  return value;
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidResponse('Dados do canal inválidos.');
  return value;
}
function participant(value: unknown): ChannelParticipant {
  if (
    !record(value) ||
    typeof value.name !== 'string' ||
    typeof value.guest !== 'boolean' ||
    typeof value.inVoice !== 'boolean' ||
    (value.avatar_file_id != null && typeof value.avatar_file_id !== 'string')
  )
    throw invalidResponse('Participante do canal inválido.');
  return Object.freeze({
    id: id(value.id),
    name: value.name,
    guest: value.guest,
    inVoice: value.inVoice,
    avatar_preset: optionalString(value.avatar_preset),
    avatar_file_id: value.avatar_file_id as string | null | undefined,
  });
}

/** Both public socket rows and HTTP metadata are accepted; a bad page changes nothing. */
export function readChannels(
  value: unknown,
  current: readonly CommunityChannel[],
): readonly CommunityChannel[] {
  if (!Array.isArray(value)) throw invalidResponse('Lista de canais inválida.');
  const seen = new Set<string>();
  return Object.freeze(
    value.map((row) => {
      if (
        !record(row) ||
        typeof row.name !== 'string' ||
        typeof row.type !== 'string' ||
        !['text', 'voice', 'mixed'].includes(row.type) ||
        (row.count !== undefined &&
          (typeof row.count !== 'number' || !Number.isSafeInteger(row.count) || row.count < 0)) ||
        (row.voiceActive !== undefined && typeof row.voiceActive !== 'boolean') ||
        (row.players !== undefined && !Array.isArray(row.players))
      )
        throw invalidResponse('Canal inválido.');
      const channelId = id(row.id);
      if (seen.has(channelId)) throw invalidResponse('Canal duplicado na lista.');
      seen.add(channelId);
      const previous = current.find((c) => c.id === channelId);
      const players =
        row.players === undefined
          ? (previous?.players ?? Object.freeze([]))
          : Object.freeze(row.players.map(participant));
      if (new Set(players.map((player) => player.id)).size !== players.length)
        throw invalidResponse('Participante duplicado no canal.');
      return Object.freeze({
        id: channelId,
        name: row.name,
        description: optionalString(row.description) ?? '',
        type: row.type as ChannelType,
        count: (row.count as number | undefined) ?? previous?.count ?? 0,
        voiceActive: (row.voiceActive as boolean | undefined) ?? previous?.voiceActive ?? false,
        players,
      });
    }),
  );
}
