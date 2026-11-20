export type NoiseEngine = 'native' | 'rnnoise' | 'off';
export interface VoiceControlsSnapshot {
  readonly micMuted: boolean;
  readonly serverMuted: boolean;
  readonly mediaBlocked: boolean;
  readonly deafened: boolean;
  readonly microphoneVolume: number;
  readonly noiseSuppression: boolean;
  readonly noiseEngine: NoiseEngine;
  readonly voiceLightMode: boolean;
  readonly selectedInput: string;
  readonly selectedCamera: string;
  readonly cameraTogglePending: boolean;
}
export type VoiceControlChange = 'mute' | 'processing' | 'gain' | 'camera' | 'device';
export interface VoiceNoiseState {
  readonly requested: boolean;
  readonly mode: NoiseEngine | 'idle' | 'loading' | 'paused' | 'unavailable';
  readonly nativeSuppression: boolean;
  readonly sampleRate: number | null;
}
