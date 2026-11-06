import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createRoguelite } from '../../lib/games/roguelite';
import { RogueliteContents } from './roguelite-contents';

interface RogueliteRuntime extends Window {
  TronoDesktop?: object;
  TronoPortal: { showOnly(id: string): void };
  TronoSocial: { showForRoom(show: boolean): void };
  TronoRoguelite?: { open(): void };
  TronoRogueliteHost?: ReturnType<typeof createRoguelite>;
}
const installed = new WeakMap<Window, () => void>();
export function initializeRoguelite(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as RogueliteRuntime,
    doc = target.document,
    screen = doc.getElementById('rogueliteScreen')!;
  const ownedFullscreen = () =>
    !!doc.fullscreenElement &&
    (doc.fullscreenElement === screen ||
      doc.fullscreenElement === doc.getElementById('rogueliteFrame'));
  const controller = createRoguelite({
    desktop: !!runtime.TronoDesktop,
    fetch: (input, options) => target.fetch(input, options),
    readActive: () => !screen.classList.contains('hidden') && !doc.hidden,
    subscribeVisibility(listener) {
      const observer = new MutationObserver(listener);
      observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
      doc.addEventListener('visibilitychange', listener);
      return () => {
        observer.disconnect();
        doc.removeEventListener('visibilitychange', listener);
      };
    },
    fullscreenOwned: ownedFullscreen,
    requestFullscreen: () => screen.requestFullscreen(),
    exitFullscreen: () => doc.exitFullscreen(),
  });
  runtime.TronoRogueliteHost = controller;
  const facade = {
    open() {
      runtime.TronoPortal.showOnly('rogueliteScreen');
      runtime.TronoSocial.showForRoom(false);
      doc.body.dataset.gamesView = 'roguelite';
      controller.sync();
      void controller.prepare();
    },
  };
  runtime.TronoRoguelite = facade;
  let root: ReturnType<typeof createRoot> | undefined,
    unsubscribe: (() => void) | undefined,
    disposed = false;
  const fullscreen = () => controller.fullscreenChanged();
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') controller.escape();
  };
  function message(event: MessageEvent) {
    const frame = doc.getElementById('rogueliteFrame') as HTMLIFrameElement | null,
      id = controller.getSnapshot().frameId;
    if (
      id !== null &&
      frame &&
      event.source === frame.contentWindow &&
      event.origin === target.location.origin &&
      event.data?.type === 'cinzas-ready'
    )
      controller.ready(id);
  }
  function bind() {
    if (disposed || root) return;
    doc.addEventListener('fullscreenchange', fullscreen);
    doc.addEventListener('keydown', keydown);
    target.addEventListener('message', message);
    root = createRoot(screen);
    flushSync(() => root!.render(<RogueliteContents controller={controller} />));
    unsubscribe = controller.subscribe(() => {
      const immersive = controller.getSnapshot().immersive;
      if (screen.classList.contains('rg-immersive') !== immersive)
        screen.classList.toggle('rg-immersive', immersive);
    });
    controller.start();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    doc.removeEventListener('fullscreenchange', fullscreen);
    doc.removeEventListener('keydown', keydown);
    target.removeEventListener('message', message);
    unsubscribe?.();
    controller.dispose();
    flushSync(() => root?.unmount());
    screen.classList.remove('rg-immersive');
    if (runtime.TronoRoguelite === facade) delete runtime.TronoRoguelite;
    if (runtime.TronoRogueliteHost === controller) delete runtime.TronoRogueliteHost;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
