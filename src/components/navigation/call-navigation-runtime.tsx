import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { CallNavigation } from '../../lib/voice/navigation';
import { NAVIGATION_CONTROLS, CallNavigationButton } from './call-navigation';
interface NavigationRuntime {
  TronoCallNavigation: CallNavigation;
  TronoDesktop?: object;
  TronoMessenger: { close(): void };
  TronoNetwork: { primaryRoom: string | null };
}
const installed = new WeakSet<Window>();
/** Mount before layouts capture/move controls; each host keeps its React button intact. */
export function initializeCallNavigation(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as NavigationRuntime,
    client = runtime.TronoCallNavigation;
  const openText = () => {
    runtime.TronoMessenger.close();
    client.toggleTextChat();
  };
  const returnToVoice = () => {
    const button = [
      ...target.document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]'),
    ].find((button) => button.dataset.chatChannel === runtime.TronoNetwork.primaryRoom);
    button?.click();
  };
  flushSync(() => {
    for (const id of NAVIGATION_CONTROLS) {
      const host = target.document.getElementById('call-nav-' + id);
      if (host)
        createRoot(host).render(
          <CallNavigationButton
            client={client}
            id={id}
            desktop={!!runtime.TronoDesktop}
            openText={openText}
            returnToVoice={returnToVoice}
          />,
        );
    }
  });
}
