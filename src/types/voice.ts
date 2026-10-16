export type MicrophoneMode = 'gain-only' | 'rnnoise' | 'native' | 'unavailable';

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

export interface ScreenFormat {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}
export interface ScreenCaptureSettings {
  readonly generation: number;
  readonly joined: boolean;
  readonly format: ScreenFormat;
  readonly replay: ScreenFormat | null | undefined;
  readonly audio: boolean;
  readonly contentHint: 'motion' | 'detail';
}
export interface ScreenCapture {
  readonly source: MediaStream;
  readonly outgoing: MediaStream;
}
