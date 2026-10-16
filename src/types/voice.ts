export type MicrophoneMode = 'gain-only' | 'rnnoise' | 'native' | 'unavailable';
export type VoiceMediaKind = 'audio' | 'camera' | 'screen' | 'screen-audio';
export type PeerSignal =
  | { readonly signalType: 'offer' | 'answer'; readonly data: RTCSessionDescriptionInit }
  | { readonly signalType: 'ice'; readonly data: RTCIceCandidateInit }
  | { readonly signalType: 'stream-watch'; readonly data: { readonly watching: boolean } }
  | { readonly signalType: 'renegotiate-request'; readonly data: { readonly iceRestart: boolean } };

/** Borrowed senders/transceivers for media publication and receiver diagnostics. */
export interface VoicePeerConnection extends RTCPeerConnection {
  _tronoAudioTransceiver?: RTCRtpTransceiver;
  _tronoVideoTransceiver?: RTCRtpTransceiver;
  _tronoScreenTransceiver?: RTCRtpTransceiver;
  _tronoScreenAudioTransceiver?: RTCRtpTransceiver;
  _tronoAudioSender?: RTCRtpSender;
  _tronoVideoSender?: RTCRtpSender;
  _tronoScreenSender?: RTCRtpSender;
  _tronoScreenAudioSender?: RTCRtpSender;
}

export interface MicrophoneProcessor {
  readonly ctx: AudioContext;
  readonly track: MediaStreamTrack | undefined;
  mode: MicrophoneMode;
  nativeSuppression?: boolean;
  rawAtUnity?: boolean;
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
export interface CameraSettings {
  readonly generation: number;
  readonly joined: boolean;
  readonly deviceId: string;
  readonly format: ScreenFormat;
}
export interface CameraCapture {
  readonly source: MediaStream;
  readonly track: MediaStreamTrack;
}
export interface CameraSnapshot {
  readonly capture: CameraCapture | null;
  readonly loading: boolean;
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
