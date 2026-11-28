import type {
  MediaTelemetry,
  ReceptionRow,
  ReceptionHistory,
  VoiceResources,
  PlayoutMetrics,
} from '../../types/voice-diagnostics';

type UnknownFields<T> = Partial<Record<keyof T, unknown>>;

interface ScreenShareEncodingInput {
  rid?: unknown;
  active?: unknown;
  scaleResolutionDownBy?: unknown;
  maxBitrate?: unknown;
  maxFramerate?: unknown;
  scalabilityMode?: unknown;
}

interface ScreenShareSubscriptionInput {
  /** Internal matcher against telemetry.streams[].pcKey; never serialized. */
  pcKey?: unknown;
  requestedRid?: unknown;
  negotiatedRid?: unknown;
  availableRids?: readonly unknown[];
}

export interface ScreenShareDiagnosticInput {
  config?: {
    format?: unknown;
    targetWidth?: unknown;
    targetHeight?: unknown;
    targetFps?: unknown;
    targetBitrateBps?: unknown;
    contentHint?: unknown;
    requestedCodec?: unknown;
    autoDetectedCodec?: unknown;
    autoHardwareConfirmed?: unknown;
    adaptiveEnabled?: unknown;
    adaptationLevel?: unknown;
    adaptationReason?: unknown;
    mobileViewer?: unknown;
  } | null;
  capture?: {
    width?: unknown;
    height?: unknown;
    fps?: unknown;
    displaySurface?: unknown;
    contentHint?: unknown;
    degradationPreference?: unknown;
    publishedRids?: readonly unknown[];
    encodings?: readonly ScreenShareEncodingInput[];
  } | null;
  /** Internal matcher against outbound stream trackId; never serialized. */
  localTrackId?: unknown;
  subscriptions?: readonly ScreenShareSubscriptionInput[];
}

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
  screenShare?: ScreenShareDiagnosticInput | null;
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
  screenShare,
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
  const numOrNull = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.round(value * 100) / 100
      : null;
  const ridOrNull = (value: unknown) =>
    value === 'f' || value === 'h' || value === 'q' ? value : null;
  const ridList = (values: readonly unknown[] | undefined) =>
    Array.isArray(values)
      ? values.map(ridOrNull).filter((v): v is 'f' | 'h' | 'q' => v !== null)
      : [];
  const rawStreams = Array.isArray(telemetry?.streams) ? telemetry.streams : [];
  const rawFreezes = Array.isArray(telemetry?.freezes) ? telemetry.freezes : [];

  const screenSection = (() => {
    if (!screenShare || typeof screenShare !== 'object') return undefined;
    const localTrackId =
      typeof screenShare.localTrackId === 'string' && screenShare.localTrackId
        ? screenShare.localTrackId
        : null;
    const subsByPcKey = new Map<string, ScreenShareSubscriptionInput>();
    const subs = Array.isArray(screenShare.subscriptions) ? screenShare.subscriptions : [];
    for (const sub of subs) {
      if (sub && typeof sub.pcKey === 'string' && sub.pcKey) subsByPcKey.set(sub.pcKey, sub);
    }
    const isScreenKey = (pcKey: unknown) =>
      typeof pcKey === 'string' &&
      (pcKey === 'sfu-pub:screen' ||
        pcKey === 'sfu:screen' ||
        pcKey.endsWith(':screen') ||
        subsByPcKey.has(pcKey));
    const isScreenOutbound = (item: Record<string, unknown>) =>
      item.direction === 'outbound' &&
      (isScreenKey(item.pcKey) || (localTrackId !== null && item.trackId === localTrackId));
    const isScreenInbound = (item: Record<string, unknown>) =>
      item.direction === 'inbound' && isScreenKey(item.pcKey);

    const cfg =
      screenShare.config && typeof screenShare.config === 'object' ? screenShare.config : null;
    const cap =
      screenShare.capture && typeof screenShare.capture === 'object' ? screenShare.capture : null;

    const sanitizeDurations = (value: unknown) => {
      if (!value || typeof value !== 'object') return null;
      const d = value as Record<string, unknown>;
      return {
        none: numOrNull(d.none) ?? 0,
        cpu: numOrNull(d.cpu) ?? 0,
        bandwidth: numOrNull(d.bandwidth) ?? 0,
        other: numOrNull(d.other) ?? 0,
      };
    };

    const outbound = rawStreams
      .slice(0, 24)
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && isScreenOutbound(item as Record<string, unknown>),
      )
      .map((item) => {
        const width = numOrNull(item.width) ?? 0;
        const height = numOrNull(item.height) ?? 0;
        return {
          rid: ridOrNull(item.rid),
          active: typeof item.active === 'boolean' ? item.active : null,
          codec: typeof item.codec === 'string' && item.codec ? safe(item.codec) : null,
          codecProfile:
            typeof item.codecProfile === 'string' && item.codecProfile
              ? safe(item.codecProfile)
              : null,
          implementation:
            typeof item.implementation === 'string' && item.implementation
              ? safe(item.implementation)
              : null,
          hardwareAccelerated:
            typeof item.hardwareAccelerated === 'boolean' ? item.hardwareAccelerated : null,
          scalabilityMode:
            typeof item.scalabilityMode === 'string' && item.scalabilityMode
              ? safe(item.scalabilityMode)
              : null,
          width,
          height,
          evenDimensions: width > 0 && height > 0 ? width % 2 === 0 && height % 2 === 0 : null,
          fps: numOrNull(item.fps),
          bitrateBps: numOrNull(item.bitrateBps),
          targetBitrateBps: numOrNull(item.targetBitrateBps),
          encodeMs: numOrNull(item.encodeMs),
          sendDelayMs: numOrNull(item.sendDelayMs),
          avgQp: numOrNull(item.avgQp),
          limiter: typeof item.limiter === 'string' && item.limiter ? safe(item.limiter) : null,
          resolutionChanges: numOrNull(item.resolutionChanges),
          limitationDurationsMs: sanitizeDurations(item.limitationDurationsMs),
          framesEncoded: numOrNull(item.framesEncoded),
          framesSent: numOrNull(item.framesSent),
          packetsSent: numOrNull(item.packetsDelta),
          retransmittedPackets: numOrNull(item.retransmittedPackets),
          nackCount: numOrNull(item.nackCount),
          pliCount: numOrNull(item.pliCount),
          firCount: numOrNull(item.firCount),
          keyFrames: numOrNull(item.keyFrames),
          stalled: !!item.stalled,
          stallMs: numOrNull(item.stallMs) ?? 0,
          cause: typeof item.cause === 'string' && item.cause ? safe(item.cause) : null,
        };
      });

    const inbound = rawStreams
      .slice(0, 24)
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && isScreenInbound(item as Record<string, unknown>),
      )
      .map((item, idx) => {
        const subMeta = typeof item.pcKey === 'string' ? subsByPcKey.get(item.pcKey) : undefined;
        return {
          viewerIndex: idx + 1,
          requestedRid: ridOrNull(subMeta?.requestedRid),
          negotiatedRid: ridOrNull(subMeta?.negotiatedRid),
          availableRids: ridList(subMeta?.availableRids),
          codec: typeof item.codec === 'string' && item.codec ? safe(item.codec) : null,
          codecProfile:
            typeof item.codecProfile === 'string' && item.codecProfile
              ? safe(item.codecProfile)
              : null,
          implementation:
            typeof item.implementation === 'string' && item.implementation
              ? safe(item.implementation)
              : null,
          hardwareAccelerated:
            typeof item.hardwareAccelerated === 'boolean' ? item.hardwareAccelerated : null,
          width: numOrNull(item.width) ?? 0,
          height: numOrNull(item.height) ?? 0,
          fps: numOrNull(item.fps),
          bitrateBps: numOrNull(item.bitrateBps),
          decodeMs: numOrNull(item.decodeMs),
          bufferMs: numOrNull(item.bufferMs),
          minBufferMs: numOrNull(item.minBufferMs),
          jitterMs: numOrNull(item.jitterMs),
          lossPct: numOrNull(item.lossPct),
          avgQp: numOrNull(item.avgQp),
          framesReceived: numOrNull(item.framesReceived),
          framesDecoded: numOrNull(item.framesDecoded),
          droppedFrames: numOrNull(item.droppedFrames),
          freezeCount: numOrNull(item.freezeCount),
          freezeMs: numOrNull(item.freezeMs),
          pauseCount: numOrNull(item.pauseCount),
          pauseMs: numOrNull(item.pauseMs),
          packetsReceived: numOrNull(item.packetsDelta),
          packetsLost: numOrNull(item.packetsLost),
          nackCount: numOrNull(item.nackCount),
          pliCount: numOrNull(item.pliCount),
          firCount: numOrNull(item.firCount),
          keyFrames: numOrNull(item.keyFrames),
          stalled: !!item.stalled,
          stallMs: numOrNull(item.stallMs) ?? 0,
          cause: typeof item.cause === 'string' && item.cause ? safe(item.cause) : null,
        };
      });

    const screenFreezes = rawFreezes
      .slice(-16)
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === 'object' &&
          ['inbound', 'outbound'].includes(String((item as Record<string, unknown>).direction)) &&
          (isScreenKey((item as Record<string, unknown>).pcKey) ||
            (localTrackId !== null && (item as Record<string, unknown>).trackId === localTrackId)),
      )
      .map((item) => ({
        direction: item.direction,
        rid: ridOrNull(item.rid),
        durationMs: numOrNull(item.durationMs) ?? 0,
        recovered: !!item.recovered,
        cause: typeof item.cause === 'string' && item.cause ? safe(item.cause) : null,
      }));

    return {
      config: cfg
        ? {
            format: typeof cfg.format === 'string' && cfg.format ? safe(cfg.format) : null,
            targetWidth: numOrNull(cfg.targetWidth),
            targetHeight: numOrNull(cfg.targetHeight),
            targetFps: numOrNull(cfg.targetFps),
            targetBitrateBps: numOrNull(cfg.targetBitrateBps),
            contentHint:
              cfg.contentHint === 'motion' || cfg.contentHint === 'detail' ? cfg.contentHint : null,
            requestedCodec:
              typeof cfg.requestedCodec === 'string' && cfg.requestedCodec
                ? safe(cfg.requestedCodec)
                : null,
            autoDetectedCodec:
              typeof cfg.autoDetectedCodec === 'string' && cfg.autoDetectedCodec
                ? safe(cfg.autoDetectedCodec)
                : null,
            autoHardwareConfirmed:
              typeof cfg.autoHardwareConfirmed === 'boolean' ? cfg.autoHardwareConfirmed : null,
            adaptiveEnabled: typeof cfg.adaptiveEnabled === 'boolean' ? cfg.adaptiveEnabled : null,
            adaptationLevel: numOrNull(cfg.adaptationLevel),
            adaptationReason:
              typeof cfg.adaptationReason === 'string' && cfg.adaptationReason
                ? safe(cfg.adaptationReason)
                : null,
            mobileViewer: typeof cfg.mobileViewer === 'boolean' ? cfg.mobileViewer : null,
          }
        : null,
      bwe: {
        availableOutgoingBps: numOrNull(telemetry?.availableOutgoingBitrate),
        retransmittedPct: numOrNull(telemetry?.retransmittedPct),
      },
      capture: cap
        ? {
            width: numOrNull(cap.width),
            height: numOrNull(cap.height),
            fps: numOrNull(cap.fps),
            displaySurface: ['monitor', 'window', 'browser', 'application'].includes(
              String(cap.displaySurface),
            )
              ? String(cap.displaySurface)
              : null,
            contentHint:
              cap.contentHint === 'motion' || cap.contentHint === 'detail' ? cap.contentHint : null,
            degradationPreference: [
              'balanced',
              'maintain-framerate',
              'maintain-resolution',
            ].includes(String(cap.degradationPreference))
              ? String(cap.degradationPreference)
              : null,
            publishedRids: ridList(cap.publishedRids),
            encodings: (Array.isArray(cap.encodings) ? cap.encodings : []).slice(0, 6).map((e) => ({
              rid: ridOrNull(e?.rid),
              active: typeof e?.active === 'boolean' ? e.active : null,
              scaleResolutionDownBy: numOrNull(e?.scaleResolutionDownBy),
              maxBitrate: numOrNull(e?.maxBitrate),
              maxFramerate: numOrNull(e?.maxFramerate),
              scalabilityMode:
                typeof e?.scalabilityMode === 'string' && e.scalabilityMode
                  ? safe(e.scalabilityMode)
                  : null,
            })),
          }
        : null,
      outbound,
      inbound,
      freezes: screenFreezes,
    };
  })();

  const payload: Record<string, unknown> = {
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
    video: (Array.isArray(telemetry?.video) ? telemetry.video : [])
      .slice(0, 24)
      .filter(
        (item) =>
          item && typeof item === 'object' && ['inbound', 'outbound'].includes(item.direction),
      )
      .map((item) => {
        const row: Record<string, unknown> = { direction: item.direction };
        for (const key of [
          'fps',
          'width',
          'height',
          'freezeCount',
          'freezeMs',
          'droppedFrames',
          'decodeMs',
          'encodeMs',
          'sendDelayMs',
          'bufferMs',
          'minBufferMs',
          'framesEncoded',
          'framesSent',
          'framesReceived',
          'framesDecoded',
          'packetsSent',
          'packetsReceived',
          'packetsLost',
          'retransmittedPackets',
          'nackCount',
          'pliCount',
          'firCount',
          'keyFrames',
        ]) {
          const value = item[key];
          row[key] =
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? Math.round(value * 100) / 100
              : null;
        }
        if (typeof item.freezeCause === 'string' && item.freezeCause)
          row.freezeCause = safe(item.freezeCause);
        return row;
      }),
    streams: rawStreams
      .slice(0, 24)
      .filter(
        (item) =>
          item && typeof item === 'object' && ['inbound', 'outbound'].includes(item.direction),
      )
      .map((item) => {
        const row: Record<string, unknown> = {
          direction: item.direction,
          codec: typeof item.codec === 'string' && item.codec ? safe(item.codec) : null,
          implementation:
            typeof item.implementation === 'string' && item.implementation
              ? safe(item.implementation)
              : null,
          hardwareAccelerated:
            typeof item.hardwareAccelerated === 'boolean' ? item.hardwareAccelerated : null,
          stalled: !!item.stalled,
          stallMs:
            typeof item.stallMs === 'number' && Number.isFinite(item.stallMs)
              ? Math.round(Math.max(0, item.stallMs))
              : 0,
          cause: typeof item.cause === 'string' && item.cause ? safe(item.cause) : null,
        };
        for (const key of [
          'width',
          'height',
          'fps',
          'bitrateBps',
          'encodeMs',
          'decodeMs',
          'sendDelayMs',
          'retransmittedPackets',
          'nackCount',
          'pliCount',
          'keyFrames',
          'freezeCount',
        ] as const) {
          const value = item[key];
          row[key] =
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? Math.round(value * 100) / 100
              : null;
        }
        return row;
      }),
    freezes: rawFreezes
      .slice(-16)
      .filter(
        (item) =>
          item && typeof item === 'object' && ['inbound', 'outbound'].includes(item.direction),
      )
      .map((item) => ({
        direction: item.direction,
        durationMs:
          typeof item.durationMs === 'number' && Number.isFinite(item.durationMs)
            ? Math.round(Math.max(0, item.durationMs))
            : 0,
        recovered: !!item.recovered,
        cause: typeof item.cause === 'string' && item.cause ? safe(item.cause) : null,
      })),
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
            for (const k of ['agoMs', 'lossPct', 'jitterMs', 'concealedPct', 'localLagMs'] as const)
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
  };
  if (screenSection) payload.screenShare = screenSection;
  return JSON.stringify(payload, null, 2);
}
