export interface ThroneLogEntry {
  readonly id: number;
  readonly ts: number;
  readonly round: number;
  readonly trick: number;
  readonly message: string;
}
export interface ThroneScore {
  readonly seat: number;
  readonly name: string;
  readonly crowns: number;
  readonly shadows: number;
  readonly pairs: number;
  readonly prestige: number;
  readonly roundScore?: {
    readonly crowns: number;
    readonly shadows: number;
    readonly pairs: number;
    readonly gained: number;
  };
}
export interface ThroneResult {
  readonly kind: 'round' | 'final';
  readonly mode: 'local' | 'online';
  readonly round: number;
  readonly scores: readonly ThroneScore[];
  readonly winners: readonly number[];
  readonly entries: readonly ThroneLogEntry[];
}
export interface ThroneHistorySnapshot {
  readonly entries: readonly ThroneLogEntry[];
  readonly logOpen: boolean;
  readonly dialog: ThroneResult | null;
  readonly resultOpen: boolean;
  readonly lastRound: ThroneResult | null;
}
