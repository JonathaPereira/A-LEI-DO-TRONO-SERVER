export type TransmissionQuality = 'economy' | 'balanced' | 'high';

/** Confirmed backend policy. Operational credentials never belong in this snapshot. */
export interface RealtimeStatus {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly hardBlocked: boolean;
  readonly softWarning: boolean;
  readonly screenAllowed: boolean;
  readonly highAllowed: boolean;
  readonly maxQuality: TransmissionQuality;
  readonly estimatedGb: number;
  readonly estimateSafetyFactor: number;
  readonly thresholds: { readonly hard: number };
}

export interface RealtimeSnapshot {
  readonly status: RealtimeStatus | null;
  readonly error: string;
  readonly turn: boolean;
}
