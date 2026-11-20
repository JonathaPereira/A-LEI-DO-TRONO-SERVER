import { readChannels } from './protocol.ts';
import { readFile, record } from '../files/protocol.ts';

/** SQL metadata and socket catalogs use different field names; normalize once at the HTTP edge. */
export function readManagedChannels(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Lista de canais inválida.');
  return readChannels(
    value.map((row: unknown) => {
      if (!record(row)) throw new Error('Canal inválido.');
      return { ...row, type: row.channel_type };
    }),
    [],
  );
}
export function readChannelFilesPage(
  data: Record<string, unknown>,
  roomId: string,
  offset: number,
) {
  if (
    !Array.isArray(data.files) ||
    data.files.length > 200 ||
    typeof data.hasMore !== 'boolean' ||
    !Number.isSafeInteger(data.nextOffset) ||
    (data.nextOffset as number) !== offset + data.files.length ||
    (data.hasMore && !data.files.length)
  )
    throw new Error('Página de anexos inválida.');
  const files = data.files.map(readFile);
  if (
    new Set(files.map((file) => file.id)).size !== files.length ||
    files.some((file) => file.kind !== 'chat' || file.roomId !== roomId)
  )
    throw new Error('Anexos de outro canal ou inválidos.');
  return {
    files: Object.freeze(files),
    hasMore: data.hasMore,
    nextOffset: data.nextOffset as number,
  };
}
