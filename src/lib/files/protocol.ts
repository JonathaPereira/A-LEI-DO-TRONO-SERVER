import type { FileRecord } from '../../types/files';
import { invalidResponse } from '../socket/protocol.ts';

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidResponse('Dados do arquivo inválidos.');
  return value;
}
export function fileId(value: unknown): string {
  if (typeof value !== 'string' || !value) throw invalidResponse('Arquivo inválido.');
  return value;
}
export function readFile(value: unknown): FileRecord {
  if (
    !record(value) ||
    typeof value.name !== 'string' ||
    typeof value.mime !== 'string' ||
    typeof value.bytes !== 'number' ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 0 ||
    (value.deleted !== undefined && typeof value.deleted !== 'boolean') ||
    (value.roomId != null && typeof value.roomId !== 'string') ||
    (value.peerId != null && typeof value.peerId !== 'string') ||
    (value.durationMs !== undefined &&
      (typeof value.durationMs !== 'number' ||
        !Number.isFinite(value.durationMs) ||
        value.durationMs < 0))
  )
    throw invalidResponse('Dados do arquivo inválidos.');
  return Object.freeze({
    id: fileId(value.id),
    name: value.name,
    mime: value.mime,
    bytes: value.bytes,
    ownerId: optionalString(value.ownerId),
    kind: optionalString(value.kind),
    roomId: value.roomId as string | null | undefined,
    createdAt: optionalString(value.createdAt),
    deleted: value.deleted as boolean | undefined,
    peerId: value.peerId as string | null | undefined,
    durationMs: value.durationMs as number | undefined,
  });
}
export function readSignedUrl(value: unknown, now: number) {
  if (
    !record(value) ||
    typeof value.url !== 'string' ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now
  )
    throw invalidResponse('Link do arquivo inválido.');
  let url;
  try {
    url = new URL(value.url);
  } catch {
    throw invalidResponse('Link do arquivo inválido.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw invalidResponse('Link do arquivo inválido.');
  return Object.freeze({ url: url.href, expiresAt: value.expiresAt });
}
