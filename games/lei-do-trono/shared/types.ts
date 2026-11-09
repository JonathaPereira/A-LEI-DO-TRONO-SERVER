export type ThroneSuit = 'cetro' | 'chave' | 'lamina' | 'mascara';
export const throneLaws = ['ordem', 'estandarte', 'revolta', 'anarquia', 'usurpacao'] as const;
export type ThroneLaw = (typeof throneLaws)[number];

export interface ThroneCard {
  readonly id: string;
  readonly suit: ThroneSuit;
  readonly value: number;
  readonly public?: boolean;
  readonly publicReason?: string | null;
}

export interface ThronePlayer {
  readonly seat: number;
  readonly name: string;
  readonly handCount?: number;
  readonly score?: number;
}

export interface ThroneTrickPlay {
  readonly seat: number;
  readonly card: ThroneCard;
}

export interface ThroneLawDefinition {
  readonly name: string;
  readonly img: string;
  readonly description: string;
}
