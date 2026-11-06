import type { Readable } from 'node:stream';
import type { UploadKind } from '../src/types/files';

export const LIMITS = {
  file: 10_000_000,
  video: 100_000_000,
  avatar: 10_000_000,
  total: 8_000_000_000,
} as const;
export const fileError = (code: string, message: string, status = 400) =>
  Object.assign(Error(message), { code, status });
export const storageUnavailable = () =>
  fileError('STORAGE_UNAVAILABLE', 'Não foi possível acessar o armazenamento.', 503);
export interface StoredFile {
  id: string;
  owner_id: string;
  object_key: string;
  name: string;
  bytes: number;
  mime: string;
  kind: UploadKind;
  room_id: string | null;
  direct_peer_id: string | null;
  state: 'pending' | 'ready' | 'deleting';
  created_at: string;
  duration_ms?: number | null;
}
/** A service-owned cancellation scope covers both native upload and object removal. */
export interface ObjectStorage {
  put(
    key: string,
    body: Readable,
    size: number,
    mime: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<void>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
  url(row: StoredFile, download?: boolean): string;
}
