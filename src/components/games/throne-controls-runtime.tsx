import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createThroneControls, type ThroneControls } from '../../lib/games/throne-controls';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { NetworkClient } from '../../lib/socket/client';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import { ThroneControlsContents } from './throne-controls';

interface Runtime extends Window {
  TronoAuth: { user: { id: string } | null; guest: { id: string } | null };
  TronoNetwork: NetworkClient;
  TronoRules: ThroneChoiceRules;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThroneControls?: ThroneControls;
  TronoThroneBoard?: { backToLobby(): void; notify(message: string, duration?: number): void };
  TronoDesktop?: { openManual?(): unknown };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneControls(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const get = (id: string) => doc.getElementById(id)!;
  const board = get('gameScreen');
  const controller = createThroneControls({
    source() {
      const identity = runtime.TronoAuth.user
        ? `user:${runtime.TronoAuth.user.id}`
        : runtime.TronoAuth.guest
          ? `guest:${runtime.TronoAuth.guest.id}`
          : 'anonymous';
      const lobby = runtime.TronoThroneLobby.getSnapshot();
      return {
        mode: runtime.TronoThroneMatch.getSnapshot().mode,
        key: `${identity}:${lobby.room?.id ?? lobby.selected?.id ?? ''}:${board.classList.contains('hidden')}`,
      };
    },
    subscribeSource(fn) {
      const releases = [
        runtime.TronoThroneLobby.subscribe(fn),
        runtime.TronoThroneMatch.subscribe(fn),
      ];
      const observer = new MutationObserver(fn);
      observer.observe(board, { attributes: true, attributeFilter: ['class'] });
      target.addEventListener('trono-auth-change', fn);
      return () => {
        releases.forEach((release) => release());
        observer.disconnect();
        target.removeEventListener('trono-auth-change', fn);
      };
    },
    confirmLeave: () =>
      target.confirm('Sair desta mesa e voltar aos salões? Sua chamada do M&N continua conectada.'),
    leave: () => runtime.TronoThroneBoard?.backToLobby(),
    openManual: () =>
      runtime.TronoDesktop?.openManual
        ? runtime.TronoDesktop.openManual()
        : target.open('manual/index.html', '_blank', 'noopener'),
    warn(error) {
      console.warn('[ThroneControls]', error);
      runtime.TronoThroneBoard?.notify('Não foi possível concluir esta ação da mesa.', 2500);
    },
  });
  runtime.TronoThroneControls = controller;
  const host = doc.createElement('div');
  host.id = 'throneControlsHost';
  doc.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <ThroneControlsContents
        controller={controller}
        rules={runtime.TronoRules}
        version={runtime.TronoNetwork.CLIENT_VERSION}
        hosts={{
          speed: get('throneSpeedHost'),
          rules: get('throneRulesHost'),
          restart: get('throneRestartHost'),
          manual: get('throneManualHost'),
          version: get('throneVersionHost'),
        }}
      />,
    ),
  );
  controller.start();
  const dispose = () => {
    controller.dispose();
    flushSync(() => root.unmount());
    host.remove();
    if (runtime.TronoThroneControls === controller) delete runtime.TronoThroneControls;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
