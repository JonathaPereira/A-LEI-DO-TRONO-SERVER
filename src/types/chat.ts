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
