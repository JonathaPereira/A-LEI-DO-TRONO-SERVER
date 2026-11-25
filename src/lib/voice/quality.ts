import type { TransmissionQuality } from '../../types/realtime';
import type { VoiceMediaKind } from '../../types/voice';
import type { VoiceCallSnapshot } from '../../types/voice-call';
import type { QualityPreferences, QualitySnapshot } from '../../types/voice-quality';
import type { MediaTelemetry } from '../../types/voice-diagnostics';
import type { SfuRid } from '../../types/sfu';
import {
  CallStability,
  QUALITY_ORDER,
  QUALITY_PROFILES,
  SCREEN_BITRATES,
  SCREEN_FORMATS,
  isQuality,
  isScreenCodec,
  isScreenFormat,
} from './quality-policy.ts';

interface QualityOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  policy(): { sfu: boolean; maxQuality?: TransmissionQuality; highAllowed?: boolean };
  call(): Pick<VoiceCallSnapshot, 'generation' | 'joined'>;
  refreshCamera(): Promise<void>;
  refreshScreenHint(): void;
  senders(): Iterable<{ sender: RTCRtpSender | null | undefined; kind: VoiceMediaKind }>;
  subscriptions(): Iterable<{ key: string; kind: VoiceMediaKind }>;
  setLayer(key: string, rid: SfuRid): Promise<void>;
  warn?(error: unknown): void;
}
const keys: Record<keyof QualityPreferences, string> = {
  transmissionQuality: 'tronoTransmissionQuality',
  screenFormat: 'mnScreenFormat',
  screenBitrateMbps: 'mnScreenBitrate',
  screenContent: 'mnScreenContent',
  screenCodec: 'mnScreenCodec',
  adaptiveEnabled: 'mnAdaptiveQuality',
};

