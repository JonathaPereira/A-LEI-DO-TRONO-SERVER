import type { ThroneCard } from './throne-choices';

export interface ThroneIntelligence {
  readonly target: number;
  readonly name: string;
  readonly card: ThroneCard;
}
export type ThroneDisclosure =
  | { readonly kind: 'intelligence'; readonly clue: ThroneIntelligence }
  | {
      readonly kind: 'usurpation';
      readonly role: 'shadow' | 'target';
      readonly otherName: string;
      readonly outgoing: ThroneCard;
      readonly incoming: ThroneCard;
    };
export interface ThronePrivateDialog {
  readonly data: ThroneDisclosure;
  readonly required: boolean;
  readonly action: 'intelligence-ack' | 'usurp-ack' | null;
}
export interface ThronePrivateSnapshot {
  readonly intelligence: ThroneIntelligence | null;
  readonly dialog: ThronePrivateDialog | null;
  readonly open: boolean;
  readonly pending: boolean;
  readonly notice: string;
}
