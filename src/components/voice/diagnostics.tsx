'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { ConnectionDiagnostics } from '../../lib/voice/connection-diagnostics';
const useDiagnostics = (client: ConnectionDiagnostics) =>
  useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);

export function DiagnosticPanel({
  client,
  panel,
}: {
  client: ConnectionDiagnostics;
  panel: HTMLElement;
}) {
  const state = useDiagnostics(client),
    details = state.details;
  useLayoutEffect(() => {
    panel.classList.toggle('hidden', !state.open);
  }, [panel, state.open]);
  return (
    <>
      <div className={'telemetry-head'}>
        <div>
          <small>DIAGNÓSTICO EM TEMPO REAL</small>
          <strong>Saúde da conexão</strong>
        </div>
        <button
          id={'telemetryCloseBtn'}
          className={'settings-close'}
          title={'Fechar diagnóstico'}
          type="button"
          onClick={() => client.toggle(false)}
        >
          ×
        </button>
      </div>
      <div className={'telemetry-hero'}>
        <span id={'telemetryHeroDot'} className={`telemetry-dot ${details.health.level}`}></span>
        <div>
          <strong id={'telemetryHeroLabel'}>{details.health.label}</strong>
          <small id={'telemetryRecommendation'}>{details.health.recommendation}</small>
        </div>
      </div>
      <div className={'telemetry-grid'}>
        <div>
          <small>Transporte</small>
          <strong id={'telemetryTransport'}>{details.fields.telemetryTransport}</strong>
        </div>
        <div>
          <small>RTT</small>
          <strong id={'telemetryRtt'}>{details.fields.telemetryRtt}</strong>
        </div>
        <div>
          <small>Upload</small>
          <strong id={'telemetryUpload'}>{details.fields.telemetryUpload}</strong>
        </div>
        <div>
          <small>Download</small>
          <strong id={'telemetryDownload'}>{details.fields.telemetryDownload}</strong>
        </div>
        <div>
          <small>FPS enviado</small>
          <strong id={'telemetryOutFps'}>{details.fields.telemetryOutFps}</strong>
        </div>
        <div>
          <small>FPS recebido</small>
          <strong id={'telemetryInFps'}>{details.fields.telemetryInFps}</strong>
        </div>
        <div>
          <small>Resolução enviada</small>
          <strong id={'telemetryOutResolution'}>{details.fields.telemetryOutResolution}</strong>
        </div>
        <div>
          <small>Resolução recebida</small>
          <strong id={'telemetryInResolution'}>{details.fields.telemetryInResolution}</strong>
        </div>
        <div>
          <small>Perda de pacotes</small>
          <strong id={'telemetryLoss'}>{details.fields.telemetryLoss}</strong>
        </div>
        <div>
          <small>Jitter</small>
          <strong id={'telemetryJitter'}>{details.fields.telemetryJitter}</strong>
        </div>
        <div className={'telemetry-network'}>
          <small>Estado WebRTC</small>
          <strong id={'telemetryPcState'}>{details.fields.telemetryPcState}</strong>
        </div>
        <div className={'telemetry-network'}>
          <small>Rota ICE</small>
          <strong id={'telemetryIceRoute'}>{details.fields.telemetryIceRoute}</strong>
        </div>
        <div className={'telemetry-network'}>
          <small>Fallback TURN</small>
          <strong id={'telemetryTurn'}>{details.fields.telemetryTurn}</strong>
        </div>
        <div>
          <small>Versão do app</small>
          <strong id={'telemetryAppVersion'}>{details.fields.telemetryAppVersion}</strong>
        </div>
        <div className={'telemetry-wide'}>
          <small>Reprodução de voz</small>
          <strong id={'telemetryPlayback'}>{details.fields.telemetryPlayback}</strong>
        </div>
        <div>
          <small>Receptores de voz</small>
          <strong id={'telemetryVoiceReceivers'}>{details.fields.telemetryVoiceReceivers}</strong>
        </div>
        <div>
          <small>Processamento de áudio</small>
          <strong id={'telemetryAudioContext'}>{details.fields.telemetryAudioContext}</strong>
        </div>
        <div className={'telemetry-wide'}>
          <small>Saída de áudio</small>
          <strong id={'telemetryOutput'}>{details.fields.telemetryOutput}</strong>
        </div>
        <div className={'telemetry-wide'}>
          <small>Limitador detectado</small>
          <strong id={'telemetryLimiter'}>{details.fields.telemetryLimiter}</strong>
        </div>
        <div className={'telemetry-wide'}>
          <small>Último erro SFU</small>
          <strong id={'telemetrySfuError'}>{details.fields.telemetrySfuError}</strong>
        </div>
      </div>
      <button
        id={'copyDiagnostics'}
        type={'button'}
        className={'royal-btn settings-secondary'}
        disabled={state.copying}
        onClick={() => void client.copy()}
      >
        Copiar diagnóstico
      </button>
      <span id={'copyDiagnosticsStatus'} role={'status'}>
        {state.copyStatus}
      </span>
      <div className={'telemetry-grid'}>
        <div>
          <small>Perda de voz</small>
          <strong id={'telemetryAudioLoss'}>{details.fields.telemetryAudioLoss}</strong>
        </div>
        <div>
          <small>Jitter de voz</small>
          <strong id={'telemetryAudioJitter'}>{details.fields.telemetryAudioJitter}</strong>
        </div>
        <div>
          <small>Áudio recuperado</small>
          <strong id={'telemetryConcealed'}>{details.fields.telemetryConcealed}</strong>
        </div>
        <div>
          <small>Atraso local</small>
          <strong id={'telemetryLocalLag'}>{details.fields.telemetryLocalLag}</strong>
        </div>
        <div className={'telemetry-wide'}>
          <small>Recursos do app</small>
          <strong id={'telemetryResources'}>{details.fields.telemetryResources}</strong>
        </div>
      </div>
      <section className={'voice-reception-report'} aria-label={'Recepção de voz'}>
        <strong>Recepção de voz</strong>
        <p id={'telemetryVoiceAssessment'}>{details.assessment}</p>
        <p id={'telemetryVoiceRows'}>{details.rows}</p>
        <small>Prioridade de áudio</small>
        <p id={'telemetryVoicePriority'}>{details.priority}</p>
        <small>Lacunas na saída, no intervalo medido</small>
        <p id={'telemetryOutputGaps'}>{details.outputGaps}</p>
        <small>
          Voz 1, 2… são identificadores locais desta chamada. Margem solicitada e buffer medido são
          grandezas diferentes; nenhum deles mede o atraso total até seu fone.
        </small>
      </section>
      <small className={'telemetry-note'}>
        Leitura local via WebRTC getStats(), atualizada a cada 2 segundos com o painel em foco e a
        cada 5 segundos durante a chamada em segundo plano. Alguns campos variam conforme navegador
        e dispositivo.
      </small>
    </>
  );
}
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
export function ConnectionIndicator({ client }: { client: ConnectionDiagnostics }) {
  const state = useDiagnostics(client);
  return (
    <>
      <button
        id="telemetryStatusPill"
        className={`connection-health ${state.health.level}`}
        type="button"
        title="Abrir diagnóstico da conexão"
        aria-controls="telemetryPanel"
        aria-expanded={state.open}
        onClick={() => client.toggle()}
      >
        <i></i>
        <span id="telemetryHealthLabel">{state.health.label.replace('Conexão ', '')}</span>
        <small id="telemetryHealthDetail">{state.health.detail}</small>
      </button>
      <span
        id="chatOnlyTransport"
        className={'transport-pill' + (state.mode === 'sfu' ? ' sfu' : '')}
      >
        {state.mode === 'sfu-pending' ? '⌁ Conectando…' : state.mode === 'sfu' ? '☁ SFU' : '↔ P2P'}
      </span>
    </>
  );
}
export function ConnectionSettings({
  client,
  desktop,
}: {
  client: ConnectionDiagnostics;
  desktop: boolean;
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
      {!desktop && (
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
