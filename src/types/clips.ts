/** Existing version-one IndexedDB records; older entries may omit display metadata. */
export interface LocalClip {
  id: string;
  owner: string;
  createdAt: number;
  name?: string;
  filename?: string;
  quality?: string;
  fps?: number;
  duration?: number;
  bytes?: number;
  blob?: Blob | null;
  state?: 'pending' | 'saved' | 'download';
  poster?: string;
}
export type ClipDirectory = FileSystemDirectoryHandle & {
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
export interface ClipShortcut {
  readonly code: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}
export interface ClipSettings {
  readonly version: 2;
  readonly quality: 'light' | 'balanced' | 'high';
  readonly fps: 30 | 60;
  readonly seconds: 15 | 30 | 60 | 120;
  readonly auto: boolean;
  readonly desktopAuto: boolean;
  readonly shortcut: ClipShortcut;
}
