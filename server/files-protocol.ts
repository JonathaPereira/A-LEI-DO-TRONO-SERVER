import type { FileRecord } from '../src/types/files';
import { object } from './http-api.ts';
import { storageUnavailable, type StoredFile, LIMITS } from './files-contract.ts';

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  !/[\x00-\x1f\x7f]/.test(value);
export function readStoredFile(value: unknown): StoredFile {
  if (!object(value)) throw storageUnavailable();
  const bytes =
    typeof value.bytes === 'string' && /^\d+$/.test(value.bytes)
      ? Number(value.bytes)
      : value.bytes;
  if (
    !uuid(value.id) ||
    !uuid(value.owner_id) ||
    !text(value.object_key, 1024) ||
    !text(value.name, 1024) ||
    typeof bytes !== 'number' ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > LIMITS.video ||
    !text(value.mime, 128) ||
    (value.kind !== 'chat' &&
      value.kind !== 'direct' &&
      value.kind !== 'avatar' &&
      value.kind !== 'soundboard') ||
    (value.state !== 'pending' && value.state !== 'ready' && value.state !== 'deleting') ||
    typeof value.created_at !== 'string' ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    (value.room_id != null && !text(value.room_id, 128)) ||
    (value.kind === 'chat' && !text(value.room_id, 128)) ||
    (value.direct_peer_id != null && !uuid(value.direct_peer_id)) ||
    (value.kind === 'direct' &&
      (!uuid(value.direct_peer_id) || value.direct_peer_id === value.owner_id)) ||
    (value.duration_ms != null &&
      (typeof value.duration_ms !== 'number' ||
        !Number.isSafeInteger(value.duration_ms) ||
        value.duration_ms <= 0 ||
        value.duration_ms > 15000))
  )
    throw storageUnavailable();
  return {
    id: value.id,
    owner_id: value.owner_id,
    object_key: value.object_key,
    name: value.name,
    bytes,
    mime: value.mime,
    kind: value.kind,
    state: value.state,
    created_at: value.created_at,
    room_id: typeof value.room_id === 'string' ? value.room_id : null,
    direct_peer_id: typeof value.direct_peer_id === 'string' ? value.direct_peer_id : null,
    duration_ms: typeof value.duration_ms === 'number' ? value.duration_ms : null,
  };
}
export function readFilePage(
  value: unknown,
  max = 200,
  accepts: (row: StoredFile) => boolean = () => true,
): StoredFile[] {
  if (!Array.isArray(value) || value.length > max) throw storageUnavailable();
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    const row = readStoredFile(item);
    if (seen.has(row.id) || !accepts(row)) throw storageUnavailable();
    seen.add(row.id);
    return row;
  });
}
export function readSingleFile(value: unknown): StoredFile | null {
  if (value == null) return null;
  if (Array.isArray(value)) return readFilePage(value, 1)[0] ?? null;
  return readStoredFile(value);
}
export function publicFile(row: StoredFile): FileRecord {
  return {
    id: row.id,
    name: row.name,
    bytes: row.bytes,
    mime: row.mime,
    kind: row.kind,
    roomId: row.room_id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    ...(row.kind === 'direct' ? { peerId: row.direct_peer_id } : {}),
    ...(row.kind === 'soundboard' && row.duration_ms != null
      ? { durationMs: row.duration_ms }
      : {}),
  };
}
export function readStorageUsage(value: unknown): number {
  const used = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0)
    throw storageUnavailable();
  return used;
}
