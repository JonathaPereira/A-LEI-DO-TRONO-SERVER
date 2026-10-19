export type ThroneSuit = 'cetro' | 'chave' | 'lamina' | 'mascara';
export type ThroneLaw = 'ordem' | 'estandarte' | 'revolta' | 'anarquia' | 'usurpacao';
export type ThroneDecree =
  | 'reserva'
  | 'rotacao'
  | 'corte'
  | 'desafio'
  | 'silencio'
  | 'sucessao'
  | 'conselho'
  | 'favor'
  | 'espionagem'
  | 'peso';
export interface ThroneCard {
  readonly id: string;
  readonly suit: ThroneSuit;
  readonly value: number;
  readonly public: boolean;
  readonly publicReason: string | null;
}
/** Only the viewer's cards and public names needed for a server choice. */
export interface ThroneChoiceContext {
  readonly you: number;
  readonly round: number;
  readonly trick: number;
  readonly phase: string;
  readonly lastCrown: number | null;
  readonly lastShadow: number | null;
  readonly name: string;
  readonly hand: readonly ThroneCard[];
  readonly reserve: ThroneCard | null;
  readonly players: readonly { readonly seat: number; readonly name: string }[];
  readonly lawUsage: Readonly<Record<ThroneLaw, number>>;
}
export type ThroneCardChoice =
  'choose-reserva' | 'choose-corte' | 'choose-conselho' | 'rotation' | 'challenge' | 'usurp-give';
interface PromptId {
  readonly id: string;
  readonly number: number;
}
export type ThronePrompt = PromptId &
  (
    | { readonly kind: 'choose-decree'; readonly options: readonly ThroneDecree[] }
    | { readonly kind: 'choose-trump'; readonly options: readonly ThroneSuit[] }
    | { readonly kind: 'choose-law'; readonly options: readonly ThroneLaw[] }
    | {
        readonly kind: 'usurp-target';
        readonly options: readonly { readonly seat: number; readonly name: string }[];
      }
    | { readonly kind: 'usurp-pick'; readonly count: number; readonly otherName: string }
    | {
        readonly kind: ThroneCardChoice;
        readonly cardIds: readonly string[];
        readonly otherName: string;
      }
  );
export interface ThroneChoicesSnapshot {
  readonly context: ThroneChoiceContext | null;
  readonly prompt: ThronePrompt | null;
  readonly preview: boolean;
  readonly pending: boolean;
  readonly open: boolean;
  readonly notice: string;
}
export interface ThroneChoiceRules {
  readonly laws: Readonly<
    Record<ThroneLaw, { readonly name: string; readonly img: string; readonly description: string }>
  >;
  readonly decrees: readonly {
    readonly id: ThroneDecree;
    readonly name: string;
    readonly text: string;
    readonly icon: string;
  }[];
}
