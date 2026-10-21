import { createApplicationAudio } from './application-audio.ts';
import type { ApplicationAudioNative } from '../../types/application-audio';

interface Runtime extends Window {
  TronoDesktop?: ApplicationAudioNative;
  TronoApplicationAudio?: Pick<ReturnType<typeof createApplicationAudio>, 'create' | 'cancel'>;
}
const installed = new WeakMap<Window, () => Promise<void>>();

/** One IPC listener per renderer. Allocates no AudioContext until an explicit capture. */
export function initializeApplicationAudio(target: Window): (() => Promise<void>) | undefined {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    native = runtime.TronoDesktop;
  if (!native) return;
  const controller = createApplicationAudio({
    subscribe: (listener) => native.onApplicationAudio(listener),
    ack: (id) => native.ackApplicationAudio(id),
    stop: (id) => native.stopApplicationAudio(id),
    createContext: (sampleRate) => new AudioContext({ sampleRate }),
    loadModule: (context) => context.audioWorklet.addModule('/application-audio-worklet.js'),
    createNode: (context) =>
      new AudioWorkletNode(context, 'mn-application-audio', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      }),
    ended: () => target.dispatchEvent(new CustomEvent('trono-application-audio-ended')),
    warn: (error) => console.warn('[ApplicationAudio]', error),
  });
  const facade = { create: controller.create, cancel: controller.cancel };
  runtime.TronoApplicationAudio = facade;
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    if (disposal) return disposal;
    target.removeEventListener('pagehide', hidden);
    if (runtime.TronoApplicationAudio === facade) delete runtime.TronoApplicationAudio;
    if (installed.get(target) === dispose) installed.delete(target);
    disposal = controller.dispose();
    return disposal;
  };
  const hidden = () => {
    void dispose();
  };
  target.addEventListener('pagehide', hidden, { once: true });
  installed.set(target, dispose);
  return dispose;
}
