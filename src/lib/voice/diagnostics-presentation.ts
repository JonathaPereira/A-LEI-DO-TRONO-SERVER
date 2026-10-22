import type { createAudioPlayback } from './audio-playback';
import type { createVoiceTelemetry } from './telemetry';
import type { createCallQuality } from './quality';
import type { RealtimeSnapshot } from '../../types/realtime';
import type { MediaTelemetry } from '../../types/voice-diagnostics';

type Playback = ReturnType<ReturnType<typeof createAudioPlayback>['getSnapshot']>;
export interface DiagnosticsSource {
  generation: number;
  joined: boolean;
  mode: string;
  hub: boolean;
  foreground: boolean;
  version: string;
  negotiating: boolean;
  connectionStates: readonly RTCPeerConnectionState[];
  expectedVoices: number;
  deafened: boolean;
  desiredFps: number;
  lastSfuError: string;
  outputLabel: string;
  audioContext: string | null;
  playback: Pick<Playback, 'entries' | 'volume' | 'output' | 'outputError'>;
  telemetry: ReturnType<ReturnType<typeof createVoiceTelemetry>['getSnapshot']>;
  realtime: RealtimeSnapshot;
  quality: Pick<
    ReturnType<ReturnType<typeof createCallQuality>['getSnapshot']>,
    'preferences' | 'adaptation'
  >;
  receptionNames: readonly string[];
}
export interface ConnectionHealth {
  level: 'neutral' | 'warn' | 'poor' | 'good';
  label: string;
  detail: string;
  recommendation: string;
}
const EMPTY_METRICS: MediaTelemetry = Object.freeze({
  transport: '',
  rttMs: 0,
  uploadBps: 0,
  downloadBps: 0,
  outFps: 0,
  inFps: 0,
  outW: 0,
  outH: 0,
  inW: 0,
  inH: 0,
  lossPct: 0,
  jitterMs: 0,
  limiter: 'none',
  audioLossPct: NaN,
  audioJitterMs: NaN,
  concealedPct: NaN,
  jitterBufferMs: NaN,
  eventLoopLagMs: 0,
  iceRoute: '',
  pcState: '',
});
export function infrastructurePresentation(source: DiagnosticsSource) {
  const { status: r, error } = source.realtime;
  let mode = 'WebRTC P2P (fallback)';
  if (!source.hub) mode = 'WebRTC P2P (partida)';
  else if (source.mode === 'sfu') mode = 'Cloudflare SFU';
  else if (source.mode === 'sfu-pending') mode = 'Conectando ao SFU…';
  else if (!source.joined && r?.enabled && r.configured && !r.hardBlocked)
    mode = 'Cloudflare SFU pronto';
  let policy = 'Proteção ativa • tela até 1080p/60 permitida.';
  if (!r)
    policy = error
      ? 'Não foi possível sincronizar o freio de consumo. O SFU não será assumido como disponível até nova confirmação.'
      : 'Freio de consumo aguardando sincronização.';
  else if (!r.configured) policy = 'SFU não configurado no backend.';
  else if (!r.enabled) policy = 'Kill switch desligado: mídia permanece em P2P.';
  else if (r.hardBlocked) policy = 'Limite de segurança atingido: SFU bloqueado.';
  else if (!r.screenAllowed) policy = 'Economia crítica: compartilhamento de tela bloqueado.';
  else if (!r.highAllowed) policy = 'Economia automática: máximo Equilibrada.';
  return Object.freeze({
    mode,
    live: source.mode === 'sfu',
    warning: !!r?.softWarning,
    blocked: !!r?.hardBlocked,
    usage: r
      ? `${r.estimatedGb.toFixed(2)} / ${(r.thresholds.hard || 950).toFixed(0)} GB estimados • margem ${(r.estimateSafetyFactor || 1).toFixed(1)}×`
      : error || 'Aguardando dados do backend',
    progress: Math.min(
      100,
      Math.max(0, ((r?.estimatedGb || 0) / (r?.thresholds.hard || 950)) * 100),
    ),
    policy,
  });
}

