'use client';
import { useSyncExternalStore } from 'react';
import type { ConnectionDiagnostics } from '../../lib/voice/connection-diagnostics';
const useDiagnostics = (client: ConnectionDiagnostics) =>
  useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);

export function DiagnosticLauncher({
  client,
  desktop = false,
}: {
  client: ConnectionDiagnostics;
  desktop?: boolean;
}) {
  const state = useDiagnostics(client);
  return (
    <button
      id="telemetryOpenBtn"
      className="royal-btn settings-secondary telemetry-open-btn"
      type="button"
      title="Ver diagnóstico em tempo real"
      aria-controls="telemetryPanel"
      aria-expanded={state.open}
      onClick={() => client.toggle()}
    >
      {desktop ? 'Telemetria' : '⌁ Abrir diagnóstico'}
    </button>
  );
}
export function ConnectionSettings({
  client,
  desktop,
  showLauncher = true,
}: {
  client: ConnectionDiagnostics;
  desktop: boolean;
  showLauncher?: boolean;
}) {
  const state = useDiagnostics(client),
    infra = state.infrastructure;
  return (
    <>
      <div className="settings-section-heading">
        <div>
          <small>REDE &amp; DIAGNÓSTICO</small>
          <strong>Conexão</strong>
        </div>
        <span>SFU, TURN e telemetria</span>
      </div>
      <label className="auth-check">
        <input
          id="adaptiveQuality"
          type="checkbox"
          checked={state.adaptiveEnabled}
          onChange={(event) => void client.setAdaptive(event.currentTarget.checked)}
        />{' '}
        Adaptar vídeo para proteger a voz
      </label>
      <small id="adaptiveQualityStatus" className="settings-context-help">
        {state.adaptation}
      </small>
      {!desktop && showLauncher && (
        <div className="settings-action-grid">
          <DiagnosticLauncher client={client} />
        </div>
      )}
      <div
        id="realtimeInfraCard"
        className={
          'realtime-infra-card' +
          (infra.live ? ' realtime-live' : '') +
          (infra.warning ? ' realtime-warning' : '') +
          (infra.blocked ? ' realtime-blocked' : '')
        }
        aria-live="polite"
      >
        <div className="realtime-infra-head">
          <div>
            <small>TRANSPORTE DE MÍDIA</small>
            <strong id="realtimeModeLabel">{infra.mode}</strong>
          </div>
          <span id="realtimeUsageLabel">{infra.usage}</span>
        </div>
        <div
          id="realtimeUsageBar"
          className="realtime-usage-bar"
          role="progressbar"
          aria-label="Uso mensal estimado do Cloudflare Realtime"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(infra.progress)}
          style={{ '--realtime-progress': `${infra.progress}%` } as import('react').CSSProperties}
        >
          <i></i>
        </div>
        <small id="realtimePolicyLabel">{infra.policy}</small>
      </div>
      <small className="settings-context-help">
        Falhas de publicação/assinatura são ressincronizadas antes do fallback. TURN só é relevante
        quando a rota ICE não consegue se estabelecer.
      </small>
    </>
  );
}
