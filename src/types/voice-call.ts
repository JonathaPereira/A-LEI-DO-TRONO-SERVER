export type VoiceCallPhase = 'idle' | 'preparing' | 'microphone' | 'connecting' | 'joined';
export type VoiceLeaveReason = 'leave' | 'disconnect';

export interface VoiceCallSnapshot {
  readonly generation: number;
  readonly phase: VoiceCallPhase;
  /** Membership starts after capture, before transport negotiation completes. */
  readonly joined: boolean;
  readonly joining: boolean;
}

export interface VoiceCallOperation {
  readonly generation: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}
