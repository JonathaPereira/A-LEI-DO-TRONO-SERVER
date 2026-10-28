import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { NetworkClient } from '../../lib/socket/client';
import { createSimilo } from '../../lib/games/similo/controller';
import { createGameFullscreen } from '../../lib/games/fullscreen';
import { SimiloContents } from './similo-contents';
import type { AudioPlayer } from '../../lib/audio/player';
import type { SimiloRoom } from '../../types/similo';
interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoAudio: AudioPlayer;
  TronoPortal: { showOnly(id: string): void };
  TronoGameLibrary: { open(id: 'library'): unknown };
  TronoSocial: { showForRoom(v: boolean): void };
  TronoSimilo?: {
    open(): void;
    readonly room: SimiloRoom | null;
  };
}
const installed = new WeakMap<Window, () => void>();
export function initializeSimilo(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    screen = doc.getElementById('similoScreen')!,
    visible = () => !screen.classList.contains('hidden') && !doc.hidden;
  const controller = createSimilo({
    getAccountId: () => runtime.TronoAuth.user?.id ?? null,
    connected: () => runtime.TronoNetwork.connected,
    visible,
    subscribeIdentity(fn) {
      target.addEventListener('trono-auth-change', fn);
      return () => target.removeEventListener('trono-auth-change', fn);
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    ensureAuthenticated: () => runtime.TronoNetwork.ensureSimilo(),
    send: (action, payload) => runtime.TronoNetwork.similo(action, payload),
    warn: (e) => console.warn('[Similo]', e),
  });
  const fullscreen = createGameFullscreen({
    visible,
    owned: () => doc.fullscreenElement === screen,
    enter: () => screen.requestFullscreen(),
    exit: () => doc.exitFullscreen(),
  });
  const facade = {
    open() {
      runtime.TronoPortal.showOnly('similoScreen');
      runtime.TronoSocial.showForRoom(false);
      doc.body.dataset.gamesView = 'similo';
      controller.open();
    },
    get room() {
      return controller.getSnapshot().room;
    },
  };
  runtime.TronoSimilo = facade;
  const root = createRoot(screen);
  flushSync(() =>
    root.render(
      <SimiloContents
        controller={controller}
        fullscreen={fullscreen}
        back={() => void runtime.TronoGameLibrary.open('library')}
        sound={(kind) => {
          if (visible()) runtime.TronoAudio.playSfx(kind, 'similo');
        }}
      />,
    ),
  );
  const sync = () => {
      controller.visibilityChanged();
      fullscreen.sync();
    },
    full = () => fullscreen.sync(),
    escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !doc.querySelector('dialog:modal'))
        fullscreen.escape();
    };
  const observer = new MutationObserver(sync);
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('visibilitychange', sync);
  doc.addEventListener('fullscreenchange', full);
  doc.addEventListener('keydown', escape);
  const subscriptions = [
    fullscreen.subscribe(() =>
      screen.classList.toggle('similo-immersive', fullscreen.getSnapshot().immersive),
    ),
    controller.subscribe(() => {
      screen.dataset.playing = String(!!controller.getSnapshot().room?.state);
    }),
  ];
  controller.start();
  const dispose = () => {
    observer.disconnect();
    doc.removeEventListener('visibilitychange', sync);
    doc.removeEventListener('fullscreenchange', full);
    doc.removeEventListener('keydown', escape);
    subscriptions.forEach((fn) => fn());
    controller.dispose();
    fullscreen.dispose();
    flushSync(() => root.unmount());
    if (runtime.TronoSimilo === facade) delete runtime.TronoSimilo;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
