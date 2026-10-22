import type { ApplicationAudioInfo } from './application-audio';

export type DesktopCaptureAudioMode = 'none' | 'application' | 'system';
export interface DesktopCaptureSource {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
}
export interface DesktopCaptureRequest {
  readonly id: string;
  readonly audio: boolean;
  readonly windows: boolean;
  readonly remote?: boolean;
  readonly applicationAudio: boolean;
  readonly sources: readonly DesktopCaptureSource[];
  readonly audioSources?: readonly DesktopCaptureSource[];
}
export interface DesktopCaptureChoice {
  readonly id: string;
  readonly source: string | null;
  readonly audioMode: DesktopCaptureAudioMode;
  readonly audioSource: string;
}
export interface DesktopCaptureSelection {
  readonly selected: boolean;
  readonly error?: string;
  readonly audio?: ApplicationAudioInfo;
}
export interface DesktopCaptureNative {
  onCapture(listener: (value: unknown) => void): (() => void) | void;
  onCaptureCancel(listener: (value: unknown) => void): (() => void) | void;
  selectCapture(choice: DesktopCaptureChoice): Promise<unknown>;
  stopApplicationAudio(id: string): Promise<unknown>;
}
export interface DesktopCaptureSnapshot {
  readonly request: DesktopCaptureRequest | null;
  readonly source: string | null;
  readonly audioMode: DesktopCaptureAudioMode;
  readonly audioSource: string;
  readonly message: string;
}
