import type { SoundBuffer } from './wav';

type DecoderContext = Pick<AudioContext, 'decodeAudioData' | 'close'>;
/** Owns only this decoding context. Aborting does not await an uninterruptible browser decoder. */
export function decodeSound(
  file: Pick<File, 'arrayBuffer'>,
  signal: AbortSignal,
  createContext: () => DecoderContext,
): Promise<SoundBuffer> {
  signal.throwIfAborted();
  const context = createContext();
  return new Promise((resolve, reject) => {
    let done = false,
      closing: Promise<unknown> | undefined;
    const close = () => {
      if (closing) return;
      try {
        closing = context.close().catch(() => {});
      } catch {
        closing = Promise.resolve();
      }
    };
    const finish = (result: { value: SoundBuffer } | { error: unknown }) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', abort);
      close();
      if ('error' in result) reject(result.error);
      else resolve(result.value);
    };
    const abort = () =>
      finish({ error: signal.reason ?? new DOMException('Leitura encerrada.', 'AbortError') });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    void Promise.resolve()
      .then(async () => {
        const bytes = await file.arrayBuffer();
        signal.throwIfAborted();
        return context.decodeAudioData(bytes);
      })
      .then(
        (buffer) => finish({ value: buffer }),
        (error) => finish({ error }),
      );
  });
}
