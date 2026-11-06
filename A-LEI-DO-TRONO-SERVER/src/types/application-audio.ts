export interface ApplicationAudioInfo {
  readonly id: string;
  readonly sampleRate: number;
  readonly channels: 2;
}
export interface ApplicationAudioPipe {
  readonly track: MediaStreamTrack;
  close(): Promise<void>;
}
export interface ApplicationAudioNative {
  onApplicationAudio(listener: (value: unknown) => void): (() => void) | void;
  ackApplicationAudio(id: string): void;
  stopApplicationAudio(id: string): Promise<unknown>;
}
