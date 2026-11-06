import {
  ClipBuffer,
  type ClipBufferOptions,
  type ClipBufferStatus,
  type ClipSnapshot,
} from './buffer.ts';

export type ClipWorkerReply =
  | { type: 'ready' }
  | ({ type: 'status' } & ClipBufferStatus)
  | ({ type: 'clip'; id: string } & ClipSnapshot)
  | { type: 'error'; id?: string; message: string };
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const clipId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
function options(data: Record<string, unknown>): ClipBufferOptions {
  const result: ClipBufferOptions = {};
  for (const [key, max] of [
    ['seconds', 120],
    ['fps', 240],
    ['maxBytes', 256 * 1048576],
  ] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > max ||
      (key === 'maxBytes' && !Number.isSafeInteger(value))
    )
      throw Error('Configuração de replay inválida.');
    result[key] = value;
  }
  return result;
}
/** One buffer per worker. The worker serializes messages; media resources belong to the caller. */
export function createClipWorkerHandler(send: (reply: ClipWorkerReply) => void) {
  let buffer: ClipBuffer | null = null;
  return (value: unknown): void => {
    const data = record(value),
      id = clipId(data?.id) ? data.id : undefined;
    try {
      if (!data) throw Error('Comando de replay inválido.');
      if (data.type === 'init') {
        buffer = new ClipBuffer(options(data));
        send({ type: 'ready' });
      } else if (data.type === 'chunk') {
        if (!(data.data instanceof ArrayBuffer)) throw Error('Fragmento de replay inválido.');
        if (!buffer) throw Error('Inicie o buffer de replay antes de enviar fragmentos.');
        send({ type: 'status', ...buffer.append(data.data) });
      } else if (data.type === 'clip') {
        if (!id) throw Error('Identificador de clipe inválido.');
        if (!buffer) throw Error('Inicie o buffer de replay antes de clipar.');
        send({ type: 'clip', id, ...buffer.snapshot() });
      } else throw Error('Comando de replay inválido.');
    } catch (error) {
      // Do not emit a partial clip after a corrupt chunk. A fresh init is required.
      if (data?.type === 'chunk') buffer = null;
      send({
        type: 'error',
        ...(id ? { id } : {}),
        message: error instanceof Error ? error.message : 'Falha ao preparar o replay.',
      });
    }
  };
}
