import type { TransmissionQuality } from './realtime';
import type { ScreenFormat } from './voice';

export type ScreenFormatId = '720-15' | '1080-15' | '720-30' | '720-60' | '1080-30' | '1080-60';
export interface VideoProfile {
  readonly camera: ScreenFormat;
  readonly screen: ScreenFormat;
  readonly videoBitrate: number;
  readonly screenBitrate: number;
  readonly audioBitrate: number;
}
export interface QualityProfile extends VideoProfile {
  readonly label: string;
  readonly hint: string;
}
export interface QualityPreferences {
  readonly transmissionQuality: TransmissionQuality;
  readonly screenFormat: ScreenFormatId;
  readonly screenBitrateMbps: number;
  readonly screenContent: 'motion' | 'detail';
  readonly adaptiveEnabled: boolean;
}
export interface QualitySnapshot {
  readonly preferences: QualityPreferences;
  readonly effectiveQuality: TransmissionQuality;
  /** Budget-limited request; adaptive sender bitrate is in profile.screenBitrate. */
  readonly screenBitrate: number;
  readonly profile: QualityProfile;
  readonly adaptation: { readonly level: number; readonly reason: string };
}