/** Owns preferences, adaptation and serialized parameter updates; borrows all media. */
export function createCallQuality(options: QualityOptions) {
  const storage = options.storage,
    stability = new CallStability();
  const initialQuality = storage.getItem(keys.transmissionQuality),
    initialFormat = storage.getItem(keys.screenFormat),
    initialBitrate = Number(storage.getItem(keys.screenBitrateMbps)),
    initialCodec = storage.getItem(keys.screenCodec);
  let preferences: QualityPreferences = Object.freeze({
    transmissionQuality: isQuality(initialQuality) ? initialQuality : 'balanced',
    screenFormat: isScreenFormat(initialFormat) ? initialFormat : '1080-60',
    screenBitrateMbps: SCREEN_BITRATES.includes(initialBitrate) ? initialBitrate : 8,
    screenContent: storage.getItem(keys.screenContent) === 'detail' ? 'detail' : 'motion',
    screenCodec: isScreenCodec(initialCodec) ? initialCodec : 'auto',
    adaptiveEnabled: storage.getItem(keys.adaptiveEnabled) !== '0',
  });
  let revision = 0;
  const queues = new WeakMap<RTCRtpSender, Promise<void>>();
  const initializedScreenSenders = new WeakSet<RTCRtpSender>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallQuality]', error));
  let cached: QualitySnapshot | undefined, cachedPreferences: QualityPreferences | undefined;
  let cachedSfu: boolean | undefined,
    cachedMax: TransmissionQuality | undefined,
    cachedHigh: boolean | undefined;
  function getSnapshot(): QualitySnapshot {
    const policy = options.policy();
    if (
      cached &&
      cachedPreferences === preferences &&
      cachedSfu === policy.sfu &&
      cachedMax === policy.maxQuality &&
      cachedHigh === policy.highAllowed &&
      cached.adaptation.level === stability.level &&
      cached.adaptation.reason === stability.reason
    )
      return cached;
    cachedPreferences = preferences;
    cachedSfu = policy.sfu;
    cachedMax = policy.maxQuality;
    cachedHigh = policy.highAllowed;
    const effectiveQuality =
      policy.sfu &&
      isQuality(policy.maxQuality) &&
      QUALITY_ORDER.indexOf(preferences.transmissionQuality) >
        QUALITY_ORDER.indexOf(policy.maxQuality)
        ? policy.maxQuality
        : preferences.transmissionQuality;
    const sfuBudgetLimited = policy.sfu && policy.highAllowed === false;
    const screenBitrate =
      Math.min(preferences.screenBitrateMbps, sfuBudgetLimited ? 6 : 15) * 1000000;
    const rawScreen = SCREEN_FORMATS[preferences.screenFormat];
    const cappedScreen = sfuBudgetLimited
      ? {
          width: Math.min(rawScreen.width, 1280),
          height: Math.min(rawScreen.height, 720),
          fps: Math.min(rawScreen.fps, 30),
        }
      : rawScreen;
    const profile = stability.profile({
      ...QUALITY_PROFILES[effectiveQuality],
      screen: cappedScreen,
      screenBitrate,
    });
    cached = Object.freeze({
      preferences,
      effectiveQuality,
      screenBitrate,
      profile: Object.freeze({
        ...profile,
        camera: Object.freeze({ ...profile.camera }),
        screen: Object.freeze({ ...profile.screen }),
      }),
      adaptation: Object.freeze({ level: stability.level, reason: stability.reason }),
    });
    return cached;
  }
  function configure(patch: Partial<QualityPreferences>) {
    const next = { ...preferences };
    if (isQuality(patch.transmissionQuality)) next.transmissionQuality = patch.transmissionQuality;
    if (isScreenFormat(patch.screenFormat)) next.screenFormat = patch.screenFormat;
    if (
      typeof patch.screenBitrateMbps === 'number' &&
      SCREEN_BITRATES.includes(patch.screenBitrateMbps)
    )
      next.screenBitrateMbps = patch.screenBitrateMbps;
    if (patch.screenContent === 'motion' || patch.screenContent === 'detail')
      next.screenContent = patch.screenContent;
    if (isScreenCodec(patch.screenCodec)) next.screenCodec = patch.screenCodec;
    if (typeof patch.adaptiveEnabled === 'boolean') {
      next.adaptiveEnabled = patch.adaptiveEnabled;
      stability.reset();
    }
    for (const key of Object.keys(keys) as (keyof QualityPreferences)[]) {
      if (next[key] !== preferences[key])
        storage.setItem(
          keys[key],
          typeof next[key] === 'boolean' ? (next[key] ? '1' : '0') : String(next[key]),
        );
    }
    preferences = Object.freeze(next);
  }
  function selectQuality(value: unknown): boolean {
    const requested = isQuality(value) ? value : 'balanced',
      policy = options.policy();
    const limited =
      policy.sfu &&
      isQuality(policy.maxQuality) &&
      QUALITY_ORDER.indexOf(requested) > QUALITY_ORDER.indexOf(policy.maxQuality);
    configure({ transmissionQuality: limited ? policy.maxQuality : requested });
    return limited;
  }
  function preferredRid(kind: VoiceMediaKind, maximized = false): SfuRid {
    if (stability.level) return stability.level === 2 ? 'q' : 'h';
    if (maximized) return 'f';
    return kind === 'screen' && getSnapshot().effectiveQuality !== 'economy'
      ? 'f'
      : getSnapshot().effectiveQuality === 'economy'
        ? 'q'
        : 'f';
  }
  function applySender(
    sender: RTCRtpSender | null | undefined,
    kind: VoiceMediaKind,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    if (!sender) return Promise.resolve();
    const generation = options.call().generation,
      epoch = revision;
    const current = () =>
      epoch === revision && options.call().generation === generation && options.call().joined;
    const next = (queues.get(sender) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!current() || !sender.track || !sender.setParameters) return;
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings?.length) parameters.encodings = [{}];
          const q = getSnapshot().profile;
          if (kind === 'audio' || kind === 'screen-audio') {
            const targetBitrate = kind === 'screen-audio' ? 192000 : q.audioBitrate;
            if (!force && parameters.encodings[0].maxBitrate === targetBitrate) return;
            parameters.encodings[0].maxBitrate = targetBitrate;
          } else if (kind === 'screen') {
            const targetDegradation =
              preferences.screenContent === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
            sender.track.contentHint = preferences.screenContent;
            const source = sender.track.getSettings();
            const srcW = source.width || q.screen.width;
            const srcH = source.height || q.screen.height;
            const rawScale = Math.max(1, srcW / q.screen.width, srcH / q.screen.height);
            let scale = Math.abs(rawScale - 1) < 0.08 ? 1 : rawScale;
            const validEven = (s: number) => {
              if (!Number.isFinite(s) || s < 1) return false;
              const w = Math.floor(srcW / s);
              const h = Math.floor(srcH / s);
              return (
                w >= 2 &&
                h >= 2 &&
                w % 2 === 0 &&
                h % 2 === 0 &&
                (scale === 1 || (w <= q.screen.width && h <= q.screen.height))
              );
            };
            if (!validEven(scale)) {
              const startEvenW = Math.max(
                2,
                Math.min(q.screen.width, Math.floor(srcW / scale)) & ~1,
              );
              for (let evenW = startEvenW; evenW >= Math.max(2, startEvenW - 64); evenW -= 2) {
                for (const frac of [0.5, 0.2, 0.8]) {
                  const candidate = Math.max(1, srcW / (evenW + frac));
                  if (validEven(candidate)) {
                    scale = candidate;
                    break;
                  }
                }
                if (validEven(scale)) break;
              }
            }
            const byRid: Record<string, number> = {
              f: q.screenBitrate,
              h: Math.max(500000, Math.round(q.screenBitrate * 0.42)),
              q: Math.max(250000, Math.round(q.screenBitrate * 0.18)),
            };
            let changed =
              force ||
              !initializedScreenSenders.has(sender) ||
              parameters.degradationPreference !== targetDegradation;
            parameters.degradationPreference = targetDegradation;
            for (const e of parameters.encodings) {
              const nextScale = scale * (e.rid === 'h' ? 2 : e.rid === 'q' ? 4 : 1);
              const nextBitrate = (e.rid && byRid[e.rid]) || q.screenBitrate;
              const nextFps =
                e.rid === 'q'
                  ? Math.min(q.screen.fps, 20)
                  : e.rid === 'h'
                    ? Math.min(q.screen.fps, 30)
                    : q.screen.fps;
              if (
                e.scaleResolutionDownBy !== nextScale ||
                e.maxBitrate !== nextBitrate ||
                e.maxFramerate !== nextFps
              )
                changed = true;
              e.scaleResolutionDownBy = nextScale;
              e.maxBitrate = nextBitrate;
              e.maxFramerate = nextFps;
            }
            if (!changed) return;
          } else if (parameters.encodings.length >= 3 && parameters.encodings.some((e) => e.rid)) {
            const byRid: Record<string, number> = {
              f: q.videoBitrate,
              h: Math.max(180000, Math.round(q.videoBitrate * 0.42)),
              q: Math.max(90000, Math.round(q.videoBitrate * 0.16)),
            };
            let changed = false;
            for (const e of parameters.encodings) {
              const nextBitrate = (e.rid && byRid[e.rid]) || q.videoBitrate;
              const nextFps = q.camera.fps;
              if (e.maxBitrate !== nextBitrate || e.maxFramerate !== nextFps) changed = true;
              e.maxBitrate = nextBitrate;
              e.maxFramerate = nextFps;
            }
            if (!changed) return;
          } else {
            if (
              parameters.encodings[0].maxBitrate === q.videoBitrate &&
              parameters.encodings[0].maxFramerate === q.camera.fps
            )
              return;
            parameters.encodings[0].maxBitrate = q.videoBitrate;
            parameters.encodings[0].maxFramerate = q.camera.fps;
          }
          if (current()) {
            await sender.setParameters(parameters);
            if (kind === 'screen') initializedScreenSenders.add(sender);
          }
        } catch (error) {
          if (current()) warn(error);
        }
      });
    queues.set(sender, next);
    return next;
  }
  async function applyLayers() {
    if (!options.policy().sfu) return;
    await Promise.allSettled(
      [...options.subscriptions()]
        .filter((sub) => sub.kind === 'camera' || sub.kind === 'screen')
        .map((sub) => options.setLayer(sub.key, preferredRid(sub.kind))),
    );
  }
  async function applyAll() {
    const generation = options.call().generation,
      epoch = revision;
    const current = () =>
      epoch === revision && options.call().generation === generation && options.call().joined;
    if (!current()) return;
    try {
      await options.refreshCamera();
    } catch (error) {
      if (current()) warn(error);
    }
    if (!current()) return;
    try {
      options.refreshScreenHint();
    } catch (error) {
      warn(error);
    }
    await Promise.allSettled(
      [...options.senders()].map(({ sender, kind }) => applySender(sender, kind)),
    );
    if (current()) await applyLayers();
  }
  return {
    getSnapshot,
    configure,
    selectQuality,
    preferredRid,
    applySender,
    applyAll,
    applyLayers,
    sample: (telemetry: Partial<MediaTelemetry>, stamp: number) =>
      stability.sample(telemetry, stamp, preferences.adaptiveEnabled),
    reset() {
      revision++;
      stability.reset();
    },
  };
}
