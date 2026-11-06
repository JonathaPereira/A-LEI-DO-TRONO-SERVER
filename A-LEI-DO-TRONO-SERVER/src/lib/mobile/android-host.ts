import { abortable } from '../http/abortable.ts';
interface CallOperation {
  readonly signal: AbortSignal;
  readonly generation: number;
}
interface VoicePort {
  prepareVoice(options: { lease: string }): Promise<unknown>;
  endVoice(options: { lease: string }): Promise<unknown>;
}
/** Owns only the native service lease. The existing call owner retains all media and signaling. */
export function createAndroidHost(native: VoicePort) {
  let current: { lease: string; release(): void } | null = null;
  let sequence = 0;
  const instance = crypto.randomUUID();
  return {
    async prepareVoice(operation: CallOperation) {
      operation.signal.throwIfAborted();
      current?.release();
      const lease = `${instance}:${operation.generation}:${++sequence}`;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        operation.signal.removeEventListener('abort', release);
        if (current?.lease === lease) current = null;
        void native
          .endVoice({ lease })
          .catch((error) => console.warn('[Android] Serviço de voz:', error));
      };
      current = { lease, release };
      operation.signal.addEventListener('abort', release, { once: true });
      try {
        await abortable(native.prepareVoice({ lease }), operation.signal);
        operation.signal.throwIfAborted();
        if (released) throw new DOMException('A chamada foi cancelada.', 'AbortError');
      } catch (error) {
        release();
        throw error;
      }
    },
    stopVoice() {
      current?.release();
    },
  };
}
