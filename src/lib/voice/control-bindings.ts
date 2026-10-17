import type { createCallControls } from './controls';

interface BindingOptions {
  controls: Pick<
    ReturnType<typeof createCallControls>,
    'toggleMute' | 'toggleDeafen' | 'toggleCamera'
  >;
  root: Pick<Document, 'getElementById'>;
  warn?(error: unknown): void;
}

/** Temporary DOM adapter: moving an existing control preserves its single listener. */
export function createCallControlBindings({
  controls,
  root,
  warn = (error) => console.warn('[CallControlBindings]', error),
}: BindingOptions) {
  const cleanup: (() => void)[] = [];
  let started = false,
    disposed = false;
  function bind(id: string, event: string, action: (element: HTMLElement) => unknown) {
    const element = root.getElementById(id);
    if (!element) return;
    const listener = () => {
      if (disposed) return;
      try {
        // Camera auto-join and audio unlock must begin inside the original click.
        void Promise.resolve(action(element)).catch(warn);
      } catch (error) {
        warn(error);
      }
    };
    element.addEventListener(event, listener);
    cleanup.push(() => element.removeEventListener(event, listener));
  }
  return {
    start() {
      if (started || disposed) return;
      started = true;
      for (const [id, action] of [
        ['muteMicBtn', controls.toggleMute],
        ['deafenVoiceBtn', controls.toggleDeafen],
        ['cameraBtn', controls.toggleCamera],
      ] as const)
        bind(id, 'click', () => action());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of cleanup.splice(0)) remove();
    },
  };
}
