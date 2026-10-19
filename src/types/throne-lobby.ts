import type { AvatarAppearance } from './domain';

export type ThroneRoomId = 'sala-cetro' | 'sala-chave' | 'sala-mascara';
export interface ThroneSeat extends AvatarAppearance {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly guest: boolean;
  readonly ready: boolean;
  readonly host: boolean;
}
/** Public lobby roster only. Hands, prompts and private game data never belong here. */
export interface ThroneRoom {
  readonly id: ThroneRoomId;
  readonly name: string;
  readonly kind: 'game';
  readonly max: 4;
  readonly count: number;
  readonly voiceActive: boolean;
  readonly gameActive: boolean;
  readonly players: readonly ThroneSeat[];
}
export interface ThroneRoomDefinition {
  readonly id: ThroneRoomId;
  readonly name: string;
  readonly glyph: string;
  readonly suit: string;
}
export type ThroneRecoveryScreen = 'setupScreen' | 'roomScreen' | 'gameScreen';
export interface ThroneLobbySnapshot {
  readonly connected: boolean;
  readonly selected: ThroneRoomDefinition | null;
  readonly room: ThroneRoom | null;
  readonly me: ThroneSeat | null;
  readonly rooms: readonly ThroneRoom[];
  readonly entering: boolean;
  readonly readyPending: boolean;
  readonly starting: boolean;
  readonly networkStatus: string;
  readonly notice: string;
}
