import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createSplendor } from '../../lib/games/splendor';
import { createGameFullscreen } from '../../lib/games/fullscreen';
import * as rules from '../../lib/games/splendor-rules';
import * as data from '../../lib/games/splendor-data';
import type { SplendorRoom } from '../../types/splendor';
import type { NetworkClient } from '../../lib/socket/client';
import { SplendorContents } from './splendor-contents';
import { createSplendorAnimations } from './splendor-animations';
interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoPortal: { showOnly(id: string): void };
  TronoSocial: { showForRoom(v: boolean): void };
  TronoAudio?: { playSfx(kind: string): void };
  TronoSplendor?: { open(): void; readonly room: SplendorRoom | null; readonly animating: boolean };
}
const installed = new WeakMap<Window, () => void>();
export function initializeSplendor(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    screen = doc.getElementById('splendorScreen')!,
    motion = target.matchMedia('(prefers-reduced-motion: reduce)'),
    visible = () => !screen.classList.contains('hidden') && !doc.hidden;
  let effects: ReturnType<typeof createSplendorAnimations> | undefined;
  const controller = createSplendor({
    getAccountId: () => runtime.TronoAuth.user?.id ?? null,
    connected: () => runtime.TronoNetwork.connected,
    visible,
    reduced: () => motion.matches,
    subscribeIdentity(fn) {
      target.addEventListener('trono-auth-change', fn);
      return () => target.removeEventListener('trono-auth-change', fn);
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    ensureAuthenticated: () => runtime.TronoNetwork.ensureSplendor(),
    send: (action, payload) => runtime.TronoNetwork.splendor(action, payload),
    rules,
    uuid: () => target.crypto.randomUUID(),
    effect: (e, p) => effects?.effect(e, p),
    capturePurchase: (e) => effects?.capturePurchase(e),
    cancelEffects: () => effects?.cancel(),
    sound: (kind) => {
      if (visible()) runtime.TronoAudio?.playSfx(kind);
    },
    warn: (error) => console.warn('[Splendor]', error),
  });
  const fullscreen = createGameFullscreen({
    visible,
    owned: () => doc.fullscreenElement === screen,
    enter: () => screen.requestFullscreen(),
    exit: () => doc.exitFullscreen(),
  });
  const facade = {
    open() {
      runtime.TronoPortal.showOnly('splendorScreen');
      runtime.TronoSocial.showForRoom(false);
      doc.body.dataset.gamesView = 'splendor';
      controller.open();
    },
    get room() {
      return controller.getSnapshot().room;
    },
    get animating() {
      return !!controller.getSnapshot().replay;
    },
  };
  runtime.TronoSplendor = facade;
  const root = createRoot(screen);
  flushSync(() =>
    root.render(
      <SplendorContents
        controller={controller}
        fullscreen={fullscreen}
        rules={rules}
        data={data}
      />,
    ),
  );
  effects = createSplendorAnimations({
    content: doc.getElementById('splendorContent')!,
    layer: doc.getElementById('splendorEffects')!,
    visible,
    reduced: () => motion.matches,
    rules,
  });
  const sync = () => {
      controller.visibilityChanged();
      fullscreen.sync();
    },
    full = () => fullscreen.sync(),
    escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fullscreen.escape();
    };
  const observer = new MutationObserver(sync);
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('visibilitychange', sync);
  doc.addEventListener('fullscreenchange', full);
  doc.addEventListener('keydown', escape);
  motion.addEventListener('change', sync);
  let account = controller.getSnapshot().accountId,
    room = controller.getSnapshot().room?.id;
  const subscriptions = [
    controller.subscribe(() => {
      const s = controller.getSnapshot();
      screen.dataset.playing = String(!!s.room?.state);
      if (s.accountId !== account || (room && !s.room)) fullscreen.leave();
      account = s.accountId;
      room = s.room?.id;
    }),
    fullscreen.subscribe(() => {
      const immersive = fullscreen.getSnapshot().immersive;
      if (screen.classList.contains('sp-immersive') !== immersive)
        screen.classList.toggle('sp-immersive', immersive);
    }),
  ];
  controller.start();
  const dispose = () => {
    observer.disconnect();
    doc.removeEventListener('visibilitychange', sync);
    doc.removeEventListener('fullscreenchange', full);
    doc.removeEventListener('keydown', escape);
    motion.removeEventListener('change', sync);
    subscriptions.forEach((fn) => fn());
    controller.dispose();
    fullscreen.dispose();
    effects?.dispose();
    flushSync(() => root.unmount());
    screen.classList.remove('sp-immersive');
    delete screen.dataset.playing;
    if (runtime.TronoSplendor === facade) delete runtime.TronoSplendor;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
