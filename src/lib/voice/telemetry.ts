import type { VoicePeerConnection } from '../../types/voice';
import type {
  MediaStat,
  MediaTelemetry,
  PlayoutMetrics,
  ReceptionHistory,
  ReceptionRow,
  VoicePriority,
  VoiceResources,
} from '../../types/voice-diagnostics';
import { VoiceReception, assessment } from './reception-policy.ts';

interface Settings {
  joined: boolean;
  transport: string;
  detailsOpen: boolean;
  foreground: boolean;
  visible: boolean;
  desktop: boolean;
}
interface Options {
  protection: boolean;
  getSettings(): Settings;
  getConnections(): readonly (readonly [string, VoicePeerConnection])[];
  getLocalVideo(): MediaStreamTrack | undefined;
  getResources?: () => Promise<unknown>;
  setVoiceProtection?: (active: boolean) => Promise<unknown>;
  onSample(telemetry: MediaTelemetry, isCurrent: () => boolean): Promise<void>;
  onChange(): void;
  now?: () => number;
  warn?: (error: unknown) => void;
}
interface PeerCounters {
  rates: Map<string, { bytes: number; stamp: number }>;
  losses: Map<string, { received: number; lost: number }>;
  audio: Map<string, { concealed: number; samples: number; delay: number; emitted: number }>;
  playout: Map<string, { events: number; duration: number }>;
}
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
function parsePriority(value: unknown): VoicePriority | null {
  const item = record(value);
  if (
    !item ||
    typeof item.active !== 'boolean' ||
    typeof item.status !== 'string' ||
    !['managed', 'system', 'waiting', 'idle', 'unavailable'].includes(item.status)
  )
    return null;
  return Object.freeze({ active: item.active, status: item.status as VoicePriority['status'] });
}
function parseResources(value: unknown): VoiceResources | null {
  const item = record(value);
  if (
    !item ||
    !['appCpuPercent', 'appMemoryMB', 'freeMemoryMB'].every(
      (key) => typeof item[key] === 'number' && Number.isFinite(item[key]),
    )
  )
    return null;
  return Object.freeze({
    appCpuPercent: number(item.appCpuPercent),
    appMemoryMB: number(item.appMemoryMB),
    freeMemoryMB: number(item.freeMemoryMB),
  });
}

/** Owns diagnostic sampling, native receive targets, priority requests and baselines.
 * Connections/receivers/tracks are borrowed. Sampling never reconnects or processes media.
 * reset invalidates in-flight reads without waiting for getStats or desktop IPC.
 */
