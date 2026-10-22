import type { ChannelType } from '../src/types/domain';
import { apiError, object } from './http-api.ts';

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const channelId = (value: unknown): value is string =>
  typeof value === 'string' && /^channel-[0-9a-f-]{36}$|^chat-(livre|jogos|conversa)$/.test(value);
const invalid = () => apiError('COMMUNITY_UNAVAILABLE', 'Dados da comunidade inválidos.', 503);
export interface ManagedChannel {
  id: string;
  name: string;
  description: string;
  channel_type: ChannelType;
  created_by?: string | null;
  created_at?: string;
  deleted_at?: string | null;
}
export function readManagedChannel(value: unknown): ManagedChannel {
  if (
    !object(value) ||
    !channelId(value.id) ||
    typeof value.name !== 'string' ||
    (value.channel_type !== 'text' &&
      value.channel_type !== 'voice' &&
      value.channel_type !== 'mixed') ||
    (value.description !== undefined && typeof value.description !== 'string') ||
    (value.created_by != null && !uuid(value.created_by)) ||
    (value.created_at !== undefined && typeof value.created_at !== 'string') ||
    (value.deleted_at != null && typeof value.deleted_at !== 'string')
  )
    throw invalid();
  return {
    id: value.id,
    name: value.name,
    description: value.description ?? '',
    channel_type: value.channel_type,
    ...(value.created_by !== undefined ? { created_by: value.created_by as string | null } : {}),
    ...(value.created_at !== undefined ? { created_at: value.created_at as string } : {}),
    ...(value.deleted_at !== undefined ? { deleted_at: value.deleted_at as string | null } : {}),
  };
}
export function readManagedChannels(value: unknown): ManagedChannel[] {
  if (!Array.isArray(value)) throw invalid();
  const ids = new Set<string>();
  return value.map((row) => {
    const channel = readManagedChannel(row);
    if (ids.has(channel.id)) throw invalid();
    ids.add(channel.id);
    return channel;
  });
}
export function readCreatedChannel(value: unknown) {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw invalid();
    return readManagedChannel(value[0]);
  }
  return readManagedChannel(value);
}
export function readPublicProfile(value: unknown, id: string) {
  if (
    !object(value) ||
    value.id !== id ||
    !uuid(value.id) ||
    typeof value.nickname !== 'string' ||
    (value.avatar_preset !== undefined && typeof value.avatar_preset !== 'string') ||
    (value.avatar_file_id != null && !uuid(value.avatar_file_id)) ||
    (value.created_at != null && typeof value.created_at !== 'string') ||
    (value.personalization != null && !object(value.personalization))
  )
    throw invalid();
  return {
    id,
    nickname: value.nickname,
    ...(value.avatar_preset !== undefined ? { avatar_preset: value.avatar_preset as string } : {}),
    ...(value.avatar_file_id !== undefined
      ? { avatar_file_id: value.avatar_file_id as string | null }
      : {}),
    ...(value.created_at !== undefined ? { created_at: value.created_at as string | null } : {}),
    ...(value.personalization !== undefined
      ? { personalization: value.personalization as Record<string, unknown> | null }
      : {}),
  };
}
export function readRegisteredAccounts(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) throw invalid();
  const ids = new Set<string>();
  return value.map((row: unknown) => {
    if (
      !object(row) ||
      !uuid(row.id) ||
      ids.has(row.id) ||
      typeof row.nickname !== 'string' ||
      typeof row.email !== 'string' ||
      row.email.length > 320 ||
      typeof row.confirmed !== 'boolean' ||
      (row.created_at != null && typeof row.created_at !== 'string')
    )
      throw invalid();
    ids.add(row.id);
    return {
      id: row.id,
      nickname: row.nickname,
      email: row.email,
      confirmed: row.confirmed,
      ...(row.created_at !== undefined ? { created_at: row.created_at as string | null } : {}),
    };
  });
}
