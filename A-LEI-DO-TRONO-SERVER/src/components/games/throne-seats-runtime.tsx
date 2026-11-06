import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneMatch } from '../../lib/games/throne-match';
import { createThroneSeats, type ThroneSeats } from '../../lib/games/throne-seats';
import { ThroneSeatContents } from './throne-seats';

interface Runtime extends Window {
  TronoThroneMatch: ThroneMatch;
  TronoThroneSeats?: ThroneSeats;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneSeats(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    panels = [0, 1, 2, 3].map((id) => doc.getElementById(`player${id}`)!),
    coins = doc.getElementById('tableInfluenceCoins')!,
    host = doc.createElement('div');
  host.id = 'throneSeatsHost';
  host.hidden = true;
  (doc.getElementById('gameSurface') ?? doc.body).append(host);
  const controller = createThroneSeats({
    source: runtime.TronoThroneMatch.getSnapshot,
    subscribeSource: runtime.TronoThroneMatch.subscribe,
    warn: (error) => console.warn('[ThroneSeats]', error),
  });
  runtime.TronoThroneSeats = controller;
  const root = createRoot(host);
  const render = () => {
    const s = controller.getSnapshot();
    panels.forEach((panel, id) => {
      panel.classList.toggle('active', s.turn === id);
      panel.classList.toggle('local-player', !!s.players[id] && s.localSeat === id);
    });
    // Effects measure these nodes immediately after projecting the local engine.
    flushSync(() => root.render(<ThroneSeatContents snapshot={s} panels={panels} coins={coins} />));
  };
  const release = controller.subscribe(render);
  controller.start();
  render();
  const dispose = () => {
    release();
    controller.dispose();
    flushSync(() => root.unmount());
    panels.forEach((panel) => panel.classList.remove('active', 'local-player'));
    host.remove();
    if (runtime.TronoThroneSeats === controller) delete runtime.TronoThroneSeats;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
