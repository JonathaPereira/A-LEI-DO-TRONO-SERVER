/** Output routing is optional in browsers without AudioContext.setSinkId. */
export type VoiceAudioContext = AudioContext & {
  readonly sinkId?: string;
  setSinkId?(id: string): Promise<void>;
};
export type CallSoundKind = 'join' | 'leave' | 'disconnect' | 'message';
export interface CallAudioSnapshot {
  readonly context: AudioContextState | null;
}
export interface CallAlertsSnapshot extends CallAudioSnapshot {
  readonly volume: number;
  readonly muted: boolean;
}
