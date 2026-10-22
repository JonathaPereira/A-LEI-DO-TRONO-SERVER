import type { NoiseFilter } from '../../types/voice';

type Engine = 'rnnoise' | 'light';
interface Options {
  workletAvailable(): boolean;
  wasmAvailable(): boolean;
  loadBinary(signal: AbortSignal): Promise<ArrayBuffer>;
  validateBinary(binary: ArrayBuffer): boolean;
  loadModule(context: BaseAudioContext, engine: Engine): Promise<void>;
  createNode(context: BaseAudioContext, engine: Engine, binary?: ArrayBuffer): AudioWorkletNode;
  schedule?(callback: () => void, milliseconds: number): () => void;
  warn?(error: unknown): void;
}
interface FilterOptions {
  onFailure?(error: Error): void;
}
const cancelled = () => new DOMException('Filtro de áudio encerrado.', 'AbortError');
// Registration belongs to the borrowed context, which may outlive a loader installation.
const modules = {
  rnnoise: new WeakMap<BaseAudioContext, Promise<void>>(),
  light: new WeakMap<BaseAudioContext, Promise<void>>(),
};

/** Owns model/module loading and filter nodes; the caller's context and microphone are borrowed. */
export function createNoiseProcessors(options: Options) {
  const controller = new AbortController(),
    resources = new Set<() => void>();
  const schedule =
    options.schedule ??
    ((callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    });
  let binaryPromise: Promise<ArrayBuffer> | null = null,
    disposed = false;
  function attempt(action: () => void) {
    try {
      action();
    } catch (error) {
      options.warn?.(error);
    }
  }
  function timed<T>(
    work: Promise<T>,
    milliseconds: number,
    message: string,
    onCancelled = () => {},
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        cancelTimer();
        controller.signal.removeEventListener('abort', abort);
        action();
      };
      const abort = () => {
        onCancelled();
        finish(() => reject(cancelled()));
      };
      const cancelTimer = schedule(() => {
        onCancelled();
        finish(() => reject(new Error(message)));
      }, milliseconds);
      controller.signal.addEventListener('abort', abort, { once: true });
      work.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
      if (controller.signal.aborted) abort();
    });
  }
  function loadBinary(): Promise<ArrayBuffer> {
    if (!binaryPromise) {
      const fetchController = new AbortController();
      const work = options.loadBinary(fetchController.signal).then((binary) => {
        if (disposed) throw cancelled();
        if (!options.validateBinary(binary)) throw new Error('Modelo RNNoise inválido.');
        return binary;
      });
      const cached = timed(work, 15000, 'Não foi possível carregar o RNNoise a tempo.', () =>
        fetchController.abort(),
      ).catch((error) => {
        if (binaryPromise === cached) binaryPromise = null;
        throw error;
      });
      binaryPromise = cached;
    }
    return binaryPromise;
  }
  function loadModule(context: BaseAudioContext, engine: Engine): Promise<void> {
    const cache = modules[engine];
    let pending = cache.get(context);
    if (!pending) {
      pending = options.loadModule(context, engine).catch((error) => {
        if (cache.get(context) === pending) cache.delete(context);
        throw error;
      });
      cache.set(context, pending);
    }
    // A timed-out registration can still finish. Reuse it instead of registering twice.
    return timed(
      pending,
      engine === 'light' ? 8000 : 15000,
      engine === 'light'
        ? 'O filtro leve demorou para iniciar.'
        : 'Não foi possível iniciar o módulo RNNoise a tempo.',
    );
  }
  function supported(context: BaseAudioContext | null): boolean {
    return (
      !disposed &&
      !!context?.audioWorklet &&
      options.workletAvailable() &&
      options.wasmAvailable() &&
      context.sampleRate === 48000
    );
  }
  async function create(
    context: BaseAudioContext,
    engine: Engine,
    { onFailure = () => {} }: FilterOptions = {},
  ): Promise<NoiseFilter> {
    if (disposed) throw cancelled();
    if (
      engine === 'rnnoise'
        ? !supported(context)
        : !context?.audioWorklet || !options.workletAvailable()
    )
      throw new Error(
        engine === 'light'
          ? 'Filtro leve indisponível neste motor.'
          : 'RNNoise requer Web Audio a 48 kHz e AudioWorklet.',
      );
    const [binary] = await Promise.all([
      engine === 'rnnoise' ? loadBinary() : Promise.resolve(undefined),
      loadModule(context, engine),
    ]);
    if (disposed) throw cancelled();
    const node = options.createNode(context, engine, binary);
    let highpass: BiquadFilterNode | undefined,
      stopped = false,
      published = false;
    let failure: Error | undefined;
    let rejectReady: (error: Error) => void = () => {};
    const processorError = () =>
      fail(
        new Error(
          engine === 'light'
            ? 'Filtro leve interrompido.'
            : 'O processamento RNNoise foi interrompido.',
        ),
      );
    const destroy = () => {
      if (stopped) return;
      stopped = true;
      resources.delete(destroy);
      node.removeEventListener('processorerror', processorError);
      node.port.onmessage = null;
      attempt(() => node.port.postMessage('destroy'));
      attempt(() => highpass?.disconnect());
      attempt(() => node.disconnect());
      attempt(() => node.port.close());
    };
    const fail = (error: Error) => {
      if (stopped) return;
      if (published) {
        destroy();
        onFailure(error);
      } else {
        failure = error;
        rejectReady(error);
      }
    };
    resources.add(destroy);
    try {
      node.addEventListener('processorerror', processorError);
      if (engine === 'light') {
        highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 75;
        highpass.Q.value = 0.707;
        highpass.connect(node);
      } else {
        const started = new Promise<void>((resolve, reject) => {
          rejectReady = reject;
          node.port.onmessage = (event) => {
            const value: unknown = event.data;
            if (!value || typeof value !== 'object' || !('type' in value)) return;
            if (value.type === 'ready') {
              resolve();
            } else if (value.type === 'error')
              fail(
                new Error(
                  'message' in value && typeof value.message === 'string'
                    ? value.message
                    : 'RNNoise não iniciou.',
                ),
              );
          };
          node.port.start();
        });
        await timed(started, 8000, 'RNNoise demorou para iniciar.');
      }
      if (failure) throw failure;
      if (disposed) throw cancelled();
      published = true;
      return Object.freeze({ ...(highpass ? { input: highpass } : {}), node, destroy });
    } catch (error) {
      destroy();
      throw error;
    }
  }
  return {
    supported,
    create: (context: BaseAudioContext, options?: FilterOptions) =>
      create(context, 'rnnoise', options),
    createLight: (context: BaseAudioContext, options?: FilterOptions) =>
      create(context, 'light', options),
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const destroy of [...resources]) destroy();
    },
  };
}
