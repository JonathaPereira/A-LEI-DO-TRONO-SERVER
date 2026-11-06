import type { MemberRole } from './roles';

export interface DirectoryEntry {
  id: string;
  nickname: string;
  role: MemberRole;
  avatar_preset: string;
  avatar_file_id: string | null;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** Validate the complete private RPC page before changing the public presence cache. */
export function readDirectory(value: unknown): DirectoryEntry[] {
  if (!Array.isArray(value) || value.length > 1000) throw Error('invalid directory');
  const ids = new Set<string>();
  return value.map((row: unknown) => {
    if (
      !record(row) ||
      typeof row.id !== 'string' ||
      !row.id ||
      ids.has(row.id) ||
      typeof row.nickname !== 'string' ||
      !row.nickname ||
      (row.role !== undefined &&
        row.role !== 'member' &&
        row.role !== 'admin' &&
        row.role !== 'creator') ||
      (row.avatar_preset != null && typeof row.avatar_preset !== 'string') ||
      (row.avatar_file_id != null && typeof row.avatar_file_id !== 'string')
    )
      throw Error('invalid directory');
    ids.add(row.id);
    return {
      id: row.id,
      nickname: row.nickname,
      role: row.role === 'admin' || row.role === 'creator' ? row.role : 'member',
      avatar_preset: row.avatar_preset || 'crown',
      avatar_file_id: row.avatar_file_id || null,
    };
  });
}
