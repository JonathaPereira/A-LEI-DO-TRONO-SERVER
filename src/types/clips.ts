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
