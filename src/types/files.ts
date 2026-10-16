import type { ChatAttachment } from './domain';

export type UploadKind = 'chat' | 'direct' | 'avatar' | 'soundboard';
export interface FileUploadOptions {
  kind?: UploadKind;
  roomId?: string;
  peerId?: string;
  signal?: AbortSignal;
  onProgress?(percent: number): void;
}
export interface FileRecord extends Readonly<ChatAttachment> {
  readonly peerId?: string | null;
  readonly durationMs?: number;
}
export interface FilesSnapshot {
  readonly accountId: string | null;
  readonly moderateFiles: boolean;
  /** Invalidates work even when identity changes from A to B and back to A. */
  readonly epoch: number;
  readonly deleted: Readonly<Record<string, true>>;
}
export interface FilesApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: BodyInit;
}