const formatRate = (value: number) =>
  !Number.isFinite(value) || value <= 0
    ? '—'
    : value >= 1e6
      ? `${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)} Mbps`
      : `${Math.round(value / 1000)} Kbps`;
const formatMetric = (value: number | null, suffix: string, decimals = 1) =>
  value !== null && Number.isFinite(value) ? value.toFixed(decimals) + suffix : '—';
const resolution = (w: number, h: number) => (w && h ? `${w}×${h}` : '—');

/** Display-only data. Names are local to the panel and never used by diagnosticReport. */
export function diagnosticPresentation(source: DiagnosticsSource) {
  const snapshot = source.telemetry,
    t = snapshot.telemetry ?? EMPTY_METRICS,
    playback = playbackPresentation(source),
    resources = snapshot.resources;
  const fields: Readonly<Record<string, string>> = Object.freeze({
    telemetryTransport:
      source.mode === 'sfu-pending'
        ? 'Conectando áudio…'
        : source.mode === 'sfu'
          ? 'Cloudflare SFU'
          : 'WebRTC P2P',
    telemetryRtt: t.rttMs ? `${Math.round(t.rttMs)} ms` : '—',
    telemetryUpload: formatRate(t.uploadBps),
    telemetryDownload: formatRate(t.downloadBps),
    telemetryOutFps: t.outFps ? `${Math.round(t.outFps)} FPS` : '—',
    telemetryInFps: t.inFps ? `${Math.round(t.inFps)} FPS` : '—',
    telemetryOutResolution: resolution(t.outW, t.outH),
    telemetryInResolution: resolution(t.inW, t.inH),
    telemetryLoss: formatMetric(t.lossPct, '%', t.lossPct >= 10 ? 1 : 2),
    telemetryJitter: t.jitterMs ? `${Math.round(t.jitterMs)} ms` : '—',
    telemetryPcState: t.pcState || '—',
    telemetryIceRoute: t.iceRoute || '—',
    telemetryTurn: source.realtime.turn ? 'TURN disponível' : 'STUN direto',
    telemetryAppVersion: source.version,
    telemetryPlayback: playback.label,
    telemetryVoiceReceivers: `${playback.count} de ${playback.expected}`,
    telemetryAudioContext: source.audioContext || 'Áudio direto',
    telemetryOutput:
      source.playback.outputError ||
      source.outputLabel ||
      (source.playback.output ? 'Dispositivo escolhido' : 'Saída padrão'),
    telemetryLimiter:
      (
        {
          cpu: 'CPU / codificação',
          bandwidth: 'Banda / congestionamento',
          other: 'Outro fator',
          none: 'Nenhum',
        } as Record<string, string>
      )[t.limiter] || 'Não informado',
    telemetrySfuError: source.lastSfuError || 'Nenhum',
    telemetryAudioLoss: formatMetric(t.audioLossPct, '%'),
    telemetryAudioJitter: formatMetric(t.audioJitterMs, ' ms', 0),
    telemetryConcealed: formatMetric(t.concealedPct, '%'),
    telemetryLocalLag: Math.round(snapshot.lagMs) + ' ms',
    telemetryResources: resources
      ? `${resources.appCpuPercent}% CPU · ${resources.appMemoryMB} MB · ${resources.freeMemoryMB} MB livres`
      : 'Abra este painel no app Windows para medir recursos.',
  });
  const lines = snapshot.rows.map(
    (row) =>
      `${source.receptionNames[row.voice - 1] || 'Participante'} · Voz ${row.voice} · perda ${formatMetric(row.lossPct, '%')} · jitter ${formatMetric(row.jitterMs, ' ms')} · reconstruída ${formatMetric(row.concealedPct, '%')} · buffer medido ${formatMetric(row.bufferMs, ' ms')} · margem solicitada ${row.targetMs === null ? 'automática' : row.targetMs + ' ms'}`,
  );
  return Object.freeze({
    fields,
    health: Object.freeze(connectionHealth(source)),
    assessment: snapshot.assessment.text,
    rows: lines.length ? lines.join('\n') : 'Aguardando intervalos de voz recebida.',
    priority: snapshot.priority
      ? {
          managed: 'Acima do normal · somente serviço de áudio',
          system: 'Prioridade gerenciada pelo sistema',
          waiting: 'Aguardando serviço de áudio',
          idle: 'Proteção nativa inativa',
          unavailable: 'Windows manteve a prioridade padrão',
        }[snapshot.priority.status]
      : 'Gerenciada pelo sistema',
    outputGaps: snapshot.playout
      ? `${snapshot.playout.gapEvents} eventos · ${Math.round(snapshot.playout.gapMs)} ms`
      : 'Métrica não fornecida por este motor de áudio',
  });
}
export function playbackPresentation(source: DiagnosticsSource): {
  label: string;
  expected: number;
  count: number;
  problem?: boolean;
} {
  const snapshot = source.playback;
  const received = snapshot.entries.filter(({ key }) => !key.startsWith('stream:'));
  const expected = source.expectedVoices;
  if (!source.joined) return { label: 'Fora da chamada', expected, count: 0 };
  if (source.deafened)
    return {
      label: 'Voz silenciada neste aparelho',
      expected,
      count: received.length,
      problem: true,
    };
  if (snapshot.volume === 0)
    return { label: 'Volume de saída em 0%', expected, count: received.length, problem: true };
  if (received.some((entry) => entry.blocked))
    return {
      label: 'Reprodução bloqueada pelo navegador',
      expected,
      count: received.length,
      problem: true,
    };
  if (received.some((entry) => entry.route !== 'gain' && entry.paused))
    return { label: 'Reprodução pausada', expected, count: received.length, problem: true };
  if (received.length && received.every((entry) => entry.gain === 0))
    return {
      label: 'Volume dos participantes em 0%',
      expected,
      count: received.length,
      problem: true,
    };
  if (!received.length)
    return {
      label: expected ? 'Aguardando áudio dos participantes' : 'Aguardando outro participante',
      expected,
      count: 0,
    };
  const boosted = received.some((entry) => entry.route === 'gain');
  return {
    label: boosted ? 'Reproduzindo com amplificação' : 'Reproduzindo áudio direto',
    expected,
    count: received.length,
  };
}
export function connectionHealth(source: DiagnosticsSource): ConnectionHealth {
  const t = source.telemetry.telemetry ?? EMPTY_METRICS;
  const playback = playbackPresentation(source);
  if (playback.problem || source.playback.outputError)
    return {
      level: 'warn',
      label: 'Confira a reprodução de áudio',
      detail: 'saída local',
      recommendation: source.playback.outputError
        ? `Saída de áudio: ${source.playback.outputError}. Confira o dispositivo em Configurações → Áudio.`
        : `${playback.label}. Confira o volume e use Liberar áudio se o navegador bloqueou a reprodução.`,
    };
  if (source.joined && source.mode === 'sfu-pending')
    return {
      level: 'neutral',
      label: 'Conectando áudio',
      detail: 'negociando',
      recommendation:
        'Aguardando a conexão de voz. O microfone já foi aberto, mas a rota de mídia ainda está sendo negociada.',
    };
  if (source.joined && source.mode === 'sfu' && source.negotiating)
    return {
      level: 'warn',
      label: 'Mídia conectando',
      detail: 'negociando receptor',
      recommendation:
        'A conexão de rede já pode estar pronta enquanto o receptor termina a negociação. Aguarde a reprodução iniciar.',
    };
  if (
    source.joined &&
    source.connectionStates.some((state) => ['new', 'connecting'].includes(state))
  )
    return {
      level: 'warn',
      label: 'Áudio conectando',
      detail: 'aguardando rota',
      recommendation:
        'Ainda há uma ponta conectando. Se persistir, confira o último erro SFU e a disponibilidade de TURN.',
    };
  if (!source.joined || !source.connectionStates.length)
    return {
      level: 'neutral',
      label: 'Aguardando mídia',
      detail: 'sem fluxo',
      recommendation: 'Entre na chamada e ative câmera ou compartilhamento para medir a conexão.',
    };
  if (['failed', 'disconnected'].includes(t.pcState))
    return {
      level: 'poor',
      label: 'Mídia desconectada',
      detail: t.pcState,
      recommendation: source.lastSfuError
        ? `Falha SFU: ${source.lastSfuError}. Em redes móveis/restritivas, habilite o TURN da Cloudflare.`
        : 'A rota WebRTC caiu. Tente reconectar; em redes móveis/restritivas, habilite TURN.',
    };
  if (t.eventLoopLagMs >= 180)
    return {
      level: 'warn',
      label: 'Sobrecarga local detectada',
      detail: 'processamento',
      recommendation:
        'A interface demorou a responder. Veja Recepção de voz para comparar com perda, jitter e reconstrução; atraso de interface sozinho não confirma falha na reprodução.',
    };
  if (t.audioLossPct >= 5 || t.audioJitterMs >= 70 || t.concealedPct >= 8)
    return {
      level: 'poor',
      label: 'Voz recebida instável',
      detail: 'perda ou atraso',
      recommendation:
        'O receptor precisou recuperar áudio. Confira a rede e a carga do computador de quem está falando. A leitura local não mede a CPU do outro participante.',
    };
  const desired = source.desiredFps;
  const lowFps = desired >= 30 && t.outFps > 0 && t.outFps < desired * 0.58;
  if (t.lossPct >= 8 || t.rttMs >= 450 || t.jitterMs >= 100 || lowFps) {
    const captureIssue = lowFps && t.limiter === 'none' && t.lossPct < 3 && t.rttMs < 180;
    return {
      level: 'poor',
      label: 'Conexão crítica',
      detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'instável',
      recommendation: captureIssue
        ? 'A rede está saudável, mas a origem está codificando poucos quadros. Reduza resolução ou feche aplicações pesadas.'
        : t.limiter === 'cpu'
          ? 'A CPU está limitando a codificação. Reduza resolução/FPS ou feche aplicações pesadas.'
          : t.limiter === 'bandwidth' || t.lossPct >= 8
            ? 'A rede está limitando a mídia. Reduza a qualidade ou teste outra conexão.'
            : 'FPS/latência fora do ideal. Teste uma qualidade menor e confira CPU/rede.',
    };
  }
  if (source.lastSfuError && source.mode === 'sfu')
    return {
      level: 'warn',
      label: 'SFU reconectando',
      detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'tentando rota',
      recommendation: `${source.lastSfuError}. A publicação local pode estar saudável mesmo quando um receptor ainda não conseguiu assinar a mídia.`,
    };
  if (playback.expected && playback.count < playback.expected)
    return {
      level: 'warn',
      label: 'Aguardando áudio remoto',
      detail: `${playback.count}/${playback.expected} receptores`,
      recommendation:
        'Ainda falta abrir o áudio de um participante. Uma publicação local conectada não confirma a recepção nos dois sentidos.',
    };
  if (
    t.lossPct >= 3 ||
    t.rttMs >= 220 ||
    t.jitterMs >= 50 ||
    t.limiter === 'cpu' ||
    t.limiter === 'bandwidth'
  )
    return {
      level: 'warn',
      label: 'Conexão sob atenção',
      detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'oscilando',
      recommendation:
        t.limiter === 'cpu'
          ? 'Codificação limitada por CPU; considere baixar a qualidade.'
          : t.limiter === 'bandwidth'
            ? 'WebRTC detectou limitação de banda; a qualidade pode oscilar.'
            : 'Há perda/jitter acima do ideal; acompanhe antes de aumentar a qualidade.',
    };
  return {
    level: 'good',
    label: 'Rede saudável',
    detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'estável',
    recommendation:
      'Sem gargalo de rede detectado. Confira também Reprodução de voz e Saída de áudio: tráfego recebido não confirma som audível no dispositivo.',
  };
}
