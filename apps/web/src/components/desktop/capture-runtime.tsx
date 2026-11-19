import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createDesktopCapture } from '../../lib/desktop/capture';
import type { DesktopCaptureNative } from '../../types/desktop-capture';
import type { createApplicationAudio } from '../../lib/voice/application-audio';
import { DesktopCaptureDialog } from './capture-dialog';

interface Runtime extends Window {
  TronoDesktop?: DesktopCaptureNative;
  TronoApplicationAudio?: Pick<ReturnType<typeof createApplicationAudio>, 'create' | 'cancel'>;
}
const installed = new WeakMap<Window, () => void>();

/** Installs one native picker and preserves the original capture arguments and returned streams. */
export function initializeDesktopCapture(target: Window): (() => void) | undefined {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    native = runtime.TronoDesktop,
    devices = target.navigator.mediaDevices;
  if (!native || !devices?.getDisplayMedia) return;
  const original = devices.getDisplayMedia;
  const controller = createDesktopCapture({
    native,
    getDisplayMedia: (options) => original.call(devices, options),
    createAudio: (info) =>
      runtime.TronoApplicationAudio?.create(info) ??
      Promise.reject(new Error('Áudio por aplicativo indisponível.')),
    cancelAudio: (id) => runtime.TronoApplicationAudio?.cancel?.(id) ?? false,
    warn: (error) => console.warn('[DesktopCapture]', error),
  });
  const capture = (options?: DisplayMediaStreamOptions) => controller.capture(options);
  devices.getDisplayMedia = capture;
  let root: ReturnType<typeof createRoot> | undefined,
    host: HTMLElement | undefined,
    disposed = false;
  const mount = () => {
    if (disposed || root) return;
    host = target.document.createElement('div');
    host.style.display = 'contents';
    host.dataset.desktopCaptureRoot = '';
    target.document.body.append(host);
    root = createRoot(host);
    flushSync(() => root!.render(<DesktopCaptureDialog controller={controller} />));
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', mount);
    target.removeEventListener('pagehide', dispose);
    controller.dispose();
    if (devices.getDisplayMedia === capture) devices.getDisplayMedia = original;
    flushSync(() => root?.unmount());
    host?.remove();
    if (installed.get(target) === dispose) installed.delete(target);
  };
  target.addEventListener('trono:ready', mount, { once: true });
  target.addEventListener('pagehide', dispose, { once: true });
  installed.set(target, dispose);
  return dispose;
}
