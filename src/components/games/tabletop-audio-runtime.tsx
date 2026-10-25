import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  createTabletopAudio,
  type TabletopAudioSource,
  type TabletopGame,
} from '../../lib/games/tabletop-audio';
import { TabletopAudioControls } from './tabletop-audio';

interface Runtime extends Window {
  TronoAudio: TabletopAudioSource;
}
const installed = new WeakMap<Window, () => void>();
/** Mount after game headers, before ready. No audio resource or compatibility global is created. */
export function initializeTabletopAudio(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const doc = target.document;
  const hosts = (
    [
      ['throne', 'gameScreen'],
      ['azul', 'azulScreen'],
      ['splendor', 'splendorScreen'],
      ['love-letter', 'loveLetterScreen'],
    ] as const
  ).map(([key, id]) => {
    const screen = doc.getElementById(id)!;
    return { key, screen, host: screen.querySelector<HTMLElement>('[data-game-audio-slot]')! };
  });
  const controller = createTabletopAudio({ audio: (target as Runtime).TronoAudio, events: target });
  const host = doc.createElement('div');
  host.id = 'tabletopAudioHost';
  (doc.getElementById('gameSurface') ?? doc.body).append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<TabletopAudioControls controller={controller} hosts={hosts} />));
  controller.start();
  const close = () => controller.setOpen(null);
  const outside = (event: PointerEvent) => {
    const key = controller.getSnapshot().open;
    const current = hosts.find((item) => item.key === key);
    if (current && event.target instanceof Node && !current.host.contains(event.target)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const current = hosts.find((item) => item.key === controller.getSnapshot().open);
    if (current?.host.contains(doc.activeElement)) current.host.querySelector('summary')?.focus();
    close();
  };
  const visibility = () => {
    const key: TabletopGame | null = controller.getSnapshot().open;
    if (
      doc.hidden ||
      hosts.some((item) => item.key === key && item.screen.classList.contains('hidden'))
    )
      close();
  };
  const observer = new MutationObserver(visibility);
  for (const { screen } of hosts)
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('pointerdown', outside);
  doc.addEventListener('keydown', escape);
  doc.addEventListener('visibilitychange', visibility);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    doc.removeEventListener('pointerdown', outside);
    doc.removeEventListener('keydown', escape);
    doc.removeEventListener('visibilitychange', visibility);
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
