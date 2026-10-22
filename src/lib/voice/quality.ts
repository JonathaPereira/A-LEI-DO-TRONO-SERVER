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
  adaptiveEnabled: 'mnAdaptiveQuality',
};

/** Owns preferences, adaptation and serialized parameter updates; borrows all media. */
export function createCallQuality(options: QualityOptions) {
  const storage = options.storage,
    stability = new CallStability();
  const initialQuality = storage.getItem(keys.transmissionQuality),
    initialFormat = storage.getItem(keys.screenFormat),
    initialBitrate = Number(storage.getItem(keys.screenBitrateMbps));
  let preferences: QualityPreferences = Object.freeze({
    transmissionQuality: isQuality(initialQuality) ? initialQuality : 'balanced',
    screenFormat: isScreenFormat(initialFormat) ? initialFormat : '720-30',
    screenBitrateMbps: SCREEN_BITRATES.includes(initialBitrate) ? initialBitrate : 8,
    screenContent: storage.getItem(keys.screenContent) === 'motion' ? 'motion' : 'detail',
    adaptiveEnabled: storage.getItem(keys.adaptiveEnabled) !== '0',
  });
  let revision = 0;
  const queues = new WeakMap<RTCRtpSender, Promise<void>>();
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
    const screenBitrate =
      Math.min(preferences.screenBitrateMbps, policy.sfu && policy.highAllowed === false ? 6 : 15) *
      1000000;
    const profile = stability.profile({
      ...QUALITY_PROFILES[effectiveQuality],
      screen: SCREEN_FORMATS[preferences.screenFormat],
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
          if (kind === 'audio' || kind === 'screen-audio')
            parameters.encodings[0].maxBitrate = kind === 'screen-audio' ? 192000 : q.audioBitrate;
          else if (kind === 'screen') {
            parameters.degradationPreference = 'maintain-resolution';
            sender.track.contentHint = preferences.screenContent;
            const source = sender.track.getSettings();
            const scale = Math.max(
              1,
              (source.width || q.screen.width) / q.screen.width,
              (source.height || q.screen.height) / q.screen.height,
            );
            const byRid: Record<string, number> = {
              f: q.screenBitrate,
              h: Math.max(500000, Math.round(q.screenBitrate * 0.42)),
              q: Math.max(250000, Math.round(q.screenBitrate * 0.18)),
            };
            for (const e of parameters.encodings) {
              e.scaleResolutionDownBy = scale * (e.rid === 'h' ? 2 : e.rid === 'q' ? 4 : 1);
              e.maxBitrate = (e.rid && byRid[e.rid]) || q.screenBitrate;
              e.maxFramerate =
                e.rid === 'q'
                  ? Math.min(q.screen.fps, 20)
                  : e.rid === 'h'
                    ? Math.min(q.screen.fps, 30)
                    : q.screen.fps;
            }
          } else if (parameters.encodings.length >= 3 && parameters.encodings.some((e) => e.rid)) {
            const byRid: Record<string, number> = {
              f: q.videoBitrate,
              h: Math.max(180000, Math.round(q.videoBitrate * 0.42)),
              q: Math.max(90000, Math.round(q.videoBitrate * 0.16)),
            };
            for (const e of parameters.encodings) {
              e.maxBitrate = (e.rid && byRid[e.rid]) || q.videoBitrate;
              e.maxFramerate = q.camera.fps;
            }
          } else {
            parameters.encodings[0].maxBitrate = q.videoBitrate;
            parameters.encodings[0].maxFramerate = q.camera.fps;
          }
          if (current()) await sender.setParameters(parameters);
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
