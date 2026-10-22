import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { SettingsRuntime } from '../../lib/settings/runtime';
import { ConnectionIndicator, DiagnosticLauncher, DiagnosticPanel } from './diagnostics';

const installed = new WeakSet<Window>();
/** Mount after the desktop shell has moved the empty hosts into their final parents. */
export function initializeConnectionDiagnostics(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as SettingsRuntime,
    client = runtime.TronoConnectionDiagnostics,
    panel = target.document.getElementById('telemetryPanel')!;
  flushSync(() => {
    createRoot(panel).render(<DiagnosticPanel client={client} panel={panel} />);
    createRoot(target.document.getElementById('voiceConnectionIndicator')!).render(
      <ConnectionIndicator client={client} />,
    );
    if (runtime.TronoDesktop)
      createRoot(target.document.getElementById('voiceDiagnosticsLauncher')!).render(
        <DiagnosticLauncher client={client} desktop />,
      );
  });
}
