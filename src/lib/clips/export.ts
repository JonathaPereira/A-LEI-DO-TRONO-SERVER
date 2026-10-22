import type { ClipDirectory, LocalClip } from '../../types/clips';

export interface ClipFiles {
  chooseDirectory(): Promise<ClipDirectory | undefined>;
  chooseFile(filename: string): Promise<FileSystemFileHandle> | undefined;
  download(blob: Blob, filename: string): void;
}
export type ClipExportResult = 'saved' | 'download' | 'canceled' | 'stale';
/** Call directly from the click: choosing a file must precede any storage await. */
export async function exportClip(
  clip: LocalClip & { blob: Blob },
  directory: ClipDirectory | null,
  files: ClipFiles,
  isCurrent: () => boolean,
): Promise<ClipExportResult> {
  let writable: FileSystemWritableFileStream | undefined;
  try {
    const filename = clip.filename || `Trono_Clipe_${clip.id}.webm`;
    let handle: FileSystemFileHandle | undefined;
    if (directory) {
      let permission = directory.queryPermission
        ? await directory.queryPermission({ mode: 'readwrite' })
        : 'granted';
      if (!isCurrent()) return 'stale';
      if (permission !== 'granted' && directory.requestPermission)
        permission = await directory.requestPermission({ mode: 'readwrite' });
      if (!isCurrent()) return 'stale';
      if (permission !== 'granted')
        throw Error('Acesso à pasta negado. Escolha outra pasta e tente novamente.');
      handle = await directory.getFileHandle(filename, { create: true });
    } else {
      const picked = files.chooseFile(filename);
      if (picked) handle = await picked;
    }
    if (!isCurrent()) return 'stale';
    if (!handle) {
      files.download(clip.blob, filename);
      return 'download';
    }
    writable = await handle.createWritable();
    if (!isCurrent()) {
      await writable.abort();
      writable = undefined;
      return 'stale';
    }
    await writable.write(clip.blob);
    await writable.close();
    writable = undefined;
    return 'saved';
  } catch (error) {
    try {
      await writable?.abort();
    } catch {}
    if (error instanceof Error && error.name === 'AbortError') return 'canceled';
    throw error;
  }
}

interface FileWindow extends Window {
  showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<ClipDirectory>;
  showSaveFilePicker?: (options: {
    id: string;
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}
/** Download URLs belong here, separately from the preview URLs owned by React. */
export function createBrowserClipFiles(target: Window) {
  const runtime = target as FileWindow,
    downloads = new Map<string, number>();
  return {
    chooseDirectory: () =>
      runtime.showDirectoryPicker?.({ id: 'trono-clips', mode: 'readwrite' }) ??
      Promise.resolve(undefined),
    chooseFile: (filename: string) =>
      runtime.showSaveFilePicker?.({
        id: 'trono-clips',
        suggestedName: filename,
        types: [{ description: 'Vídeo WebM', accept: { 'video/webm': ['.webm'] } }],
      }),
    download(blob: Blob, filename: string) {
      const url = URL.createObjectURL(blob),
        anchor = target.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      try {
        target.document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        downloads.set(
          url,
          target.setTimeout(() => {
            URL.revokeObjectURL(url);
            downloads.delete(url);
          }, 30000),
        );
      }
    },
    dispose() {
      for (const [url, timer] of downloads) {
        target.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloads.clear();
    },
  } satisfies ClipFiles & { dispose(): void };
}
