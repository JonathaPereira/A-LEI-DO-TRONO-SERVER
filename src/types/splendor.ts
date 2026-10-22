export interface SplendorCard {
  id: string;
  level: number;
  points: number;
  bonus: number;
  cost: number[];
  hidden?: false;
}
export interface HiddenSplendorCard {
  hidden: true;
  level: number;
}
export type SplendorReserve = SplendorCard | HiddenSplendorCard;
export interface SplendorNoble {
  id: string;
  points: number;
  cost: number[];
}
export interface SplendorPlayer {
  id: string;
  name: string;
  bot: boolean;
  forfeited?: boolean;
  tokens: number[];
  bonuses: number[];
  cards: SplendorCard[];
  reserved: SplendorReserve[];
  nobles: SplendorNoble[];
  score: number;
  turns: number;
}
export type SplendorMove = (
  | { kind: 'take'; tokens: number[] }
  | { kind: 'reserve'; id?: string; level?: number }
  | { kind: 'buy'; id: string; payment?: number[] }
  | { kind: 'noble'; id: string }
  | { kind: 'pass' }
) & { returnTokens?: number[] };
export interface SplendorEvent {
  kind: SplendorMove['kind'];
  playerId: string;
  points: number;
  revision: number;
  score: number;
  card?: SplendorCard;
  noble?: SplendorNoble;
  payment?: number[];
  tokens?: number[];
  returned?: number[];
  gold?: number;
  level?: number;
  blind?: boolean;
}
export interface SplendorState {
  version: number;
  phase: 'action' | 'noble' | 'finished';
  revision: number;
  round: number;
  turn: number;
  starter: number;
  players: SplendorPlayer[];
  bank: number[];
  deckCounts: number[];
  market: (SplendorCard | null)[][];
  nobles: SplendorNoble[];
  eligible: string[];
  finalRound: boolean;
  winners: string[];
  last: SplendorEvent | null;
  log: SplendorEvent[];
}
export interface SplendorRoom {
  id: string;
  hostId: string;
  maxPlayers: number;
  players: { id: string; name: string; bot: boolean; online: boolean; forfeited: boolean }[];
  state: SplendorState | null;
  recordStatus: 'saving' | 'saved' | 'pending' | 'unranked' | null;
}
export interface SplendorOpenRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
}
export interface SplendorRecord {
  playerId: string;
  name: string;
  score: number;
  cards: number;
  mode: 'online' | 'bots';
  date: string;
}
export type SplendorPhase = 'payment' | 'showcase' | 'flight' | 'returned' | 'landed';
export interface SplendorReplay {
  state: SplendorState;
  event: SplendorEvent;
  displayScore: number;
  phase: SplendorPhase;
}
export interface SplendorSnapshot {
  accountId: string | null;
  connected: boolean;
  room: SplendorRoom | null;
  rooms: readonly SplendorOpenRoom[];
  resumeId: string | null;
  notice: string;
  ranking: readonly SplendorRecord[];
  rankingError: string;
  pending: boolean;
  selected: readonly number[];
  replay: SplendorReplay | null;
  card: { card: SplendorCard; payment: number[] | null; actions: boolean; revision: number } | null;
  returns: {
    move: SplendorMove;
    held: number[];
    excess: number;
    returned: number[];
    revision: number;
  } | null;
  collection: string | null;
  rulesOpen: boolean;
}
export interface SplendorRules {
  colors: string[];
  symbols: string[];
  sum(v: readonly number[]): number;
  payment(player: SplendorPlayer, card: SplendorCard): number[] | null;
  price(player: SplendorPlayer, card: SplendorCard): number[];
  legalActions(state: SplendorState): SplendorMove[];
}
export interface SplendorData {
  cards: SplendorCard[];
  nobles: SplendorNoble[];
}
