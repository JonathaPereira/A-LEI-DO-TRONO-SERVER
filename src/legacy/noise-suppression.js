'use strict';
// The model and worklet are served with the site. Microphone PCM stays on this device.
window.TronoNoise = (() => {
  const base = new URL('vendor/rnnoise/', document.currentScript.src),
    modules = new WeakMap();
  let binaryPromise;
  const supported = (ctx) =>
    !!(
      ctx?.audioWorklet &&
      window.AudioWorkletNode &&
      window.WebAssembly &&
      ctx.sampleRate === 48000
    );
  function loadBinary() {
    if (!binaryPromise)
      binaryPromise = (async () => {
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(new URL('rnnoise.wasm?v=2025.1.5', base), {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('Não foi possível carregar o RNNoise.');
          const binary = await response.arrayBuffer();
          if (!WebAssembly.validate(binary)) throw new Error('Modelo RNNoise inválido.');
          return binary;
        } finally {
          clearTimeout(timer);
        }
      })().catch((error) => {
        binaryPromise = null;
        throw error;
      });
    return binaryPromise;
  }
  function loadModule(ctx) {
    if (!modules.has(ctx))
      modules.set(
        ctx,
        ctx.audioWorklet.addModule(new URL('worklet.js?v=1', base)).catch((error) => {
          modules.delete(ctx);
          throw error;
        }),
      );
    // Retain the actual registration promise if a slow request finishes after timeout.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Não foi possível iniciar o módulo RNNoise a tempo.')),
        15000,
      );
      modules.get(ctx).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
  async function create(ctx, { onFailure = () => {} } = {}) {
    if (!supported(ctx)) throw new Error('RNNoise requer Web Audio a 48 kHz e AudioWorklet.');
    const [wasmBinary] = await Promise.all([loadBinary(), loadModule(ctx)]);
    const node = new AudioWorkletNode(ctx, 'trono-rnnoise', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { wasmBinary, maxChannels: 1 },
    });
    let stopped = false,
      ready = false,
      fail;
    const processorError = () => fail(new Error('O processamento RNNoise foi interrompido.'));
    const destroy = () => {
      if (stopped) return;
      stopped = true;
      node.removeEventListener('processorerror', processorError);
      node.port.onmessage = null;
      node.port.postMessage('destroy');
      node.disconnect();
      node.port.close();
    };
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(new Error('RNNoise demorou para iniciar.')), 8000);
        fail = (error) => {
          if (stopped) return;
          clearTimeout(timer);
          if (ready) {
            destroy();
            onFailure(error);
          } else reject(error);
        };
        node.addEventListener('processorerror', processorError);
        node.port.onmessage = (e) => {
          if (e.data?.type === 'ready') {
            clearTimeout(timer);
            ready = true;
            resolve();
          } else if (e.data?.type === 'error')
            fail(new Error(e.data.message || 'RNNoise não iniciou.'));
        };
        node.port.start();
      });
      return { node, destroy };
    } catch (error) {
      destroy();
      throw error;
    }
  }
  return { create, supported };
})();
