import type { MediaTelemetry } from '../../types/voice-diagnostics';
import type { QualityProfile, VideoProfile, ScreenFormatId } from '../../types/voice-quality';
import type { TransmissionQuality } from '../../types/realtime';

export const QUALITY_ORDER: readonly TransmissionQuality[] = Object.freeze([
  'economy',
  'balanced',
  'high',
]);
export const SCREEN_BITRATES: readonly number[] = Object.freeze([4, 6, 8, 10, 12, 15]);
export const SCREEN_FORMATS: Readonly<Record<ScreenFormatId, VideoProfile['screen']>> =
  Object.freeze({
    '720-15': Object.freeze({ width: 1280, height: 720, fps: 15 }),
    '1080-15': Object.freeze({ width: 1920, height: 1080, fps: 15 }),
    '720-30': Object.freeze({ width: 1280, height: 720, fps: 30 }),
    '720-60': Object.freeze({ width: 1280, height: 720, fps: 60 }),
    '1080-30': Object.freeze({ width: 1920, height: 1080, fps: 30 }),
    '1080-60': Object.freeze({ width: 1920, height: 1080, fps: 60 }),
  });
const format = Object.freeze({ width: 1280, height: 720, fps: 30 });
export const QUALITY_PROFILES: Readonly<Record<TransmissionQuality, QualityProfile>> =
  Object.freeze({
    economy: Object.freeze({
      label: 'Economia',
      camera: format,
      screen: format,
      videoBitrate: 900000,
      screenBitrate: 4000000,
      audioBitrate: 64000,
      hint: '720p/30 FPS.',
    }),
    balanced: Object.freeze({
      label: 'Equilibrada',
      camera: format,
      screen: format,
      videoBitrate: 2200000,
      screenBitrate: 8000000,
      audioBitrate: 96000,
      hint: '720p/30 FPS.',
    }),
    high: Object.freeze({
      label: 'Alta',
      camera: format,
      screen: format,
      videoBitrate: 3500000,
      screenBitrate: 10000000,
      audioBitrate: 128000,
      hint: '720p/30 FPS.',
    }),
  });
export const isQuality = (value: unknown): value is TransmissionQuality =>
  typeof value === 'string' && QUALITY_ORDER.includes(value as TransmissionQuality);
export const isScreenFormat = (value: unknown): value is ScreenFormatId =>
  typeof value === 'string' && Object.hasOwn(SCREEN_FORMATS, value);

/** Sustained trouble lowers video only; user preferences and audio are untouched. */
export class CallStability {
  private currentLevel = 0;
  private currentReason = '';
  private badSince: number | null = null;
  private goodSince: number | null = null;
  private changedAt = -Infinity;
  get level() {
    return this.currentLevel;
  }
  get reason() {
    return this.currentReason;
  }
  reset() {
    this.currentLevel = 0;
    this.currentReason = '';
    this.badSince = null;
    this.goodSince = null;
    this.changedAt = -Infinity;
  }
  sample(t: Partial<MediaTelemetry>, stamp: number, enabled = true): boolean {
    if (!enabled) {
      const changed = this.level !== 0;
      this.reset();
      return changed;
    }
    const cpu = t.limiter === 'cpu' || (t.eventLoopLagMs ?? 0) >= 180;
    const network =
      (t.audioLossPct ?? 0) >= 5 ||
      (t.audioJitterMs ?? 0) >= 70 ||
      (t.rttMs ?? 0) >= 350 ||
      t.limiter === 'bandwidth';
    if (cpu || network) {
      this.goodSince = null;
      if (this.badSince === null) this.badSince = stamp;
      this.currentReason = cpu ? 'sobrecarga local' : 'instabilidade de rede';
      if (stamp - this.badSince >= 12000 && stamp - this.changedAt >= 20000 && this.level < 2) {
        this.currentLevel++;
        this.changedAt = stamp;
        this.badSince = stamp;
        return true;
      }
    } else {
      this.badSince = null;
      if (this.goodSince === null) this.goodSince = stamp;
      if (this.level && stamp - this.goodSince >= 60000 && stamp - this.changedAt >= 20000) {
        this.currentLevel--;
        this.changedAt = stamp;
        this.goodSince = stamp;
        if (!this.level) this.currentReason = '';
        return true;
      }
    }
    return false;
  }
  profile<T extends VideoProfile>(base: T): T {
    if (!this.level) return base;
    const severe = this.level === 2;
    return {
      ...base,
      camera: { width: severe ? 640 : 960, height: severe ? 360 : 540, fps: severe ? 15 : 24 },
      screen: {
        width: Math.min(base.screen.width, 1280),
        height: Math.min(base.screen.height, 720),
        fps: Math.min(base.screen.fps, severe ? 15 : 30),
      },
      videoBitrate: Math.min(base.videoBitrate, severe ? 450000 : 1000000),
      screenBitrate: Math.min(base.screenBitrate, severe ? 2500000 : 4000000),
    };
  }
}
