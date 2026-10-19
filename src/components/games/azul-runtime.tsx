import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createAzul } from '../../lib/games/azul';
import { createGameFullscreen } from '../../lib/games/fullscreen';
import type { AzulRoom, AzulRules, AzulPresentation } from '../../types/azul';
import type { NetworkClient } from '../../lib/socket/client';
import { AzulContents } from './azul-contents';
import { createAzulAnimations } from './azul-animations';

interface Runtime extends Window {
  AzulRules: AzulRules;
  AzulPresentation: AzulPresentation;
  TronoAuth: { user: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoPortal: { showOnly(id: string): void };
  TronoSocial: { showForRoom(show: boolean): void };
  TronoAudio?: { playSfx(kind: string): void };
  TronoAzul?: {
    open(): void;
    refreshRooms(): Promise<boolean>;
    leaveView(): void;
    readonly room: AzulRoom | null;
    readonly animating: boolean;
  };
}
const installed = new WeakMap<Window, () => void>();
export function initializeAzul(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    screen = doc.getElementById('azulScreen')!,
    motion = target.matchMedia('(prefers-reduced-motion: reduce)');
  const visible = () => !screen.classList.contains('hidden') && !doc.hidden;
  const sound = (kind: string) => {
    if (visible()) runtime.TronoAudio?.playSfx(kind);
  };
  let animations: ReturnType<typeof createAzulAnimations> | undefined;
  const controller = createAzul({
    getAccountId: () => runtime.TronoAuth.user?.id ?? null,
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      return () => target.removeEventListener('trono-auth-change', listener);
    },
    subscribeMessages: (listener) => runtime.TronoNetwork.onMessage(listener),
    ensureAuthenticated: () => runtime.TronoNetwork.ensureAzul(),
    send: (action, payload) => runtime.TronoNetwork.azul(action, payload),
    visible,
    reducedMotion: () => motion.matches,
    rules: runtime.AzulRules,
    presentation: runtime.AzulPresentation,
    uuid: () => target.crypto.randomUUID(),
    animate: (step, points) => animations?.step(step, points),
    captureMove: (room) => animations?.captureMove(room),
    cancelAnimations: () => animations?.cancel(),
    sound,
    warn: (error) => console.warn('[Azul]', error),
  });
  const fullscreen = createGameFullscreen({
    visible,
    owned: () => doc.fullscreenElement === screen,
    enter: () => screen.requestFullscreen(),
    exit: () => doc.exitFullscreen(),
  });
  const facade = {
    open() {
      runtime.TronoPortal.showOnly('azulScreen');
      runtime.TronoSocial.showForRoom(false);
      doc.body.dataset.gamesView = 'azul';
      controller.open();
    },
    refreshRooms: controller.refreshRooms,
    leaveView() {
      controller.finishReplay();
      fullscreen.leave();
    },
    get room() {
      return controller.getSnapshot().room;
    },
    get animating() {
      return !!controller.getSnapshot().replay;
    },
  };
  runtime.TronoAzul = facade;
  let root: ReturnType<typeof createRoot> | undefined,
    observer: MutationObserver | undefined,
    disposed = false;
  const subscriptions: (() => void)[] = [];
  const visibility = () => {
    controller.visibilityChanged();
    fullscreen.sync();
  };
  const fullChange = () => fullscreen.sync();
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') fullscreen.escape();
  };
  function bind() {
    if (disposed || root) return;
    root = createRoot(screen);
    flushSync(() =>
      root!.render(
        <AzulContents controller={controller} fullscreen={fullscreen} rules={runtime.AzulRules} />,
      ),
    );
    animations = createAzulAnimations({
      screen,
      content: doc.getElementById('azulContent')!,
      layer: doc.getElementById('azulEffects')!,
      visible,
      reducedMotion: () => motion.matches,
      sound,
    });
    observer = new MutationObserver(visibility);
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    doc.addEventListener('visibilitychange', visibility);
    doc.addEventListener('fullscreenchange', fullChange);
    doc.addEventListener('keydown', escape);
    motion.addEventListener('change', visibility);
    let account = controller.getSnapshot().accountId,
      room = controller.getSnapshot().room?.id;
    subscriptions.push(
      controller.subscribe(() => {
        const s = controller.getSnapshot();
        screen.dataset.playing = String(!!s.room?.state);
        if (s.accountId !== account || (room && !s.room)) fullscreen.leave();
        account = s.accountId;
        room = s.room?.id;
      }),
      fullscreen.subscribe(() => {
        const immersive = fullscreen.getSnapshot().immersive;
        if (screen.classList.contains('az-immersive') !== immersive)
          screen.classList.toggle('az-immersive', immersive);
      }),
    );
    controller.start();
  }
  const dispose = () => {
    disposed = true;
    observer?.disconnect();
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('fullscreenchange', fullChange);
    doc.removeEventListener('keydown', escape);
    motion.removeEventListener('change', visibility);
    subscriptions.splice(0).forEach((fn) => fn());
    controller.dispose();
    fullscreen.dispose();
    animations?.dispose();
    flushSync(() => root?.unmount());
    screen.classList.remove('az-immersive');
    delete screen.dataset.playing;
    if (runtime.TronoAzul === facade) delete runtime.TronoAzul;
    installed.delete(target);
  };
  installed.set(target, dispose);
  bind();
  return dispose;
}
