import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import type { ThroneMatch } from '../../lib/games/throne-match';
import { createThroneTable, type ThroneTable } from '../../lib/games/throne-table';
import { ThroneTableContents } from './throne-table';

interface Runtime extends Window {
  TronoRules: ThroneChoiceRules;
  TronoThroneMatch: ThroneMatch;
  TronoThroneTable?: ThroneTable;
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneTable(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    board = doc.getElementById('gameScreen')!,
    court = doc.getElementById('throneCourtHost')!,
    tracker = doc.getElementById('lawTrackerList')!,
    slots = [0, 1, 2, 3].map((id) => doc.getElementById(`tableCard${id}`)!),
    host = doc.createElement('div');
  host.id = 'throneTableHost';
  host.hidden = true;
  doc.body.append(host);
  const controller = createThroneTable({
    source: runtime.TronoThroneMatch.getSnapshot,
    subscribeSource: runtime.TronoThroneMatch.subscribe,
    warn: (error) => console.warn('[ThroneTable]', error),
  });
  runtime.TronoThroneTable = controller;
  const root = createRoot(host);
  const render = () => {
    const s = controller.getSnapshot();
    flushSync(() =>
      root.render(
        <ThroneTableContents
          state={s}
          rules={runtime.TronoRules}
          slots={slots}
          court={court}
          tracker={tracker}
        />,
      ),
    );
    slots.forEach((slot, id) => {
      slot.classList.toggle('winner-crown', s?.winners?.crown === id);
      slot.classList.toggle('winner-shadow', s?.winners?.shadow === id);
    });
    for (const [node, kind, value, key] of [
      [
        court.querySelector<HTMLElement>('.law-mini')!,
        'law',
        s?.currentLaw,
        s ? `${s.round}:${s.trick}:${s.currentLaw}` : '',
      ],
      [doc.getElementById('decreeBadge')!, 'decree', s?.decree, s ? `${s.round}:${s.decree}` : ''],
    ] as const) {
      if (!value) {
        delete node.dataset.arrivalKey;
        delete node.dataset[kind];
        node.classList.remove('court-arrival');
        continue;
      }
      if (node.dataset.arrivalKey === key) continue;
      node.dataset.arrivalKey = key;
      node.dataset[kind] = value;
      node.classList.remove('court-arrival');
      if (
        !board.classList.contains('hidden') &&
        !target.matchMedia('(prefers-reduced-motion: reduce)').matches &&
        !doc.body.classList.contains('voice-light-mode')
      ) {
        void node.offsetWidth;
        node.classList.add('court-arrival');
      }
    }
  };
  const release = controller.subscribe(render);
  controller.start();
  render();
  const dispose = () => {
    release();
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    slots.forEach((slot) => slot.classList.remove('winner-crown', 'winner-shadow'));
    if (runtime.TronoThroneTable === controller) delete runtime.TronoThroneTable;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
