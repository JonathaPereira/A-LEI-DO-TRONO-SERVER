import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CALL_CONTROL_IDS } from '../../lib/voice/toolbar';
import type { CallToolbar } from '../../lib/voice/toolbar';
import { CallControl, CallStatus } from './call-toolbar';

const installed = new WeakSet<Window>();
/** Mount before layout controllers remember homes; they move hosts, never React children. */
export function initializeCallToolbar(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const client = (target as unknown as { TronoCallToolbar: CallToolbar }).TronoCallToolbar;
  client.start();
  flushSync(() => {
    for (const id of CALL_CONTROL_IDS)
      createRoot(target.document.getElementById('call-control-' + id)!).render(
        <CallControl client={client} id={id} />,
      );
    createRoot(target.document.getElementById('call-status-host')!).render(
      <CallStatus client={client} />,
    );
  });
}
