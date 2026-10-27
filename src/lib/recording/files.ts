import type { ClipDirectory } from '../../types/clips';
export interface RecordingNotice {
  readonly message: string;
  readonly kind: '' | 'ok' | 'warn' | 'error';
}
/** A failed folder write is aborted before offering the original Blob as a download. */
export async function saveRecording(
  blob: Blob,
  directory: ClipDirectory | null,
  filename: string,
  download: (blob: Blob, filename: string) => void,
  signal?: AbortSignal,
): Promise<RecordingNotice> {
  let writable: FileSystemWritableFileStream | null = null;
  let aborting: Promise<void> | null = null;
  const abort = () => {
    if (writable && !aborting) aborting = writable.abort().catch(() => {});
  };
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (directory) {
      try {
        const folder = await directory.getDirectoryHandle('A Lei do Trono - Gravações', {
          create: true,
        });
        signal?.throwIfAborted();
        const handle = await folder.getFileHandle(filename, { create: true });
        signal?.throwIfAborted();
        writable = await handle.createWritable();
        if (signal?.aborted) abort();
        signal?.throwIfAborted();
        await writable.write(blob);
        signal?.throwIfAborted();
        await writable.close();
        writable = null;
        return {
          message:
            'Gravação salva na pasta “A Lei do Trono - Gravações” dentro da pasta escolhida.',
          kind: 'ok',
        };
      } catch (error) {
        abort();
        await aborting;
        signal?.throwIfAborted();
        download(blob, filename);
        return {
          message:
            'Não foi possível gravar na pasta escolhida; o arquivo foi enviado para download pelo navegador.',
          kind: 'warn',
        };
      }
    }
    signal?.throwIfAborted();
    download(blob, filename);
    return {
      message:
        'Gravação finalizada. Selecione/mova o arquivo para a Área de Trabalho se o navegador salvou em Downloads.',
      kind: 'ok',
    };
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
