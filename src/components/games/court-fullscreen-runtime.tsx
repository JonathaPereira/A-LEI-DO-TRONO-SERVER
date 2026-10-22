import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  createCourtFullscreen,
  type CourtFullscreen,
  type CourtNativeFullscreen,
} from '../../lib/games/court-fullscreen';
import { CourtFullscreenButton } from './court-fullscreen';
interface Runtime extends Window {
  TronoDesktopShell?: CourtNativeFullscreen;
  TronoCourtFullscreen?: CourtFullscreen;
}
const installed = new WeakMap<Window, () => void>();
export function initializeCourtFullscreen(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    host = doc.getElementById('courtFullscreenHost')!;
  const controller = createCourtFullscreen({
    read: () => ({
      playing: !board.classList.contains('hidden'),
      rootFullscreen: doc.fullscreenElement === doc.documentElement,
      hasFullscreen: !!doc.fullscreenElement,
    }),
    subscribeSource(fn) {
      const observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      doc.addEventListener('fullscreenchange', fn);
      return () => {
        observer.disconnect();
        doc.removeEventListener('fullscreenchange', fn);
      };
    },
    requestDocument: () => doc.documentElement.requestFullscreen(),
    exitDocument: () => doc.exitFullscreen(),
    native: runtime.TronoDesktopShell,
  });
  const root = createRoot(host);
  flushSync(() => root.render(<CourtFullscreenButton controller={controller} />));
  const sync = () => doc.body.classList.toggle('court-fullscreen', controller.getSnapshot().active);
  const release = controller.subscribe(sync);
  runtime.TronoCourtFullscreen = controller;
  controller.start();
  sync();
  const dispose = () => {
    release();
    controller.dispose();
    flushSync(() => root.unmount());
    doc.body.classList.remove('court-fullscreen');
    if (runtime.TronoCourtFullscreen === controller) delete runtime.TronoCourtFullscreen;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
