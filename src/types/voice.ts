export type MicrophoneMode = 'gain-only' | 'rnnoise' | 'light' | 'native' | 'unavailable';

export interface MicrophoneProcessor {
  readonly ctx: AudioContext;
  readonly track: MediaStreamTrack | undefined;
  mode: MicrophoneMode;
  nativeSuppression?: boolean;
  setGain(percent: number): void;
  stop(): void;
}
export interface MicrophoneCapture {
  readonly rawStream: MediaStream;
  readonly processor: MicrophoneProcessor | null;
  readonly outgoingTrack: MediaStreamTrack;
}
export interface MicrophoneSnapshot {
  readonly capture: MicrophoneCapture | null;
  readonly loading: boolean;
}
export interface MicrophoneSettings {
  readonly generation: number;
  readonly enabled: boolean;
  readonly nativeOnly: boolean;
  readonly deviceId: string;
  readonly gain: number;
  readonly muted: boolean;
}
export interface NoiseFilter {
  readonly input?: AudioNode;
  readonly node: AudioNode;
  destroy(): void;
}
