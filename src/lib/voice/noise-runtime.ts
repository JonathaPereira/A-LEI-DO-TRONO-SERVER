import { createNoiseProcessors } from './noise-processors.ts';

type Processors = ReturnType<typeof createNoiseProcessors>;
interface Runtime extends Window {
  TronoNoise?: Pick<Processors, 'create' | 'supported'>;
  TronoLightNoise?: { create: Processors['createLight'] };
}
const installed = new WeakMap<Window, () => void>();

/** Loads only local worklets/model on demand. Microphone PCM never leaves this device. */
export function initializeNoiseProcessors(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime;
  const processors = createNoiseProcessors({
    workletAvailable: () => typeof AudioWorkletNode !== 'undefined',
    wasmAvailable: () => typeof WebAssembly !== 'undefined',
    async loadBinary(signal) {
      const response = await target.fetch('/vendor/rnnoise/rnnoise.wasm?v=2025.1.5', { signal });
      if (!response.ok) throw new Error('Não foi possível carregar o RNNoise.');
      return response.arrayBuffer();
    },
    validateBinary: (binary) => WebAssembly.validate(binary),
    loadModule: (context, engine) =>
      context.audioWorklet.addModule(
        engine === 'light' ? '/light-noise-worklet.js?v=112' : '/vendor/rnnoise/worklet.js?v=1',
      ),
    createNode: (context, engine, wasmBinary) =>
      new AudioWorkletNode(context, engine === 'light' ? 'trono-light-noise' : 'trono-rnnoise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        ...(engine === 'rnnoise' ? { processorOptions: { wasmBinary, maxChannels: 1 } } : {}),
      }),
    warn: (error) => console.warn('[NoiseProcessors]', error),
  });
  const noise = { create: processors.create, supported: processors.supported };
  const light = { create: processors.createLight };
  runtime.TronoNoise = noise;
  runtime.TronoLightNoise = light;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('pagehide', dispose);
    if (runtime.TronoNoise === noise) delete runtime.TronoNoise;
    if (runtime.TronoLightNoise === light) delete runtime.TronoLightNoise;
    if (installed.get(target) === dispose) installed.delete(target);
    processors.dispose();
  };
  target.addEventListener('pagehide', dispose, { once: true });
  installed.set(target, dispose);
  return dispose;
}
