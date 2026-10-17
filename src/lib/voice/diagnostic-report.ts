import type {
  MediaTelemetry,
  ReceptionRow,
  ReceptionHistory,
  VoiceResources,
  PlayoutMetrics,
} from '../../types/voice-diagnostics';

type UnknownFields<T> = Partial<Record<keyof T, unknown>>;

/** Only explicitly selected technical fields may leave the application. */
interface DiagnosticInput {
  version?: unknown;
  platform?: unknown;
  call: Partial<
    Record<
      'joined' | 'muted' | 'deafened' | 'camera' | 'screen' | 'transport' | 'playback',
      unknown
    >
  >;
  telemetry?: UnknownFields<MediaTelemetry>;
  processing?: unknown;
  adaptation?: unknown;
  resources?: UnknownFields<VoiceResources> | null;
  reception?: {
    enabled?: boolean;
    assessment?: string;
    priority?: string;
    rows?: readonly UnknownFields<ReceptionRow>[];
    recent?: readonly UnknownFields<ReceptionHistory & { agoMs: number }>[];
    playout?: UnknownFields<PlayoutMetrics> | null;
  } | null;
}
export function diagnosticReport({
  version,
  platform,
  call,
  telemetry,
  processing,
  adaptation,
  resources,
  reception,
}: DiagnosticInput) {
  const fields = [
    'rttMs',
    'uploadBps',
    'downloadBps',
    'audioLossPct',
    'audioJitterMs',
    'concealedPct',
    'jitterBufferMs',
    'eventLoopLagMs',
    'lossPct',
    'jitterMs',
    'outFps',
    'inFps',
    'outW',
    'outH',
    'inW',
    'inH',
  ] as const;
  const numbers: Record<string, number> = {};
  for (const key of fields)
    if (typeof telemetry?.[key] === 'number' && Number.isFinite(telemetry[key]))
      numbers[key] = Math.round(Math.max(0, telemetry[key] as number) * 100) / 100;
  const safe = (value: unknown) =>
    String(value || '')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 80);
  return JSON.stringify(
    {
      app: 'M&N',
      version: safe(version),
      platform: safe(platform),
      at: new Date().toISOString(),
      call: {
        joined: !!call.joined,
        muted: !!call.muted,
        deafened: !!call.deafened,
        camera: !!call.camera,
        screen: !!call.screen,
        transport: safe(call.transport),
      },
      playback: safe(call.playback),
      processing: safe(processing),
      adaptation: safe(adaptation),
      metrics: numbers,
      network: {
        state: safe(telemetry?.pcState),
        route: safe(telemetry?.iceRoute),
        limiter: safe(telemetry?.limiter),
      },
      reception: reception
        ? {
            enabled: !!reception.enabled,
            assessment: [
              'output',
              'arrival',
              'local',
              'recovery',
              'local-timing',
              'steady',
              'waiting',
            ].includes(String(reception.assessment))
              ? reception.assessment
              : 'waiting',
            priority: ['managed', 'system', 'waiting', 'idle', 'unavailable'].includes(
              String(reception.priority),
            )
              ? reception.priority
              : null,
            rows: (reception.rows || []).slice(0, 24).map((row, i) => {
              const entry: Record<string, unknown> = { voice: i + 1, supported: !!row.supported };
              for (const k of [
                'lossPct',
                'jitterMs',
                'concealedPct',
                'bufferMs',
                'targetMs',
                'packets',
              ] as const)
                entry[k] =
                  typeof row[k] === 'number' && Number.isFinite(row[k])
                    ? Math.round(Math.max(0, row[k] as number) * 100) / 100
                    : null;
              return entry;
            }),
            playout: reception.playout
              ? {
                  gapEvents: Math.max(0, Number(reception.playout.gapEvents) || 0),
                  gapMs: Math.max(0, Number(reception.playout.gapMs) || 0),
                }
              : null,
            recent: (reception.recent || []).slice(-12).map((row) => {
              const entry: Record<string, unknown> = {};
              for (const k of [
                'agoMs',
                'lossPct',
                'jitterMs',
                'concealedPct',
                'localLagMs',
              ] as const)
                entry[k] =
                  typeof row[k] === 'number' && Number.isFinite(row[k])
                    ? Math.round(Math.max(0, row[k] as number) * 100) / 100
                    : null;
              return entry;
            }),
          }
        : null,
      resources: resources
        ? {
            appCpuPercent: Number(resources.appCpuPercent) || 0,
            appMemoryMB: Number(resources.appMemoryMB) || 0,
            freeMemoryMB: Number(resources.freeMemoryMB) || 0,
          }
        : null,
    },
    null,
    2,
  );
}