export function createVoiceTelemetry(options: Options) {
  const reception = new VoiceReception(options.protection);
  const owners = new Map<RTCRtpReceiver, string>();
  const counters = new Map<VoicePeerConnection, PeerCounters>();
  const now = options.now ?? (() => performance.now());
  const warn = options.warn ?? ((error: unknown) => console.warn('[VoiceTelemetry]', error));
  let enabled = options.protection,
    generation = 0,
    schedule = 0,
    started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let collecting: { generation: number; promise: Promise<void> } | undefined;
  let priorityRevision = 0,
    priorityQueue = Promise.resolve();
  let priority: VoicePriority | null = null,
    resources: VoiceResources | null = null;
  let telemetry: Readonly<MediaTelemetry> | null = null,
    lagMs = 0;
  let rows: readonly ReceptionRow[] = Object.freeze([]);
  let rowOwners: readonly (string | undefined)[] = Object.freeze([]);
  let playout: Readonly<PlayoutMetrics> | null = null;
  const history: ReceptionHistory[] = [];

  function refreshRows() {
    rows = Object.freeze(reception.snapshot().map((row) => Object.freeze(row)));
    rowOwners = Object.freeze(
      reception.measuredReceivers().map((receiver) => owners.get(receiver)),
    );
  }
  function registerReceiver(id: string, receiver: RTCRtpReceiver) {
    if (!options.getSettings().joined || receiver.track?.kind !== 'audio') return;
    owners.set(receiver, id);
    reception.add(receiver);
  }
  function removeReceiver(receiver: RTCRtpReceiver) {
    owners.delete(receiver);
    reception.remove(receiver);
    refreshRows();
  }
  function requestPriority(active: boolean): Promise<void> {
    const revision = ++priorityRevision,
      call = generation;
    const run = async () => {
      if (revision !== priorityRevision || !options.setVoiceProtection) return;
      let result: VoicePriority | null;
      try {
        result = parsePriority(await options.setVoiceProtection(active));
      } catch {
        result = Object.freeze({ active: false, status: 'unavailable' });
      }
      if (call !== generation || revision !== priorityRevision) return;
      priority = result ?? Object.freeze({ active: false, status: 'unavailable' });
      options.onChange();
    };
    // Serialize native side effects as well as guarding their returned state.
    priorityQueue = priorityQueue.then(run, run);
    return priorityQueue;
  }
  function syncPriority() {
    return requestPriority(options.getSettings().joined && enabled);
  }
  function peerCurrent(key: string, pc: VoicePeerConnection) {
    return (
      options.getSettings().joined &&
      pc.connectionState !== 'closed' &&
      options.getConnections().some(([id, candidate]) => id === key && candidate === pc)
    );
  }
  function stateFor(pc: VoicePeerConnection) {
    let state = counters.get(pc);
    if (!state) {
      state = { rates: new Map(), losses: new Map(), audio: new Map(), playout: new Map() };
      counters.set(pc, state);
    }
    return state;
  }
  function rate(state: PeerCounters, key: string, bytes: number | undefined, stamp: number) {
    const previous = state.rates.get(key),
      count = number(bytes);
    if (previous && stamp <= previous.stamp) return 0;
    state.rates.set(key, { bytes: count, stamp });
    if (!previous || count < previous.bytes) return 0;
    return ((count - previous.bytes) * 8000) / Math.max(1, stamp - previous.stamp);
  }
  function loss(state: PeerCounters, key: string, stat: MediaStat) {
    const previous = state.losses.get(key),
      next = { received: number(stat.packetsReceived), lost: number(stat.packetsLost) };
    state.losses.set(key, next);
    if (!previous || next.received < previous.received || next.lost < previous.lost)
      return { lost: 0, total: 0 };
    const received = next.received - previous.received,
      lost = next.lost - previous.lost;
    return { lost, total: received + lost };
  }
  function voiceReceiver(pcKey: string, pc: VoicePeerConnection, stat: MediaStat) {
    if (pcKey.endsWith(':screen-audio')) return null;
    const screen = pc._tronoScreenAudioTransceiver;
    if (
      (screen?.mid != null && String(stat.mid) === String(screen.mid)) ||
      (stat.trackIdentifier && stat.trackIdentifier === screen?.receiver.track.id)
    )
      return null;
    const candidates = pc
      .getTransceivers()
      .filter(
        (tr) => tr !== screen && tr.receiver.track.kind === 'audio' && reception.has(tr.receiver),
      );
    return (
      (
        candidates.find(
          (tr) => stat.trackIdentifier && tr.receiver.track.id === stat.trackIdentifier,
        ) ||
        candidates.find((tr) => stat.mid != null && String(tr.mid) === String(stat.mid)) ||
        (candidates.length === 1 ? candidates[0] : null)
      )?.receiver ?? null
    );
  }
  async function read(call: number) {
    const current = () => call === generation;
    const settings = options.getSettings(),
      priorityVersion = priorityRevision;
    if (settings.detailsOpen && settings.foreground && options.getResources) {
      try {
        const result = await options.getResources();
        if (!current()) return;
        resources = parseResources(result);
        if (priorityVersion === priorityRevision)
          priority = parsePriority(record(result)?.voicePriority) ?? priority;
      } catch {}
    }
    if (!current()) return;
    const pcs = options.getConnections();
    if (!options.getSettings().joined || !pcs.length) {
      reception.clear();
      owners.clear();
      counters.clear();
      refreshRows();
      playout = null;
      telemetry = null;
      options.onChange();
      return;
    }
    const sampledReceivers = new Set<RTCRtpReceiver>();
    let reportsAvailable = false;
    let gapEvents = 0,
      gapMs = 0,
      playoutAvailable = false;
    let audioLost = 0,
      audioTotal = 0,
      audioJitterMs = 0,
      concealed = 0,
      samples = 0,
      jitterDelay = 0,
      jitterEmitted = 0;
    let uploadBps = 0,
      downloadBps = 0,
      rttSum = 0,
      rttCount = 0,
      jitterSum = 0,
      jitterCount = 0,
      lossLost = 0,
      lossTotal = 0,
      outFps = 0,
      inFps = 0,
      outW = 0,
      outH = 0,
      inW = 0,
      inH = 0,
      iceRoute = '',
      pcState = '';
    const limiters: string[] = [];
    for (const [pcKey, pc] of pcs) {
      if (!current()) return;
      if (!peerCurrent(pcKey, pc)) continue;
      const state = stateFor(pc),
        playoutSeen = new Set<string>(),
        seen = new Set<string>();
      if (pc.connectionState && pc.connectionState !== 'new') pcState = pc.connectionState;
      let report: ReadonlyMap<string, MediaStat>;
      try {
        report = await pc.getStats();
      } catch {
        if (!current()) return;
        if (peerCurrent(pcKey, pc))
          for (const receiver of pc.getReceivers()) reception.invalidateSample(receiver);
        continue;
      }
      if (!current()) return;
      if (!peerCurrent(pcKey, pc)) continue;
      reportsAvailable ||= report.size > 0;
      const voicePlayoutIds = new Set<string>();
      report.forEach((stat) => {
        const kind = stat.kind || stat.mediaType || '',
          ts = number(stat.timestamp) || now(),
          key = stat.id;
        seen.add(key);
        if (stat.type === 'outbound-rtp' && !stat.isRemote) {
          uploadBps += rate(state, `tx:${key}`, stat.bytesSent, ts);
          if (kind === 'video') {
            if (Number(stat.framesPerSecond) > outFps) outFps = Number(stat.framesPerSecond) || 0;
            if ((Number(stat.frameWidth) || 0) * (Number(stat.frameHeight) || 0) > outW * outH) {
              outW = Number(stat.frameWidth) || 0;
              outH = Number(stat.frameHeight) || 0;
            }
            if (stat.qualityLimitationReason && stat.qualityLimitationReason !== 'none')
              limiters.push(stat.qualityLimitationReason);
          }
        }
        if (stat.type === 'inbound-rtp' && !stat.isRemote) {
          downloadBps += rate(state, `rx:${key}`, stat.bytesReceived, ts);
          const packetLoss = loss(state, key, stat);
          lossLost += packetLoss.lost;
          lossTotal += packetLoss.total;
          const receiver = kind === 'audio' ? voiceReceiver(pcKey, pc, stat) : null;
          if (receiver) {
            if (stat.playoutId) voicePlayoutIds.add(stat.playoutId);
            if (!sampledReceivers.has(receiver)) {
              sampledReceivers.add(receiver);
              reception.sample(receiver, stat, ts);
            }
            audioLost += packetLoss.lost;
            audioTotal += packetLoss.total;
            audioJitterMs = Math.max(audioJitterMs, (Number(stat.jitter) || 0) * 1000);
            const prior = state.audio.get(key);
            if (prior) {
              concealed += Math.max(0, (stat.concealedSamples || 0) - prior.concealed);
              samples += Math.max(0, (stat.totalSamplesReceived || 0) - prior.samples);
              jitterDelay += Math.max(0, (stat.jitterBufferDelay || 0) - prior.delay);
              jitterEmitted += Math.max(0, (stat.jitterBufferEmittedCount || 0) - prior.emitted);
            }
            state.audio.set(key, {
              concealed: stat.concealedSamples || 0,
              samples: stat.totalSamplesReceived || 0,
              delay: stat.jitterBufferDelay || 0,
              emitted: stat.jitterBufferEmittedCount || 0,
            });
          }
          if (Number.isFinite(stat.jitter)) {
            jitterSum += number(stat.jitter) * 1000;
            jitterCount++;
          }
          if (kind === 'video') {
            if (Number(stat.framesPerSecond) > inFps) inFps = Number(stat.framesPerSecond) || 0;
            if ((Number(stat.frameWidth) || 0) * (Number(stat.frameHeight) || 0) > inW * inH) {
              inW = Number(stat.frameWidth) || 0;
              inH = Number(stat.frameHeight) || 0;
            }
          }
        }
        if (
          stat.type === 'candidate-pair' &&
          stat.state === 'succeeded' &&
          (stat.nominated || stat.selected)
        ) {
          if (Number.isFinite(stat.currentRoundTripTime)) {
            rttSum += number(stat.currentRoundTripTime) * 1000;
            rttCount++;
          }
          const lc = stat.localCandidateId ? report.get(stat.localCandidateId) : undefined;
          if (lc?.candidateType)
            iceRoute =
              lc.candidateType === 'relay'
                ? 'TURN relay'
                : lc.candidateType === 'srflx'
                  ? 'STUN / srflx'
                  : lc.candidateType;
        }
        if (stat.type === 'remote-inbound-rtp' && Number.isFinite(stat.roundTripTime)) {
          rttSum += number(stat.roundTripTime) * 1000;
          rttCount++;
        }
      });
      for (const id of voicePlayoutIds) {
        const stat = report.get(id);
        if (
          stat?.type !== 'media-playout' ||
          !Number.isFinite(stat.synthesizedSamplesEvents) ||
          !Number.isFinite(stat.synthesizedSamplesDuration)
        )
          continue;
        const k = id,
          prev = state.playout.get(k);
        playoutSeen.add(k);
        playoutAvailable = true;
        if (prev) {
          gapEvents += Math.max(0, number(stat.synthesizedSamplesEvents) - prev.events);
          gapMs += Math.max(0, number(stat.synthesizedSamplesDuration) - prev.duration) * 1000;
        }
        state.playout.set(k, {
          events: number(stat.synthesizedSamplesEvents),
          duration: number(stat.synthesizedSamplesDuration),
        });
      }
      for (const key of state.playout.keys()) if (!playoutSeen.has(key)) state.playout.delete(key);
      for (const key of state.audio.keys()) if (!seen.has(key)) state.audio.delete(key);
      for (const key of state.losses.keys()) if (!seen.has(key)) state.losses.delete(key);
      for (const key of state.rates.keys()) if (!seen.has(key.slice(3))) state.rates.delete(key);
    }
    if (!current() || !options.getSettings().joined) return;
    const connections = options.getConnections(),
      currentPeers = new Set(connections.map(([, pc]) => pc));
    for (const pc of counters.keys()) if (!currentPeers.has(pc)) counters.delete(pc);
    reception.prune(new Set(connections.flatMap(([, pc]) => pc.getReceivers())));
    for (const receiver of owners.keys()) if (!reception.has(receiver)) owners.delete(receiver);
    refreshRows();
    playout = playoutAvailable ? Object.freeze({ gapEvents, gapMs }) : null;
    if (rows.length) {
      const highest = (k: 'lossPct' | 'jitterMs' | 'concealedPct') => {
        const v = rows
          .map((r) => r[k])
          .filter((value): value is number => value !== null && Number.isFinite(value));
        return v.length ? Math.max(...v) : null;
      };
      history.push(
        Object.freeze({
          stamp: now(),
          lossPct: highest('lossPct'),
          jitterMs: highest('jitterMs'),
          concealedPct: highest('concealedPct'),
          localLagMs: lagMs,
        }),
      );
      if (history.length > 12) history.shift();
    }
    if (!outFps) {
      const track = options.getLocalVideo(),
        settings = track?.getSettings?.() || {};
      outFps = Number(settings.frameRate) || 0;
      outW = outW || Number(settings.width) || 0;
      outH = outH || Number(settings.height) || 0;
    }
    const limiter = limiters.includes('cpu')
      ? 'cpu'
      : limiters.includes('bandwidth')
        ? 'bandwidth'
        : limiters[0] || 'none';
    telemetry = Object.freeze({
      audioLossPct: audioTotal ? (audioLost / audioTotal) * 100 : 0,
      audioJitterMs,
      concealedPct: samples ? Math.min(100, (concealed / samples) * 100) : 0,
      jitterBufferMs: jitterEmitted ? (jitterDelay / jitterEmitted) * 1000 : 0,
      eventLoopLagMs: lagMs,
      transport: options.getSettings().transport,
      rttMs: rttCount ? rttSum / rttCount : 0,
      uploadBps,
      downloadBps,
      outFps,
      inFps,
      outW,
      outH,
      inW,
      inH,
      lossPct: lossTotal ? (lossLost / lossTotal) * 100 : 0,
      jitterMs: jitterCount ? jitterSum / jitterCount : 0,
      limiter,
      iceRoute,
      pcState,
    });
    if (reportsAvailable) await options.onSample(telemetry, current);
    if (current()) options.onChange();
  }
  function collect(): Promise<void> {
    if (collecting?.generation === generation) return collecting.promise;
    const request = { generation, promise: Promise.resolve() };
    collecting = request;
    request.promise = read(generation).finally(() => {
      if (collecting === request) collecting = undefined;
    });
    return request.promise;
  }
  function stop() {
    started = false;
    schedule++;
    clearTimeout(timer);
    timer = undefined;
  }
  function start() {
    stop();
    started = true;
    const version = schedule;
    let expected = now();
    const tick = async () => {
      if (version !== schedule) return;
      const settings = options.getSettings(),
        visible = settings.visible || settings.desktop;
      lagMs = visible ? Math.min(60000, Math.max(0, now() - expected)) : 0;
      try {
        if (visible) await collect();
      } catch (error) {
        warn(error);
      }
      if (version !== schedule) return;
      const next = options.getSettings();
      const delay = next.joined ? (next.detailsOpen && next.foreground ? 2000 : 5000) : 15000;
      expected = now() + delay;
      timer = setTimeout(tick, delay);
    };
    void tick();
  }
  function reset() {
    generation++;
    priorityRevision++;
    collecting = undefined;
    reception.clear();
    owners.clear();
    counters.clear();
    refreshRows();
    history.length = 0;
    playout = null;
    telemetry = null;
    lagMs = 0;
    resources = null;
    void requestPriority(false);
    if (started) start();
  }
  return {
    registerReceiver,
    removeReceiver,
    syncPriority,
    collect,
    start,
    stop,
    reset,
    configureProtection(value: boolean) {
      enabled = value;
      reception.configure(value);
      refreshRows();
      void syncPriority();
    },
    getSnapshot() {
      return Object.freeze({
        telemetry,
        resources,
        lagMs,
        enabled,
        priority,
        rows,
        owners: rowOwners,
        playout,
        history: Object.freeze([...history]),
        assessment: Object.freeze(assessment(rows, lagMs, playout)),
      });
    },
  };
}
