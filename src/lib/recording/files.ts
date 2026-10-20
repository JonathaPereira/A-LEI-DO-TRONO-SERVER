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
): Promise<RecordingNotice> {
  let writable: FileSystemWritableFileStream | null = null;
  if (directory) {
    try {
      const folder = await directory.getDirectoryHandle('A Lei do Trono - Gravações', {
          create: true,
        }),
        handle = await folder.getFileHandle(filename, { create: true });
      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      writable = null;
      return {
        message: 'Gravação salva na pasta “A Lei do Trono - Gravações” dentro da pasta escolhida.',
        kind: 'ok',
      };
    } catch {
      try {
        await writable?.abort();
      } catch {}
      download(blob, filename);
      return {
        message:
          'Não foi possível gravar na pasta escolhida; o arquivo foi enviado para download pelo navegador.',
        kind: 'warn',
      };
    }
  }
  download(blob, filename);
  return {
    message:
      'Gravação finalizada. Selecione/mova o arquivo para a Área de Trabalho se o navegador salvou em Downloads.',
    kind: 'ok',
  };
}
