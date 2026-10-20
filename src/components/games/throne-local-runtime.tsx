import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  createThroneLocalLifecycle,
  type ThroneLocalLifecycle,
} from '../../lib/games/throne-local-lifecycle';
import {
  createThroneLocalEngine,
  type ThroneLocalEngine,
} from '../../lib/games/throne-local-engine';
import type { ThroneSeats } from '../../lib/games/throne-seats';
import type { ThroneTable } from '../../lib/games/throne-table';
import type { ThroneControls } from '../../lib/games/throne-controls';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { ThroneChoices } from '../../lib/games/throne-choices';
import type { ThroneHand } from '../../lib/games/throne-hand';
import type { ThronePrivate } from '../../lib/games/throne-private';
import type { ThroneHistory } from '../../lib/games/throne-history';
import type { ThroneEffects } from '../../lib/games/throne-effects';
import { ThroneLocalStart } from './throne-local-start';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoAudio: { ensureAudio(): Promise<unknown> };
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThroneChoices: ThroneChoices;
  TronoThroneHand: ThroneHand;
  TronoThronePrivate: ThronePrivate;
  TronoThroneHistory: ThroneHistory;
  TronoThroneEffects: ThroneEffects;
  TronoThroneLocal?: ThroneLocalLifecycle;
  TronoThroneLocalEngine?: ThroneLocalEngine;
  TronoThroneSeats: ThroneSeats;
  TronoThroneTable: ThroneTable;
  TronoThroneControls: ThroneControls;
  TronoBots: { at(index: number): string };
  TronoThroneBoard?: {
    enterLocal(): void;
    backToLobby(): void;
    notify(message: string, duration?: number): void;
  };
  TronoPortal: { showOnly(id: string): void };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneLocal(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const room = doc.getElementById('roomScreen')!,
    host = doc.getElementById('throneLocalStartHost')!;
  const engine = createThroneLocalEngine({
    hand: runtime.TronoThroneHand,
    choices: runtime.TronoThroneChoices,
    match: runtime.TronoThroneMatch,
    seats: runtime.TronoThroneSeats,
    table: runtime.TronoThroneTable,
    private: runtime.TronoThronePrivate,
    history: runtime.TronoThroneHistory,
    effects: runtime.TronoThroneEffects,
    random: () => Math.random(),
    botName: (index) => runtime.TronoBots.at(index),
    scale: () => runtime.TronoThroneControls.getSnapshot().scale,
    show() {
      runtime.TronoThroneBoard!.enterLocal();
      doc.getElementById('setupScreen')!.classList.add('hidden');
      room.classList.add('hidden');
      doc.getElementById('gameScreen')!.classList.remove('hidden');
    },
    leave: () => runtime.TronoThroneBoard!.backToLobby(),
  });
  runtime.TronoThroneLocalEngine = engine;
  const controller = createThroneLocalLifecycle({
    source() {
      const identity = runtime.TronoAuth.user
        ? `user:${runtime.TronoAuth.user.id}`
        : runtime.TronoAuth.guest
          ? `guest:${runtime.TronoAuth.guest.id}`
          : 'anonymous';
      const selected = runtime.TronoThroneLobby.getSnapshot().selected;
      return {
        key: `${identity}:${selected?.id ?? ''}`,
        online: runtime.TronoThroneMatch.getSnapshot().mode === 'online',
        allowed: !!selected && !room.classList.contains('hidden'),
      };
    },
    subscribeSource(fn) {
      const releases = [
        runtime.TronoThroneLobby.subscribe(fn),
        runtime.TronoThroneMatch.subscribe(fn),
      ];
      const observer = new MutationObserver(fn);
      observer.observe(room, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      return () => {
        releases.forEach((release) => release());
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
      };
    },
    prepare: () => runtime.TronoAudio.ensureAudio(),
    reset() {
      runtime.TronoThroneChoices.clear();
      runtime.TronoThroneHand.clear();
      runtime.TronoThronePrivate.clear();
      runtime.TronoThroneHistory.clear();
      runtime.TronoThroneEffects.clear();
      runtime.TronoThroneMatch.clear();
    },
    execute: (run, demo) =>
      engine.start(
        run,
        demo,
        [0, 1, 2, 3].map(
          (index) => (doc.getElementById(`p${index}Name`) as HTMLInputElement).value,
        ),
        runtime.TronoThroneLobby.getSnapshot().selected,
      ),
    cancelled: (run) => engine.cancel(run),
    error(error) {
      console.error('[ThroneLocal]', error);
      runtime.TronoPortal.showOnly(
        runtime.TronoThroneLobby.getSnapshot().selected ? 'roomScreen' : 'setupScreen',
      );
      runtime.TronoThroneBoard?.notify('Não foi possível continuar a partida local.', 3000);
    },
    now: () => Date.now(),
    schedule(fn, milliseconds) {
      const timer = target.setTimeout(fn, milliseconds);
      return () => target.clearTimeout(timer);
    },
  });
  runtime.TronoThroneLocal = controller;
  const root = createRoot(host);
  flushSync(() => root.render(<ThroneLocalStart controller={controller} />));
  controller.initialize();
  const dispose = () => {
    controller.dispose();
    flushSync(() => root.unmount());
    if (runtime.TronoThroneLocal === controller) delete runtime.TronoThroneLocal;
    if (runtime.TronoThroneLocalEngine === engine) delete runtime.TronoThroneLocalEngine;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
