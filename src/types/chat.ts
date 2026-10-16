import type { ChatMessage } from './domain';

export interface ChatUploadOptions {
  roomId: string;
  signal: AbortSignal;
  onProgress(percent: number): void;
}

/** Shared file library; upload results are validated before attaching an ID. */
export interface ChatFiles {
  upload(file: File, options: ChatUploadOptions): Promise<unknown>;
  remove(id: string): Promise<void>;
}

export interface ComposerSnapshot {
  readonly draft: string;
  readonly file: File | null;
  readonly uploading: boolean;
  readonly status: string;
  readonly focusVersion: number;
}

export type ModerationAction =
  { readonly action: 'clear' } | { readonly action: 'delete'; readonly id: string };

export type ModerationChoice = ModerationAction & { readonly roomId: string };

export interface MessagesSnapshot {
  readonly roomId: string | null;
  readonly messages: readonly ChatMessage[];
  readonly before: string | null;
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly canModerate: boolean;
  readonly accountId: string | null;
  readonly clientId: string | null;
  readonly viewVersion: number;
  readonly change: 'replace' | 'append' | 'prepend' | 'remove';
  readonly choice: ModerationChoice | null;
  readonly pending: (ModerationChoice & { readonly requestId: string }) | null;
}

export type ChatActivity = { type: 'read' } | { type: 'message'; message: ChatMessage };
